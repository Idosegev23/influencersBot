import { describe, it, expect } from 'vitest';
import { describeDemoLink } from '@/lib/demo/preview-status';

describe('describeDemoLink', () => {
  it('names the site the prospect will see', () => {
    const s = describeDemoLink({ widgetDomain: 'bara.co.il', demoState: 'open' });
    expect(s.kind).toBe('site');
    expect(s.title).toContain('bara.co.il');
  });

  it('warns when there is no site, so the link is a backdrop not their website', () => {
    const s = describeDemoLink({ widgetDomain: null, demoState: 'open' });
    expect(s.kind).toBe('no-site');
    // Presence assertion: the warning has to actually say what they'll get.
    expect(s.title).toContain('רקע ממותג');
  });

  it('treats an empty or whitespace domain as no site', () => {
    expect(describeDemoLink({ widgetDomain: '' }).kind).toBe('no-site');
    expect(describeDemoLink({ widgetDomain: '   ' }).kind).toBe('no-site');
    expect(describeDemoLink({}).kind).toBe('no-site');
  });

  it('lets expiry win over a registered domain', () => {
    // The preview route stops proxying the site once the window closes, so a
    // domain here would otherwise promise something the link cannot deliver.
    const s = describeDemoLink({ widgetDomain: 'bara.co.il', demoState: 'locked' });
    expect(s.kind).toBe('expired');
    expect(s.title).not.toContain('bara.co.il');
  });

  it('treats expiring as still open — it still shows the real site', () => {
    expect(describeDemoLink({ widgetDomain: 'bara.co.il', demoState: 'expiring' }).kind).toBe('site');
  });
});
