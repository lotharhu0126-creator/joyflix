import { NextRequest, NextResponse } from 'next/server';

import { BDZY_ADULT_TYPE_ID } from '@/lib/adult-content';
import { hasValidAccountSession } from '@/lib/auth';
import {
  HONG_KONG_CATEGORY_ID,
  HONG_KONG_LANGUAGES,
  HongKongLanguage,
  isBdzyCategoryId,
} from '@/lib/bdzy-categories';
import { getAvailableApiSites } from '@/lib/config';
import { SearchResult } from '@/lib/types';

export const runtime = 'nodejs';

const BDZY_SOURCE_KEY = 'bdzy';
const BDZY_RELAY_URL_ENV = 'BDZY_RELAY_URL';
const BDZY_TIMEOUT_MS = 10_000;
const BDZY_MAX_ATTEMPTS = 2;
const BDZY_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};
const RETRIABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

interface BdzyVideo {
  vod_id: number | string;
  vod_name: string;
  vod_pic?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  type_name?: string;
  type_id?: number;
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

class BdzyRequestError extends Error {
  constructor(
    message: string,
    readonly type: 'network' | 'timeout' | 'upstream',
    readonly upstreamStatus?: number
  ) {
    super(message);
    this.name = 'BdzyRequestError';
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return { value: String(error) };

  const cause = (error as Error & { cause?: unknown }).cause;
  return {
    name: error.name,
    message: error.message,
    cause:
      cause instanceof Error
        ? { name: cause.name, message: cause.message }
        : cause
          ? String(cause)
          : undefined,
  };
}

async function fetchBdzy(
  url: URL,
  requestTarget: 'upstream' | 'relay'
): Promise<Response> {
  for (let attempt = 1; attempt <= BDZY_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BDZY_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: BDZY_HEADERS,
        cache: 'no-store',
      });

      if (response.ok) return response;

      const retryable = RETRIABLE_STATUS_CODES.has(response.status);
      console.warn('[BDZY] Upstream returned a non-success response', {
        attempt,
        requestTarget,
        status: response.status,
        statusText: response.statusText,
        retryable,
      });

      if (!retryable || attempt === BDZY_MAX_ATTEMPTS) {
        throw new BdzyRequestError(
          `BDZY upstream returned HTTP ${response.status}`,
          'upstream',
          response.status
        );
      }
    } catch (error) {
      if (error instanceof BdzyRequestError) throw error;

      const timedOut = error instanceof Error && error.name === 'AbortError';
      console.error('[BDZY] Request from server failed', {
        attempt,
        requestTarget,
        timedOut,
        ...describeError(error),
      });

      if (attempt === BDZY_MAX_ATTEMPTS) {
        throw new BdzyRequestError(
          timedOut ? 'BDZY request timed out' : 'BDZY network request failed',
          timedOut ? 'timeout' : 'network'
        );
      }
    } finally {
      clearTimeout(timeout);
    }

    // Chỉ retry một lần để tránh giữ function Netlify quá lâu khi nguồn lỗi.
    await delay(350);
  }

  throw new BdzyRequestError('BDZY network request failed', 'network');
}

function getBdzyRelayUrl(upstreamUrl: URL): URL | null {
  const configuredUrl = process.env[BDZY_RELAY_URL_ENV]?.trim();
  if (!configuredUrl) return null;

  try {
    const relayUrl = new URL(configuredUrl);
    if (relayUrl.protocol !== 'https:') {
      console.error('[BDZY] Relay URL must use HTTPS');
      return null;
    }
    // Relay chỉ nhận các query BDZY đã được tạo ở route này, không nhận target
    // URL từ trình duyệt nên không thể biến thành open proxy.
    relayUrl.search = upstreamUrl.search;
    return relayUrl;
  } catch (error) {
    console.error('[BDZY] Relay URL is invalid', describeError(error));
    return null;
  }
}

function shouldRetryThroughRelay(error: BdzyRequestError) {
  return (
    error.type === 'network' ||
    error.type === 'timeout' ||
    error.upstreamStatus === 401 ||
    error.upstreamStatus === 403 ||
    error.upstreamStatus === 429 ||
    (error.upstreamStatus != null && error.upstreamStatus >= 500)
  );
}

async function fetchBdzyWithFallback(upstreamUrl: URL): Promise<Response> {
  try {
    return await fetchBdzy(upstreamUrl, 'upstream');
  } catch (error) {
    if (
      !(error instanceof BdzyRequestError) ||
      !shouldRetryThroughRelay(error)
    ) {
      throw error;
    }

    const relayUrl = getBdzyRelayUrl(upstreamUrl);
    if (!relayUrl) throw error;

    console.warn('[BDZY] Direct request failed; using dedicated relay', {
      type: error.type,
      upstreamStatus: error.upstreamStatus,
    });
    return fetchBdzy(relayUrl, 'relay');
  }
}

export async function GET(request: NextRequest) {
  const typeId = Number(request.nextUrl.searchParams.get('typeId'));
  const page = Number(request.nextUrl.searchParams.get('page') || '1');
  const requestedLanguage = request.nextUrl.searchParams.get('language');
  const language = HONG_KONG_LANGUAGES.includes(
    requestedLanguage as HongKongLanguage
  )
    ? (requestedLanguage as HongKongLanguage)
    : null;

  if (!Number.isInteger(typeId) || !isBdzyCategoryId(typeId)) {
    return NextResponse.json(
      { error: 'Danh mục không hợp lệ' },
      { status: 400 }
    );
  }
  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    return NextResponse.json({ error: 'Trang không hợp lệ' }, { status: 400 });
  }
  if (requestedLanguage && (typeId !== HONG_KONG_CATEGORY_ID || !language)) {
    return NextResponse.json(
      { error: 'Bộ lọc ngôn ngữ không hợp lệ' },
      { status: 400 }
    );
  }
  if (
    typeId === BDZY_ADULT_TYPE_ID &&
    !(await hasValidAccountSession(request))
  ) {
    return NextResponse.json(
      { error: 'Bạn cần đăng nhập để xem danh mục này' },
      { status: 403 }
    );
  }

  const bdzy = (await getAvailableApiSites()).find(
    (site) => site.key === BDZY_SOURCE_KEY
  );
  if (!bdzy) {
    return NextResponse.json(
      { error: 'Nguồn BDZY chưa được cấu hình hoặc đang bị tắt' },
      { status: 404 }
    );
  }

  const url = new URL(bdzy.api);
  url.searchParams.set('ac', 'videolist');
  url.searchParams.set('t', String(typeId));
  url.searchParams.set('pg', String(page));
  // BDZY không hỗ trợ tham số lang, nhưng wd kết hợp với t=17 trả về đúng
  // danh sách Hồng Kông theo nhãn 粤语/国语 và vẫn có phân trang từ nguồn.
  if (language) url.searchParams.set('wd', language);

  try {
    const response = await fetchBdzyWithFallback(url);

    const data = await response.json();
    if (!data || !Array.isArray(data.list)) {
      return NextResponse.json(
        { error: 'BDZY trả về dữ liệu không hợp lệ' },
        { status: 502 }
      );
    }

    const items: SearchResult[] = data.list.map((item: BdzyVideo) => {
      const { episodes, titles } = getEpisodes(item.vod_play_url);
      return {
        id: String(item.vod_id),
        title: item.vod_name?.trim() || 'Không có tiêu đề',
        poster: item.vod_pic || '',
        episodes,
        episodes_titles: titles,
        source: BDZY_SOURCE_KEY,
        source_name: bdzy.name,
        class: item.vod_class,
        year: item.vod_year?.match(/\d{4}/)?.[0] || 'unknown',
        desc: item.vod_content,
        type_name: item.type_name,
        type_id: item.type_id || typeId,
      };
    });

    return NextResponse.json(
      {
        items,
        page: Number(data.page) || page,
        pageCount: Number(data.pagecount) || 0,
        total: Number(data.total) || 0,
      },
      {
        // Cache riêng trong trình duyệt: an toàn với tài khoản/18+ mà vẫn làm
        // lần quay lại danh mục nhanh hơn, không cần gọi BDZY lần nữa.
        headers: {
          'Cache-Control': 'private, max-age=300, stale-while-revalidate=1800',
        },
      }
    );
  } catch (error) {
    const bdzyError = error instanceof BdzyRequestError ? error : null;
    if (!bdzyError) {
      console.error('[BDZY] Response could not be parsed', describeError(error));
    }

    const message = bdzyError?.type === 'timeout'
      ? 'BDZY phản hồi quá chậm'
      : bdzyError?.type === 'upstream'
        ? `BDZY tạm từ chối yêu cầu (HTTP ${bdzyError.upstreamStatus})`
        : 'Không thể kết nối đến BDZY từ máy chủ';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
