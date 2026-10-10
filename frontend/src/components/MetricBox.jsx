import React from 'react';

export default function MetricBox({
  label,
  value,
  unit,
  icon: Icon,
  color = 'tech-white',
  subtext,
  trend,
}) {
  // Bản đồ màu sắc hiện đại cho icon box và con số
  const styleConfig = {
    'electric-cyan': {
      text: 'text-sky-600 dark:text-sky-400',
      iconBg: 'bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shadow-sky-500/10',
      badge: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    },
    'grid-green': {
      text: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shadow-emerald-500/10',
      badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    'caution-amber': {
      text: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shadow-amber-500/10',
      badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    },
    'critical-red': {
      text: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shadow-rose-500/10',
      badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    },
    'tech-white': {
      text: 'text-slate-900 dark:text-white',
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
      badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    },
  };

  const selected = styleConfig[color] || styleConfig['tech-white'];

  return (
    <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-soft-dark flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-default group">
      
      {/* Top Header: Nhãn & Icon trong hộp màu */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {Icon && (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform duration-200 group-hover:scale-110 ${selected.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {/* Main Stat: Số to rõ */}
      <div className="my-1">
        <div className="flex items-baseline space-x-1.5">
          <span className={`text-3xl font-extrabold tracking-tight font-mono tabular-nums ${selected.text}`}>
            {value}
          </span>
          {unit && (
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* Footer Subtext */}
      {subtext && (
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60">
          <span className="line-clamp-1">{subtext}</span>
          {trend && (
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${selected.badge}`}>
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

