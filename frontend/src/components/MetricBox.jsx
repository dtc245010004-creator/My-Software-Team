import React from 'react';
import { motion } from 'framer-motion';

export default function MetricBox({
  label,
  value,
  unit,
  icon: Icon,
  color = 'tech-white',
  subtext,
  trend,
  trendPositive = true,
}) {
  // Bảng phối màu hiện đại chuẩn WCAG AAA (> 7:1 trong Light Mode, > 4.5:1 trong Dark Mode)
  const styleConfig = {
    'electric-cyan': {
      text: 'text-sky-700 dark:text-sky-300',
      iconBg: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/60 shadow-sky-500/10',
      badge: 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60',
      glow: 'group-hover:border-sky-300 dark:group-hover:border-sky-700/60',
    },
    'grid-green': {
      text: 'text-emerald-700 dark:text-emerald-300',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 shadow-emerald-500/10',
      badge: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
      glow: 'group-hover:border-emerald-300 dark:group-hover:border-emerald-700/60',
    },
    'caution-amber': {
      text: 'text-amber-800 dark:text-amber-300',
      iconBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 shadow-amber-500/10',
      badge: 'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
      glow: 'group-hover:border-amber-300 dark:group-hover:border-amber-700/60',
    },
    'critical-red': {
      text: 'text-rose-700 dark:text-rose-300',
      iconBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60 shadow-rose-500/10',
      badge: 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60',
      glow: 'group-hover:border-rose-300 dark:group-hover:border-rose-700/60',
    },
    'tech-white': {
      text: 'text-slate-900 dark:text-slate-100',
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60',
      badge: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60',
      glow: 'group-hover:border-slate-300 dark:group-hover:border-slate-700',
    },
  };

  const selected = styleConfig[color] || styleConfig['tech-white'];

  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2, ease: 'easeOut' } }}
      className={`relative overflow-hidden bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm hover:shadow-xl dark:shadow-soft-dark dark:hover:shadow-cyan-950/10 flex flex-col justify-between transition-all duration-300 group ${selected.glow}`}
    >
      {/* Subtle 3D gradient background glow on hover */}
      <div className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-white/10 dark:from-sky-500/5 to-transparent" />

      {/* Top Header: Nhãn & Icon trong hộp màu */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 tracking-wide uppercase">
          {label}
        </span>
        {Icon && (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${selected.iconBg}`}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {/* Main Stat: Số to rõ nét */}
      <div className="my-1.5 relative z-10">
        <div className="flex items-baseline space-x-2">
          <span
            className={`text-3xl sm:text-4xl font-extrabold tracking-tight font-mono tabular-nums ${selected.text}`}
          >
            {value}
          </span>
          {unit && (
            <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* Footer Subtext: Đảm bảo độ tương phản cao trong Light Mode */}
      {subtext && (
        <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/70 relative z-10">
          <span className="line-clamp-1 font-medium">{subtext}</span>
          {trend && (
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ml-2 shrink-0 ${selected.badge}`}
            >
              {trend}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
