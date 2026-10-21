import React from 'react';
import { motion } from 'framer-motion';
import Card from './ui/Card';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

export default function BusbarLoadIndicator({
  currentKw = 0,
  limitKw = 100,
  label = 'Phụ Tải Lưới Điện (Busbar Load)',
}) {
  const percentage = limitKw > 0 ? Math.min(100, Math.round((currentKw / limitKw) * 100)) : 0;

  // Xác định gradient & màu sắc theo mức tải chuẩn WCAG AAA
  let gradientClass = 'from-emerald-500 via-teal-500 to-cyan-500';
  let badgeColor =
    'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200/90 dark:border-emerald-800/60';
  let textColor = 'text-emerald-700 dark:text-emerald-400';
  let statusIcon = ShieldCheck;

  if (percentage >= 95) {
    gradientClass = 'from-rose-500 via-red-500 to-rose-600';
    badgeColor =
      'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200/90 dark:border-rose-800/60';
    textColor = 'text-rose-700 dark:text-rose-400';
    statusIcon = AlertTriangle;
  } else if (percentage >= 80) {
    gradientClass = 'from-amber-500 via-orange-500 to-amber-600';
    badgeColor =
      'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/90 dark:border-amber-800/60';
    textColor = 'text-amber-800 dark:text-amber-400';
    statusIcon = AlertTriangle;
  } else if (percentage >= 50) {
    gradientClass = 'from-sky-500 to-cyan-500';
    badgeColor =
      'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200/90 dark:border-sky-800/60';
    textColor = 'text-sky-700 dark:text-sky-400';
  }

  const StatusIcon = statusIcon;

  return (
    <Card padding="p-5" className="shadow-sm hover:shadow-md transition-shadow duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase break-words">
              {label}
            </span>
            <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${badgeColor}`}>
              <StatusIcon className="w-3 h-3" />
              <span>{percentage >= 95 ? 'Nguy cơ quá tải' : percentage >= 80 ? 'Tải cao' : 'An toàn'}</span>
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Giám sát phụ tải biến áp & điều phối dòng rơ-le chống sập lưới tự động
          </p>
        </div>

        <div className="flex items-center space-x-2 font-mono tabular-nums">
          <span className={`text-lg sm:text-xl font-extrabold ${textColor}`}>
            {currentKw.toFixed(1)} kW
          </span>
          <span className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
            / {limitKw.toFixed(1)} kW
          </span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${badgeColor}`}>
            {percentage}% Tải
          </span>
        </div>
      </div>

      {/* Industrial Busbar Visualization: Dày dặn, Gradient & Vạch ngưỡng */}
      <div className="relative w-full h-4 sm:h-5 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-800 shadow-inner">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(2, percentage)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full bg-gradient-to-r ${gradientClass} shadow-md`}
        />

        {/* Vạch ngưỡng an toàn 80% */}
        <div
          className="absolute top-0 bottom-0 w-px bg-amber-400 dark:bg-amber-500/80 z-10 opacity-70"
          style={{ left: '80%' }}
          title="Ngưỡng cảnh báo 80%"
        />

        {/* Vạch cảnh báo ngưỡng 95% */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-rose-600 dark:bg-rose-500 z-10 shadow-sm"
          style={{ left: '95%' }}
          title="Ngưỡng an toàn tối đa 95%"
        />
      </div>

      {/* Chú thích các mốc % dưới thanh */}
      <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2 px-1 font-mono">
        <span>0%</span>
        <span>50%</span>
        <span className="text-amber-700 dark:text-amber-400">80% (Cảnh báo)</span>
        <span className="text-rose-700 dark:text-rose-400 font-bold">95% (Ngưỡng an toàn)</span>
        <span>100%</span>
      </div>
    </Card>
  );
}
