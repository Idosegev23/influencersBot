/** First-run dashboard tutorial is shown once for a freshly-onboarded account. */
export function shouldShowTutorial(config: any): boolean {
  return config?.onboarding?.status === 'ready' && !config?.tutorial_seen;
}
