'use client';

import { useState } from 'react';

type SubTask = {
  id: string;
  text: string;
  completed: boolean;
};

type SubTasksListProps = {
  taskId: string;
  checklist: SubTask[];
  onUpdate: (checklist: SubTask[]) => Promise<void>;
  readonly?: boolean;
};

export default function SubTasksList({ taskId, checklist, onUpdate, readonly = false }: SubTasksListProps) {
  const [items, setItems] = useState<SubTask[]>(checklist || []);
  const [newItemText, setNewItemText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const completed = items.filter(item => item.completed).length;
  const total = items.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleToggle = async (itemId: string) => {
    if (readonly) return;

    const updated = items.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    
    setItems(updated);
    setIsSaving(true);
    try {
      await onUpdate(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newItemText.trim() || readonly) return;

    const newItem: SubTask = {
      id: Date.now().toString(),
      text: newItemText.trim(),
      completed: false,
    };

    const updated = [...items, newItem];
    setItems(updated);
    setNewItemText('');
    setIsAdding(false);
    
    setIsSaving(true);
    try {
      await onUpdate(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (readonly) return;

    const updated = items.filter(item => item.id !== itemId);
    setItems(updated);
    
    setIsSaving(true);
    try {
      await onUpdate(updated);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      {total > 0 && (
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>התקדמות תתי-משימות</span>
            <span className="font-medium">{completed}/{total} ({progress}%)</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <input
              type="checkbox"
              checked={item.completed}
              onChange={() => handleToggle(item.id)}
              disabled={readonly}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span
              className={`flex-1 ${
                item.completed ? 'line-through text-gray-500' : 'text-gray-900'
              }`}
            >
              {item.text}
            </span>
            {!readonly && (
              <button
                onClick={() => handleDelete(item.id)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add New */}
      {!readonly && (
        <div>
          {isAdding ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') {
                    setIsAdding(false);
                    setNewItemText('');
                  }
                }}
                placeholder="תתי-משימה חדשה..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                הוסף
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewItemText('');
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ביטול
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + הוסף תתי-משימה
            </button>
          )}
        </div>
      )}

      {/* Saving indicator */}
      {isSaving && (
        <div className="text-xs text-gray-500 text-center">
          שומר...
        </div>
      )}
    </div>
  );
}
