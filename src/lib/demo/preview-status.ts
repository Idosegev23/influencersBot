/**
 * What a prospect will actually see when they open an account's demo link.
 *
 * The admin needs this BEFORE sending the link, not after. The preview route
 * never fails any more — it renders a page for every outcome — so the question
 * stopped being "does this link work" and became "which of three things does it
 * show". Sending a client a link that turns out to be a plain backdrop instead
 * of their own website is the mistake this exists to prevent.
 */

export type DemoLinkKind = 'site' | 'no-site' | 'expired';

export interface DemoLinkStatus {
  kind: DemoLinkKind;
  /** Hebrew, for the admin button's tooltip. */
  title: string;
}

export function describeDemoLink(input: {
  widgetDomain?: string | null;
  demoState?: 'open' | 'expiring' | 'locked' | null;
}): DemoLinkStatus {
  // Expiry wins over everything: the preview route refuses to proxy the
  // customer's site once the window has closed, whatever domain is registered.
  if (input.demoState === 'locked') {
    return { kind: 'expired', title: 'הדמו הסתיים — הלקוח יראה מסך נעילה. הארך אותו קודם.' };
  }

  const domain = typeof input.widgetDomain === 'string' ? input.widgetDomain.trim() : '';
  if (!domain) {
    return {
      kind: 'no-site',
      title: 'לא רשום אתר — הלקוח יראה את הוויג׳ט על רקע ממותג, בלי האתר שלו.',
    };
  }

  return { kind: 'site', title: `הלקוח יראה את ${domain} עם הוויג׳ט עליו.` };
}
