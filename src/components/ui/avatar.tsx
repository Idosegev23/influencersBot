'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: number;
  rounded?: boolean;
}

export function Avatar({ src, alt = '', fallback, size = 40, rounded, className, ...props }: AvatarProps) {
  const initials = (fallback || alt || '?').trim().slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-[color:var(--ink-100)] text-[color:var(--ink-600)] font-semibold select-none',
        rounded ? 'rounded-full' : 'rounded-[10px]',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      {...props}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
