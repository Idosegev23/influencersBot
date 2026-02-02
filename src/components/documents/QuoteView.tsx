'use client';

/**
 * QuoteView - תצוגה מסודרת להצעת מחיר
 */

interface QuoteData {
  brandName?: string;
  campaignName?: string;
  totalAmount?: number;
  currency?: string;
  deliverables?: Array<{
    type: string;
    quantity: number;
    platform?: string;
    dueDate?: string | null;
    description?: string;
  }>;
  timeline?: {
    startDate?: string | null;
    endDate?: string | null;
  };
  paymentTerms?: {
    milestones?: Array<{
      percentage: number;
      amount: number;
      trigger: string;
      dueDate?: string | null;
    }>;
  };
  specialTerms?: string[];
  contactPerson?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

interface QuoteViewProps {
  data: QuoteData;
}

export function QuoteView({ data }: QuoteViewProps) {
  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">✅ הצעת המחיר נותחה בהצלחה!</h3>
            <p className="text-sm text-gray-600">המערכת זיהתה את הפרטים הבאים:</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Brand */}
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-xs font-medium text-blue-900 mb-1">מותג</p>
            <p className="text-lg font-bold text-blue-700">{data.brandName || '—'}</p>
          </div>

          {/* Campaign */}
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-xs font-medium text-purple-900 mb-1">קמפיין</p>
            <p className="text-lg font-bold text-purple-700">{data.campaignName || '—'}</p>
          </div>

          {/* Amount */}
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-xs font-medium text-green-900 mb-1">סכום</p>
            <p className="text-lg font-bold text-green-700">
              {data.totalAmount
                ? `${data.currency === 'USD' ? '$' : '₪'}${data.totalAmount.toLocaleString()}`
                : '—'}
            </p>
          </div>

          {/* Timeline */}
          <div className="bg-orange-50 rounded-lg p-4">
            <p className="text-xs font-medium text-orange-900 mb-1">תקופה</p>
            <p className="text-sm font-bold text-orange-700">
              {data.timeline?.startDate || '—'} → {data.timeline?.endDate || '—'}
            </p>
          </div>
        </div>

        {/* Deliverables */}
        {data.deliverables && data.deliverables.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3 text-right">📋 דליברבלס:</p>
            <ul className="space-y-2">
              {data.deliverables.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <span className="font-bold text-blue-600">{i + 1}.</span>
                  <span className="flex-1 text-right">
                    {d.quantity && <strong>{d.quantity}x </strong>}
                    {d.type && <span className="font-medium">{d.type}</span>}
                    {d.description && <> - {d.description}</>}
                    {d.platform && <span className="text-xs text-gray-500"> ({d.platform})</span>}
                    {d.dueDate && (
                      <span className="block text-xs text-blue-600 mt-1">
                        📅 {new Date(d.dueDate).toLocaleDateString('he-IL')}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Payment Milestones */}
        {data.paymentTerms?.milestones && data.paymentTerms.milestones.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3 text-right">💰 מועדי תשלום:</p>
            <div className="space-y-2">
              {data.paymentTerms.milestones.map((payment, i) => (
                <div key={i} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="text-right flex-1">
                    <p className="font-bold text-green-900">
                      {data.currency === 'USD' ? '$' : '₪'}{payment.amount?.toLocaleString()} ({payment.percentage}%)
                    </p>
                    <p className="text-xs text-green-700">{payment.trigger}</p>
                  </div>
                  {payment.dueDate && (
                    <span className="text-sm font-medium text-green-700">
                      📅 {new Date(payment.dueDate).toLocaleDateString('he-IL')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Special Terms */}
        {data.specialTerms && data.specialTerms.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3 text-right">📝 תנאים מיוחדים:</p>
            <ul className="space-y-2">
              {data.specialTerms.map((term, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <span className="text-yellow-600">•</span>
                  <span className="flex-1 text-right">{term}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Contact Person */}
        {data.contactPerson && (data.contactPerson.name || data.contactPerson.email || data.contactPerson.phone) && (
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-3 text-right">📞 איש קשר:</p>
            <div className="space-y-1 text-sm text-gray-700 text-right">
              {data.contactPerson.name && <div><strong>שם:</strong> {data.contactPerson.name}</div>}
              {data.contactPerson.email && <div><strong>אימייל:</strong> {data.contactPerson.email}</div>}
              {data.contactPerson.phone && <div><strong>טלפון:</strong> {data.contactPerson.phone}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
