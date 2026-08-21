const BDZY_IMAGE_SEQUENCE_HOST_SUFFIX = ".bdzybf22.com";

/**
 * BDZY's current `bdzybf22.com` playlists point to JPEG image sequences,
 * not HLS media segments. hls.js cannot play that format as a video stream.
 */
export function hasUsableBdzyPlayback(episodes: string[]) {
  return episodes.some((episodeUrl) => {
    try {
      const hostname = new URL(episodeUrl).hostname.toLowerCase();
      return !hostname.endsWith(BDZY_IMAGE_SEQUENCE_HOST_SUFFIX);
    } catch {
      return false;
    }
  });
}
