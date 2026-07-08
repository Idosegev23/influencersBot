/** Decide whether a voice transcription needs a read-back before acting. Pure, DB-free. */
export const STT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * A low-confidence transcription (noisy/mumbled audio) is echoed back for the agent to
 * confirm before any action, so a mis-heard price or talent name is caught on the money
 * path. A null confidence (provider gave no signal) is trusted — today's behavior — so the
 * gate never adds friction to a clear voice note.
 */
export function shouldReadBack(confidence: number | null | undefined, text: string): boolean {
  if (confidence == null) return false;
  if (!text || !text.trim()) return false;
  return confidence < STT_CONFIDENCE_THRESHOLD;
}
