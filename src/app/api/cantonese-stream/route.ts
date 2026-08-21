import { NextRequest, NextResponse } from "next/server";

import { hasValidAccountSession } from "@/lib/auth";
import { getUsableBdzyEpisodes } from "@/lib/bdzy-playback";
import { API_CONFIG, ApiSite, getAvailableApiSites } from "@/lib/config";
import { SearchResult } from "@/lib/types";

export const runtime = "nodejs";

const BDZY_SOURCE_KEY = "bdzy";
const CANTONESE_QUERY = "粤语";
const UPSTREAM_TIMEOUT_MS = 8000;

type CantoneseCategory = "series" | "movie";

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

function isCantonese(video: UpstreamVideo) {
  const title = video.vod_name || "";
  const language = video.vod_lang || "";
  const hasCantonese =
    title.includes(CANTONESE_QUERY) || language.includes(CANTONESE_QUERY);
  const isMandarinOnlyTitle =
    !title.includes(CANTONESE_QUERY) &&
    /(?:国语|普通话|汉语普通话)/.test(title);

  return hasCantonese && !isMandarinOnlyTitle;
}

function isLikelyAdult(
  video: Pick<UpstreamVideo, "vod_name" | "vod_class" | "type_name">
) {
  return /(?:伦理|情色|色情|成人|午夜|18[+＋])/.test(
    [video.vod_name, video.vod_class, video.type_name].filter(Boolean).join(" ")
  );
}

function normalizeTitle(title: string) {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?:粤语|国语|汉语普通话|普通话)(?:版)?/g, "")
    .replace(/[\s·・:：,，.。'"“”‘’()（）\[\]【】{}<>《》_\-—–]/g, "");
}

function toSearchResult(
  site: ApiSite,
  video: UpstreamVideo
): SearchResult | null {
  const title = video.vod_name?.trim().replace(/\s+/g, " ");
  if (!title || video.vod_id === undefined || video.vod_id === null) {
    return null;
  }

  let { episodes, titles } = getEpisodes(video.vod_play_url);
  if (episodes.length === 0) return null;
  if (site.key === BDZY_SOURCE_KEY) {
    ({ episodes, titles } = getUsableBdzyEpisodes(episodes, titles));
    if (episodes.length === 0) return null;
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

async function fetchSourcePage(
  site: ApiSite,
  page: number
): Promise<UpstreamPage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamUrl = new URL(site.api);
    upstreamUrl.searchParams.set("ac", "videolist");
    upstreamUrl.searchParams.set("wd", CANTONESE_QUERY);
    upstreamUrl.searchParams.set("pg", String(page));
    const requestUrl =
      site.key === BDZY_SOURCE_KEY
        ? getBdzyRelayUrl(upstreamUrl) || upstreamUrl
        : upstreamUrl;

    const response = await fetch(requestUrl, {
      signal: controller.signal,
      headers: API_CONFIG.search.headers,
      cache: "no-store",
    });
    if (!response.ok) return null;

    const data = (await response.json()) as UpstreamPage;
    return Array.isArray(data.list) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getNextCursor(
  sourceIndex: number,
  page: number,
  pageCount: number,
  sourceTotal: number
) {
  const hasNextPageInSource = page < pageCount;
  const nextSourceIndex = hasNextPageInSource ? sourceIndex : sourceIndex + 1;
  const nextPage = hasNextPageInSource ? page + 1 : 1;

  return {
    hasMore: nextSourceIndex < sourceTotal,
    nextCursor: { sourceIndex: nextSourceIndex, page: nextPage },
  };
}

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const sourceIndex = Number(request.nextUrl.searchParams.get("source") || "0");
  const page = Number(request.nextUrl.searchParams.get("page") || "1");

  if (category !== "series" && category !== "movie") {
    return NextResponse.json(
      { error: "Danh mục không hợp lệ" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex > 1000) {
    return NextResponse.json({ error: "Nguồn không hợp lệ" }, { status: 400 });
  }
  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    return NextResponse.json(
      { error: "Trang nguồn không hợp lệ" },
      { status: 400 }
    );
  }

  const sites = await getAvailableApiSites();
  if (sourceIndex >= sites.length) {
    return NextResponse.json({
      items: [],
      hasMore: false,
      nextCursor: null,
      sourceCount: sites.length,
    });
  }

  const site = sites[sourceIndex];
  const data = await fetchSourcePage(site, page);
  if (!data) {
    const cursor = getNextCursor(sourceIndex, page, page, sites.length);
    return NextResponse.json({
      items: [],
      ...cursor,
      sourceCount: sites.length,
      sourceIndex,
      sourceName: site.name,
      sourcePage: page,
    });
  }

  const includeAdult = await hasValidAccountSession(request);
  const videos = data.list || [];
  const uniqueItems = new Map<string, SearchResult>();
  for (const video of videos) {
    if (!isCantonese(video)) continue;
    if (!includeAdult && isLikelyAdult(video)) continue;

    const item = toSearchResult(site, video);
    if (!item) continue;
    const matchesCategory =
      category === "series"
        ? item.episodes.length > 1
        : item.episodes.length === 1;
    if (!matchesCategory) continue;

    const key = normalizeTitle(item.title);
    const current = uniqueItems.get(key);
    if (!current || shouldReplaceCandidate(current, item)) {
      uniqueItems.set(key, item);
    }
  }

  const pageCount = Math.max(1, Number(data.pagecount) || 1);
  // Khi nguồn bỏ qua wd=粤语, trang đầu thường là danh sách chung và không có
  // mục 粤语 nào. Bỏ qua cả nguồn đó thay vì bắt người xem cuộn qua hàng trăm
  // trang không liên quan. Nếu trang đầu có 粤语 thì tiếp tục đến hết pagecount.
  const sourceHasCantonese = videos.some(isCantonese);
  const cursor = getNextCursor(
    sourceIndex,
    page,
    page === 1 && !sourceHasCantonese ? 1 : pageCount,
    sites.length
  );
  return NextResponse.json(
    {
      items: Array.from(uniqueItems.values()),
      ...cursor,
      sourceCount: sites.length,
      sourceIndex,
      sourceName: site.name,
      sourcePage: page,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
