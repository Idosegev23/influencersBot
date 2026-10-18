import { describe, it, expect } from 'vitest';
import { channelParams } from '@/lib/scraping/youtubeScraper';

describe('channelParams', () => {
  it('turns a channel link into a handle, never a url param the API rejects', () => {
    for (const link of [
      'https://www.youtube.com/@GoDominicanRepublic',
      'https://www.youtube.com/@GoDominicanRepublic/featured',
      'youtube.com/@GoDominicanRepublic?si=abc',
      'https://www.youtube.com/c/GoDominicanRepublic',
      'https://www.youtube.com/user/GoDominicanRepublic/videos',
    ]) {
      const p = channelParams(link);
      expect(p).toEqual({ handle: '@GoDominicanRepublic' });
      expect(p).not.toHaveProperty('url');
    }
  });

  it('uses channelId for a /channel/ link', () => {
    expect(channelParams('https://www.youtube.com/channel/UCabc_123-xyz')).toEqual({ channelId: 'UCabc_123-xyz' });
  });

  it('still accepts a bare handle with or without @', () => {
    expect(channelParams('GoDominicanRepublic')).toEqual({ handle: '@GoDominicanRepublic' });
    expect(channelParams('@GoDominicanRepublic')).toEqual({ handle: '@GoDominicanRepublic' });
  });
});
