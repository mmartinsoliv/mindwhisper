import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode };

export function IconButton({ label, children, className = '', ...rest }: Props) {
  return (
    <button {...rest} aria-label={label}
      className={`inline-flex size-9 items-center justify-center rounded-control text-muted transition hover:bg-surface-2 hover:text-text disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>
      {children}
    </button>
  );
}
