const STREAM_TIMEOUT_MS = 4000;
const MAX_PLAYLIST_BYTES = 256 * 1024;
const MAX_SEGMENT_PROBE_BYTES = 4096;

async function readResponseAtMost(response: Response, maximumBytes: number) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function fetchPlaybackBytes(
  url: string,
  maximumBytes: number,
  signal: AbortSignal,
  headers: HeadersInit
) {
  const timeoutController = new AbortController();
  const cancel = () => timeoutController.abort();
  const timeout = window.setTimeout(cancel, STREAM_TIMEOUT_MS);
  signal.addEventListener('abort', cancel, { once: true });

  try {
    const response = await fetch(url, {
      signal: timeoutController.signal,
      cache: 'no-store',
      headers,
    });
    if (!response.ok) return null;
    const bytes = await readResponseAtMost(response, maximumBytes);
    if (!bytes) return null;
    return {
      bytes,
      contentType: response.headers.get('content-type')?.toLowerCase() || '',
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

function getFirstMediaUri(manifest: string) {
  return manifest
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
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
  return new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp';
}

/**
 * This runs in the same browser and with the same CORS rules as hls.js. A
 * card is shown only after its first HLS playlist and media segment respond
 * as playable video, not an HTML error page or BDZY JPEG sequence.
 */
export async function canPlayHlsInBrowser(
  url: string | undefined,
  signal: AbortSignal
) {
  if (!url) return false;
  let currentUrl = url;

  for (let depth = 0; depth < 3; depth += 1) {
    const playlist = await fetchPlaybackBytes(
      currentUrl,
      MAX_PLAYLIST_BYTES,
      signal,
      { Accept: 'application/vnd.apple.mpegurl, */*' }
    );
    if (!playlist) return false;

    const manifest = new TextDecoder().decode(playlist.bytes);
    if (!manifest.startsWith('#EXTM3U')) return false;
    const mediaUri = getFirstMediaUri(manifest);
    if (!mediaUri) return false;

    try {
      currentUrl = new URL(mediaUri, currentUrl).toString();
    } catch {
      return false;
    }

    if (currentUrl.split('?')[0].toLowerCase().endsWith('.m3u8')) continue;

    const segment = await fetchPlaybackBytes(
      currentUrl,
      MAX_SEGMENT_PROBE_BYTES,
      signal,
      { Range: 'bytes=0-4095' }
    );
    if (!segment || isJpeg(segment.bytes)) return false;
    return (
      segment.contentType.startsWith('video/') ||
      segment.contentType.startsWith('audio/') ||
      isMpegTs(segment.bytes) ||
      isFragmentedMp4(segment.bytes)
    );
  }

  return false;
}
