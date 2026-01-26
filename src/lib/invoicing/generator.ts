/**
 * Invoice Generator
 * Generate and format invoices for partnerships
 */

export type InvoiceData = {
  id: string;
  invoice_number: string;
  partnership: {
    brand_name: string;
    campaign_name: string;
  };
  amount: number;
  currency: string;
  due_date: string | null;
  status: 'pending' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issued_date: string;
  payment_date: string | null;
  notes: string | null;
};

/**
 * Generate invoice number
 * Format: INV-YYYYMM-XXXX
 */
export function generateInvoiceNumber(accountId: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  return `INV-${year}${month}-${random}`;
}

/**
 * Calculate invoice status based on dates and payment
 */
export function calculateInvoiceStatus(
  currentStatus: string,
  dueDate: string | null,
  paymentDate: string | null
): 'pending' | 'sent' | 'paid' | 'overdue' | 'cancelled' {
  // If paid, status is paid
  if (paymentDate) {
    return 'paid';
  }

  // If cancelled, keep as cancelled
  if (currentStatus === 'cancelled') {
    return 'cancelled';
  }

  // Check if overdue
  if (dueDate && new Date(dueDate) < new Date() && currentStatus !== 'paid') {
    return 'overdue';
  }

  // Otherwise, keep current status
  return currentStatus as any;
}

/**
 * Format invoice for display
 */
export function formatInvoice(invoice: any): InvoiceData {
  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    partnership: invoice.partnership || { brand_name: 'לא מצורף', campaign_name: '' },
    amount: invoice.amount || 0,
    currency: invoice.currency || 'ILS',
    due_date: invoice.due_date,
    status: calculateInvoiceStatus(invoice.status, invoice.due_date, invoice.payment_date),
    issued_date: invoice.issued_date,
    payment_date: invoice.payment_date,
    notes: invoice.notes,
  };
}

/**
 * Generate invoice summary statistics
 */
export function generateInvoiceSummary(invoices: InvoiceData[]) {
  const total = invoices.length;
  const pending = invoices.filter(i => i.status === 'pending' || i.status === 'sent').length;
  const paid = invoices.filter(i => i.status === 'paid').length;
  const overdue = invoices.filter(i => i.status === 'overdue').length;

  const totalAmount = invoices.reduce((sum, i) => sum + i.amount, 0);
  const paidAmount = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
  const pendingAmount = invoices.filter(i => i.status === 'pending' || i.status === 'sent').reduce((sum, i) => sum + i.amount, 0);
  const overdueAmount = invoices.filter(i => i.status === 'overdue').reduce((sum, i) => sum + i.amount, 0);

  return {
    count: {
      total,
      pending,
      paid,
      overdue,
    },
    amount: {
      total: totalAmount,
      paid: paidAmount,
      pending: pendingAmount,
      overdue: overdueAmount,
    },
    rates: {
      payment_rate: total > 0 ? Math.round((paid / total) * 100) : 0,
      overdue_rate: total > 0 ? Math.round((overdue / total) * 100) : 0,
    },
  };
}
