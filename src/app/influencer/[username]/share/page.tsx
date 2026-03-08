'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Share2,
  ArrowLeft,
  Download,
  Copy,
  Check,
  Link2,
  QrCode,
  Loader2,
  ExternalLink,
  Instagram,
  Smartphone,
  Globe,
} from 'lucide-react';
import { getInfluencerByUsername } from '@/lib/supabase';
import type { Influencer } from '@/types';

// Simple QR Code SVG Generator
function QRCodeSVG({ value, size = 200, bgColor = '#ffffff', fgColor = '#000000' }: {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
}) {
  // Simple QR code pattern generator (for demo purposes)
  // In production, you'd use a proper QR code library
  const modules = generateQRPattern(value);
  const moduleSize = size / modules.length;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill={bgColor} />
      {modules.map((row, y) =>
        row.map((cell, x) =>
          cell ? (
            <rect
              key={`${x}-${y}`}
              x={x * moduleSize}
              y={y * moduleSize}
              width={moduleSize}
              height={moduleSize}
              fill={fgColor}
            />
          ) : null
        )
      )}
    </svg>
  );
}

// Simple QR pattern generator (simplified version)
function generateQRPattern(data: string): boolean[][] {
  const size = 25;
  const pattern: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));

  // Position detection patterns (corners)
  const addFinderPattern = (startX: number, startY: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        if (y === 0 || y === 6 || x === 0 || x === 6 ||
            (y >= 2 && y <= 4 && x >= 2 && x <= 4)) {
          pattern[startY + y][startX + x] = true;
        }
      }
    }
  };

  addFinderPattern(0, 0); // Top-left
  addFinderPattern(size - 7, 0); // Top-right
  addFinderPattern(0, size - 7); // Bottom-left

  // Add timing patterns
  for (let i = 8; i < size - 8; i++) {
    pattern[6][i] = i % 2 === 0;
    pattern[i][6] = i % 2 === 0;
  }

  // Generate pseudo-random data based on input
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash = hash & hash;
  }

  // Fill data area with pattern based on hash
  for (let y = 9; y < size - 8; y++) {
    for (let x = 9; x < size - 8; x++) {
      if (x !== 6 && y !== 6) {
        const bit = ((hash >> ((x * y) % 32)) & 1) === 1;
        pattern[y][x] = bit || (x + y) % 3 === 0;
      }
    }
  }

  // Fill some areas around finder patterns
  for (let y = 8; y < 12; y++) {
    for (let x = 8; x < 12; x++) {
      pattern[y][x] = ((hash >> ((x + y) % 16)) & 1) === 1;
    }
  }

  return pattern;
}

const utmSources = [
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'website', label: 'אתר אישי', icon: Globe },
  { id: 'linktree', label: 'Linktree', icon: Link2 },
  { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
  { id: 'custom', label: 'מותאם אישית', icon: Share2 },
];

export default function SharePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();
  const qrRef = useRef<HTMLDivElement>(null);

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState('instagram');
  const [customSource, setCustomSource] = useState('');
  const [customMedium, setCustomMedium] = useState('');
  const [customCampaign, setCustomCampaign] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        // Check authentication
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();

        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        // Load influencer data
        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const chatLink = `${baseUrl}/chat/${username}`;

  const generateUTMLink = () => {
    const source = selectedSource === 'custom' ? customSource : selectedSource;
    const medium = selectedSource === 'custom' ? customMedium : 'social';
    const campaign = customCampaign || 'chatbot';

    const params = new URLSearchParams({
      utm_source: source,
      utm_medium: medium,
      utm_campaign: campaign,
    });

    return `${chatLink}?${params.toString()}`;
  };

  const utmLink = generateUTMLink();

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownloadQR = () => {
    if (!qrRef.current) return;

    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = 400;
    canvas.height = 400;

    img.onload = () => {
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, 400, 400);

        const link = document.createElement('a');
        link.download = `qr-${username}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl" style={{ background: 'var(--dash-bg)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* QR Code Section */}
          <div
            className="rounded-xl border p-6"
            style={{ borderColor: 'var(--dash-border)' }}
          >
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
              <QrCode className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
              QR Code
            </h2>

            <div className="flex flex-col items-center">
              <div
                ref={qrRef}
                className="bg-white p-4 rounded-2xl mb-6"
              >
                <QRCodeSVG
                  value={utmLink}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>

              <p className="text-sm mb-4 text-center" style={{ color: 'var(--dash-text-2)' }}>
                סרקו את הקוד כדי לגשת ישירות לצ'אטבוט
              </p>

              <button
                onClick={handleDownloadQR}
                className="flex items-center gap-2 px-6 py-3 rounded-xl transition-colors"
                style={{ background: 'var(--color-primary)', color: 'white' }}
              >
                <Download className="w-5 h-5" />
                הורד QR Code
              </button>
            </div>
          </div>

          {/* Links Section */}
          <div
            className="rounded-xl border p-6"
            style={{ borderColor: 'var(--dash-border)' }}
          >
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--dash-text)' }}>
              <Link2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
              לינקים
            </h2>

            {/* Basic Link */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dash-text-2)' }}>לינק בסיסי</label>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 px-4 py-3 rounded-lg text-sm truncate"
                  style={{ background: 'var(--dash-surface)', color: 'var(--dash-text-2)' }}
                >
                  {chatLink}
                </div>
                <button
                  onClick={() => handleCopy(chatLink, 'basic')}
                  className="p-3 rounded-lg transition-colors"
                  style={{
                    background: copied === 'basic' ? 'var(--dash-positive)' : 'var(--dash-surface)',
                    color: copied === 'basic' ? 'white' : 'var(--dash-text-2)',
                  }}
                >
                  {copied === 'basic' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
                <a
                  href={chatLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-lg transition-colors"
                  style={{ background: 'var(--dash-surface)', color: 'var(--dash-text-2)' }}
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* UTM Link Builder */}
            <div className="pt-6" style={{ borderTop: '1px solid var(--dash-border)' }}>
              <label className="block text-sm font-medium mb-3" style={{ color: 'var(--dash-text-2)' }}>לינק עם מעקב (UTM)</label>

              {/* Source Selection */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
                {utmSources.map((source) => {
                  const Icon = source.icon;
                  return (
                    <button
                      key={source.id}
                      onClick={() => setSelectedSource(source.id)}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl border transition-all"
                      style={{
                        borderColor: selectedSource === source.id ? 'var(--color-primary)' : 'var(--dash-border)',
                        background: selectedSource === source.id ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                        color: selectedSource === source.id ? 'var(--dash-text)' : 'var(--dash-text-2)',
                      }}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs">{source.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom UTM Fields */}
              {selectedSource === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <input
                    type="text"
                    value={customSource}
                    onChange={(e) => setCustomSource(e.target.value)}
                    placeholder="מקור (source)"
                    className="rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                  />
                  <input
                    type="text"
                    value={customMedium}
                    onChange={(e) => setCustomMedium(e.target.value)}
                    placeholder="אמצעי (medium)"
                    className="rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
                  />
                </div>
              )}

              {/* Campaign Name */}
              <input
                type="text"
                value={customCampaign}
                onChange={(e) => setCustomCampaign(e.target.value)}
                placeholder="שם הקמפיין (אופציונלי)"
                className="w-full rounded-lg px-4 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)', border: '1px solid' }}
              />

              {/* Generated UTM Link */}
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 px-4 py-3 rounded-lg text-sm truncate"
                  style={{ background: 'var(--dash-surface)', color: 'var(--dash-text-2)' }}
                >
                  {utmLink}
                </div>
                <button
                  onClick={() => handleCopy(utmLink, 'utm')}
                  className="p-3 rounded-lg transition-colors"
                  style={{
                    background: copied === 'utm' ? 'var(--dash-positive)' : 'var(--dash-surface)',
                    color: copied === 'utm' ? 'white' : 'var(--dash-text-2)',
                  }}
                >
                  {copied === 'utm' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div
          className="mt-8 rounded-xl border p-6"
          style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)', background: 'color-mix(in srgb, var(--color-primary) 5%, transparent)' }}
        >
          <h3 className="font-semibold mb-4" style={{ color: 'var(--dash-text)' }}>💡 טיפים לשיתוף</h3>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--dash-text-2)' }}>
            <li className="flex items-start gap-2">
              <span style={{ color: 'var(--color-primary)' }}>•</span>
              הוסיפו את הלינק לביו באינסטגרם או ב-Linktree
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: 'var(--color-primary)' }}>•</span>
              השתמשו ב-QR Code בסטוריז או בפוסטים
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: 'var(--color-primary)' }}>•</span>
              לינקים עם UTM יעזרו לכם לעקוב מאיפה מגיעים המבקרים
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: 'var(--color-primary)' }}>•</span>
              שנו את שם הקמפיין לכל פרסום שונה למעקב מדויק
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
