import { NextRequest, NextResponse } from 'next/server';

import { isAdultResult } from '@/lib/adult-content';
import { hasValidAccountSession } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime } from '@/lib/config';
import { getDetailFromApi } from '@/lib/downstream';

export const runtime = 'nodejs';

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

    const result = await getDetailFromApi(apiSite, id);
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
