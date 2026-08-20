const BDZY_API_URL = 'https://api.apibdzy.com/api.php/provide/vod/at/json';

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function parsePositiveInteger(value, maximum) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? String(parsed)
    : null;
}

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }
    if (requestUrl.pathname !== '/bdzy') {
      return jsonResponse({ error: 'Not found' }, 404);
    }
    if (requestUrl.searchParams.get('ac') !== 'videolist') {
      return jsonResponse({ error: 'Invalid BDZY action' }, 400);
    }

    // `t` chỉ cần khi duyệt một thể loại BDZY cụ thể. Tìm kiếm theo `wd`
    // (ví dụ "粤语") phải được phép đi qua toàn bộ danh mục nguồn này.
    const requestedTypeId = requestUrl.searchParams.get('t');
    const typeId = requestedTypeId
      ? parsePositiveInteger(requestedTypeId, 999)
      : null;
    const page = parsePositiveInteger(requestUrl.searchParams.get('pg') || '1', 1000);
    const keyword = requestUrl.searchParams.get('wd');
    if (
      !page ||
      (requestedTypeId !== null && !typeId) ||
      (keyword && keyword.length > 100)
    ) {
      return jsonResponse({ error: 'Invalid BDZY query' }, 400);
    }

    // Fixed upstream + whitelist query: worker này không thể dùng để proxy URL
    // bất kỳ, không proxy video/image và chỉ relay danh sách BDZY cho JoyFlix.
    const upstreamUrl = new URL(BDZY_API_URL);
    upstreamUrl.searchParams.set('ac', 'videolist');
    if (typeId) upstreamUrl.searchParams.set('t', typeId);
    upstreamUrl.searchParams.set('pg', page);
    if (keyword) upstreamUrl.searchParams.set('wd', keyword);

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (compatible; JoyFlix-BDZY-Relay/1.0; +https://xemfree.netlify.app)',
        },
      });

      if (!upstreamResponse.ok) {
        console.warn('BDZY rejected relay request', {
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
        });
        return jsonResponse(
          { error: 'BDZY upstream rejected the request' },
          502
        );
      }

      const body = await upstreamResponse.text();
      const data = JSON.parse(body);
      if (!Array.isArray(data?.list)) {
        return jsonResponse({ error: 'Invalid BDZY response' }, 502);
      }

      return new Response(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (error) {
      console.error('BDZY relay failed', error);
      return jsonResponse({ error: 'BDZY relay request failed' }, 502);
    }
  },
};
