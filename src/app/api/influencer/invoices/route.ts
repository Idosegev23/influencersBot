import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateInvoiceNumber, formatInvoice } from '@/lib/invoicing/generator';

/**
 * GET /api/influencer/invoices
 * List invoices with filters
 */
export async function GET(req: NextRequest) {
  try {
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

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status');
    const partnershipId = searchParams.get('partnershipId');

    // Build query
    let query = supabase
      .from('invoices')
      .select(`
        *,
        partnership:partnerships(id, brand_name, campaign_name)
      `)
      .eq('account_id', account.id);

    if (status) {
      query = query.eq('status', status);
    }

    if (partnershipId) {
      query = query.eq('partnership_id', partnershipId);
    }

    query = query.order('issued_date', { ascending: false });

    const { data: invoices, error } = await query;

    if (error) {
      console.error('Failed to fetch invoices:', error);
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }

    // Format invoices
    const formattedInvoices = (invoices || []).map(formatInvoice);

    return NextResponse.json({ invoices: formattedInvoices });
  } catch (error) {
    console.error('GET /api/influencer/invoices error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/influencer/invoices
 * Create a new invoice
 */
export async function POST(req: NextRequest) {
  try {
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
    const {
      partnership_id,
      amount,
      currency = 'ILS',
      due_date,
      notes,
    } = body;

    // Validate
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Amount is required' }, { status: 400 });
    }

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber(account.id);

    // Create invoice
    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        account_id: account.id,
        partnership_id: partnership_id || null,
        invoice_number: invoiceNumber,
        amount,
        currency,
        due_date: due_date || null,
        status: 'pending',
        issued_date: new Date().toISOString(),
        notes: notes || null,
      })
      .select(`
        *,
        partnership:partnerships(id, brand_name, campaign_name)
      `)
      .single();

    if (error) {
      console.error('Failed to create invoice:', error);
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
    }

    return NextResponse.json({ invoice: formatInvoice(invoice) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/influencer/invoices error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
