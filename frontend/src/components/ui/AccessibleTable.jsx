import React from 'react';

/**
 * AccessibleTable Component System (WCAG AA Compliant)
 * 
 * Provides accessible, high-contrast table wrappers:
 * - Table: Container with subtle borders and soft elevation shadow
 * - TableHeader: Clean subtle header with muted background
 * - TableHead: High-contrast uppercase header cell
 * - TableBody: Dividers using subtle system borders
 * - TableRow: Auto-applies soft hover state & accessible borders
 * - TableCell: High-contrast content typography
 */

export function Table({ children, className = '', ...props }) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#151D2A] shadow-sm">
      <table className={`w-full text-left font-sans border-collapse ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, className = '', ...props }) {
  return (
    <thead
      className={`bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800/60 ${className}`}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableHead({ children, className = '', align = 'left', ...props }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      className={`py-3.5 px-4 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider ${alignClass} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableBody({ children, className = '', ...props }) {
  return (
    <tbody
      className={`divide-y divide-slate-200 dark:divide-slate-800/60 ${className}`}
      {...props}
    >
      {children}
    </tbody>
  );
}

/**
 * Accessible TableRow
 * Automatically applies subtle system borders and soft hover states
 */
export function TableRow({ children, className = '', hover = true, onClick, ...props }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-slate-200 dark:border-slate-800/60 transition-colors duration-150 ${
        hover ? 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40' : ''
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, className = '', align = 'left', ...props }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <td
      className={`py-3.5 px-4 text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium ${alignClass} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}

export default {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
};

