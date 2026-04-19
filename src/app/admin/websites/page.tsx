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
} from 'lucide-react';

import { PageHeader } from '@/components/admin/PageHeader';
import { Card } from '@/components/ui/card';
import { ButtonLink, Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/utils';

interface WebsiteAccount {
  id: string;
  domain: string;
  displayName: string;
  url: string;
  pagesCount: number;
  chunksCount: number;
  primaryColor: string;
  profilePic: string | null;
  managementToken: string | null;
}

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<WebsiteAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedDemoId, setCopiedDemoId] = useState<string | null>(null);
  const [generatingTokenId, setGeneratingTokenId] = useState<string | null>(null);

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
    (s, w) => ({ pages: s.pages + (w.pagesCount || 0), chunks: s.chunks + (w.chunksCount || 0) }),
    { pages: 0, chunks: 0 },
  );

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
      <div className="grid grid-cols-3 gap-3 mb-5">
        <SummaryStat label="אתרים" value={loading ? '—' : formatNumber(websites.length)} icon={Globe} />
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
              copied={copiedId === w.id}
              demoCopied={copiedDemoId === w.id}
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

function WebsiteCard({
  website,
  onManageLink,
  onDemoLink,
  copied,
  demoCopied,
  generating,
}: {
  website: WebsiteAccount;
  onManageLink: () => void;
  onDemoLink: () => void;
  copied: boolean;
  demoCopied: boolean;
  generating: boolean;
}) {
  return (
    <Card hover>
      <div className="p-4 flex flex-col gap-3.5">
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
              <Badge variant="outline">{formatNumber(website.pagesCount)} מסמכים</Badge>
              <Badge variant="outline">{formatNumber(website.chunksCount)} chunks</Badge>
            </div>
          </div>
        </div>

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

        <Button
          onClick={onManageLink}
          disabled={generating}
          variant={website.managementToken ? 'outline' : 'brand'}
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
              העתק לינק פאנל ניהול
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
