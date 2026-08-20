/* eslint-disable @typescript-eslint/no-explicit-any,no-console */
import he from 'he';
import Hls from 'hls.js';

function getDoubanImageProxyConfig(): {
  proxyType:
    | 'direct'
    | 'server'
    | 'img3'
    | 'cmliussss-cdn-tencent'
    | 'cmliussss-cdn-ali'
    | 'custom';
  proxyUrl: string;
} {
  const doubanImageProxyType =
    localStorage.getItem('doubanImageProxyType') ||
    (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE ||
    'direct';
  const doubanImageProxy =
    localStorage.getItem('doubanImageProxyUrl') ||
    (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY ||
    '';
  return {
    proxyType: doubanImageProxyType,
    proxyUrl: doubanImageProxy,
  };
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  // 仅处理豆瓣图片代理
  if (!originalUrl.includes('doubanio.com')) {
    return originalUrl;
  }

  const { proxyType, proxyUrl } = getDoubanImageProxyConfig();
  switch (proxyType) {
    case 'server':
      return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
    case 'img3':
      return originalUrl.replace(/img\d+\.doubanio\.com/g, 'img3.doubanio.com');
    case 'cmliussss-cdn-tencent':
      return originalUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.net'
      );
    case 'cmliussss-cdn-ali':
      return originalUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.com'
      );
    case 'custom':
      return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
    case 'direct':
    default:
      return originalUrl;
  }
}

/**
 * Tạo một ảnh mờ cực nhỏ từ tiêu đề/link poster để thẻ phim không hiện khung
 * trống trong lúc poster từ nguồn VOD đang tải. Không cần gọi thêm API ảnh.
 */
export function getPosterBlurDataUrl(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }

  const hue = Math.abs(hash) % 360;
  const nextHue = (hue + 52) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 15"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 48% 34%)"/><stop offset="1" stop-color="hsl(${nextHue} 54% 14%)"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="1.6"/></filter></defs><rect width="10" height="15" fill="url(#g)"/><circle cx="2" cy="3" r="3" fill="hsl(${nextHue} 55% 55% / .6)" filter="url(#b)"/><circle cx="8" cy="12" r="4" fill="hsl(${hue} 65% 64% / .35)" filter="url(#b)"/></svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * 从m3u8地址获取视频质量等级和网络信息（多点抽样增强版）
 * @param m3u8Url m3u8播放列表的URL
 * @returns Promise<{quality: string, loadSpeed: string, pingTime: number, speedJitter: number}> 视频质量等级和网络信息
 */
export async function getVideoResolutionFromM3u8(m3u8Url: string): Promise<{
  quality: string;
  loadSpeed: string;
  pingTime: number;
  speedJitter: number;
}> {
  return new Promise(async (resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Timeout: Multi-point sampling test took too long'));
    }, 10000); // 10秒总超时

    try {
      // 1. 获取M3U8清单文件，计算初始延迟(Ping)
      const pingStart = performance.now();
      const manifestResponse = await fetch(m3u8Url, {
        signal: controller.signal,
      });
      const pingTime = performance.now() - pingStart;

      if (!manifestResponse.ok) {
        throw new Error(
          `Manifest fetch failed with status: ${manifestResponse.status}`
        );
      }
      const manifestContent = await manifestResponse.text();

      // 2. 从清单中解析分片URL和最高画质
      const lines = manifestContent.split('\n');
      const segmentUrls = lines
        .filter((line) => line.trim() && !line.startsWith('#'))
        .map((url) => new URL(url, m3u8Url).href);

      if (segmentUrls.length === 0) {
        throw new Error('No segments found in manifest');
      }

      const resolutionRegex = /RESOLUTION=(\d+)x(\d+)/g;
      let match;
      let maxResolution = 0;
      while ((match = resolutionRegex.exec(manifestContent)) !== null) {
        const width = parseInt(match[1], 10);
        if (width > maxResolution) maxResolution = width;
      }

      let quality = '未知';
      if (maxResolution > 0) {
        quality =
          maxResolution >= 3840
            ? '4K'
            : maxResolution >= 2560
            ? '2K'
            : maxResolution >= 1920
            ? '1080P'
            : maxResolution >= 1280
            ? '720P'
            : maxResolution >= 854
            ? '480P'
            : 'SD';
      }

      // 3. 选择测试分片（第一个和中间一个）
      const segmentsToTest: string[] = [];
      if (segmentUrls[0]) {
        segmentsToTest.push(segmentUrls[0]);
      }
      if (segmentUrls.length > 2) {
        segmentsToTest.push(segmentUrls[Math.floor(segmentUrls.length / 2)]);
      }

      // 4. 并行测试分片下载速度
      const testSegment = async (url: string): Promise<number> => {
        try {
          const startTime = performance.now();
          const segmentResponse = await fetch(url, {
            signal: controller.signal,
          });
          if (!segmentResponse.ok) return 0;
          const size = (await segmentResponse.arrayBuffer()).byteLength;
          const loadTime = performance.now() - startTime;
          if (loadTime <= 0 || size <= 0) return 0;
          return size / 1024 / (loadTime / 1000); // KB/s
        } catch (error) {
          return 0; // 任何错误都视为速度为0
        }
      };

      const speedSamples = (
        await Promise.all(segmentsToTest.map(testSegment))
      ).filter((speed) => speed > 0);

      if (speedSamples.length === 0) {
        throw new Error('All segment download tests failed');
      }

      // 5. 计算最终统计数据
      const avgSpeed =
        speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;
      const finalLoadSpeed =
        avgSpeed >= 1024
          ? `${(avgSpeed / 1024).toFixed(1)} MB/s`
          : `${avgSpeed.toFixed(1)} KB/s`;

      let speedJitter = 0;
      if (speedSamples.length > 1) {
        const mean = avgSpeed;
        const variance =
          speedSamples
            .map((x) => Math.pow(x - mean, 2))
            .reduce((a, b) => a + b, 0) / speedSamples.length;
        speedJitter = Math.sqrt(variance);
      }

      clearTimeout(timeout);
      resolve({
        quality,
        loadSpeed: finalLoadSpeed,
        pingTime: Math.round(pingTime),
        speedJitter,
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';

  const cleanedText = text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .trim(); // 去掉首尾空格

  // 使用 he 库解码 HTML 实体
  return he.decode(cleanedText);
}
