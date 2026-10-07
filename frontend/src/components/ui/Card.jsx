import React from 'react';

export default function Card({
  children,
  className = '',
  hoverable = false,
  glass = false,
  padding = 'p-5',
  onClick,
  ...props
}) {
  const baseClasses = 'rounded-2xl transition-all duration-200';
  
  const themeClasses = glass
    ? 'glass-panel border border-slate-200/80 dark:border-slate-800/80 shadow-soft dark:shadow-soft-dark'
    : 'bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/90 shadow-sm dark:shadow-soft-dark';

  const hoverClasses = hoverable
    ? 'hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-glow-cyan/10 cursor-pointer'
    : '';

  return (
    <div
      onClick={onClick}
      className={`${baseClasses} ${themeClasses} ${hoverClasses} ${padding} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
