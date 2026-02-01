'use client';

/**
 * BriefView - תצוגה מסודרת לבריף קמפיין
 */

interface BriefData {
  campaignGoal?: string;
  targetAudience?: string;
  keyMessages?: string[];
  tone?: string;
  dosList?: string[];
  dontsList?: string[];
  hashtags?: string[];
  mentions?: string[];
  contentGuidelines?: {
    format?: string;
    length?: string;
    style?: string;
  };
  assets?: Array<{
    type: string;
    description: string;
    url?: string | null;
  }>;
  tasks?: Array<{
    title: string;
    description?: string;
    dueDate?: string | null;
    priority?: string;
  }>;
  approvalProcess?: string;
  references?: string[];
}

interface BriefViewProps {
  data: BriefData;
}

export function BriefView({ data }: BriefViewProps) {
  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityText = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'גבוה';
      case 'medium':
        return 'בינוני';
      case 'low':
        return 'נמוך';
      default:
        return priority || 'לא צוין';
    }
  };

  return (
    <div className="space-y-6">
      {/* Campaign Goal */}
      {data.campaignGoal && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
          <h3 className="text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
            🎯 מטרת הקמפיין
          </h3>
          <p className="text-blue-800 text-right leading-relaxed">{data.campaignGoal}</p>
        </div>
      )}

      {/* Target Audience */}
      {data.targetAudience && (
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-6">
          <h3 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
            👥 קהל יעד
          </h3>
          <p className="text-purple-800 text-right leading-relaxed">{data.targetAudience}</p>
        </div>
      )}

      {/* Key Messages */}
      {data.keyMessages && data.keyMessages.length > 0 && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-6">
          <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
            💬 מסרים מרכזיים
          </h3>
          <ul className="space-y-2">
            {data.keyMessages.map((message, i) => (
              <li key={i} className="flex items-start gap-3 text-right">
                <span className="text-green-600 text-xl">•</span>
                <span className="text-green-800 flex-1">{message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tone & Style */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.tone && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              🎨 טון קול
            </h3>
            <p className="text-gray-700 text-right">{data.tone}</p>
          </div>
        )}

        {data.contentGuidelines && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              📐 הנחיות תוכן
            </h3>
            <div className="space-y-2 text-right text-sm">
              {data.contentGuidelines.format && (
                <div>
                  <span className="font-medium text-gray-600">פורמט:</span>{' '}
                  <span className="text-gray-800">{data.contentGuidelines.format}</span>
                </div>
              )}
              {data.contentGuidelines.length && (
                <div>
                  <span className="font-medium text-gray-600">אורך:</span>{' '}
                  <span className="text-gray-800">{data.contentGuidelines.length}</span>
                </div>
              )}
              {data.contentGuidelines.style && (
                <div>
                  <span className="font-medium text-gray-600">סטייל:</span>{' '}
                  <span className="text-gray-800">{data.contentGuidelines.style}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Do's and Don'ts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Do's */}
        {data.dosList && data.dosList.length > 0 && (
          <div className="bg-green-50 rounded-lg border border-green-200 p-6">
            <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
              ✅ מה לעשות
            </h3>
            <ul className="space-y-2">
              {data.dosList.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-right">
                  <span className="text-green-600 font-bold">✓</span>
                  <span className="text-green-800 text-sm flex-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Don'ts */}
        {data.dontsList && data.dontsList.length > 0 && (
          <div className="bg-red-50 rounded-lg border border-red-200 p-6">
            <h3 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
              ❌ מה לא לעשות
            </h3>
            <ul className="space-y-2">
              {data.dontsList.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-right">
                  <span className="text-red-600 font-bold">✗</span>
                  <span className="text-red-800 text-sm flex-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Tasks */}
      {data.tasks && data.tasks.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            📝 משימות לביצוע
          </h3>
          <div className="space-y-3">
            {data.tasks.map((task, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex-1 text-right">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">{task.title}</h4>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${getPriorityColor(
                        task.priority
                      )}`}
                    >
                      {getPriorityText(task.priority)}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-sm text-gray-700 mb-2">{task.description}</p>
                  )}
                  {task.dueDate && (
                    <p className="text-xs text-gray-500">
                      📅 {new Date(task.dueDate).toLocaleDateString('he-IL')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assets */}
      {data.assets && data.assets.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            🎨 נכסים וחומרים
          </h3>
          <div className="space-y-3">
            {data.assets.map((asset, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <span className="text-2xl">
                  {asset.type === 'logo' ? '🏷️' : asset.type === 'image' ? '🖼️' : '📄'}
                </span>
                <div className="flex-1 text-right">
                  <p className="text-sm font-medium text-gray-900 capitalize">{asset.type}</p>
                  <p className="text-sm text-gray-700">{asset.description}</p>
                  {asset.url && (
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                    >
                      צפה בנכס ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hashtags & Mentions */}
      {((data.hashtags && data.hashtags.length > 0) || (data.mentions && data.mentions.length > 0)) && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            #️⃣ תגיות ואזכורים
          </h3>
          <div className="space-y-4">
            {data.hashtags && data.hashtags.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2 text-right">האשטגים:</p>
                <div className="flex flex-wrap gap-2 justify-end">
                  {data.hashtags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                    >
                      #{tag.replace('#', '')}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {data.mentions && data.mentions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2 text-right">תיוגים:</p>
                <div className="flex flex-wrap gap-2 justify-end">
                  {data.mentions.map((mention, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded-full"
                    >
                      @{mention.replace('@', '')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval Process */}
      {data.approvalProcess && (
        <div className="bg-orange-50 rounded-lg border border-orange-200 p-6">
          <h3 className="text-lg font-bold text-orange-900 mb-3 flex items-center gap-2">
            ✔️ תהליך אישור
          </h3>
          <p className="text-orange-800 text-right leading-relaxed">{data.approvalProcess}</p>
        </div>
      )}

      {/* References */}
      {data.references && data.references.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            🔗 רפרנסים ודוגמאות
          </h3>
          <ul className="space-y-2">
            {data.references.map((ref, i) => (
              <li key={i} className="text-right">
                {ref.startsWith('http') ? (
                  <a
                    href={ref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-sm"
                  >
                    {ref} ↗
                  </a>
                ) : (
                  <span className="text-gray-700 text-sm">{ref}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
