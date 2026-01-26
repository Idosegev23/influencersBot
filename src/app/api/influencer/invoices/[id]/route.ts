import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatInvoice } from '@/lib/invoicing/generator';

/**
 * PATCH /api/influencer/invoices/[id]
 * Update invoice (mark as paid, sent, etc.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Parse request body
    const body = await req.json();
    const { status, payment_date, notes } = body;

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      updates.status = status;
      
      // If marking as paid and no payment_date provided, set it to now
      if (status === 'paid' && !payment_date) {
        updates.payment_date = new Date().toISOString();
      }
    }

    if (payment_date !== undefined) {
      updates.payment_date = payment_date;
      
      // If providing payment_date, automatically mark as paid
      if (payment_date && !status) {
        updates.status = 'paid';
      }
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    // Update invoice
    const { data: invoice, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', id)
      .eq('account_id', account.id)
      .select(`
        *,
        partnership:partnerships(id, brand_name, campaign_name)
      `)
      .single();

    if (error) {
      console.error('Failed to update invoice:', error);
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }

    return NextResponse.json({ invoice: formatInvoice(invoice) });
  } catch (error) {
    console.error('PATCH /api/influencer/invoices/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/influencer/invoices/[id]
 * Delete invoice
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Delete invoice
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)
      .eq('account_id', account.id);

    if (error) {
      console.error('Failed to delete invoice:', error);
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/influencer/invoices/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
