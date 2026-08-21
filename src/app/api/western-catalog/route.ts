import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { NextRequest, NextResponse } from "next/server";

import { hasUsableBdzyPlayback } from "@/lib/bdzy-playback";
import { API_CONFIG, ApiSite, getAvailableApiSites } from "@/lib/config";
import { SearchResult } from "@/lib/types";

export const runtime = "nodejs";

const BDZY_SOURCE_KEY = "bdzy";
const BDZY_TYPE_ID = 14;
// Các nguồn VOD không ổn định; không để vài nguồn chậm giữ skeleton trên
// trang chủ quá lâu. Nguồn quá hạn sẽ được bỏ qua trong lần quét đó.
const REQUEST_TIMEOUT_MS = 4_000;
const FETCH_CONCURRENCY = 12;
// Một hàng chỉ có 20 thẻ; xác minh chúng song song giúp không cộng dồn thời
// gian chờ của từng CDN, trong khi vẫn không tải hay proxy toàn bộ video.
const PLAYBACK_CONCURRENCY = 20;
const PLAYBACK_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_SEGMENT_PROBE_BYTES = 4 * 1024;
const BDZY_PREVIEW_PAGE_COUNT = 5;
const BDZY_LEGACY_PLAYABLE_PAGE_COUNT = 14;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
// Trang chủ chỉ cần một hàng phim. Giữ giới hạn này bằng đúng số thẻ hiển thị
// để khách đầu tiên không phải chờ kiểm tra thêm các stream chưa cần đến.
const CATALOG_SIZE = 20;
// Mỗi API tự đặt mã thể loại riêng. Chỉ dùng các nguồn JoyFlix đã xác nhận
// có đúng danh mục 欧美剧, thay vì quét cả nguồn không phản hồi/rỗng ở mỗi lần
// khách mở trang chủ.
const WESTERN_SOURCE_TYPE_IDS: Readonly<Record<string, readonly number[]>> = {
  dyttzy: [16],
  gszy: [14],
  ruyi: [16],
  bfzy: [32],
  tyyszy: [14],
  zy360: [16],
  jisu: [3],
  ikun: [26],
  maoyan: [16],
  jy: [3],
  sn: [14],
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
  pagecount?: number | string;
}

interface WesternTarget {
  site: ApiSite;
  typeId: number;
}

interface Candidate extends SearchResult {
  sourceOrder: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface WesternCatalog {
  items: SearchResult[];
  sourceCount: number;
}

const playableUrlCache = new Map<string, CacheEntry<boolean>>();
const westernCatalogCache = new Map<string, CacheEntry<WesternCatalog>>();
const westernCatalogPromises = new Map<string, Promise<WesternCatalog>>();

function getEpisodes(playUrl?: string) {
  let episodes: string[] = [];
  let titles: string[] = [];

  for (const sourceLine of playUrl?.split("$$$") || []) {
    const candidateEpisodes: string[] = [];
    const candidateTitles: string[] = [];

    for (const episode of sourceLine.split("#")) {
      const [title, url, ...rest] = episode.split("$");
      const pathname = url?.split("?")[0]?.toLowerCase();
      if (title && url && rest.length === 0 && pathname?.endsWith(".m3u8")) {
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
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?:粤语|国语|汉语普通话|普通话)(?:版)?/g, "")
    .replace(/[\s·・:：,，.。'"“”‘’()（）\[\]【】{}<>《》_\-—–]/g, "");
}

function getBdzyRelayUrl(upstreamUrl: URL): URL | null {
  const configuredUrl = process.env.BDZY_RELAY_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const relayUrl = new URL(configuredUrl);
    if (relayUrl.protocol !== "https:") return null;
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
      cache: "no-store",
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
  upstreamUrl.searchParams.set("ac", "videolist");
  upstreamUrl.searchParams.set("t", String(target.typeId));
  upstreamUrl.searchParams.set("pg", String(page));
  const requestUrl =
    target.site.key === BDZY_SOURCE_KEY
      ? getBdzyRelayUrl(upstreamUrl) || upstreamUrl
      : upstreamUrl;

  const data = (await fetchJson(requestUrl)) as UpstreamPage | null;
  return Array.isArray(data?.list) ? data : null;
}

function toCandidate(
  site: ApiSite,
  video: UpstreamVideo,
  sourceOrder: number
): Candidate | null {
  const title = video.vod_name?.trim().replace(/\s+/g, " ");
  if (!title || video.vod_id === undefined || video.vod_id === null) {
    return null;
  }

  const { episodes, titles } = getEpisodes(video.vod_play_url);
  if (episodes.length === 0) return null;
  if (site.key === BDZY_SOURCE_KEY && !hasUsableBdzyPlayback(episodes)) {
    return null;
  }

  return {
    id: String(video.vod_id),
    title,
    poster: video.vod_pic || "",
    episodes,
    episodes_titles: titles,
    source: site.key,
    source_name: site.name,
    class: video.vod_class,
    year: video.vod_year?.match(/\d{4}/)?.[0] || "unknown",
    desc: video.vod_content || "",
    type_name: video.type_name,
    type_id: video.type_id,
    country: video.vod_area,
    sourceOrder,
  };
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPublicIp(address: string) {
  const version = isIP(address);
  if (version === 4) return !isPrivateIpv4(address);
  if (version !== 6) return false;

  const value = address.toLowerCase();
  return !(
    value === "::1" ||
    value === "::" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80:") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.") ||
    value.startsWith("::ffff:169.254.")
  );
}

async function isSafePlaybackUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:" ||
      Boolean(url.username) ||
      Boolean(url.password) ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local")
    ) {
      return false;
    }

    if (isIP(url.hostname)) return isPublicIp(url.hostname);
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    return (
      addresses.length > 0 &&
      addresses.every(({ address }) => isPublicIp(address))
    );
  } catch {
    return false;
  }
}

function isCorsAllowed(response: Response, siteOrigin: string) {
  const allowedOrigins = response.headers.get("access-control-allow-origin");
  if (!allowedOrigins) return false;
  return allowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .some((origin) => origin === "*" || origin === siteOrigin);
}

async function readResponseAtMost(response: Response, maximumBytes: number) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error("Response too large");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response body");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error("Response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function fetchPlaybackResource(
  url: string,
  siteOrigin: string,
  probeSegment = false
) {
  if (!(await isSafePlaybackUrl(url))) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
      headers: {
        Accept: probeSegment ? "*/*" : "application/vnd.apple.mpegurl, */*",
        ...(probeSegment ? { Range: "bytes=0-4095" } : {}),
      },
    });
    if (!response.ok || !isCorsAllowed(response, siteOrigin)) return null;
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function findFirstMediaUri(manifest: string) {
  return manifest
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
}

function isJpeg(bytes: Uint8Array) {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function isMpegTs(bytes: Uint8Array) {
  return bytes[0] === 0x47 || (bytes.length > 188 && bytes[188] === 0x47);
}

function isFragmentedMp4(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
}

async function isHlsPlayable(playlistUrl: string, siteOrigin: string) {
  const cached = playableUrlCache.get(playlistUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value = false;
  let currentUrl = playlistUrl;
  try {
    for (let depth = 0; depth < 3; depth += 1) {
      const response = await fetchPlaybackResource(currentUrl, siteOrigin);
      if (!response) break;

      const manifestBytes = await readResponseAtMost(
        response,
        MAX_MANIFEST_BYTES
      );
      const manifest = new TextDecoder().decode(manifestBytes);
      if (!manifest.startsWith("#EXTM3U")) break;

      const mediaUri = findFirstMediaUri(manifest);
      if (!mediaUri) break;
      const mediaUrl = new URL(mediaUri, currentUrl).toString();
      if (mediaUrl.split("?")[0].toLowerCase().endsWith(".m3u8")) {
        currentUrl = mediaUrl;
        continue;
      }

      const segment = await fetchPlaybackResource(mediaUrl, siteOrigin, true);
      if (!segment) break;
      const contentType =
        segment.headers.get("content-type")?.toLowerCase() || "";
      if (
        contentType.startsWith("image/") ||
        contentType.includes("text/html")
      ) {
        break;
      }
      const bytes = await readResponseAtMost(segment, MAX_SEGMENT_PROBE_BYTES);
      value =
        !isJpeg(bytes) &&
        (contentType.startsWith("video/") ||
          contentType.startsWith("audio/") ||
          isMpegTs(bytes) ||
          isFragmentedMp4(bytes));
      break;
    }
  } catch {
    value = false;
  }

  playableUrlCache.set(playlistUrl, {
    value,
    expiresAt: Date.now() + PLAYBACK_CACHE_TTL_MS,
  });
  return value;
}

function interleaveCandidates(
  regularGroups: Candidate[][],
  bdzyCandidates: Candidate[],
  maximumCandidates: number
) {
  const regularQueues = regularGroups.map((items) => [...items]);
  const bdzyQueue = [...bdzyCandidates];
  const candidates: Candidate[] = [];

  while (candidates.length < maximumCandidates) {
    let added = false;
    for (let index = 0; index < regularQueues.length; index += 1) {
      const candidate = regularQueues[index].shift();
      if (candidate) {
        candidates.push(candidate);
        added = true;
      }
      // BDZY là nguồn bổ sung: xen sau mỗi bốn nguồn JoyFlix để cả hai
      // cùng xuất hiện trong hàng đầu mà không ưu tiên một bên tuyệt đối.
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

async function getVerifiedCandidates(
  candidates: Candidate[],
  limit: number,
  siteOrigin: string
) {
  const selected: SearchResult[] = [];
  const usedTitles = new Set<string>();

  for (
    let start = 0;
    start < candidates.length && selected.length < limit;
    start += PLAYBACK_CONCURRENCY
  ) {
    const batch = candidates.slice(start, start + PLAYBACK_CONCURRENCY);
    const playbackResults = await Promise.all(
      batch.map((candidate) => isHlsPlayable(candidate.episodes[0], siteOrigin))
    );

    batch.forEach((candidate, index) => {
      if (!playbackResults[index] || selected.length >= limit) return;
      const titleKey = normalizeTitle(candidate.title);
      if (!titleKey || usedTitles.has(titleKey)) return;
      usedTitles.add(titleKey);
      const { sourceOrder: _sourceOrder, ...item } = candidate;
      selected.push(item);
    });
  }

  return selected;
}

async function getBdzyCandidates(target: WesternTarget, sourceOrder: number) {
  const firstPage = await fetchSourcePage(target, 1);
  const pageCount = Math.max(1, Number(firstPage?.pagecount) || 1);
  const firstCandidates = (firstPage?.list || [])
    .map((video) => toCandidate(target.site, video, sourceOrder))
    .filter((candidate): candidate is Candidate => Boolean(candidate));

  // BDZY hiện xếp nhóm JPEG lỗi ở đầu kho; phần HLS hợp lệ bắt đầu ở các
  // trang cũ hơn. Nếu trang 1 không có HLS, chỉ quét một cửa sổ nhỏ ở phần
  // cuối kho để lấy thẻ bổ sung cho trang chủ, không quét cả 629 mục.
  const startPage =
    firstCandidates.length > 0
      ? 2
      : Math.max(2, pageCount - BDZY_LEGACY_PLAYABLE_PAGE_COUNT + 1);
  const endPage = Math.min(pageCount, startPage + BDZY_PREVIEW_PAGE_COUNT - 1);
  const pageNumbers = Array.from(
    { length: Math.max(0, endPage - startPage + 1) },
    (_, index) => startPage + index
  );
  const remainingPages = await mapWithConcurrency(
    pageNumbers,
    (page) => fetchSourcePage(target, page),
    FETCH_CONCURRENCY
  );

  const remainingCandidates = remainingPages
    .flatMap((page) => page?.list || [])
    .map((video) => toCandidate(target.site, video, sourceOrder))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  return [...firstCandidates, ...remainingCandidates];
}

async function buildWesternCatalog(
  siteOrigin: string
): Promise<WesternCatalog> {
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
    bdzyTarget
      ? getBdzyCandidates(
          bdzyTarget,
          sites.findIndex((site) => site.key === BDZY_SOURCE_KEY)
        )
      : Promise.resolve([]),
  ]);
  const regularGroups = regularPages.map((page, index) =>
    (page?.list || [])
      .map((video) =>
        toCandidate(
          regularTargets[index].site,
          video,
          sites.findIndex((site) => site.key === regularTargets[index].site.key)
        )
      )
      .filter((candidate): candidate is Candidate => Boolean(candidate))
  );

  const candidates = interleaveCandidates(
    regularGroups,
    bdzyCandidates,
    Math.max(CATALOG_SIZE * 12, 120)
  );
  const items = await getVerifiedCandidates(
    candidates,
    CATALOG_SIZE,
    siteOrigin
  );

  return {
    items,
    sourceCount: new Set(items.map((item) => item.source)).size,
  };
}

function getWesternCatalog(siteOrigin: string) {
  const cached = westernCatalogCache.get(siteOrigin);
  if (cached && cached.expiresAt > Date.now())
    return Promise.resolve(cached.value);

  const pending = westernCatalogPromises.get(siteOrigin);
  if (pending) return pending;

  const request = buildWesternCatalog(siteOrigin)
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
  const limit = Number(request.nextUrl.searchParams.get("limit") || "20");
  if (!Number.isInteger(limit) || limit < 1 || limit > CATALOG_SIZE) {
    return NextResponse.json(
      { error: "Giới hạn không hợp lệ" },
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
        // Danh mục này không có nội dung 18+; cache ngắn để khách sau không
        // phải kiểm tra lại cùng manifest/segment ngay lập tức.
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=600",
          "Netlify-Vary": "query",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Không thể tổng hợp phim Âu Mỹ lúc này" },
      { status: 502 }
    );
  }
}
