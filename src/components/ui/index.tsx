'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.css';

const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' ');

/* -------------------------------------------------------------- Button --- */

type Variant = 'primary' | 'secondary' | 'subtle' | 'ghost';
type Size = 'lg' | 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(styles.button, styles[variant], styles[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Chip --- */

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  wide?: boolean;
}

export function Chip({ active = false, wide = false, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(styles.chip, active && styles.chipActive, wide && styles.chipWide, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------- Containers --- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx(styles.card, className)}>{children}</div>;
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx(styles.panel, className)}>{children}</div>;
}

export function Label({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx(styles.label, className)}>{children}</div>;
}

export function AccentLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx(styles.accentLabel, className)}>{children}</div>;
}

/* ---------------------------------------------------------------- Stats --- */

export interface StatItem {
  value: ReactNode;
  label: string;
}

export function StatGrid({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div className={cx(styles.statGrid, className)}>
      {items.map((item, i) => (
        <div key={i} className={styles.stat}>
          <div className={styles.statValue}>{item.value}</div>
          <div className={styles.statLabel}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Field --- */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, className, id, ...rest }: FieldProps) {
  const inputId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.fieldLabel} htmlFor={inputId}>
        {label}
        {hint ? ` · ${hint}` : ''}
      </label>
      <input id={inputId} className={styles.fieldInput} {...rest} />
    </div>
  );
}

/* ---------------------------------------------------------------- Sheet --- */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  surface?: boolean;
  labelledBy?: string;
}

/** Bottom sheet used for exercise details, explanations and swaps. */
export function Sheet({ open, onClose, children, surface = false, labelledBy }: SheetProps) {
  if (!open) return null;
  return (
    <div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={onClose}
    >
      <div
        className={cx(styles.sheet, surface && styles.sheetSurface)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grabber} />
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ icon, title, id }: { icon: ReactNode; title: string; id?: string }) {
  return (
    <div className={styles.sheetHeader}>
      <div className={styles.sheetBadge}>{icon}</div>
      <span className={styles.sheetTitle} id={id}>
        {title}
      </span>
    </div>
  );
}

export function SheetBody({ children }: { children: ReactNode }) {
  return <div className={styles.sheetBody}>{children}</div>;
}

/* ------------------------------------------------------------- Feedback --- */

export function TypingDots() {
  return (
    <span className={styles.dots} aria-label="thinking">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </span>
  );
}

export function ErrorNote({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button className={styles.errorDismiss} onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
