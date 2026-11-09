import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean };
const V = {
  primary: 'bg-accent text-accent-contrast hover:brightness-110',
  secondary: 'bg-surface-2 text-text hover:brightness-95 border border-border',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-danger text-danger-contrast hover:brightness-110',
};
const S = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm' };

export function Button({ variant = 'primary', size = 'md', loading, disabled, children, className = '', ...rest }: Props) {
  return (
    <button {...rest} disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-control font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${V[variant]} ${S[size]} ${className}`}>
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}
