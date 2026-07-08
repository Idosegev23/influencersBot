export interface Transcript {
  text: string | null;
  confidence: number | null;
  provider: string;
}

/**
 * Dedicated Hebrew voice transcription for the agent path (P2). Replaces the misuse of the
 * quote-document parser on the voice path: primary = a LEAN Gemini transcription (transcript
 * + self-reported confidence, no discarded doc extraction); fallback = the proven full
 * parseAudioWithGemini path. Both providers are Gemini today; an OpenAI gpt-4o-transcribe
 * fallback is an env-switchable add (AGENT_MODEL_STT). Returns null text if both fail.
 */
export async function transcribeHebrew(bytes: Uint8Array, mime: string): Promise<Transcript> {
  const ext = (mime.split('/')[1] || 'ogg').split(';')[0];
  const file = new File([Buffer.from(bytes)], `voice.${ext}`, { type: mime });

  // Primary — lean transcription with a real confidence signal.
  try {
    const { transcribeAudioHebrew } = await import('@/lib/ai-parser/gemini');
    const r = await transcribeAudioHebrew(file);
    if (r.transcript && r.transcript.trim()) {
      return { text: r.transcript, confidence: Number.isFinite(r.confidence) ? r.confidence : null, provider: 'gemini' };
    }
  } catch (e) {
    console.warn('[stt] lean gemini transcription failed', e);
  }

  // Fallback — the proven doc-parser path (no clean confidence).
  try {
    const { parseAudioWithGemini } = await import('@/lib/ai-parser');
    const res: any = await parseAudioWithGemini({ file, documentType: 'quote', language: 'he' });
    const text = res?.transcription || res?.data?.transcription || null;
    return { text, confidence: null, provider: 'gemini-parser' };
  } catch (e) {
    console.warn('[stt] fallback transcription failed', e);
    return { text: null, confidence: null, provider: 'none' };
  }
}
