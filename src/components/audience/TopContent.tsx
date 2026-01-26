'use client';

interface ContentItem {
  id: string;
  type: string;
  thumbnail: string;
  caption: string;
  likes: number;
  comments: number;
  engagement_rate: number;
  date: string;
}

export function TopContent({ content }: { content: ContentItem[] }) {
  if (!content || content.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
        <p>אין מספיק נתונים על תוכן</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">
        תוכן מצליח
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {content.map((item) => (
          <div
            key={item.id}
            className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Thumbnail */}
            <div className="relative aspect-square bg-gray-100">
              <img
                src={item.thumbnail}
                alt={item.caption}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 right-2 px-2 py-1 bg-white/90 rounded text-xs font-medium">
                {item.type === 'reel' ? '🎥 Reel' : 
                 item.type === 'carousel' ? '🖼️ קרוסלה' : 
                 '📷 פוסט'}
              </div>
            </div>

            {/* Content Info */}
            <div className="p-4 space-y-2">
              <p className="text-sm text-gray-700 line-clamp-2 text-right">
                {item.caption}
              </p>

              {/* Metrics */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-gray-600">
                    <span className="text-red-500">❤️</span>
                    {item.likes.toLocaleString('he-IL')}
                  </span>
                  <span className="flex items-center gap-1 text-gray-600">
                    <span className="text-blue-500">💬</span>
                    {item.comments.toLocaleString('he-IL')}
                  </span>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                  {item.engagement_rate.toFixed(1)}% ER
                </span>
              </div>

              {/* Date */}
              <p className="text-xs text-gray-400 text-right">
                {new Date(item.date).toLocaleDateString('he-IL')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
