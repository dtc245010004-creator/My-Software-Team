import React, { useState, useEffect } from 'react';
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
import {
  ALERT_SEVERITY,
  ALERT_MESSAGES,
  formatEventTime,
  formatOfflineDuration,
} from '../../config/chargerAlertConfig';

/**
 * AlertBanner Component (SCRUM-320 / SCRUM-295)
 * Component thuần hiển thị (Pure Presentation Component) ở đầu màn hình theo dõi (ChargerGridMonitor).
 *
 * Nhận props:
 * @param {Object} props
 * @param {Array<{
 *   chargerId: number|string,
 *   chargerCode: string,
 *   stationName: string,
 *   type: 'offline' | 'repeated_fault',
 *   consecutiveFaults?: number,
 *   offlineSince?: string|Date,
 *   lastFaultAt?: string|Date,
 *   reason?: string
 * }>} props.alerts Danh sách các cảnh báo được chuyển đổi động từ dữ liệu sống của màn hình
 * @param {(alertItem: any) => void} [props.onSelectCharger] Callback khi click mã trụ để xem chi tiết / mở popup điều khiển
 * @param {() => void} [props.onDismiss] Callback khi bấm nút đóng X
 * @param {string} [props.className] Tùy biến class container
 */
export default function AlertBanner({
  alerts = [],
  onSelectCharger,
  onDismiss,
  className = '',
}) {
  // Quản lý các alert key đã bị người dùng bấm đóng X trong phiên làm việc hiện tại
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState(new Set());
  const [isExpanded, setIsExpanded] = useState(false);

  // Timer cập nhật thời gian thực cho thời lượng "đã offline bao lâu", dọn dẹp khi unmount
  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000); // 5 giây cập nhật 1 lần
    return () => clearInterval(timer);
  }, []);

  // Helper tạo key duy nhất cho mỗi alert
  const getAlertKey = (item) => `${item.chargerId}_${item.type}`;

  // Khi danh sách alerts thay đổi:
  // - Nếu không còn alert nào -> reset dismissed keys
  // - Nếu có alert đã được xử lý (rời trạng thái lỗi/offline) -> gỡ khỏi dismissed keys để nếu lỗi lại thì banner sẽ hiện lại
  useEffect(() => {
    if (!Array.isArray(alerts) || alerts.length === 0) {
      setDismissedAlertKeys(new Set());
    } else {
      const currentKeys = new Set(alerts.map(getAlertKey));
      setDismissedAlertKeys((prev) => {
        let changed = false;
        const next = new Set();
        prev.forEach((key) => {
          if (currentKeys.has(key)) {
            next.add(key);
          } else {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [alerts]);

  // Phân loại danh sách alerts
  const validAlerts = Array.isArray(alerts) ? alerts : [];
  const faultedAlerts = validAlerts.filter((a) => a.type === 'repeated_fault');
  const offlineAlerts = validAlerts.filter((a) => a.type === 'offline');

  const hasFaulted = faultedAlerts.length > 0;
  const hasOffline = offlineAlerts.length > 0;
  const totalCount = validAlerts.length;

  // Banner chỉ bị ẩn nếu TẤT CẢ alert hiện tại đều đã nằm trong danh sách đã đóng X
  // (Nếu có thêm cảnh báo MỚI hoặc trụ cũ vào lại mức cảnh báo -> banner lập tức hiện lại)
  const isDismissed =
    dismissedAlertKeys.size > 0 &&
    totalCount > 0 &&
    validAlerts.every((a) => dismissedAlertKeys.has(getAlertKey(a)));

  // Không có cảnh báo nào hoặc đã bị đóng -> không render, không chừa khoảng trống
  if (isDismissed || totalCount === 0) {
    return null;
  }

  // Quy tắc ưu tiên: Nếu có repeated_fault (hoặc có cả hai) -> ưu tiên mức ĐỎ (critical-red)
  const isCritical = hasFaulted;
  const severity = isCritical ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING;

  // Câu chữ tiêu đề và mô tả suy ra hoàn toàn từ dữ liệu props (KHÔNG hard-code số cố định)
  let title = '';
  let description = '';

  if (hasFaulted && hasOffline) {
    title = `Phát hiện ${totalCount} trụ sạc gặp sự cố (${faultedAlerts.length} báo lỗi liên tục, ${offlineAlerts.length} ngoại tuyến quá lâu).`;
    description =
      'Hệ thống ghi nhận trụ sạc báo lỗi phần cứng liên tiếp hoặc mất kết nối quá thời gian quy định. Cần kiểm tra kỹ thuật hoặc ngắt nguồn an toàn.';
  } else if (hasFaulted) {
    title = `Phát hiện ${faultedAlerts.length} trụ sạc báo lỗi liên tục.`;
    description = ALERT_MESSAGES.FAULTED_DESCRIPTION;
  } else {
    title = `Phát hiện ${offlineAlerts.length} trụ sạc ngoại tuyến quá lâu.`;
    description = ALERT_MESSAGES.OFFLINE_DESCRIPTION;
  }

  const IconComponent = isCritical ? AlertTriangle : WifiOff;

  // Sử dụng đúng các token màu đã có trong tailwind.config.js
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
    const allKeys = new Set(validAlerts.map(getAlertKey));
    setDismissedAlertKeys(allKeys);
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
                {totalCount} Trụ gặp sự cố
              </span>
              {/* Thông báo phụ nếu có cả hai nhóm */}
              {hasFaulted && hasOffline && (
                <span className="text-[10px] font-mono opacity-80 italic">
                  (Bao gồm cả {offlineAlerts.length} trụ đang ngoại tuyến)
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
              Danh Sách Trụ Cần Xử Lý ({totalCount} Trụ):
            </span>
            <span className="text-[11px] font-mono opacity-75">
              Nhấn vào mã trụ để điều hướng / kiểm tra
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {validAlerts.map((item) => {
              const isItemCritical = item.type === 'repeated_fault';
              const ItemIcon = isItemCritical ? Zap : WifiOff;
              const itemCardClasses = isItemCritical
                ? 'bg-rose-100/60 dark:bg-critical-red/20 border-rose-300 dark:border-critical-red/40 hover:border-critical-red'
                : 'bg-amber-100/60 dark:bg-caution-amber/20 border-amber-300 dark:border-caution-amber/40 hover:border-caution-amber';

              return (
                <div
                  key={getAlertKey(item)}
                  onClick={() => onSelectCharger && onSelectCharger(item)}
                  className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all cursor-pointer hover:scale-[1.01] ${itemCardClasses}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 font-mono font-bold text-xs">
                      <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.chargerCode}</span>
                    </div>
                    {item.stationName && (
                      <span className="text-[10px] font-sans truncate max-w-[140px] opacity-80" title={item.stationName}>
                        {item.stationName}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 space-y-0.5 text-[11px] font-mono opacity-90">
                    {/* Mốc thời gian báo lỗi hoặc mất kết nối */}
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 shrink-0 opacity-70" />
                      <span>
                        {isItemCritical ? ALERT_MESSAGES.TIME_LABEL_FAULTED : ALERT_MESSAGES.TIME_LABEL_OFFLINE}{' '}
                        <strong className="font-bold">
                          {formatEventTime(isItemCritical ? item.lastFaultAt : item.offlineSince)}
                        </strong>
                      </span>
                    </div>

                    {/* Chi tiết số lần lỗi liên tiếp hoặc thời gian đã offline cập nhật theo live timer */}
                    <div className="text-[10px] opacity-80 truncate">
                      {isItemCritical ? (
                        <span className="font-semibold text-critical-red">
                          • {item.consecutiveFaults ? `${item.consecutiveFaults} lỗi liên tiếp` : 'Lỗi liên tục'}
                        </span>
                      ) : (
                        <span className="font-semibold text-caution-amber">
                          • Đã offline {formatOfflineDuration(item.offlineSince, currentTime)}
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
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
