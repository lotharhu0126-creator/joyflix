const BDZY_IMAGE_SEQUENCE_HOST_SUFFIX = ".bdzybf22.com";

function isBdzyImageSequenceUrl(episodeUrl: string) {
  try {
    return new URL(episodeUrl).hostname
      .toLowerCase()
      .endsWith(BDZY_IMAGE_SEQUENCE_HOST_SUFFIX);
  } catch {
    // A malformed URL cannot be handed to the player either.
    return true;
  }
}

/**
 * Keeps episode titles aligned with their playable URLs. BDZY occasionally
 * mixes normal HLS links with `.bdzybf22.com` JPEG sequences in one source
 * line; dropping only the whole movie would unnecessarily hide valid episodes.
 */
export function getUsableBdzyEpisodes(
  episodes: string[],
  titles: string[]
) {
  const usableEpisodes: string[] = [];
  const usableTitles: string[] = [];

  episodes.forEach((episodeUrl, index) => {
    if (isBdzyImageSequenceUrl(episodeUrl)) return;
    usableEpisodes.push(episodeUrl);
    usableTitles.push(titles[index] || `Tập ${index + 1}`);
  });

  return { episodes: usableEpisodes, titles: usableTitles };
}

/**
 * BDZY's current `bdzybf22.com` playlists point to JPEG image sequences,
 * not HLS media segments. hls.js cannot play that format as a video stream.
 */
export function hasUsableBdzyPlayback(episodes: string[]) {
  return episodes.some((episodeUrl) => !isBdzyImageSequenceUrl(episodeUrl));
}
