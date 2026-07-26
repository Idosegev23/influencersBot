/**
 * Turn a route from the knowledge base into a link this account can click.
 *
 * Returns null rather than a broken link. Bestie's whole support value is "go
 * here and press this" — a confident pointer to a screen that was deleted two
 * months ago costs more trust than saying nothing.
 */
export interface ScreenLink {
  route: string;
  href: string;
  isCurrentScreen: boolean;
}

export function buildScreenLink(
  route: string,
  username: string,
  currentRoute: string | null,
  knownRoutes: string[]
): ScreenLink | null {
  if (!route.startsWith('/influencer/')) return null;
  if (!knownRoutes.includes(route)) return null;

  return {
    route,
    href: route.replace('[username]', username),
    isCurrentScreen: currentRoute === route,
  };
}
