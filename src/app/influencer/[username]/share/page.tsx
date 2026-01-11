'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" dir="rtl">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:50px_50px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-slate-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href={`/influencer/${username}/dashboard`}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">חזרה</span>
            </Link>
            <div className="h-6 w-px bg-gray-700" />
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Share2 className="w-6 h-6 text-indigo-400" />
              שיתוף
            </h1>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* QR Code Section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
          >
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-indigo-400" />
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

              <p className="text-sm text-gray-400 mb-4 text-center">
                סרקו את הקוד כדי לגשת ישירות לצ'אטבוט
              </p>

              <button
                onClick={handleDownloadQR}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
              >
                <Download className="w-5 h-5" />
                הורד QR Code
              </button>
            </div>
          </motion.div>

          {/* Links Section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6"
          >
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-indigo-400" />
              לינקים
            </h2>

            {/* Basic Link */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">לינק בסיסי</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-3 bg-gray-700 rounded-lg text-sm text-gray-300 truncate">
                  {chatLink}
                </div>
                <button
                  onClick={() => handleCopy(chatLink, 'basic')}
                  className={`p-3 rounded-lg transition-colors ${
                    copied === 'basic'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
                  }`}
                >
                  {copied === 'basic' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
                <a
                  href={chatLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* UTM Link Builder */}
            <div className="border-t border-gray-700 pt-6">
              <label className="block text-sm font-medium text-gray-400 mb-3">לינק עם מעקב (UTM)</label>
              
              {/* Source Selection */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
                {utmSources.map((source) => {
                  const Icon = source.icon;
                  return (
                    <button
                      key={source.id}
                      onClick={() => setSelectedSource(source.id)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                        selectedSource === source.id
                          ? 'border-indigo-500 bg-indigo-500/10 text-white'
                          : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white'
                      }`}
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
                    className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={customMedium}
                    onChange={(e) => setCustomMedium(e.target.value)}
                    placeholder="אמצעי (medium)"
                    className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* Campaign Name */}
              <input
                type="text"
                value={customCampaign}
                onChange={(e) => setCustomCampaign(e.target.value)}
                placeholder="שם הקמפיין (אופציונלי)"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {/* Generated UTM Link */}
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-3 bg-gray-700 rounded-lg text-sm text-gray-300 truncate">
                  {utmLink}
                </div>
                <button
                  onClick={() => handleCopy(utmLink, 'utm')}
                  className={`p-3 rounded-lg transition-colors ${
                    copied === 'utm'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
                  }`}
                >
                  {copied === 'utm' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tips */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-2xl p-6"
        >
          <h3 className="font-semibold text-white mb-4">💡 טיפים לשיתוף</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-indigo-400">•</span>
              הוסיפו את הלינק לביו באינסטגרם או ב-Linktree
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400">•</span>
              השתמשו ב-QR Code בסטוריז או בפוסטים
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400">•</span>
              לינקים עם UTM יעזרו לכם לעקוב מאיפה מגיעים המבקרים
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400">•</span>
              שנו את שם הקמפיין לכל פרסום שונה למעקב מדויק
            </li>
          </ul>
        </motion.div>
      </main>
    </div>
  );
}








