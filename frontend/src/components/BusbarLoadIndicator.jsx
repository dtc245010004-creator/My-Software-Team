import React from 'react';
import Card from './ui/Card';

export default function BusbarLoadIndicator({
  currentKw = 0,
  limitKw = 100,
  label = 'Phụ Tải Lưới Điện (Busbar Load)',
}) {
  const percentage = limitKw > 0 ? Math.min(100, Math.round((currentKw / limitKw) * 100)) : 0;

  // Xác định gradient & màu sắc theo mức tải
  let gradientClass = 'from-emerald-500 to-teal-400';
  let badgeColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60';
  let textColor = 'text-emerald-600 dark:text-emerald-400';

  if (percentage >= 95) {
    gradientClass = 'from-rose-600 via-rose-500 to-red-600 animate-pulse';
    badgeColor = 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200 dark:border-rose-800/60';
    textColor = 'text-rose-600 dark:text-rose-400';
  } else if (percentage >= 80) {
    gradientClass = 'from-amber-500 to-orange-500';
    badgeColor = 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-800/60';
    textColor = 'text-amber-600 dark:text-amber-400';
  } else if (percentage >= 50) {
    gradientClass = 'from-sky-500 to-cyan-400';
    badgeColor = 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400 border-sky-200 dark:border-sky-800/60';
    textColor = 'text-sky-600 dark:text-sky-400';
  }

  return (
    <Card padding="p-5" className="shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <span className="text-xs font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
            {label}
          </span>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Giám sát giới hạn cấp nguồn biến áp & bảo vệ rơ-le chống sập nguồn
          </p>
        </div>

        <div className="flex items-center space-x-2 font-mono tabular-nums">
          <span className={`text-base font-extrabold ${textColor}`}>
            {currentKw.toFixed(1)} kW
          </span>
          <span className="text-slate-400 dark:text-slate-500 text-sm">
            / {limitKw.toFixed(1)} kW
          </span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${badgeColor}`}>
            {percentage}% Tải
          </span>
        </div>
      </div>

      {/* Industrial Busbar Visualization: Dày dặn & Gradient */}
      <div className="relative w-full h-4 sm:h-5 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-800 shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${gradientClass} shadow-md`}
          style={{ width: `${Math.max(2, percentage)}%` }}
        />
        
        {/* Vạch cảnh báo ngưỡng 95% */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-rose-600 dark:bg-rose-500 z-10 shadow-sm"
          style={{ left: '95%' }}
          title="Ngưỡng an toàn 95%"
        />
      </div>

      {/* Chú thích các mốc % dưới thanh */}
      <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-2 px-1 font-mono">
        <span>0%</span>
        <span>50%</span>
        <span>80%</span>
        <span className="text-rose-600 dark:text-rose-400 font-semibold">95% (Ngưỡng an toàn)</span>
        <span>100%</span>
      </div>
    </Card>
  );
}

