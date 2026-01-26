'use client';

import { useState } from 'react';

interface PartnershipEvent {
  id: string;
  brand_name: string;
  campaign_name: string;
  start_date: string;
  end_date: string;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-500',
  in_progress: 'bg-green-500',
  completed: 'bg-gray-400',
  lead: 'bg-yellow-500',
  negotiation: 'bg-orange-500',
};

export function PartnershipCalendar({ events }: { events: PartnershipEvent[] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  ).getDay();

  const prevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    );
  };

  const getEventsForDate = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(
      currentMonth.getMonth() + 1
    ).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return events.filter((event) => {
      const start = new Date(event.start_date);
      const end = new Date(event.end_date);
      const current = new Date(dateStr);

      return current >= start && current <= end;
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={prevMonth}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          ←
        </button>

        <h3 className="text-lg font-semibold text-gray-900">
          {currentMonth.toLocaleDateString('he-IL', {
            month: 'long',
            year: 'numeric',
          })}
        </h3>

        <button
          onClick={nextMonth}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          →
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Day Headers */}
        {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((day) => (
          <div
            key={day}
            className="text-center text-sm font-medium text-gray-600 pb-2"
          >
            {day}
          </div>
        ))}

        {/* Empty cells for days before month starts */}
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Calendar Days */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayEvents = getEventsForDate(day);
          const isToday =
            new Date().toDateString() ===
            new Date(
              currentMonth.getFullYear(),
              currentMonth.getMonth(),
              day
            ).toDateString();

          return (
            <div
              key={day}
              className={`aspect-square p-2 border border-gray-200 rounded-lg ${
                isToday ? 'bg-blue-50 border-blue-300' : ''
              }`}
            >
              <div className="text-sm font-medium text-gray-900 mb-1">{day}</div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className={`text-xs px-1 py-0.5 rounded text-white truncate ${
                      STATUS_COLORS[event.status] || 'bg-gray-500'
                    }`}
                    title={`${event.brand_name} - ${event.campaign_name}`}
                  >
                    {event.brand_name}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-gray-500 px-1">
                    +{dayEvents.length - 3} עוד
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-3 justify-center text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-500 rounded" />
          <span className="text-gray-600">Lead</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-orange-500 rounded" />
          <span className="text-gray-600">משא ומתן</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded" />
          <span className="text-gray-600">פעיל</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded" />
          <span className="text-gray-600">בעבודה</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-gray-400 rounded" />
          <span className="text-gray-600">הושלם</span>
        </div>
      </div>
    </div>
  );
}
