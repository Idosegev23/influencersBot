'use client';

import { useRef, useState, useCallback } from 'react';
import { MediaAttachButton } from './MediaAttachButton';
import { MediaPreview } from './MediaPreview';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** Media handling */
  media?: {
    previewUrl: string | null;
    isProcessing: boolean;
    result: { mediaType?: string } | null;
    error: string | null;
    clear: () => void;
    processMedia: (file: File, username: string) => void;
  };
  username?: string;
  /** Show commercial content disclaimer */
  showDisclaimer?: boolean;
  /** Custom ref for the textarea */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = 'משהו שבא לך לשאול?',
  media,
  username,
  showDisclaimer = false,
  inputRef: externalRef,
}: ChatInputProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;
  const [isFocused, setIsFocused] = useState(false);

  const isActive = isFocused || value.trim().length > 0;
  const hasMedia = media?.result && !media.isProcessing;
  const canSend = (value.trim().length > 0 || !!hasMedia) && !disabled && !media?.isProcessing;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSend) onSend();
      }
    },
    [canSend, onSend]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
  }, []);

  return (
    <div className="chat-input-wrapper">
      {/* Media preview */}
      {media?.previewUrl && (
        <MediaPreview
          previewUrl={media.previewUrl}
          isProcessing={media.isProcessing}
          isReady={!!media.result}
          isVideo={
            media.result?.mediaType === 'video' ||
            media.previewUrl?.includes('video') ||
            false
          }
          error={media.error}
          onClear={media.clear}
        />
      )}

      {/* Input pill */}
      <div className={`chat-input-pill${isActive ? ' chat-input-pill--active' : ''}`}>
        {/* Send button (left side in RTL) */}
        <button
          onClick={onSend}
          disabled={!canSend}
          className="send-btn"
          aria-label="שלח הודעה"
        >
          <span className="send-btn-icon" aria-hidden />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          dir="rtl"
        />

        {/* Media attach button (right side in RTL) */}
        {media && username && (
          <MediaAttachButton
            onFileSelected={(file) => media.processMedia(file, username)}
            disabled={disabled || media.isProcessing}
          />
        )}
      </div>

      {/* Commercial content disclaimer */}
      {showDisclaimer && (
        <p className="chat-input-disclaimer" dir="rtl">
          העמוד עשוי לכלול תוכן שיווקי ושיתופי פעולה מסחריים
        </p>
      )}
    </div>
  );
}
