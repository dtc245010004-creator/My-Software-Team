import React from 'react';
import StatusBadge from './StatusBadge';

/**
 * MetricCard Component (WCAG AA Compliant Surface & Contrast)
 *
 * Applies subtle system borders (slate-200 in light, slate-800/60 in dark)
 * and soft dynamic elevation shadows (shadow-sm resting, shadow-md hover).
 *
 * @param {string} title - Card label / title
 * @param {string|number} value - Main numerical stat
 * @param {string} unit - Measurement unit (kW, kWh, VND, %, etc.)
 * @param {React.ReactNode} icon - Lucide or SVG icon
 * @param {string} subtext - Descriptive secondary subtext
 * @param {string} trend - Trend indicator percentage or label
 * @param {'success'|'warning'|'danger'|'info'|'neutral'} trendVariant - Status badge variant
 * @param {boolean} hoverable - Enable 3D hover elevation
 */
export default function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  subtext,
  trend,
  trendVariant = 'info',
  hoverable = true,
  className = '',
  onClick,
  ...props
}) {
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-5 shadow-sm transition-all duration-300 flex flex-col justify-between ${
        hoverable
          ? 'hover:-translate-y-1 hover:shadow-md dark:hover:shadow-cyan-950/20 cursor-pointer'
          : ''
      } ${className}`}
      {...props}
    >
      {/* Top Header: Label & Icon */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          {title}
        </span>
        {Icon && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/60">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Main Metric Stat (High Contrast Numbers) */}
      <div className="my-1.5 flex items-baseline space-x-2">
        <span className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono tabular-nums text-slate-900 dark:text-slate-100">
          {value}
        </span>
        {unit && (
          <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">
            {unit}
          </span>
        )}
      </div>

      {/* Footer Subtext & Trend Badge */}
      {(subtext || trend) && (
        <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/60">
          {subtext && <span className="line-clamp-1 font-medium">{subtext}</span>}
          {trend && (
            <StatusBadge variant={trendVariant} size="sm" className="shrink-0 ml-2">
              {trend}
            </StatusBadge>
          )}
        </div>
      )}
    </div>
  );
}

