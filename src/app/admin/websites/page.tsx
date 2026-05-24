'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Globe,
  ExternalLink,
  Copy,
  Check,
  Settings,
  FileText,
  Search,
  Plus,
  Code,
  ShoppingBag,
  LifeBuoy,
  UserPlus,
  CalendarClock,
} from 'lucide-react';

import { PageHeader } from '@/components/admin/PageHeader';
import { Card } from '@/components/ui/card';
import { ButtonLink, Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/utils';

interface WidgetModules {
  support: { enabled: boolean };
  leads: { enabled: boolean };
  bookings: { enabled: boolean };
}

interface WebsiteAccount {
  id: string;
  domain: string;
  displayName: string;
  url: string;
  language: string;
  enabled: boolean;
  modules: WidgetModules;
  pagesCount: number;
  chunksCount: number;
  productsCount: number;
  supportEmail: string | null;
  primaryColor: string;
  profilePic: string | null;
  managementToken: string | null;
}

type ToggleField = 'enabled' | 'support' | 'leads' | 'bookings';

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<WebsiteAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedDemoId, setCopiedDemoId] = useState<string | null>(null);
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);
  const [generatingTokenId, setGeneratingTokenId] = useState<string | null>(null);
  // Per-card per-field "saving" indicator so each toggle has its own optimistic state.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchWebsites = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/websites');
      if (res.ok) {
        const data = await res.json();
        setWebsites(data.websites || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebsites();
  }, [fetchWebsites]);

  const filtered = websites.filter((w) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [w.displayName, w.domain, w.url].some((s) => (s || '').toLowerCase().includes(q));
  });

  const totals = websites.reduce(
    (s, w) => ({
      pages: s.pages + (w.pagesCount || 0),
      chunks: s.chunks + (w.chunksCount || 0),
      enabled: s.enabled + (w.enabled ? 1 : 0),
    }),
    { pages: 0, chunks: 0, enabled: 0 },
  );

  const handleToggle = async (website: WebsiteAccount, field: ToggleField, next: boolean) => {
    const key = website.id + ':' + field;
    setSavingKey(key);
    // Optimistic update — flip state immediately, roll back on failure.
    const prev = websites;
    setWebsites((prevList) =>
      prevList.map((w) => {
        if (w.id !== website.id) return w;
        if (field === 'enabled') return { ...w, enabled: next };
        return { ...w, modules: { ...w.modules, [field]: { enabled: next } } };
      }),
    );
    try {
      const body: Record<string, any> = { accountId: website.id };
      if (field === 'enabled') body.enabled = next;
      else { body.module = field; body.moduleEnabled = next; }
      const res = await fetch('/api/admin/websites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('PATCH failed');
    } catch (err) {
      console.error(err);
      setWebsites(prev);
    } finally {
      setSavingKey(null);
    }
  };

  const handleManageLink = async (website: WebsiteAccount) => {
    let token = website.managementToken;
    if (!token) {
      setGeneratingTokenId(website.id);
      try {
        const res = await fetch('/api/admin/websites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: website.id }),
        });
        const data = await res.json();
        if (data.token) {
          token = data.token;
          setWebsites((prev) => prev.map((w) => (w.id === website.id ? { ...w, managementToken: token } : w)));
        }
      } finally {
        setGeneratingTokenId(null);
      }
    }
    if (token) {
      navigator.clipboard.writeText(`${window.location.origin}/manage/${token}`);
      setCopiedId(website.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDemoLink = (website: WebsiteAccount) => {
    navigator.clipboard.writeText(`${window.location.origin}/demo/${website.id}`);
    setCopiedDemoId(website.id);
    setTimeout(() => setCopiedDemoId(null), 2000);
  };

  // Embed snippet for client installation — same shape as /manage/[token],
  // mirrored here so admins don't need to flip between panels.
  const handleCopySnippet = (website: WebsiteAccount) => {
    const snippet = `<!-- bestieAI Widget -->\n<script src="${window.location.origin}/widget.js" data-account-id="${website.id}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCopiedSnippetId(website.id);
    setTimeout(() => setCopiedSnippetId(null), 2000);
  };

  return (
    <>
      <PageHeader
        eyebrow="ניהול"
        title="אתרים"
        description="אתרי לקוחות המחוברים למערכת עם וידג׳ט צ׳אט מבוסס מסמכים."
        actions={
          <>
            <ButtonLink href="/admin/websites/add" variant="primary" size="sm">
              <Plus className="w-3.5 h-3.5" />
              הוספת אתר
            </ButtonLink>
          </>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <SummaryStat label="אתרים" value={loading ? '—' : formatNumber(websites.length)} icon={Globe} />
        <SummaryStat label="פעילים" value={loading ? '—' : `${totals.enabled}/${websites.length}`} icon={Check} />
        <SummaryStat label="סה״כ מסמכים" value={loading ? '—' : formatNumber(totals.pages)} icon={FileText} />
        <SummaryStat label="Chunks" value={loading ? '—' : formatNumber(totals.chunks)} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="flex-1" />
        <div className="relative md:w-72">
          <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-3.5 h-3.5 text-[color:var(--ink-400)] pointer-events-none" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש אתר..." className="ps-8" />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-3.5 w-28 mb-2" />
                  <Skeleton className="h-2.5 w-36" />
                </div>
              </div>
              <Skeleton className="h-8 w-full mt-5" />
              <Skeleton className="h-8 w-full mt-2" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-16 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[color:var(--ink-100)] flex items-center justify-center">
              <Globe className="w-5 h-5 text-[color:var(--ink-500)]" />
            </div>
            <h3 className="text-[14px] font-semibold text-[color:var(--ink-800)] mb-1.5">אין אתרים תואמים</h3>
            <p className="text-[12.5px] text-[color:var(--ink-500)]">נסה חיפוש אחר.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((w) => (
            <WebsiteCard
              key={w.id}
              website={w}
              onManageLink={() => handleManageLink(w)}
              onDemoLink={() => handleDemoLink(w)}
              onCopySnippet={() => handleCopySnippet(w)}
              onToggle={(field, next) => handleToggle(w, field, next)}
              savingKey={savingKey}
              copied={copiedId === w.id}
              demoCopied={copiedDemoId === w.id}
              snippetCopied={copiedSnippetId === w.id}
              generating={generatingTokenId === w.id}
            />
          ))}
        </div>
      )}
    </>
  );
}

function SummaryStat({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
  return (
    <Card>
      <div className="px-4 py-3.5 flex items-center gap-3">
        {Icon && (
          <span className="w-8 h-8 rounded-[8px] bg-[color:var(--ink-100)] ring-1 ring-[color:var(--line)] flex items-center justify-center text-[color:var(--ink-600)]">
            <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
          </span>
        )}
        <div>
          <div className="text-[11px] font-medium text-[color:var(--ink-500)]">{label}</div>
          <div className="font-display font-semibold text-[18px] tabular-nums text-[color:var(--ink-900)]">{value}</div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Compact toggle — used both for the master ON/OFF switch and each module.
 * Disabled while a save is in-flight (per-key, not global) so the user gets
 * visual feedback per toggle without freezing the rest of the card.
 */
function MicroToggle({
  on, onChange, label, icon: Icon, saving, intent,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  icon?: React.ElementType;
  saving: boolean;
  intent?: 'master' | 'module';
}) {
  const sizeCls = intent === 'master' ? 'h-6 w-10' : 'h-5 w-9';
  const knobCls = intent === 'master' ? 'w-5 h-5' : 'w-4 h-4';
  const knobOffset = on ? (intent === 'master' ? 'translate-x-[-16px]' : 'translate-x-[-14px]') : 'translate-x-0';
  return (
    <button
      type="button"
      onClick={() => !saving && onChange(!on)}
      disabled={saving}
      aria-pressed={on}
      title={label}
      className="flex items-center gap-1.5 group cursor-pointer disabled:opacity-60 disabled:cursor-wait"
    >
      <span
        className={`relative ${sizeCls} rounded-full transition-colors flex-shrink-0`}
        style={{ background: on ? 'var(--accent)' : 'var(--ink-200)' }}
      >
        <span className={`absolute top-0.5 right-0.5 ${knobCls} rounded-full bg-white shadow transition-transform ${knobOffset}`} />
      </span>
      {Icon && <Icon className="w-3 h-3 text-[color:var(--ink-500)]" strokeWidth={1.75} />}
      <span className={`text-[11px] font-medium ${on ? 'text-[color:var(--ink-800)]' : 'text-[color:var(--ink-500)]'}`}>{label}</span>
    </button>
  );
}

function WebsiteCard({
  website,
  onManageLink,
  onDemoLink,
  onCopySnippet,
  onToggle,
  savingKey,
  copied,
  demoCopied,
  snippetCopied,
  generating,
}: {
  website: WebsiteAccount;
  onManageLink: () => void;
  onDemoLink: () => void;
  onCopySnippet: () => void;
  onToggle: (field: ToggleField, next: boolean) => void;
  savingKey: string | null;
  copied: boolean;
  demoCopied: boolean;
  snippetCopied: boolean;
  generating: boolean;
}) {
  const saving = (field: ToggleField) => savingKey === website.id + ':' + field;
  const hasProducts = website.productsCount > 0;
  const hasKnowledge = website.chunksCount > 0;

  return (
    <Card hover>
      <div className={`p-4 flex flex-col gap-3.5 transition-opacity ${website.enabled ? '' : 'opacity-70'}`}>
        {/* ---- Header: avatar + brand + master toggle ---- */}
        <div className="flex items-start gap-3 min-w-0">
          {website.profilePic ? (
            <div className="relative w-11 h-11 rounded-[10px] overflow-hidden ring-1 ring-[color:var(--line)] flex-shrink-0">
              <Image src={website.profilePic} alt={website.displayName} fill sizes="44px" className="object-cover" unoptimized />
            </div>
          ) : (
            <div
              className="w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0 ring-1"
              style={{
                backgroundColor: website.primaryColor + '15',
                color: website.primaryColor,
                // @ts-expect-error css var token
                '--tw-ring-color': website.primaryColor + '30',
              }}
            >
              <Globe className="w-4 h-4" strokeWidth={1.75} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-[13.5px] font-semibold text-[color:var(--ink-900)] truncate">{website.displayName}</h3>
            <a
              href={website.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11.5px] text-[color:var(--accent)] hover:underline truncate block"
            >
              {website.domain}
            </a>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {website.language === 'en' && <Badge variant="outline">EN</Badge>}
              <Badge variant="outline">{formatNumber(website.pagesCount)} מסמכים</Badge>
              {hasKnowledge && <Badge variant="outline">{formatNumber(website.chunksCount)} chunks</Badge>}
              {hasProducts && (
                <Badge variant="outline" className="!text-[color:var(--accent)]">
                  <ShoppingBag className="w-2.5 h-2.5 me-0.5 inline" />{formatNumber(website.productsCount)} מוצרים
                </Badge>
              )}
            </div>
          </div>
          {/* Master ON/OFF — top-right */}
          <div className="flex-shrink-0">
            <MicroToggle
              on={website.enabled}
              onChange={(next) => onToggle('enabled', next)}
              label={website.enabled ? 'דלוק' : 'כבוי'}
              saving={saving('enabled')}
              intent="master"
            />
          </div>
        </div>

        {/* ---- Modules row (only when widget is on) ---- */}
        {website.enabled && (
          <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-[color:var(--line)]">
            <MicroToggle
              on={website.modules.support.enabled}
              onChange={(next) => onToggle('support', next)}
              label="תמיכה"
              icon={LifeBuoy}
              saving={saving('support')}
            />
            <MicroToggle
              on={website.modules.leads.enabled}
              onChange={(next) => onToggle('leads', next)}
              label="לידים"
              icon={UserPlus}
              saving={saving('leads')}
            />
            <MicroToggle
              on={website.modules.bookings.enabled}
              onChange={(next) => onToggle('bookings', next)}
              label="פגישות"
              icon={CalendarClock}
              saving={saving('bookings')}
            />
          </div>
        )}

        {/* ---- Actions row ---- */}
        <div className="flex items-center gap-1 pt-3 border-t border-[color:var(--line)]">
          <Link
            href={`/admin/websites/${website.id}/preview`}
            className="ui-btn ui-btn-sm ui-btn-ghost focus-ring flex-1 justify-center"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            וידג׳ט
          </Link>
          <a
            href={website.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ui-btn ui-btn-sm ui-btn-ghost focus-ring flex-1 justify-center"
          >
            <Globe className="w-3.5 h-3.5" />
            לאתר
          </a>
          <button
            onClick={onDemoLink}
            className="ui-btn ui-btn-icon-sm ui-btn-ghost focus-ring"
            aria-label="העתק לינק דמו"
            title="לינק דמו"
          >
            {demoCopied ? <Check className="w-3.5 h-3.5 text-[color:var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* ---- Embed snippet — what you send the customer to paste in their site ---- */}
        <Button
          onClick={onCopySnippet}
          variant={snippetCopied ? 'outline' : 'brand'}
          size="sm"
          className="w-full justify-center"
          disabled={!website.enabled}
          title={website.enabled ? 'העתק את ה-snippet ושלח ללקוח להטמעה' : 'הפעל את הווידג׳ט כדי להעתיק קוד הטמעה'}
        >
          {snippetCopied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              הקוד הועתק
            </>
          ) : (
            <>
              <Code className="w-3.5 h-3.5" />
              העתק קוד הטמעה
            </>
          )}
        </Button>

        <Button
          onClick={onManageLink}
          disabled={generating}
          variant="outline"
          size="sm"
          className="w-full justify-center"
        >
          {generating ? (
            <>מייצר קישור…</>
          ) : copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              הקישור הועתק
            </>
          ) : website.managementToken ? (
            <>
              <Copy className="w-3.5 h-3.5" />
              לינק פאנל ניהול
            </>
          ) : (
            <>
              <Settings className="w-3.5 h-3.5" />
              צור לינק פאנל ניהול
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
