'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings,
  Save,
  Loader2,
  Check,
  RefreshCw,
  MessageSquare,
} from 'lucide-react';
import { getInfluencerByUsername } from '@/lib/supabase';
import type { Influencer } from '@/types';

export default function SettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [greetingMessage, setGreetingMessage] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();
        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);

        // Load greeting from config or chatbot_persona
        if (inf.greeting_message) {
          setGreetingMessage(inf.greeting_message);
        } else if ((inf as any).config?.widget?.welcomeMessage) {
          setGreetingMessage((inf as any).config.widget.welcomeMessage);
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/influencer/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          greeting_message: greetingMessage,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch('/api/influencer/regenerate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.greeting) {
          setGreetingMessage(data.greeting);
        }
      }
    } catch (err) {
      console.error('Error regenerating greeting:', err);
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dash-text-3)' }} />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
            הגדרות
          </h1>
        </div>

        {/* Greeting Message */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <MessageSquare className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
              הודעת פתיחה
            </h2>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-200 hover:bg-[var(--dash-surface-hover)]"
              style={{ color: 'var(--dash-text-2)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
              ייצור אוטומטי
            </button>
          </div>

          <p className="text-sm mb-3" style={{ color: 'var(--dash-text-3)' }}>
            ההודעה שתופיע למבקרים כשהם פותחים את הצ׳אט
          </p>

          <textarea
            className="input w-full py-3 px-4 text-sm"
            rows={4}
            value={greetingMessage}
            onChange={(e) => setGreetingMessage(e.target.value)}
            placeholder="היי! איך אוכל לעזור?"
          />

          {/* Preview */}
          {greetingMessage && (
            <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--dash-muted)', border: '1px solid var(--dash-glass-border)' }}>
              <div className="text-xs mb-2" style={{ color: 'var(--dash-text-3)' }}>תצוגה מקדימה:</div>
              <div
                className="p-3 rounded-2xl text-sm"
                style={{
                  background: 'rgba(160,148,224,0.1)',
                  border: '1px solid rgba(160,148,224,0.2)',
                  color: 'var(--dash-text)',
                  borderBottomLeftRadius: '4px',
                  maxWidth: '80%',
                }}
              >
                {greetingMessage}
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50"
              style={{ background: saved ? '#17A34A' : 'var(--color-primary)', color: '#fff' }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saved ? 'נשמר!' : 'שמירה'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
