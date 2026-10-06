import React from 'react';

export default function Skeleton({
  variant = 'text',
  className = '',
  width,
  height,
}) {
  const baseClasses = 'animate-pulse bg-slate-200 dark:bg-slate-800 rounded';

  const variantClasses = {
    text: 'h-4 w-full rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
    card: 'rounded-2xl h-36 w-full',
  };

  const style = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant] || ''} ${className}`}
      style={style}
    />
  );
}
