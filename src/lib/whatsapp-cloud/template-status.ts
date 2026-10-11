/**
 * Keep whatsapp_channels.templates in step with Meta's template reviews.
 *
 * The billing probe gates on templates.cs_followup === 'APPROVED', but nothing ever wrote this
 * column — so a connected customer sat on "waiting for template approval" forever, even after
 * Meta approved it (LA BEAUTÉ, 2026-10-11). Meta tells us through the
 * message_template_status_update webhook, keyed by the WABA that owns the template.
 */
export async function recordTemplateStatus(wabaId: string | undefined, value: any): Promise<boolean> {
  const name = value?.message_template_name;
  const event = value?.event;
  if (!wabaId || typeof name !== 'string' || typeof event !== 'string') return false;

  const { supabase } = await import('@/lib/supabase');
  const { data: rows } = await supabase
    .from('whatsapp_channels')
    .select('id, templates')
    .eq('waba_id', wabaId);
  if (!rows || rows.length === 0) return false;

  for (const row of rows as any[]) {
    await supabase
      .from('whatsapp_channels')
      .update({ templates: { ...(row.templates || {}), [name]: event } })
      .eq('id', row.id);
  }
  return true;
}
