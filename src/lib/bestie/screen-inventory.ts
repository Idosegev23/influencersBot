/**
 * The customer dashboard's real screens, read from the route tree.
 *
 * Bestie's whole support value is "go to this screen and press this button", so
 * the set of screens has to come from the filesystem rather than a list someone
 * maintains by hand. A list drifts the day a screen is added; the tree cannot.
 *
 * Used two ways: to find screens with no knowledge entry yet, and to catch
 * knowledge that still points at a screen which has since been deleted.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

export interface Screen {
  route: string;
  file: string;
}

const DEFAULT_APP_DIR = join(process.cwd(), 'src', 'app', 'influencer');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'page.tsx') out.push(full);
  }
  return out;
}

export function listCustomerScreens(appDir: string = DEFAULT_APP_DIR): Screen[] {
  if (!existsSync(appDir)) return [];

  return walk(appDir)
    .map(file => {
      const relative = file.slice(appDir.length).split(sep).slice(0, -1).filter(Boolean);
      return { route: ['/influencer', ...relative].join('/'), file };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function findMissingScreens(screens: Screen[], documentedRoutes: string[]): string[] {
  const documented = new Set(documentedRoutes);
  return screens.map(s => s.route).filter(route => !documented.has(route));
}

export function findDeadRoutes(screens: Screen[], documentedRoutes: string[]): string[] {
  const real = new Set(screens.map(s => s.route));
  return documentedRoutes.filter(route => !real.has(route));
}
