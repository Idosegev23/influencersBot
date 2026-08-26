import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import InlineMountSection from '@/components/influencer/InlineMountSection';
import { getDashboardStrings } from '@/lib/i18n/dashboard';

// The component's labels now come from the dashboard bundle. These tests assert
// against the Hebrew ones, which is what an existing Hebrew account still sees.
const t = getDashboardStrings('he');

afterEach(() => cleanup());

const PICK = {
  selector: '.hero', label: 'div.hero', mode: 'into' as const,
  reserve: { desktop: 480, mobile: 0 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'dark' as const },
};

describe('InlineMountSection', () => {
  it('offers to pick a spot when nothing is configured', () => {
    render(<InlineMountSection t={t} value={null} onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    expect(screen.getByRole('button', { name: /בחרו מקום/ })).toBeInTheDocument();
  });

  it('asks the page to start picking', () => {
    const onStartPicking = vi.fn();
    render(<InlineMountSection t={t} value={null} onChange={() => {}} onStartPicking={onStartPicking} picking={false} />);
    fireEvent.click(screen.getByRole('button', { name: /בחרו מקום/ }));
    expect(onStartPicking).toHaveBeenCalled();
  });

  it('shows what was picked, so the customer can tell it chose the right thing', () => {
    render(<InlineMountSection t={t} value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    expect(screen.getByText(/div\.hero/)).toBeInTheDocument();
  });

  it('proposes the sampled theme rather than applying it silently', () => {
    render(<InlineMountSection t={t} value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    expect(screen.getByText(/#4c3e5e/i)).toBeInTheDocument();
  });

  it('defaults a brand-new mount to preview, never straight to live', () => {
    const onChange = vi.fn();
    render(<InlineMountSection t={t} value={null} onChange={onChange} onStartPicking={() => {}} picking={false} pendingPick={PICK} />);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: 'preview' }));
  });

  it('lets the customer switch between preview and live', () => {
    const onChange = vi.fn();
    render(<InlineMountSection t={t} value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={onChange} onStartPicking={() => {}} picking={false} />);
    // There are only two live states — the stored schema has no "picked but
    // off" value (resolveInlineMount only accepts true | 'preview'; absence
    // IS off), so a third "כבוי" radio would show the customer a state the
    // next save cannot actually keep. This absence assertion is paired with
    // presence assertions below so it can't pass on a component that failed
    // to render anything at all.
    expect(screen.queryByRole('radio', { name: /כבוי/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /תצוגה מקדימה/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /פעיל לכל המבקרים/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  // ── The `כבוי` copy gap ─────────────────────────────────────────────────
  //
  // The customer sees preview / live / remove and nothing that tells them
  // `תצוגה מקדימה` ALREADY is the pause state — mount, selector, theme and
  // reserve all kept, and only someone arriving with ?bestie=1 sees it.
  // Facing those three options they reach for הסרה and lose the pick.
  it('says that preview IS the pause state, so nobody reaches for remove to pause', () => {
    render(<InlineMountSection t={t} value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    // The copy has to name the destructive alternative too — "preview keeps
    // things" alone does not stop the reach for הסרה.
    expect(screen.getByText(/מצב ההשהיה/)).toBeInTheDocument();
    expect(screen.getByText(/הסרה לעומת זאת מוחקת/)).toBeInTheDocument();
  });

  // ── I3: a refused pick is visible ───────────────────────────────────────

  it('says nothing about a refused pick while picking is going fine', () => {
    // The absence half. Paired with the two presence assertions below so it
    // cannot pass on a component that renders no picking prompt at all.
    render(<InlineMountSection t={t} value={null} onChange={() => {}} onStartPicking={() => {}} picking />);
    expect(screen.getByText(/לחצו על האלמנט באתר/)).toBeInTheDocument();
    expect(screen.queryByText(/לא ניתן לבחור את האלמנט הזה/)).not.toBeInTheDocument();
  });

  it('explains a refused pick beside the picking prompt, before anything is configured', () => {
    render(<InlineMountSection t={t} value={null} onChange={() => {}} onStartPicking={() => {}} picking pickFailed />);
    expect(screen.getByText(/לא ניתן לבחור את האלמנט הזה/)).toBeInTheDocument();
    // Still picking — the notice explains, it does not end the session.
    expect(screen.getByText(/לחצו על האלמנט באתר/)).toBeInTheDocument();
  });

  it('explains a refused pick while re-picking an existing mount too', () => {
    render(<InlineMountSection t={t} value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={() => {}} onStartPicking={() => {}} picking pickFailed />);
    expect(screen.getByText(/לא ניתן לבחור את האלמנט הזה/)).toBeInTheDocument();
  });

  // ── I1: a stored mount this editor cannot represent ─────────────────────

  it('tells the customer an operator-configured mount exists and that saving will not remove it', () => {
    // `value` is null because `resolveInlineMount` refused the stored mount
    // (a combinator selector, an attribute selector, `enabled: false`). The
    // empty state alone is a lie by omission: it looks exactly like an
    // account that never configured anything.
    render(<InlineMountSection t={t} value={null} onChange={() => {}} onStartPicking={() => {}} picking={false} unrepresentable />);
    expect(screen.getByText(/הוגדר עבורכם על ידי הצוות/)).toBeInTheDocument();
    expect(screen.getByText(/לא תסיר אותו/)).toBeInTheDocument();
    // And the customer can still pick a new spot on top of it.
    expect(screen.getByRole('button', { name: /בחרו מקום/ })).toBeInTheDocument();
  });

  it('says nothing about an operator mount when there is no stored mount at all', () => {
    render(<InlineMountSection t={t} value={null} onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    expect(screen.queryByText(/הוגדר עבורכם על ידי הצוות/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /בחרו מקום/ })).toBeInTheDocument();
  });

  it('drops the operator-mount notice once the customer has picked a spot of their own', () => {
    render(<InlineMountSection t={t} value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={() => {}} onStartPicking={() => {}} picking={false} unrepresentable />);
    expect(screen.queryByText(/הוגדר עבורכם על ידי הצוות/)).not.toBeInTheDocument();
    expect(screen.getByText(/div\.hero/)).toBeInTheDocument();
  });

  it('can remove the mount entirely', () => {
    const onChange = vi.fn();
    render(<InlineMountSection t={t} value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={onChange} onStartPicking={() => {}} picking={false} />);
    fireEvent.click(screen.getByRole('button', { name: /הסרה/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
