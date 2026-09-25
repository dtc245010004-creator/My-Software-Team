import React from 'react';

export default function MetricBox({ label, value, unit, icon: Icon, color = 'tech-white', subtext }) {
  const colorMap = {
    'electric-cyan': 'text-electric-cyan',
    'grid-green': 'text-grid-green',
    'caution-amber': 'text-caution-amber',
    'critical-red': 'text-critical-red',
    'tech-white': 'text-tech-white',
  };

  const selectedColor = colorMap[color] || 'text-tech-white';

  return (
    <div className="bg-panel border border-hairline p-4 rounded-sm flex flex-col justify-between">
      <div className="flex items-center justify-between text-steel-gray text-xs mb-1">
        <span>{label}</span>
        {Icon && <Icon className="w-4 h-4 text-steel-gray" />}
      </div>
      <div className="font-mono tabular-nums my-1">
        <span className={`text-2xl font-bold tracking-tight ${selectedColor}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-steel-gray ml-1.5 font-normal">{unit}</span>}
      </div>
      {subtext && <div className="text-[11px] text-steel-gray font-mono">{subtext}</div>}
    </div>
  );
}
