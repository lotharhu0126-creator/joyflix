import { NextRequest, NextResponse } from 'next/server';

import { isAdultResult } from '@/lib/adult-content';
import { hasValidAccountSession } from '@/lib/auth';
import { hasUsableBdzyPlayback } from '@/lib/bdzy-playback';
import { getAvailableApiSites, getCacheTime } from '@/lib/config';
import { getDetailFromApi } from '@/lib/downstream';
import { SearchResult } from '@/lib/types';

export const runtime = 'nodejs';

const BDZY_SOURCE_KEY = 'bdzy';

function getBdzyRelayApiUrl() {
  const configuredUrl = process.env.BDZY_RELAY_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const relayUrl = new URL(configuredUrl);
    if (relayUrl.protocol !== 'https:') return null;
    relayUrl.search = '';
    return relayUrl.toString();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const sourceCode = searchParams.get('source');

  if (!id || !sourceCode) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }

  if (!/^[\w-]+$/.test(id)) {
    return NextResponse.json({ error: '无效的视频ID格式' }, { status: 400 });
  }

  try {
    const apiSites = await getAvailableApiSites();
    const apiSite = apiSites.find((site) => site.key === sourceCode);

    if (!apiSite) {
      return NextResponse.json({ error: '无效的API来源' }, { status: 400 });
    }

    let result: SearchResult;
    try {
      result = await getDetailFromApi(apiSite, id);
    } catch (error) {
      const relayApiUrl =
        sourceCode === BDZY_SOURCE_KEY ? getBdzyRelayApiUrl() : null;
      if (!relayApiUrl) throw error;

      // BDZY từ chối IP Netlify cho một số request chi tiết. Relay chỉ hỗ trợ
      // đúng BDZY `ac=videolist&ids=<id>`, không nhận URL đích tuỳ ý.
      console.warn('[BDZY] Detail request failed; retrying dedicated relay');
      result = await getDetailFromApi({ ...apiSite, api: relayApiUrl }, id);
    }

    if (
      sourceCode === BDZY_SOURCE_KEY &&
      !hasUsableBdzyPlayback(result.episodes)
    ) {
      return NextResponse.json(
        { error: 'Nguồn phát BDZY hiện không tương thích với trình phát' },
        { status: 422 }
      );
    }
    if (isAdultResult(result) && !(await hasValidAccountSession(request))) {
      return NextResponse.json(
        { error: 'Không tìm thấy nội dung' },
        { status: 404 }
      );
    }
    const cacheTime = await getCacheTime();

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': isAdultResult(result)
          ? 'private, no-store'
          : `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        ...(isAdultResult(result)
          ? {}
          : {
              'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
              'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
              'Netlify-Vary': 'query',
            }),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
