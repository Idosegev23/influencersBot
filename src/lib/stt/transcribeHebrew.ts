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

  const { transcribeAudioHebrew } = await import('@/lib/ai-parser/gemini');

  // Primary — fast Flash transcription (no thinking-token burn → doesn't truncate a long note).
  // Force flash explicitly so a stale AGENT_MODEL_STT_GEMINI=<pro model> env can't reintroduce the bug.
  try {
    const r = await transcribeAudioHebrew(file, 'gemini-3.5-flash');
    if (r.transcript && r.transcript.trim()) {
      return { text: r.transcript, confidence: Number.isFinite(r.confidence) ? r.confidence : null, provider: 'gemini-flash' };
    }
  } catch (e) {
    console.warn('[stt] flash transcription failed', e);
  }

  // Fallback — the SAME lean transcription on a stronger model (NOT the quote doc-parser, which
  // returned empty transcription for plain voice notes). A different model can catch a Flash miss.
  try {
    const r = await transcribeAudioHebrew(file, 'gemini-3.1-pro-preview');
    if (r.transcript && r.transcript.trim()) {
      return { text: r.transcript, confidence: Number.isFinite(r.confidence) ? r.confidence : null, provider: 'gemini-pro' };
    }
  } catch (e) {
    console.warn('[stt] pro transcription fallback failed', e);
  }
  return { text: null, confidence: null, provider: 'none' };
}
