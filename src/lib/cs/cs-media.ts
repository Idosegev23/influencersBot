// Materialize an inbound WhatsApp image for the CS brain (mirrors materializeInbound in the agent
// CRM worker). Downloads the bytes once and produces:
//   • dataUrl — a base64 data URL fed straight to the multimodal brain (gpt-5.5 sees the photo)
//   • url     — a DURABLE copy in the support-attachments bucket for the escalation email + inbox
//               (WhatsApp media URLs expire in ~5 min, so they can't be embedded later)
//   • caption — the shopper's image caption, if any
// Runs in the drain worker (300s budget), never on the webhook, so a slow download never blocks ACK.
import { downloadMedia } from '@/lib/whatsapp-cloud/client';
import { supabase } from '@/lib/supabase';

const BUCKET = 'support-attachments';

export interface CsImage {
  dataUrl: string;        // data:<mime>;base64,… — for the model
  url: string | null;     // durable public URL — for the escalation/inbox
  caption: string | null;
  mime: string;
}

export async function materializeCsImage(msg: any): Promise<CsImage | null> {
  const mediaId = msg?.image?.id;
  if (!mediaId) return null;
  const caption = typeof msg?.image?.caption === 'string' && msg.image.caption.trim() ? msg.image.caption.trim() : null;
  try {
    const dl = await downloadMedia(mediaId);
    if (!dl?.bytes) return null;
    const buf = Buffer.from(dl.bytes);
    const mime = dl.mimeType || msg?.image?.mime_type || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

    // Durable copy — best-effort; a storage failure must not lose the understanding path.
    let url: string | null = null;
    try {
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      const path = `cs/${mediaId}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: true });
      if (!error) url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      else console.warn('[cs-media] store image failed', error.message);
    } catch (e) { console.warn('[cs-media] store image threw', (e as Error).message); }

    return { dataUrl, url, caption, mime };
  } catch (e) {
    console.warn('[cs-media] download failed', (e as Error).message);
    return null;
  }
}
