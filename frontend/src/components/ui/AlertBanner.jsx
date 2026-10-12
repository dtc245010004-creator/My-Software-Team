import React, { useState } from 'react';
import {
  AlertTriangle,
  WifiOff,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { ALERT_SEVERITY, ALERT_MESSAGES } from '../../config/chargerAlertConfig';

/**
 * AlertBanner Component (SCRUM-320)
 * Banner cảnh báo gộp ở đầu màn hình theo dõi (ChargerGridMonitor.jsx - SCRUM-129)
 * Hỗ trợ 2 mức độ (Ưu tiên mức đỏ khi có cả hai):
 * - critical-red: Trụ báo lỗi liên tục
 * - caution-amber: Trụ ngoại tuyến quá lâu
 *
 * @param {Object} props
 * @param {Array} props.faultedChargers Danh sách trụ báo lỗi liên tục
 * @param {Array} props.offlineChargers Danh sách trụ ngoại tuyến quá lâu
 * @param {(charger: any) => void} [props.onSelectCharger] Callback khi click vào mã trụ để xem chi tiết / cuộn tới trụ
 * @param {() => void} [props.onDismiss] Callback khi bấm nút X
 * @param {string} [props.className] Class tùy biến thêm
 */
export default function AlertBanner({
  faultedChargers = [],
  offlineChargers = [],
  onSelectCharger,
  onDismiss,
  className = '',
}) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Không hiển thị nếu đã đóng hoặc không có trụ nào gặp sự cố
  const hasFaulted = Array.isArray(faultedChargers) && faultedChargers.length > 0;
  const hasOffline = Array.isArray(offlineChargers) && offlineChargers.length > 0;

  if (isDismissed || (!hasFaulted && !hasOffline)) {
    return null;
  }

  // Quy tắc ưu tiên: Nếu có cả hai, ưu tiên hiển thị mức ĐỎ (critical-red)
  const isCritical = hasFaulted;
  const severity = isCritical ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING;

  // Dữ liệu và thông điệp gộp tương ứng theo mức ưu tiên
  const activeItems = isCritical ? faultedChargers : offlineChargers;
  const count = activeItems.length;

  const title = isCritical
    ? ALERT_MESSAGES.FAULTED_TITLE(count)
    : ALERT_MESSAGES.OFFLINE_TITLE(count);

  const description = isCritical
    ? ALERT_MESSAGES.FAULTED_DESCRIPTION
    : ALERT_MESSAGES.OFFLINE_DESCRIPTION;

  const IconComponent = isCritical ? AlertTriangle : WifiOff;

  // Sử dụng token màu có sẵn trong tailwind.config.js (critical-red, caution-amber, panel, hairline, tech-white, steel-gray)
  const containerClasses = isCritical
    ? 'bg-rose-50 dark:bg-critical-red/10 border-rose-300 dark:border-critical-red/40 text-rose-900 dark:text-rose-200'
    : 'bg-amber-50 dark:bg-caution-amber/10 border-amber-300 dark:border-caution-amber/40 text-amber-900 dark:text-amber-200';

  const iconClasses = isCritical
    ? 'text-critical-red bg-critical-red/10 dark:bg-critical-red/20 border-critical-red/30'
    : 'text-caution-amber bg-caution-amber/10 dark:bg-caution-amber/20 border-caution-amber/30';

  const badgeClasses = isCritical
    ? 'bg-critical-red/15 text-critical-red border-critical-red/30'
    : 'bg-caution-amber/15 text-caution-amber border-caution-amber/30';

  const buttonClasses = isCritical
    ? 'text-critical-red hover:bg-critical-red/15 border-critical-red/30'
    : 'text-caution-amber hover:bg-caution-amber/15 border-caution-amber/30';

  const handleClose = () => {
    setIsDismissed(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`border rounded-xl p-4 shadow-sm transition-all duration-200 ${containerClasses} ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Khối Thông Điệp Chính (Gộp tổng hợp) */}
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div className={`p-2 rounded-lg border shrink-0 mt-0.5 ${iconClasses}`}>
            <IconComponent className="w-5 h-5 animate-pulse" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <strong className="font-bold text-sm tracking-wide font-sans">
                {title}
              </strong>
              {/* Badge số lượng trụ và mốc quan trọng */}
              <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${badgeClasses}`}>
                {count} Trụ gặp sự cố
              </span>
              {/* Thông báo phụ nếu có cả offline lẫn lỗi liên tục */}
              {hasFaulted && hasOffline && (
                <span className="text-[10px] font-mono opacity-80 italic">
                  (Bao gồm cả {offlineChargers.length} trụ đang ngoại tuyến)
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm mt-1 font-sans opacity-90 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Khối Nút Hành Động (Xem chi tiết + Nút Đóng X) */}
        <div className="flex items-center space-x-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${buttonClasses}`}
            title="Mở rộng danh sách chi tiết các trụ gặp sự cố"
          >
            <span>{isExpanded ? ALERT_MESSAGES.ACTION_COLLAPSE : ALERT_MESSAGES.ACTION_VIEW_DETAILS}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Đóng cảnh báo (ẩn trong phiên này)"
            className="p-1.5 rounded-lg opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Đóng cảnh báo trong phiên này"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Phần Danh Sách Mã Trụ & Mốc Thời Gian (Mở rộng khi bấm "Xem chi tiết") */}
      {isExpanded && (
        <div className="mt-3.5 pt-3 border-t border-black/10 dark:border-white/10 animate-fadeIn">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider opacity-90">
              Danh Sách Trụ Cần Xử Lý ({activeItems.length} Trụ):
            </span>
            <span className="text-[11px] font-mono opacity-75">
              Nhấn vào mã trụ để điều hướng / kiểm tra
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeItems.map((item) => (
              <div
                key={item.id || item.code}
                onClick={() => onSelectCharger && onSelectCharger(item)}
                className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all cursor-pointer hover:scale-[1.01] ${
                  isCritical
                    ? 'bg-rose-100/60 dark:bg-critical-red/20 border-rose-300 dark:border-critical-red/40 hover:border-critical-red'
                    : 'bg-amber-100/60 dark:bg-caution-amber/20 border-amber-300 dark:border-caution-amber/40 hover:border-caution-amber'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-mono font-bold text-xs">
                    <Zap className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.code}</span>
                  </div>
                  {item.station_name && (
                    <span className="text-[10px] font-sans truncate max-w-[140px] opacity-80" title={item.station_name}>
                      {item.station_name}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 space-y-0.5 text-[11px] font-mono opacity-90">
                  {/* Mốc thời gian mất kết nối hoặc báo lỗi */}
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3 shrink-0 opacity-70" />
                    <span>
                      {isCritical ? ALERT_MESSAGES.TIME_LABEL_FAULTED : ALERT_MESSAGES.TIME_LABEL_OFFLINE}{' '}
                      <strong className="font-bold">{item.last_event_time || 'Gần đây'}</strong>
                    </span>
                  </div>

                  {/* Chi tiết nguyên nhân hoặc số lần lỗi / phút offline */}
                  <div className="text-[10px] opacity-80 truncate">
                    {item.consecutive_faults !== undefined && (
                      <span className="font-semibold text-critical-red">
                        • {item.consecutive_faults} lỗi liên tiếp
                      </span>
                    )}
                    {item.offline_minutes !== undefined && (
                      <span className="font-semibold text-caution-amber">
                        • Offline {item.offline_minutes} phút
                      </span>
                    )}
                    {item.reason && <span> — {item.reason}</span>}
                  </div>
                </div>

                {onSelectCharger && (
                  <div className="mt-1 text-right">
                    <span className="text-[10px] inline-flex items-center space-x-1 underline opacity-80 hover:opacity-100">
                      <span>Kiểm tra trụ</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
