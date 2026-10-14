import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Zap, BatteryCharging, AlertCircle, CheckCircle2, Clock, Power } from 'lucide-react';

/* =============================================================================
   TYPES & INTERFACES
   ============================================================================= */

export type ChargerStatus = 'CHARGING' | 'AVAILABLE' | 'FAULTED' | 'OFFLINE' | 'PREPARING';

export interface ChargerStationData {
  id: string | number;
  code: string;                 // e.g. "SIM-001"
  name?: string;                // e.g. "Trạm sạc Vincom Metropolis"
  connectorType: string;        // e.g. "CCS 2", "Type 2", "CHAdeMO"
  powerKw: number;              // e.g. 22 or 120 (Max rating)
  currentPowerKw?: number;      // e.g. 18.5 (Live telemetry while charging)
  soc?: number;                 // e.g. 72% Battery SoC
  status: ChargerStatus;
  vendor?: string;              // e.g. "ABB Terra 54"
  stationLocation?: string;     // e.g. "Hầm B2 - Trụ C14"
  energyDeliveredKwh?: number;  // e.g. 14.8 kWh
}

export interface ChargerStationCardProps {
  station: ChargerStationData;
  index?: number;               // Index for staggered entrance delay
  onClick?: (station: ChargerStationData) => void;
  className?: string;
}

/* =============================================================================
   STATUS THEME CONFIGURATION (WCAG AA/AAA COMPLIANT)
   ============================================================================= */

const statusConfig: Record<
  ChargerStatus,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
    glowColor: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  CHARGING: {
    label: 'Đang sạc',
    badgeClass:
      'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/50',
    dotClass: 'bg-sky-500 shadow-[0_0_12px_rgba(2,132,199,0.7)]',
    glowColor: 'rgba(2, 132, 199, 0.15)',
    icon: BatteryCharging,
  },
  AVAILABLE: {
    label: 'Sẵn sàng',
    badgeClass:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50',
    dotClass: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]',
    glowColor: 'rgba(16, 185, 129, 0.12)',
    icon: CheckCircle2,
  },
  FAULTED: {
    label: 'Lỗi rơ-le',
    badgeClass:
      'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50',
    dotClass: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]',
    glowColor: 'rgba(244, 63, 94, 0.15)',
    icon: AlertCircle,
  },
  OFFLINE: {
    label: 'Mất tín hiệu',
    badgeClass:
      'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700/60',
    dotClass: 'bg-slate-400 dark:bg-slate-500',
    glowColor: 'rgba(148, 163, 184, 0.08)',
    icon: Power,
  },
  PREPARING: {
    label: 'Chuẩn bị cắm sạc',
    badgeClass:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50',
    dotClass: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]',
    glowColor: 'rgba(245, 158, 11, 0.15)',
    icon: Clock,
  },
};

/* =============================================================================
   CHARGER STATION CARD COMPONENT
   ============================================================================= */

export const ChargerStationCard: React.FC<ChargerStationCardProps> = ({
  station,
  index = 0,
  onClick,
  className = '',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  // 1. Framer Motion 3D Tilt Values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Soft physics spring for natural feel
  const springConfig = { damping: 25, stiffness: 350 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  // Subtle rotation bounds: -6deg to +6deg for realistic tactile perspective
  const rotateX = useTransform(smoothMouseY, [-0.5, 0.5], ['6deg', '-6deg']);
  const rotateY = useTransform(smoothMouseX, [-0.5, 0.5], ['-6deg', '6deg']);

  // Dynamic sheen glare highlight positioning
  const glareX = useTransform(smoothMouseX, [-0.5, 0.5], ['0%', '100%']);
  const glareY = useTransform(smoothMouseY, [-0.5, 0.5], ['0%', '100%']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width - 0.5;
    const yPct = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(xPct);
    mouseY.set(yPct);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const currentStatus = statusConfig[station.status] || statusConfig.AVAILABLE;
  const isCharging = station.status === 'CHARGING';
  const isAvailable = station.status === 'AVAILABLE';
  const StatusIcon = currentStatus.icon;

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={() => onClick && onClick(station)}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      whileHover={{ scale: 1.02 }}
      className={`relative group cursor-pointer rounded-2xl select-none transition-shadow duration-300 ${className}`}
    >
      {/* Outer Card Body with Subtle System Borders (slate-200 in Light, slate-800/60 in Dark) */}
      <div className="relative h-full overflow-hidden rounded-2xl bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-5 shadow-sm group-hover:shadow-xl dark:group-hover:shadow-black/40 transition-all duration-300 flex flex-col justify-between">
        
        {/* Subtle Ambient Hover Glow */}
        <div
          className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${currentStatus.glowColor}, transparent 70%)`,
          }}
        />

        {/* Dynamic Sheen Glare Effect */}
        <motion.div
          className="pointer-events-none absolute -inset-full opacity-0 group-hover:opacity-20 dark:group-hover:opacity-10 transition-opacity duration-500 blur-2xl"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 60%)',
            left: glareX,
            top: glareY,
          }}
        />

        {/* ===================================================================
            HEADER: STATION ID & LIVE STATUS BADGE
           =================================================================== */}
        <div className="relative z-10 flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center space-x-2.5">
            {/* Live 3D Status Indicator with Pulsing Aura */}
            <div className="relative flex items-center justify-center w-4 h-4">
              {isCharging && (
                <>
                  {/* Expanding Aura Wave 1 */}
                  <motion.span
                    animate={{ scale: [1, 2.2, 1], opacity: [0.65, 0, 0.65] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inline-flex w-full h-full rounded-full bg-sky-400"
                  />
                  {/* Middle Pulse Ring 2 */}
                  <motion.span
                    animate={{ scale: [1, 1.5, 1], opacity: [0.8, 0.2, 0.8] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inline-flex w-full h-full rounded-full bg-sky-500/40"
                  />
                </>
              )}

              {isAvailable && (
                <motion.span
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inline-flex w-full h-full rounded-full bg-emerald-400"
                />
              )}

              {/* Solid 3D Center Dot */}
              <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${currentStatus.dotClass}`} />
            </div>

            {/* Station ID Code */}
            <div>
              <span className="font-mono text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {station.code}
              </span>
              {station.vendor && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-none mt-0.5 truncate max-w-[140px]">
                  {station.vendor}
                </p>
              )}
            </div>
          </div>

          {/* WCAG Compliant Status Badge */}
          <span
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${currentStatus.badgeClass}`}
          >
            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
            <span>{currentStatus.label}</span>
          </span>
        </div>

        {/* ===================================================================
            BODY: POWER METRIC & CONNECTOR TYPE
           =================================================================== */}
        <div className="relative z-10 my-2 space-y-3">
          {/* Power Rating & Realtime Delivery */}
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                {isCharging ? 'Phụ tải sạc thực tế' : 'Công suất định mức'}
              </span>
              <div className="flex items-baseline space-x-1.5 mt-0.5">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {isCharging && station.currentPowerKw !== undefined
                    ? station.currentPowerKw.toFixed(1)
                    : station.powerKw}
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400">
                  kW
                </span>
                {isCharging && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    / {station.powerKw} kW
                  </span>
                )}
              </div>
            </div>

            {/* Connector Type Badge */}
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60">
              <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{station.connectorType}</span>
            </span>
          </div>

          {/* Active Charging Session Bar & Battery SoC (if charging) */}
          {isCharging && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-600 dark:text-slate-400 flex items-center space-x-1">
                  <span>Mức pin xe:</span>
                  <strong className="text-sky-700 dark:text-sky-300">{station.soc ?? 68}%</strong>
                </span>
                {station.energyDeliveredKwh !== undefined && (
                  <span className="text-slate-500 dark:text-slate-400">
                    +{station.energyDeliveredKwh.toFixed(1)} kWh
                  </span>
                )}
              </div>

              {/* Animated Progress Bar */}
              <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${station.soc ?? 68}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* ===================================================================
            FOOTER: LOCATION & QUICK HINT
           =================================================================== */}
        {station.stationLocation && (
          <div className="relative z-10 pt-3 mt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate max-w-[200px]">{station.stationLocation}</span>
            <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0 ml-2">
              Chi tiết →
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

/* =============================================================================
   COMPANION: CHARGER STATION GRID
   ============================================================================= */

export interface ChargerStationGridProps {
  stations: ChargerStationData[];
  onSelectStation?: (station: ChargerStationData) => void;
  className?: string;
}

export const ChargerStationGrid: React.FC<ChargerStationGridProps> = ({
  stations,
  onSelectStation,
  className = '',
}) => {
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 ${className}`}
    >
      {stations.map((station, index) => (
        <ChargerStationCard
          key={station.id}
          station={station}
          index={index}
          onClick={onSelectStation}
        />
      ))}
    </div>
  );
};

export default ChargerStationCard;
