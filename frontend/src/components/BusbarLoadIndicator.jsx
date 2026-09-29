import React from 'react';

export default function BusbarLoadIndicator({ currentKw = 0, limitKw = 100, label = 'Phụ Tải Lưới Điện (Busbar Load)' }) {
  const percentage = limitKw > 0 ? Math.min(100, Math.round((currentKw / limitKw) * 100)) : 0;

  // Xác định màu trạng thái dòng điện
  let barColor = 'bg-grid-green';
  let textColor = 'text-grid-green';
  if (percentage >= 95) {
    barColor = 'bg-critical-red animate-pulse';
    textColor = 'text-critical-red';
  } else if (percentage >= 80) {
    barColor = 'bg-caution-amber';
    textColor = 'text-caution-amber';
  } else if (percentage >= 50) {
    barColor = 'bg-electric-cyan';
    textColor = 'text-electric-cyan';
  }

  return (
    <div className="bg-panel border border-hairline p-4 rounded-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-steel-gray">
          {label}
        </span>
        <div className="font-mono text-sm tabular-nums">
          <span className={`font-bold ${textColor}`}>{currentKw.toFixed(1)} kW</span>
          <span className="text-steel-gray"> / {limitKw.toFixed(1)} kW</span>
          <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-obsidian text-steel-gray">
            {percentage}% Tải
          </span>
        </div>
      </div>

      {/* Industrial Busbar Visualization */}
      <div className="w-full h-3 bg-obsidian border border-hairline rounded-sm overflow-hidden p-0.5 relative">
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
        {/* Vạch cảnh báo ngưỡng 95% */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-critical-red z-10 opacity-70"
          style={{ left: '95%' }}
          title="Ngưỡng bảo vệ 95%"
        />
      </div>
    </div>
  );
}
