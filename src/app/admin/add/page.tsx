'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';
import {
  WizardSteps,
  StepUrl,
  StepFetching,
  StepReview,
  StepTheme,
  StepPublish,
} from '@/components/wizard';
import { themePresets } from '@/lib/theme';
import type {
  WizardStep,
  WizardState,
  ApifyProfileData,
  ApifyPostData,
  InfluencerType,
  InfluencerTheme,
  InfluencerPersona,
  Product,
  ContentItem,
} from '@/types';

export default function AddInfluencerPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [state, setState] = useState<WizardState>({
    step: 'url',
    url: '',
    profileData: null,
    posts: [],
    influencerType: null,
    extractedProducts: [],
    extractedContent: [],
    persona: null,
    theme: themePresets.other,
    subdomain: '',
    error: null,
    isLoading: false,
  });

  const [fetchProgress, setFetchProgress] = useState(0);
  const [fetchStatus, setFetchStatus] = useState('');

  useEffect(() => {
    fetch('/api/admin')
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push('/admin');
        } else {
          setCheckingAuth(false);
        }
      })
      .catch(() => router.push('/admin'));
  }, [router]);

  // Step 1: Handle URL submission
  const handleUrlSubmit = async (url: string) => {
    setState((prev) => ({ ...prev, url, isLoading: true, error: null }));
    setFetchProgress(0);
    setFetchStatus('מתחבר לאינסטגרם...');

    try {
      // Start fetching phase
      setState((prev) => ({ ...prev, step: 'fetching' }));

      // Simulate progress while fetching
      const progressInterval = setInterval(() => {
        setFetchProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 500);

      setFetchProgress(10);
      setFetchStatus('שולף פרופיל...');

      // Fetch from Apify
      const apifyRes = await fetch('/api/apify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!apifyRes.ok) {
        const error = await apifyRes.json();
        throw new Error(error.error || 'Failed to fetch profile');
      }

      const apifyData = await apifyRes.json();
      const { profile, posts }: { profile: ApifyProfileData; posts: ApifyPostData[] } = apifyData;

      setFetchProgress(60);
      setFetchStatus('מנתח תוכן...');
      setState((prev) => ({ ...prev, step: 'analysis' }));

      // Analyze with AI
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, posts }),
      });

      if (!analyzeRes.ok) {
        const error = await analyzeRes.json();
        throw new Error(error.error || 'Analysis failed');
      }

      const analysisData = await analyzeRes.json();

      clearInterval(progressInterval);
      setFetchProgress(100);
      setFetchStatus('הושלם!');

      // Update state with all data
      setState((prev) => ({
        ...prev,
        step: 'review',
        profileData: profile,
        posts,
        influencerType: analysisData.influencerType,
        persona: analysisData.persona,
        theme: analysisData.theme || themePresets[analysisData.influencerType as InfluencerType],
        extractedProducts: analysisData.products,
        extractedContent: analysisData.contentItems,
        subdomain: profile.username.toLowerCase().replace(/[^a-z0-9]/g, ''),
        isLoading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        step: 'url',
        error: error instanceof Error ? error.message : 'An error occurred',
        isLoading: false,
      }));
    }
  };

  // Handle products update
  const handleUpdateProducts = (products: Partial<Product>[]) => {
    setState((prev) => ({ ...prev, extractedProducts: products }));
  };

  // Handle content update
  const handleUpdateContent = (content: Partial<ContentItem>[]) => {
    setState((prev) => ({ ...prev, extractedContent: content }));
  };

  // Handle theme change
  const handleThemeChange = (theme: InfluencerTheme) => {
    setState((prev) => ({ ...prev, theme }));
  };

  // Handle publish
  const handlePublish = async (subdomain: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Build context for assistant
      let context = '';
      if (state.extractedProducts.length > 0) {
        context += '## מוצרים וקופונים:\n';
        state.extractedProducts.forEach((p) => {
          context += `- ${p.name}`;
          if (p.brand) context += ` (${p.brand})`;
          if (p.coupon_code) context += ` - קופון: ${p.coupon_code}`;
          if (p.link) context += ` - לינק: ${p.link}`;
          context += '\n';
        });
      }

      // Create influencer
      const res = await fetch('/api/admin/influencers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: state.profileData?.username,
          subdomain,
          display_name: state.profileData?.fullName || state.profileData?.username,
          bio: state.profileData?.biography,
          avatar_url: state.profileData?.profilePicUrl,
          followers_count: state.profileData?.followersCount,
          following_count: state.profileData?.followingCount,
          influencer_type: state.influencerType,
          persona: state.persona,
          theme: state.theme,
          admin_password: password,
          context,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create influencer');
      }

      const data = await res.json();

      // Save products
      if (state.extractedProducts.length > 0 && data.influencer?.id) {
        for (const product of state.extractedProducts) {
          await fetch('/api/admin/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              influencer_id: data.influencer.id,
              ...product,
            }),
          }).catch(console.error);
        }
      }

      // Success - redirect to dashboard
      router.push(`/admin/dashboard?created=${subdomain}`);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to publish',
        isLoading: false,
      }));
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen admin-panel flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen admin-panel" dir="rtl">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-900/20 via-gray-950 to-purple-900/20" />

      {/* Header */}
      <header className="relative z-10 px-6 py-4 border-b border-gray-800">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
            חזרה לדשבורד
          </Link>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-500" />
            <span className="font-semibold text-white">הוספת משפיען</span>
          </div>
        </div>
      </header>

      {/* Wizard Steps Indicator */}
      <div className="relative z-10 py-6 border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-6">
          <WizardSteps currentStep={state.step} isLoading={state.isLoading} />
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* Error Display */}
        {state.error && state.step === 'url' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center"
          >
            {state.error}
          </motion.div>
        )}

        {/* Step Content */}
        {state.step === 'url' && (
          <StepUrl onSubmit={handleUrlSubmit} isLoading={state.isLoading} />
        )}

        {(state.step === 'fetching' || state.step === 'analysis') && (
          <StepFetching progress={fetchProgress} status={fetchStatus} />
        )}

        {state.step === 'review' && state.profileData && state.influencerType && state.persona && (
          <StepReview
            profile={state.profileData}
            influencerType={state.influencerType}
            persona={state.persona}
            products={state.extractedProducts}
            contentItems={state.extractedContent}
            onUpdateProducts={handleUpdateProducts}
            onUpdateContent={handleUpdateContent}
            onContinue={() => setState((prev) => ({ ...prev, step: 'theme' }))}
            onBack={() => setState((prev) => ({ ...prev, step: 'url' }))}
          />
        )}

        {state.step === 'theme' && state.influencerType && state.profileData && (
          <StepTheme
            initialTheme={state.theme}
            influencerType={state.influencerType}
            profileName={state.profileData.fullName || state.profileData.username}
            onThemeChange={handleThemeChange}
            onContinue={() => setState((prev) => ({ ...prev, step: 'publish' }))}
            onBack={() => setState((prev) => ({ ...prev, step: 'review' }))}
          />
        )}

        {state.step === 'publish' && state.profileData && (
          <StepPublish
            suggestedSubdomain={state.subdomain || state.profileData.username}
            onPublish={handlePublish}
            onBack={() => setState((prev) => ({ ...prev, step: 'theme' }))}
            isLoading={state.isLoading}
            error={state.error}
          />
        )}
      </main>
    </div>
  );
}


