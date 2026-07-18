/**
 * Client-side auto-tracking hooks. Mounted once at the app root they
 * emit events nobody has to wire by hand:
 *   - page_load + arrival + qr_scan_detected on first paint
 *   - returning_visitor / session_start
 *   - route_change on pathname change
 *   - viewport_focus / viewport_blur
 *   - scroll_depth at 25/50/75/100 % per pathname
 *   - js_error / unhandled_promise_rejection
 *   - session_end on beforeunload
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  bumpVisitCount,
  captureAttribution,
  endSession,
  getClientId,
  isReturningVisitor,
  startSession,
  track,
} from './track';
import { sanitizeTrackedPath } from './surface';

export function useAutoAnalytics() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);
  const scrollMarksRef = useRef<{ [path: string]: Set<number> }>({});

  // First paint — fire once
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // identity + attribution + visit count must run BEFORE first events
    getClientId();
    captureAttribution();
    const { returning, visitCount, firstVisit } = isReturningVisitor();
    bumpVisitCount();
    startSession();

    track('client_init', { is_new: !returning, visit_count: visitCount });

    track('page_load', {
      path: sanitizeTrackedPath(window.location.pathname + window.location.search),
      referrer: document.referrer || null,
    });

    if (returning) {
      track('returning_visitor', {
        visit_count: visitCount,
        first_visit_at: firstVisit,
      });
    }

    track('session_start', {});

    // ?source=conf badge
    if (new URL(window.location.href).searchParams.get('source') === 'conf') {
      track('qr_scan_detected', { campaign: 'innovation_conf_2026' });
    }

    // Visibility
    const onVisibility = () => {
      if (document.hidden) {
        track('viewport_blur', {});
      } else {
        track('viewport_focus', {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Errors
    const onError = (e: ErrorEvent) => {
      track('js_error', {
        message: String(e.message || 'unknown').slice(0, 200),
        source: e.filename || null,
        line: e.lineno || 0,
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      track('unhandled_promise_rejection', {
        reason: String(e.reason || 'unknown').slice(0, 200),
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    // Session end
    const onBeforeUnload = () => {
      track('session_end', {});
      endSession();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route change
  useEffect(() => {
    if (!pathname) return;
    if (lastPathRef.current && lastPathRef.current !== pathname) {
      const fromPath = sanitizeTrackedPath(lastPathRef.current);
      const toPath = sanitizeTrackedPath(pathname);
      track('route_change', { from_path: fromPath, to_path: toPath });
      track('page_load', { path: toPath, referrer: fromPath });
    }
    lastPathRef.current = pathname;
  }, [pathname]);

  // Scroll depth
  useEffect(() => {
    if (typeof window === 'undefined' || !pathname) return;
    if (!scrollMarksRef.current[pathname]) {
      scrollMarksRef.current[pathname] = new Set();
    }
    const marks = scrollMarksRef.current[pathname];

    const onScroll = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      if (total <= 0) return;
      const pct = Math.min(100, Math.round((scrolled / total) * 100));
      for (const threshold of [25, 50, 75, 100]) {
        if (pct >= threshold && !marks.has(threshold)) {
          marks.add(threshold);
          track('scroll_depth', { path: sanitizeTrackedPath(pathname), depth_pct: threshold });
        }
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);
}
