import { NextRequest, NextResponse } from 'next/server';

import { getUsableBdzyEpisodes } from '@/lib/bdzy-playback';
import { API_CONFIG, ApiSite, getAvailableApiSites } from '@/lib/config';
import { SearchResult } from '@/lib/types';

export const runtime = 'nodejs';

const BDZY_SOURCE_KEY = 'bdzy';
const BDZY_TYPE_ID = 14;
const REQUEST_TIMEOUT_MS = 2500;
const FETCH_CONCURRENCY = 12;
const BDZY_LEGACY_START_PAGE = 22;
const BDZY_PREVIEW_PAGE_COUNT = 5;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const CATALOG_SIZE = 20;

// Mỗi API tự đặt mã thể loại riêng. Đây là các nguồn JoyFlix có danh mục
// 欧美剧; BDZY là nguồn bổ sung, được ghép lẫn thay vì thay thế nguồn gốc.
const WESTERN_SOURCE_TYPE_IDS: Readonly<Record<string, readonly number[]>> = {
  dyttzy: [16],
  ruyi: [16],
  bfzy: [32],
  tyyszy: [14],
  jisu: [3],
  [BDZY_SOURCE_KEY]: [BDZY_TYPE_ID],
};

interface UpstreamVideo {
  vod_id?: string | number;
  vod_name?: string;
  vod_pic?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  vod_area?: string;
  type_name?: string;
  type_id?: number;
}

interface UpstreamPage {
  list?: UpstreamVideo[];
}

interface WesternTarget {
  site: ApiSite;
  typeId: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface WesternCatalog {
  items: SearchResult[];
  sourceCount: number;
}

const westernCatalogCache = new Map<string, CacheEntry<WesternCatalog>>();
const westernCatalogPromises = new Map<string, Promise<WesternCatalog>>();

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

function normalizeTitle(title: string) {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(?:粤语|国语|汉语普通话|普通话)(?:版)?/g, '')
    .replace(/[\s·・:：,，.。'"“”‘’()（）\[\]【】{}<>《》_\-—–]/g, '');
}

function isLikelyAdult(video: UpstreamVideo) {
  return /(?:伦理|情色|色情|成人|午夜|18[+＋])/.test(
    [video.vod_name, video.vod_class, video.type_name]
      .filter(Boolean)
      .join(' ')
  );
}

function getBdzyRelayUrl(upstreamUrl: URL): URL | null {
  const configuredUrl = process.env.BDZY_RELAY_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const relayUrl = new URL(configuredUrl);
    if (relayUrl.protocol !== 'https:') return null;
    relayUrl.search = upstreamUrl.search;
    return relayUrl;
  } catch {
    return null;
  }
}

async function fetchJson(url: URL): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: API_CONFIG.search.headers,
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  worker: (value: T) => Promise<R>,
  concurrency: number
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

function getWesternTargets(sites: ApiSite[]): WesternTarget[] {
  return sites.flatMap((site) =>
    (WESTERN_SOURCE_TYPE_IDS[site.key] || []).map((typeId) => ({
      site,
      typeId,
    }))
  );
}

async function fetchSourcePage(
  target: WesternTarget,
  page: number
): Promise<UpstreamPage | null> {
  const upstreamUrl = new URL(target.site.api);
  upstreamUrl.searchParams.set('ac', 'videolist');
  upstreamUrl.searchParams.set('t', String(target.typeId));
  upstreamUrl.searchParams.set('pg', String(page));
  const requestUrl =
    target.site.key === BDZY_SOURCE_KEY
      ? getBdzyRelayUrl(upstreamUrl) || upstreamUrl
      : upstreamUrl;

  const data = (await fetchJson(requestUrl)) as UpstreamPage | null;
  return Array.isArray(data?.list) ? data : null;
}

function toCandidate(site: ApiSite, video: UpstreamVideo): SearchResult | null {
  const title = video.vod_name?.trim().replace(/\s+/g, ' ');
  if (
    !title ||
    video.vod_id === undefined ||
    video.vod_id === null ||
    isLikelyAdult(video)
  ) {
    return null;
  }

  let { episodes, titles } = getEpisodes(video.vod_play_url);
  if (site.key === BDZY_SOURCE_KEY) {
    ({ episodes, titles } = getUsableBdzyEpisodes(episodes, titles));
  }
  if (episodes.length === 0) return null;

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

function interleaveCandidates(
  regularGroups: SearchResult[][],
  bdzyCandidates: SearchResult[],
  maximumCandidates: number
) {
  const regularQueues = regularGroups.map((items) => [...items]);
  const bdzyQueue = [...bdzyCandidates];
  const candidates: SearchResult[] = [];

  while (candidates.length < maximumCandidates) {
    let added = false;
    for (let index = 0; index < regularQueues.length; index += 1) {
      const candidate = regularQueues[index].shift();
      if (candidate) {
        candidates.push(candidate);
        added = true;
      }
      if (index % 4 === 3) {
        const bdzyCandidate = bdzyQueue.shift();
        if (bdzyCandidate) {
          candidates.push(bdzyCandidate);
          added = true;
        }
      }
      if (candidates.length >= maximumCandidates) break;
    }
    if (bdzyQueue.length > 0 && regularQueues.length < 4) {
      const bdzyCandidate = bdzyQueue.shift();
      if (bdzyCandidate) {
        candidates.push(bdzyCandidate);
        added = true;
      }
    }
    if (!added) break;
  }

  return candidates;
}

function selectDistinctCandidates(candidates: SearchResult[], limit: number) {
  const selected: SearchResult[] = [];
  const usedTitles = new Set<string>();

  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    const titleKey = normalizeTitle(candidate.title);
    if (!titleKey || usedTitles.has(titleKey)) continue;
    usedTitles.add(titleKey);
    selected.push(candidate);
  }

  return selected;
}

async function getBdzyCandidates(target: WesternTarget) {
  // Trang mới của BDZY hiện chủ yếu là playlist JPEG không phát được. Vùng
  // HLS đã xác nhận nằm từ trang 22; gọi đồng thời năm trang này để server
  // không phải chờ tuần tự và không chạm giới hạn thời gian của Netlify.
  const pageNumbers = Array.from(
    { length: BDZY_PREVIEW_PAGE_COUNT },
    (_, index) => BDZY_LEGACY_START_PAGE + index
  );
  const pages = await mapWithConcurrency(
    pageNumbers,
    (page) => fetchSourcePage(target, page),
    FETCH_CONCURRENCY
  );

  return pages
    .flatMap((page) => page?.list || [])
    .map((video) => toCandidate(target.site, video))
    .filter((candidate): candidate is SearchResult => Boolean(candidate));
}

async function buildWesternCatalog(): Promise<WesternCatalog> {
  const sites = await getAvailableApiSites();
  const targets = getWesternTargets(sites);
  const regularTargets = targets.filter(
    (target) => target.site.key !== BDZY_SOURCE_KEY
  );
  const bdzyTarget = targets.find(
    (target) => target.site.key === BDZY_SOURCE_KEY
  );

  const [regularPages, bdzyCandidates] = await Promise.all([
    mapWithConcurrency(
      regularTargets,
      (target) => fetchSourcePage(target, 1),
      FETCH_CONCURRENCY
    ),
    bdzyTarget ? getBdzyCandidates(bdzyTarget) : Promise.resolve([]),
  ]);
  const regularGroups = regularPages.map((page, index) =>
    (page?.list || [])
      .map((video) => toCandidate(regularTargets[index].site, video))
      .filter((candidate): candidate is SearchResult => Boolean(candidate))
  );

  const candidates = interleaveCandidates(
    regularGroups,
    bdzyCandidates,
    CATALOG_SIZE * 2
  );
  const items = selectDistinctCandidates(candidates, CATALOG_SIZE);

  return {
    items,
    sourceCount: new Set(items.map((item) => item.source)).size,
  };
}

function getWesternCatalog(siteOrigin: string) {
  const cached = westernCatalogCache.get(siteOrigin);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value);
  }

  const pending = westernCatalogPromises.get(siteOrigin);
  if (pending) return pending;

  const request = buildWesternCatalog()
    .then((catalog) => {
      westernCatalogCache.set(siteOrigin, {
        value: catalog,
        expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
      });
      return catalog;
    })
    .finally(() => {
      westernCatalogPromises.delete(siteOrigin);
    });
  westernCatalogPromises.set(siteOrigin, request);
  return request;
}

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get('limit') || '20');
  if (!Number.isInteger(limit) || limit < 1 || limit > CATALOG_SIZE) {
    return NextResponse.json(
      { error: 'Giới hạn không hợp lệ' },
      { status: 400 }
    );
  }

  try {
    const catalog = await getWesternCatalog(request.nextUrl.origin);
    return NextResponse.json(
      {
        items: catalog.items.slice(0, limit),
        sourceCount: catalog.sourceCount,
        checkedAt: Date.now(),
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=600',
          'Netlify-Vary': 'query',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: 'Không thể tổng hợp phim Âu Mỹ lúc này' },
      { status: 502 }
    );
  }
}
