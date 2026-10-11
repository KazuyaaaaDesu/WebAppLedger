import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'accent' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

interface ButtonOwnProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
}

type ButtonProps = ButtonOwnProps & ComponentPropsWithRef<'button'>;

type Styleable = Omit<ButtonOwnProps, 'children'>;

function classes({ variant = 'primary', size = 'md', block }: Styleable): string {
  return [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button({ variant, size, block, className, children, ...rest }: ButtonProps) {
  return (
    <button className={[classes({ variant, size, block }), className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  );
}

interface LinkButtonProps extends ButtonOwnProps {
  to: string;
  className?: string;
  'aria-label'?: string;
  title?: string;
}

export function LinkButton({ to, variant, size, block, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link to={to} className={[classes({ variant, size, block }), className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Link>
  );
}
