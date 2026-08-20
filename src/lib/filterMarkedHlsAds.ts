/**
 * Removes ad media only when the HLS playlist explicitly brackets it with
 * EXT-X-CUE-OUT and EXT-X-CUE-IN. Any playlist without a complete pair is
 * returned byte-for-byte unchanged so ordinary video segments are never
 * guessed to be advertisements.
 */
export function filterMarkedHlsAds(playlist: string): string {
  if (!playlist) return playlist;

  const lines = playlist.split(/\r?\n/);
  const hasCueOut = lines.some(
    (line) =>
      line.startsWith('#EXT-X-CUE-OUT') &&
      !line.startsWith('#EXT-X-CUE-OUT-CONT')
  );
  const hasCueIn = lines.some((line) => line.startsWith('#EXT-X-CUE-IN'));

  // A playlist fetched mid-break must remain untouched.
  if (!hasCueOut || !hasCueIn) return playlist;

  let insideMarkedAd = false;
  const filteredLines: string[] = [];

  for (const line of lines) {
    const isCueOut =
      line.startsWith('#EXT-X-CUE-OUT') &&
      !line.startsWith('#EXT-X-CUE-OUT-CONT');

    if (isCueOut) {
      insideMarkedAd = true;
      continue;
    }

    if (line.startsWith('#EXT-X-CUE-IN')) {
      insideMarkedAd = false;
      continue;
    }

    if (!insideMarkedAd) filteredLines.push(line);
  }

  return filteredLines.join('\n');
}
