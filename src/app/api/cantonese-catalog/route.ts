import { NextRequest, NextResponse } from 'next/server';

import { hasValidAccountSession } from '@/lib/auth';
import { hasUsableBdzyPlayback } from '@/lib/bdzy-playback';
import { API_CONFIG, ApiSite, getAvailableApiSites } from '@/lib/config';
import { SearchResult } from '@/lib/types';

export const runtime = 'nodejs';

const CANTONESE_QUERY = '粤语';
const CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_STALE_CACHE_MS = 6 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 8000;
const FETCH_CONCURRENCY = 8;
const MAX_PAGES_PER_SOURCE = 30;
const PREVIEW_SOURCE_KEYS = new Set(['bdzy', 'uk']);
const PREVIEW_PAGES_PER_SOURCE = 4;

type CantoneseCategory = 'series' | 'movie';

interface UpstreamVideo {
  vod_id: string | number;
  vod_name?: string;
  vod_pic?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  vod_lang?: string;
  vod_area?: string;
  type_name?: string;
  type_id?: number;
}

interface UpstreamPage {
  list?: UpstreamVideo[];
  pagecount?: string | number;
}

interface SourcePage {
  site: ApiSite;
  data: UpstreamPage;
}

interface CantoneseCatalog {
  series: SearchResult[];
  movie: SearchResult[];
  sourceCount: number;
  builtAt: number;
}

let cachedCatalog: CantoneseCatalog | null = null;
let catalogPromise: Promise<CantoneseCatalog> | null = null;
let cachedPreviewCatalog: CantoneseCatalog | null = null;
let previewCatalogPromise: Promise<CantoneseCatalog> | null = null;

function getEpisodes(playUrl?: string) {
  let episodes: string[] = [];
  let titles: string[] = [];

  for (const sourceLine of playUrl?.split('$$$') || []) {
    const candidateEpisodes: string[] = [];
    const candidateTitles: string[] = [];

    for (const episode of sourceLine.split('#')) {
      const [title, url, ...rest] = episode.split('$');
      const pathname = url?.split('?')[0]?.toLowerCase();
      if (title && url && rest.length === 0 && pathname?.endsWith('.m3u8')) {
        candidateTitles.push(title);
        candidateEpisodes.push(url);
      }
    }

    if (candidateEpisodes.length > episodes.length) {
      episodes = candidateEpisodes;
      titles = candidateTitles;
    }
  }

  return { episodes, titles };
}

function isCantonese(video: UpstreamVideo) {
  const title = video.vod_name || '';
  const language = video.vod_lang || '';
  const hasCantonese =
    title.includes(CANTONESE_QUERY) || language.includes(CANTONESE_QUERY);
  const isMandarinOnlyTitle =
    !title.includes(CANTONESE_QUERY) &&
    /(?:国语|普通话|汉语普通话)/.test(title);

  return hasCantonese && !isMandarinOnlyTitle;
}

function isLikelyAdult(
  video: Pick<UpstreamVideo, 'vod_name' | 'vod_class' | 'type_name'>
) {
  const text = [video.vod_name, video.vod_class, video.type_name]
    .filter(Boolean)
    .join(' ');
  return /(?:伦理|情色|色情|成人|午夜|18[+＋])/.test(text);
}

function normalizeTitle(title: string) {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(?:粤语|国语|汉语普通话|普通话)(?:版)?/g, '')
    .replace(/[\s·・:：,，.。'"“”‘’()（）\[\]【】{}<>《》_\-—–]/g, '');
}

function toSearchResult(
  site: ApiSite,
  video: UpstreamVideo
): SearchResult | null {
  const title = video.vod_name?.trim().replace(/\s+/g, ' ');
  if (!title || video.vod_id === undefined || video.vod_id === null)
    return null;

  const { episodes, titles } = getEpisodes(video.vod_play_url);
  if (episodes.length === 0) return null;
  if (site.key === 'bdzy' && !hasUsableBdzyPlayback(episodes)) return null;

  return {
    id: String(video.vod_id),
    title,
    poster: video.vod_pic || '',
    episodes,
    episodes_titles: titles,
    source: site.key,
    source_name: site.name,
    class: video.vod_class,
    year: video.vod_year?.match(/\d{4}/)?.[0] || 'unknown',
    desc: video.vod_content || '',
    type_name: video.type_name,
    type_id: video.type_id,
    country: video.vod_area,
  };
}

function shouldReplaceCandidate(
  current: SearchResult,
  candidate: SearchResult
) {
  if (candidate.episodes.length !== current.episodes.length) {
    return candidate.episodes.length > current.episodes.length;
  }
  if (Boolean(candidate.poster) !== Boolean(current.poster)) {
    return Boolean(candidate.poster);
  }
  return Boolean(candidate.desc) && !current.desc;
}

async function fetchSourcePage(
  site: ApiSite,
  page: number
): Promise<SourcePage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const url = new URL(site.api);
    url.searchParams.set('ac', 'videolist');
    url.searchParams.set('wd', CANTONESE_QUERY);
    url.searchParams.set('pg', String(page));

    const response = await fetch(url, {
      signal: controller.signal,
      headers: API_CONFIG.search.headers,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as UpstreamPage;
    return Array.isArray(data.list) ? { site, data } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  worker: (value: T) => Promise<R>,
  concurrency = FETCH_CONCURRENCY
) {
  const results: R[] = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, runWorker)
  );
  return results;
}

function buildCatalogFromPages(
  sourcePages: SourcePage[],
  sourceCount: number
): CantoneseCatalog {
  const uniqueTitles = new Map<string, SearchResult>();

  for (const { site, data } of sourcePages) {
    for (const video of data.list || []) {
      if (!isCantonese(video)) continue;
      const item = toSearchResult(site, video);
      if (!item) continue;

      const titleKey = normalizeTitle(item.title);
      if (!titleKey) continue;
      const current = uniqueTitles.get(titleKey);
      if (!current || shouldReplaceCandidate(current, item)) {
        uniqueTitles.set(titleKey, item);
      }
    }
  }

  const uniqueItems = Array.from(uniqueTitles.values());
  return {
    series: uniqueItems.filter((item) => item.episodes.length > 1),
    movie: uniqueItems.filter((item) => item.episodes.length === 1),
    sourceCount,
    builtAt: Date.now(),
  };
}

async function buildCatalog(): Promise<CantoneseCatalog> {
  const sites = await getAvailableApiSites();
  const firstPages = await mapWithConcurrency(sites, (site) =>
    fetchSourcePage(site, 1)
  );
  const sourcePages: SourcePage[] = firstPages.filter(
    (page): page is SourcePage => Boolean(page)
  );
  // Một số API bỏ qua wd=粤语 nhưng trả pagecount của toàn bộ kho. Chỉ lấy
  // thêm trang từ nguồn đã chứng minh có dữ liệu phù hợp ở trang đầu.
  const matchingSourcePages = sourcePages.filter(({ data }) =>
    (data.list || []).some(isCantonese)
  );

  const remainingRequests = matchingSourcePages.flatMap(({ site, data }) => {
    const pageCount = Math.min(
      MAX_PAGES_PER_SOURCE,
      Math.max(1, Number(data.pagecount) || 1)
    );
    return Array.from({ length: pageCount - 1 }, (_, index) => ({
      site,
      page: index + 2,
    }));
  });
  const remainingPages = await mapWithConcurrency(
    remainingRequests,
    ({ site, page }) => fetchSourcePage(site, page)
  );

  const allPages = [
    ...sourcePages,
    ...remainingPages.filter((page): page is SourcePage => Boolean(page)),
  ];
  return buildCatalogFromPages(allPages, matchingSourcePages.length);
}

async function buildPreviewCatalog(): Promise<CantoneseCatalog> {
  const sites = (await getAvailableApiSites()).filter((site) =>
    PREVIEW_SOURCE_KEYS.has(site.key)
  );
  const previewRequests = sites.flatMap((site) =>
    Array.from({ length: PREVIEW_PAGES_PER_SOURCE }, (_, index) => ({
      site,
      page: index + 1,
    }))
  );
  const pages = await mapWithConcurrency(previewRequests, ({ site, page }) =>
    fetchSourcePage(site, page)
  );
  const sourcePages = pages.filter((page): page is SourcePage => Boolean(page));
  const matchingSourceKeys = new Set(
    sourcePages
      .filter(({ data }) => (data.list || []).some(isCantonese))
      .map(({ site }) => site.key)
  );

  return buildCatalogFromPages(sourcePages, matchingSourceKeys.size);
}

function refreshCatalog() {
  if (!catalogPromise) {
    catalogPromise = buildCatalog()
      .then((catalog) => {
        cachedCatalog = catalog;
        return catalog;
      })
      .finally(() => {
        catalogPromise = null;
      });
  }
  return catalogPromise;
}

function refreshPreviewCatalog() {
  if (!previewCatalogPromise) {
    previewCatalogPromise = buildPreviewCatalog()
      .then((catalog) => {
        cachedPreviewCatalog = catalog;
        return catalog;
      })
      .finally(() => {
        previewCatalogPromise = null;
      });
  }
  return previewCatalogPromise;
}

async function getCatalog(): Promise<{
  catalog: CantoneseCatalog;
  isPreview: boolean;
}> {
  if (cachedCatalog) {
    const cacheAge = Date.now() - cachedCatalog.builtAt;
    if (cacheAge < CACHE_TTL_MS) {
      return { catalog: cachedCatalog, isPreview: false };
    }

    // Không bắt người đang xem phải chờ quét lại tất cả nguồn. Trả danh mục
    // gần nhất ngay và thay mới âm thầm; sau 6 giờ mới bắt buộc chờ dữ liệu mới.
    if (cacheAge < MAX_STALE_CACHE_MS) {
      void refreshCatalog().catch(() => undefined);
      return { catalog: cachedCatalog, isPreview: false };
    }
  }

  // Khách đầu tiên nhận ngay bản xem trước từ hai nguồn có phản hồi nhanh.
  // Chỉ bắt đầu quét toàn bộ sau đó để không tranh kết nối với bản xem trước.
  const preview = await refreshPreviewCatalog();
  void refreshCatalog().catch(() => undefined);
  return { catalog: preview, isPreview: true };
}

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category');
  const page = Number(request.nextUrl.searchParams.get('page') || '1');

  if (category !== 'series' && category !== 'movie') {
    return NextResponse.json(
      { error: 'Danh mục không hợp lệ' },
      { status: 400 }
    );
  }
  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    return NextResponse.json({ error: 'Trang không hợp lệ' }, { status: 400 });
  }

  try {
    const { catalog, isPreview } = await getCatalog();
    const includeAdult = await hasValidAccountSession(request);
    const sourceItems = catalog[category].filter((item) => {
      if (includeAdult) return true;
      return !isLikelyAdult({
        vod_name: item.title,
        vod_class: item.class,
        type_name: item.type_name,
      });
    });
    const pageSize = 20;
    const pageCount = Math.max(1, Math.ceil(sourceItems.length / pageSize));
    const safePage = Math.min(page, pageCount);
    const start = (safePage - 1) * pageSize;

    return NextResponse.json(
      {
        items: sourceItems.slice(start, start + pageSize),
        page: safePage,
        pageCount,
        total: sourceItems.length,
        sourceCount: catalog.sourceCount,
        isPreview,
      },
      {
        headers: {
          'Cache-Control': isPreview
            ? 'private, no-store'
            : 'private, max-age=1200, stale-while-revalidate=21600',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: 'Không thể tổng hợp danh mục 粤语 lúc này' },
      { status: 502 }
    );
  }
}
