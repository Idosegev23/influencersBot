import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listCustomerScreens,
  findMissingScreens,
  findDeadRoutes,
} from '@/lib/bestie/screen-inventory';

function fixtureApp(): string {
  const root = mkdtempSync(join(tmpdir(), 'bestie-screens-'));
  const make = (segments: string) => {
    const dir = join(root, segments);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'page.tsx'), 'export default function P() { return null }');
  };
  make('[username]');
  make('[username]/chatbot-settings');
  make('[username]/documents/upload');
  make('insights');
  // A layout or component file must not be mistaken for a screen.
  writeFileSync(join(root, 'layout.tsx'), 'export default function L() { return null }');
  return root;
}

describe('listCustomerScreens', () => {
  it('finds every page.tsx and nothing else', () => {
    const routes = listCustomerScreens(fixtureApp()).map(s => s.route);
    expect(routes).toEqual([
      '/influencer/[username]',
      '/influencer/[username]/chatbot-settings',
      '/influencer/[username]/documents/upload',
      '/influencer/insights',
    ]);
  });

  it('reads the real app tree by default and includes a known screen', () => {
    const routes = listCustomerScreens().map(s => s.route);
    expect(routes).toContain('/influencer/[username]/chatbot-settings');
    expect(routes.length).toBeGreaterThan(20);
  });
});

describe('drift detection', () => {
  const screens = [
    { route: '/influencer/[username]/settings', file: 'x' },
    { route: '/influencer/[username]/coupons', file: 'y' },
  ];

  it('names screens that have no knowledge entry', () => {
    expect(findMissingScreens(screens, ['/influencer/[username]/settings']))
      .toEqual(['/influencer/[username]/coupons']);
  });

  it('names documented routes that no longer exist', () => {
    expect(findDeadRoutes(screens, ['/influencer/[username]/deleted-screen']))
      .toEqual(['/influencer/[username]/deleted-screen']);
  });

  it('reports nothing when knowledge and routes agree', () => {
    const documented = screens.map(s => s.route);
    expect(findMissingScreens(screens, documented)).toEqual([]);
    expect(findDeadRoutes(screens, documented)).toEqual([]);
  });
});
