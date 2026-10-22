import React from 'react';

/**
 * StatusBadge Component (WCAG AA / AAA Compliant)
 * 
 * Auto-applies high-contrast dark text on soft tinted backgrounds for Light Mode,
 * and crisp luminescent text on subtle tinted backgrounds for Dark Mode.
 *
 * @param {'success'|'warning'|'danger'|'info'|'neutral'} variant - Status variant
 * @param {boolean} dot - Render a live status LED indicator dot
 * @param {boolean} pulse - Animate pulsating ping effect on dot
 * @param {'sm'|'md'|'lg'} size - Badge sizing
 * @param {React.ReactNode} icon - Optional Lucide or SVG icon
 */
export default function StatusBadge({
  children,
  variant = 'neutral',
  dot = false,
  pulse = false,
  size = 'md',
  icon: Icon,
  className = '',
  ...props
}) {
  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold',
  };

  // High contrast accessible tokens conforming strictly to WCAG AA/AAA guidelines
  const variantClasses = {
    success:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50',
    warning:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50',
    danger:
      'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50',
    info:
      'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/50',
    neutral:
      'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700/60',
  };

  const dotColors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-sky-500',
    neutral: 'bg-slate-400 dark:bg-slate-500',
  };

  const selectedVariant = variantClasses[variant] || variantClasses.neutral;
  const selectedDot = dotColors[variant] || dotColors.neutral;

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border transition-colors select-none ${
        sizeClasses[size] || sizeClasses.md
      } ${selectedVariant} ${className}`}
      {...props}
    >
      {dot && (
        <span className="relative flex h-2 w-2 shrink-0">
          {pulse && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${selectedDot}`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${selectedDot}`} />
        </span>
      )}

      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}

      <span>{children}</span>
    </span>
  );
}

