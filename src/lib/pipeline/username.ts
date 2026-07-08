/**
 * Normalize whatever an admin pastes into the "Instagram username" field into a
 * bare handle. People paste full profile URLs (`instagram.com/freesbe.israel/?hl=he`),
 * add `@`, trailing slashes, or query strings — all of which, used verbatim as the
 * scrape handle, produce an empty account. This extracts just the handle.
 *
 *   normalizeIgUsername('@freesbe.israel')                                   -> 'freesbe.israel'
 *   normalizeIgUsername('freesbe.israel/?hl=he')                             -> 'freesbe.israel'
 *   normalizeIgUsername('https://www.instagram.com/holidayfinder_/?hl=he')   -> 'holidayfinder_'
 *   normalizeIgUsername('instagram.com/kikomilanoisrael/')                   -> 'kikomilanoisrael'
 */
export function normalizeIgUsername(input: string): string {
  let s = (input ?? '').trim();
  // Full instagram URL → take the first path segment after the host.
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@+/, '');        // leading @
  s = s.split(/[/?#\s]/)[0];       // drop anything after a slash / query / hash / space
  return s.trim();
}
