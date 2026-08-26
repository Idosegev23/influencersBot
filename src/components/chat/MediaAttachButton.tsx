'use client';

import { useRef } from 'react';

interface MediaAttachButtonProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  /** Account language. This is an icon-only button, so the aria-label is the ONLY
   *  thing a screen reader announces — Hebrew here is not a cosmetic leak. */
  language?: 'he' | 'en';
}

export function MediaAttachButton({ onFileSelected, disabled, language }: MediaAttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        className="media-attach-btn"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label={language === 'en' ? 'Attach a photo or video' : 'צרף תמונה או סרטון'}
      >
        <span className="media-attach-icon" aria-hidden />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/webm"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onFileSelected(file);
            // Reset so same file can be re-selected
            e.target.value = '';
          }
        }}
      />
    </>
  );
}
