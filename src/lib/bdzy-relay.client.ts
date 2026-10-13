import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';

const BDZY_RELAY_URL =
  'https://joyflix-bdzy-relay.joyflix-huge-2026-0820.workers.dev/bdzy';
const BDZY_IMAGE_SEQUENCE_HOST_SUFFIX = '.bdzybf22.com';
const EMPTY_PAGE_SCAN_LIMIT = 30;
const EMPTY_PAGE_SCAN_CONCURRENCY = 5;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('The BDZY request was aborted', 'AbortError');
  }
}

interface BdzyVideo {
  vod_id?: string | number;
  vod_name?: string;
  vod_pic?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  vod_douban_id?: number;
  type_name?: string;
  type_id?: number;
}

interface BdzyResponse {
  page?: string | number;
  pagecount?: string | number;
  total?: string | number;
  list?: BdzyVideo[];
  error?: string;
}

function getEpisodes(playUrl?: string) {
  let episodes: string[] = [];
  let titles: string[] = [];

  for (const line of playUrl?.split('$$$') || []) {
    const candidateEpisodes: string[] = [];
    const candidateTitles: string[] = [];
    for (const episode of line.split('#')) {
      const [title, url, ...rest] = episode.split('$');
      if (title && url && rest.length === 0 && url.endsWith('.m3u8')) {
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

function isUsableBdzyEpisode(episodeUrl: string) {
  try {
    return !new URL(episodeUrl).hostname
      .toLowerCase()
      .endsWith(BDZY_IMAGE_SEQUENCE_HOST_SUFFIX);
  } catch {
    return false;
  }
}

function toSearchResult(video: BdzyVideo): SearchResult | null {
  if (video.vod_id === undefined || video.vod_id === null) return null;

  const title = video.vod_name?.trim().replace(/\s+/g, ' ');
  if (!title) return null;

  const parsed = getEpisodes(video.vod_play_url);
  const episodes: string[] = [];
  const episodesTitles: string[] = [];
  parsed.episodes.forEach((episodeUrl, index) => {
    if (!isUsableBdzyEpisode(episodeUrl)) return;
    episodes.push(episodeUrl);
    episodesTitles.push(parsed.titles[index] || `Tập ${index + 1}`);
  });
  if (episodes.length === 0) return null;

  return {
    id: String(video.vod_id),
    title,
    poster: video.vod_pic || '',
    episodes,
    episodes_titles: episodesTitles,
    source: 'bdzy',
    source_name: 'BDZY',
    class: video.vod_class,
    year: video.vod_year?.match(/\d{4}/)?.[0] || 'unknown',
    desc: cleanHtmlTags(video.vod_content || ''),
    type_name: video.type_name,
    type_id: video.type_id,
    douban_id: video.vod_douban_id,
  };
}

async function requestBdzy(
  searchParams: URLSearchParams,
  signal?: AbortSignal
): Promise<BdzyResponse & { list: BdzyVideo[] }> {
  const requestUrl = new URL(BDZY_RELAY_URL);
  requestUrl.search = searchParams.toString();

  const response = await fetch(requestUrl, {
    signal,
    cache: 'no-store',
  });
  const data = (await response.json()) as BdzyResponse;
  if (!response.ok) {
    throw new Error(data.error || 'Không thể tải dữ liệu BDZY');
  }
  if (!Array.isArray(data.list)) {
    throw new Error('BDZY trả về dữ liệu không hợp lệ');
  }
  return data as BdzyResponse & { list: BdzyVideo[] };
}

export async function fetchBdzyCategory({
  typeId,
  page,
  language,
  signal,
}: {
  typeId: number;
  page: number;
  language?: string | null;
  signal?: AbortSignal;
}) {
  let lastResponse: (BdzyResponse & { list: BdzyVideo[] }) | null = null;
  let reachedLastPage = false;

  // BDZY hiện đặt nhiều trang playlist ảnh ở đầu từng danh mục. Chỉ quét một
  // cửa sổ nhỏ, theo thứ tự, đến khi gặp trang có HLS thật để giao diện không
  // hiển thị "trống" dù phía nguồn vẫn còn phim phát được.
  for (
    let offset = 0;
    offset < EMPTY_PAGE_SCAN_LIMIT;
    offset += EMPTY_PAGE_SCAN_CONCURRENCY
  ) {
    throwIfAborted(signal);
    const candidatePages = Array.from(
      { length: EMPTY_PAGE_SCAN_CONCURRENCY },
      (_, index) => page + offset + index
    );
    const responses = await Promise.allSettled(
      candidatePages.map((candidatePage) => {
        const query = new URLSearchParams({
          ac: 'videolist',
          t: String(typeId),
          pg: String(candidatePage),
        });
        if (language) query.set('wd', language);
        return requestBdzy(query, signal);
      })
    );
    throwIfAborted(signal);

    for (let index = 0; index < responses.length; index += 1) {
      const response = responses[index];
      if (response.status !== 'fulfilled') continue;

      const data = response.value;
      lastResponse = data;
      const items = data.list.flatMap((video) => {
        const result = toSearchResult(video);
        return result ? [result] : [];
      });
      if (items.length > 0) {
        return {
          items,
          page: Number(data.page) || candidatePages[index],
          pageCount: Number(data.pagecount) || 0,
          total: Number(data.total) || 0,
        };
      }

      const lastPage = Number(data.pagecount) || 0;
      if (lastPage > 0 && candidatePages[index] >= lastPage) {
        reachedLastPage = true;
        break;
      }
    }
    if (reachedLastPage) break;
  }

  return {
    items: [],
    page,
    pageCount: Number(lastResponse?.pagecount) || 0,
    total: Number(lastResponse?.total) || 0,
  };
}

export async function fetchBdzyDetail({
  id,
  signal,
}: {
  id: string;
  signal?: AbortSignal;
}): Promise<SearchResult> {
  const data = await requestBdzy(
    new URLSearchParams({ ac: 'videolist', ids: id }),
    signal
  );
  const detail = data.list
    .map(toSearchResult)
    .find((candidate): candidate is SearchResult => candidate !== null);
  if (!detail) {
    throw new Error('BDZY không có nguồn phát tương thích cho phim này');
  }
  return detail;
}
