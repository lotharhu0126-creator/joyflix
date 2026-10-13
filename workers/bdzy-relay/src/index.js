const BDZY_API_URL = 'https://api.apibdzy.com/api.php/provide/vod/at/json';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;
const ALLOWED_BROWSER_ORIGINS = new Set(['https://xemfree.netlify.app']);

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  const isLocalDevelopment = Boolean(
    origin && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)
  );
  const isAllowedOrigin = Boolean(
    origin && (ALLOWED_BROWSER_ORIGINS.has(origin) || isLocalDevelopment)
  );

  return {
    Vary: 'Origin',
    ...(isAllowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
}

function jsonResponse(request, body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...getCorsHeaders(request),
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

async function readJsonBody(response) {
  const contentLength = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error('BDZY response exceeds size limit');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('BDZY response body is missing');

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('BDZY response exceeds size limit');
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return { body, data: JSON.parse(body) };
}

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...getCorsHeaders(request),
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
      });
    }
    if (request.method !== 'GET') {
      return jsonResponse(request, { error: 'Method not allowed' }, 405);
    }
    if (requestUrl.pathname !== '/bdzy') {
      return jsonResponse(request, { error: 'Not found' }, 404);
    }
    if (requestUrl.searchParams.get('ac') !== 'videolist') {
      return jsonResponse(request, { error: 'Invalid BDZY action' }, 400);
    }

    // Fixed upstream + whitelist query: worker này không thể dùng để proxy URL
    // bất kỳ, không proxy video/image và chỉ relay dữ liệu BDZY cho JoyFlix.
    const upstreamUrl = new URL(BDZY_API_URL);
    upstreamUrl.searchParams.set('ac', 'videolist');
    const requestedId = requestUrl.searchParams.get('ids');
    const isDetailRequest = requestedId !== null;

    if (isDetailRequest) {
      const id = parsePositiveInteger(requestedId, 999_999_999);
      if (
        !id ||
        requestUrl.searchParams.has('t') ||
        requestUrl.searchParams.has('pg') ||
        requestUrl.searchParams.has('wd')
      ) {
        return jsonResponse(
          request,
          { error: 'Invalid BDZY detail query' },
          400
        );
      }
      upstreamUrl.searchParams.set('ids', id);
    } else {
      // `t` chỉ cần khi duyệt một thể loại BDZY cụ thể. Tìm kiếm theo `wd`
      // (ví dụ "粤语") phải được phép đi qua toàn bộ danh mục nguồn này.
      const requestedTypeId = requestUrl.searchParams.get('t');
      const typeId = requestedTypeId
        ? parsePositiveInteger(requestedTypeId, 999)
        : null;
      const page = parsePositiveInteger(
        requestUrl.searchParams.get('pg') || '1',
        1000
      );
      const keyword = requestUrl.searchParams.get('wd');
      if (
        !page ||
        (requestedTypeId !== null && !typeId) ||
        (keyword && keyword.length > 100)
      ) {
        return jsonResponse(request, { error: 'Invalid BDZY query' }, 400);
      }
      if (typeId) upstreamUrl.searchParams.set('t', typeId);
      upstreamUrl.searchParams.set('pg', page);
      if (keyword) upstreamUrl.searchParams.set('wd', keyword);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
      let upstreamResponse;
      try {
        upstreamResponse = await fetch(upstreamUrl, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'User-Agent':
              'Mozilla/5.0 (compatible; JoyFlix-BDZY-Relay/1.0; +https://xemfree.netlify.app)',
          },
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!upstreamResponse.ok) {
        console.warn('BDZY rejected relay request', {
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
        });
        return jsonResponse(
          request,
          { error: 'BDZY upstream rejected the request' },
          502
        );
      }

      const { body, data } = await readJsonBody(upstreamResponse);
      if (!Array.isArray(data?.list)) {
        return jsonResponse(request, { error: 'Invalid BDZY response' }, 502);
      }

      return new Response(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': isDetailRequest
            ? 'no-store'
            : 'public, max-age=300, s-maxage=300',
          'X-Content-Type-Options': 'nosniff',
          ...getCorsHeaders(request),
        },
      });
    } catch (error) {
      console.error('BDZY relay failed', error);
      return jsonResponse(request, { error: 'BDZY relay request failed' }, 502);
    }
  },
};
