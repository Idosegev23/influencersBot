import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sanitizeHtml, sanitizeUsername } from '@/lib/sanitize';

function generateSerial(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `LD-${ts}-${rand}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const firstName = sanitizeHtml(body.firstName || '');
    const lastName = sanitizeHtml(body.lastName || '');
    const phone = (body.phone || '').replace(/[^\d+\-() ]/g, '').slice(0, 20);
    const username = sanitizeUsername(body.username || '');
    const sessionId = body.sessionId;

    if (!firstName?.trim() || !lastName?.trim() || !phone?.trim()) {
      return NextResponse.json({ success: false, error: 'כל השדות חובה' }, { status: 400 });
    }

    if (!username) {
      return NextResponse.json({ success: false, error: 'Missing username' }, { status: 400 });
    }

    // Get account
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('config->>username', username)
      .eq('status', 'active')
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    // Check if phone already registered for this account
    const { data: existing } = await supabase
      .from('chat_leads')
      .select('id, serial_number, first_name')
      .eq('account_id', account.id)
      .eq('phone', phone.trim())
      .maybeSingle();

    if (existing) {
      // Already registered — return existing serial
      if (sessionId) {
        await supabase
          .from('chat_sessions')
          .update({ lead_id: existing.id, is_follower: true })
          .eq('id', sessionId);
      }
      return NextResponse.json({
        success: true,
        serialNumber: existing.serial_number,
        leadId: existing.id,
        firstName: existing.first_name,
        alreadyRegistered: true,
      });
    }

    const serialNumber = generateSerial();

    const { data: lead, error } = await supabase
      .from('chat_leads')
      .insert({
        account_id: account.id,
        session_id: sessionId || null,
        serial_number: serialNumber,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
      })
      .select('id, serial_number, first_name')
      .single();

    if (error) {
      console.error('[Lead API] Insert error:', error);
      return NextResponse.json({ success: false, error: 'שגיאה בשמירה' }, { status: 500 });
    }

    // Link session to lead
    if (sessionId) {
      await supabase
        .from('chat_sessions')
        .update({ lead_id: lead.id, is_follower: true })
        .eq('id', sessionId);
    }

    return NextResponse.json({
      success: true,
      serialNumber: lead.serial_number,
      leadId: lead.id,
      firstName: lead.first_name,
    });
  } catch (err) {
    console.error('[Lead API] Error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
