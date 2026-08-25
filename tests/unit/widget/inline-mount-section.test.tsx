import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InlineMountSection from '@/components/influencer/InlineMountSection';

const PICK = {
  selector: '.hero', label: 'div.hero', mode: 'into' as const,
  reserve: { desktop: 480, mobile: 0 },
  theme: { font: 'inherit', accent: '#4c3e5e', radius: 8, ground: 'dark' as const },
};

describe('InlineMountSection', () => {
  it('offers to pick a spot when nothing is configured', () => {
    render(<InlineMountSection value={null} onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    expect(screen.getByRole('button', { name: /בחרו מקום/ })).toBeInTheDocument();
  });

  it('asks the page to start picking', () => {
    const onStartPicking = vi.fn();
    render(<InlineMountSection value={null} onChange={() => {}} onStartPicking={onStartPicking} picking={false} />);
    fireEvent.click(screen.getByRole('button', { name: /בחרו מקום/ }));
    expect(onStartPicking).toHaveBeenCalled();
  });

  it('shows what was picked, so the customer can tell it chose the right thing', () => {
    render(<InlineMountSection value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    expect(screen.getByText(/div\.hero/)).toBeInTheDocument();
  });

  it('proposes the sampled theme rather than applying it silently', () => {
    render(<InlineMountSection value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={() => {}} onStartPicking={() => {}} picking={false} />);
    expect(screen.getByText(/#4c3e5e/i)).toBeInTheDocument();
  });

  it('defaults a brand-new mount to preview, never straight to live', () => {
    const onChange = vi.fn();
    render(<InlineMountSection value={null} onChange={onChange} onStartPicking={() => {}} picking={false} pendingPick={PICK} />);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: 'preview' }));
  });

  it('lets the customer switch between preview and live', () => {
    const onChange = vi.fn();
    render(<InlineMountSection value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
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

  it('can remove the mount entirely', () => {
    const onChange = vi.fn();
    render(<InlineMountSection value={{ ...PICK, enabled: 'preview', preset: 'hero', surface: 'bare', bubble: 'after-scroll' }}
      onChange={onChange} onStartPicking={() => {}} picking={false} />);
    fireEvent.click(screen.getByRole('button', { name: /הסרה/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
