'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'brand' | 'outline' | 'ghost' | 'danger';
type Size = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';

function variantClass(v: Variant) {
  return (
    {
      primary: 'ui-btn-primary',
      brand: 'ui-btn-brand',
      outline: 'ui-btn-outline',
      ghost: 'ui-btn-ghost',
      danger: 'ui-btn-danger',
    }[v] || ''
  );
}
function sizeClass(s: Size) {
  return (
    {
      default: '',
      sm: 'ui-btn-sm',
      lg: 'ui-btn-lg',
      icon: 'ui-btn-icon',
      'icon-sm': 'ui-btn-icon-sm',
    }[s] || ''
  );
}

export function buttonVariants({ variant = 'outline', size = 'default' }: { variant?: Variant; size?: Size } = {}) {
  return cn('ui-btn focus-ring', variantClass(variant), sizeClass(size));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'outline', size = 'default', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export interface ButtonLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Variant;
  size?: Size;
  external?: boolean;
}

export const ButtonLink = React.forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { className, variant = 'outline', size = 'default', href, external, children, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (external) {
    return (
      <a ref={ref} href={href} target="_blank" rel="noopener noreferrer" className={classes} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link ref={ref as unknown as React.Ref<HTMLAnchorElement>} href={href} className={classes} {...(props as Record<string, unknown>)}>
      {children}
    </Link>
  );
});
