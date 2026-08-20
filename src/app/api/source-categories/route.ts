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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: 'BDZY không phản hồi' },
        { status: 502 }
      );
    }

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
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'BDZY phản hồi quá chậm'
        : 'Không thể tải danh mục BDZY';
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
