'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Partnership {
  id: string;
  brand_name: string;
  campaign_name: string;
  status: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  created_at: string;
  whatsapp_phone?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  negotiation: 'משא ומתן',
  active: 'פעיל',
  in_progress: 'בעבודה',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

const STATUS_COLORS: Record<string, string> = {
  lead: 'bg-gray-100 text-gray-700',
  negotiation: 'bg-orange-100 text-orange-700',
  active: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-green-100 text-green-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export function PartnershipLibrary({
  partnerships,
  username,
}: {
  partnerships: Partnership[];
  username: string;
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'brand'>('date');
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [phoneValues, setPhoneValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // Filter & Sort
  let filteredPartnerships = partnerships.filter((p) => {
    const matchesSearch =
      p.brand_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.campaign_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' || p.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Sort
  filteredPartnerships.sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'amount':
        return (b.total_amount || 0) - (a.total_amount || 0);
      case 'brand':
        return a.brand_name.localeCompare(b.brand_name, 'he');
      default:
        return 0;
    }
  });

  const handleSavePhone = async (partnershipId: string) => {
    setSaving(partnershipId);
    try {
      const phone = phoneValues[partnershipId];
      const response = await fetch(`/api/influencer/partnerships/${partnershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username,
          whatsapp_phone: phone || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update phone');
      }

      setEditingPhone(null);
      // Refresh data
      window.location.reload();
    } catch (err) {
      console.error('Error saving phone:', err);
      alert('שגיאה בשמירת המספר');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="חיפוש לפי מותג או קמפיין..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-right"
          />

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-right"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="lead">Lead</option>
            <option value="negotiation">משא ומתן</option>
            <option value="active">פעיל</option>
            <option value="in_progress">בעבודה</option>
            <option value="completed">הושלם</option>
            <option value="cancelled">בוטל</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-right"
          >
            <option value="date">תאריך יצירה</option>
            <option value="amount">סכום</option>
            <option value="brand">מותג (א-ת)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {filteredPartnerships.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <p>לא נמצאו שת"פים</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                  מותג
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                  WhatsApp
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                  סטטוס
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                  תאריכים
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                  סכום
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPartnerships.map((partnership) => (
                <tr
                  key={partnership.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-right">
                    <div className="font-medium text-gray-900">
                      {partnership.brand_name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingPhone === partnership.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="tel"
                          value={phoneValues[partnership.id] || partnership.whatsapp_phone || ''}
                          onChange={(e) => setPhoneValues({ ...phoneValues, [partnership.id]: e.target.value.replace(/[^\d+]/g, '') })}
                          placeholder="05X-XXX-XXXX"
                          className="px-2 py-1 text-sm border border-gray-300 rounded w-32"
                          dir="ltr"
                        />
                        <button
                          onClick={() => handleSavePhone(partnership.id)}
                          disabled={saving === partnership.id}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {saving === partnership.id ? '...' : 'שמור'}
                        </button>
                        <button
                          onClick={() => setEditingPhone(null)}
                          className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                          ביטול
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600" dir="ltr">
                          {partnership.whatsapp_phone || '—'}
                        </span>
                        <button
                          onClick={() => {
                            setEditingPhone(partnership.id);
                            setPhoneValues({ ...phoneValues, [partnership.id]: partnership.whatsapp_phone || '' });
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          ערוך
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                        STATUS_COLORS[partnership.status] ||
                        'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {STATUS_LABELS[partnership.status] || partnership.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">
                    {partnership.start_date && partnership.end_date ? (
                      <>
                        {new Date(partnership.start_date).toLocaleDateString('he-IL')}
                        {' - '}
                        {new Date(partnership.end_date).toLocaleDateString('he-IL')}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {partnership.total_amount
                      ? `₪${partnership.total_amount.toLocaleString('he-IL')}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() =>
                        router.push(
                          `/influencer/${username}/partnerships/${partnership.id}`
                        )
                      }
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      צפה
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
