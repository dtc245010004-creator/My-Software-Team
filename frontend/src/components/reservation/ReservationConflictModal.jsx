import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AlertTriangle,
  X,
  Zap,
  Clock,
  BatteryCharging,
  ArrowRight,
  MapPin,
  Loader2,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { formatSuggestionAvailableTime } from '../../utils/reservationConflictUtils';
import { formatVNTime, formatVNDateTime, parseToDate } from '../../utils/formatTime';

/**
 * ReservationConflictModal Component (SCRUM-372 / SCRUM-353 / S-49)
 *
 * Hộp thoại hiển thị thông báo "Trụ này vừa được người khác đặt" khi tài xế gặp xung đột 409
 * kèm danh sách các đầu nối sạc khả dụng gợi ý trong cùng trạm.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Trạng thái hiển thị modal
 * @param {() => void} props.onClose - Hàm đóng modal
 * @param {Array<Object>} [props.suggestions=[]] - Danh sách gợi ý từ backend
 * @param {string|Date|Object} [props.selectedTime] - Giờ tới/thời gian người dùng đã chọn trước đó
 * @param {(suggestion: Object, selectedTime: any) => Promise<void>} props.onSelectSuggestion - Hàm gọi lại khi bấm "Đặt trụ này"
 * @param {() => void} [props.onBackToStations] - Hàm quay về danh sách trạm khi không có gợi ý
 * @param {boolean} [props.loading=false] - Trạng thái đang gửi yêu cầu đặt lại
 * @param {string} [props.error=null] - Thông báo lỗi nếu việc đặt lại tiếp tục xung đột
 * @param {string} [props.conflictDetail] - Chi tiết lỗi từ backend
 */
export default function ReservationConflictModal({
  isOpen,
  onClose,
  suggestions = [],
  selectedTime,
  onSelectSuggestion,
  onBackToStations,
  loading = false,
  error = null,
  conflictDetail,
}) {
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);

  // Chống bấm đúp (anti-double-click) ở tầng component
  const [submittingId, setSubmittingId] = useState(null);

  // Đóng bằng phím Esc và quản lý focus
  useEffect(() => {
    if (!isOpen) {
      setSubmittingId(null);
      return;
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading && !submittingId) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Tự động focus vào nút đóng khi mở modal để hỗ trợ trợ năng
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, loading, submittingId, onClose]);

  // Xử lý bấm chọn một trụ gợi ý (chống bấm đôi)
  const handleSelect = useCallback(
    async (item) => {
      if (loading || submittingId !== null) return;
      try {
        setSubmittingId(item.connectorId);
        if (onSelectSuggestion) {
          await onSelectSuggestion(item, selectedTime);
        }
      } finally {
        setSubmittingId(null);
      }
    },
    [loading, submittingId, onSelectSuggestion, selectedTime]
  );

  if (!isOpen) return null;

  // Hiển thị chuỗi thời gian đã chọn để người dùng an tâm giữ nguyên thời gian
  const renderSelectedTimeText = () => {
    if (!selectedTime) return null;
    if (typeof selectedTime === 'string' || selectedTime instanceof Date) {
      const d = parseToDate(selectedTime);
      if (d && !isNaN(d.getTime())) {
        return `Khung giờ đã chọn: ${formatVNTime(d)} (${formatVNDateTime(d).split(',')[0]})`;
      }
      return `Thời gian đã chọn: ${selectedTime}`;
    }
    if (selectedTime.durationMinutes) {
      return `Thời lượng giữ chỗ: ${selectedTime.durationMinutes} phút`;
    }
    return null;
  };

  const hasSuggestions = Array.isArray(suggestions) && suggestions.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
      aria-describedby="conflict-modal-desc"
    >
      {/* Backdrop mờ nền */}
      <div
        className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={() => !loading && !submittingId && onClose()}
        aria-hidden="true"
      />

      {/* Nội dung Modal */}
      <div
        ref={modalRef}
        className="relative w-full max-w-lg bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 z-10 my-8"
      >
        {/* Header Modal */}
        <div className="flex items-start justify-between p-5 pb-4 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="conflict-modal-title"
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug"
              >
                Trụ này vừa được người khác đặt
              </h2>
              <p
                id="conflict-modal-desc"
                className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed"
              >
                {conflictDetail ||
                  'Một tài xế khác vừa hoàn tất đặt trước đầu nối sạc này trước bạn vài giây. Bạn có thể chọn ngay một trụ sạc khác đang trống dưới đây:'}
              </p>
            </div>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            disabled={loading || submittingId !== null}
            aria-label="Đóng hộp thoại"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông báo giờ đã chọn & lỗi nếu có */}
        <div className="px-5 pt-3">
          {renderSelectedTimeText() && (
            <div className="flex items-center space-x-2 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 px-3 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800/50">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{renderSelectedTimeText()}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-2.5 p-3 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center space-x-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Thân Modal: Danh sách gợi ý hoặc trạng thái rỗng */}
        <div className="p-5 space-y-3 max-h-[55vh] overflow-y-auto no-scrollbar">
          {hasSuggestions ? (
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>GỢI Ý TRỤ KHẢ DỤNG CÙNG TRẠM ({suggestions.length})</span>
                <span className="text-[11px] font-normal normal-case text-slate-400">
                  Giữ nguyên thời gian bạn đã chọn
                </span>
              </div>

              {suggestions.map((item) => {
                const isItemSubmitting = submittingId === item.connectorId;
                const isAnySubmitting = loading || submittingId !== null;

                return (
                  <div
                    key={`suggest-${item.connectorId}`}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800/80 hover:border-sky-400 dark:hover:border-sky-600 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    {/* Thông tin trụ gợi ý */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="font-bold text-sm font-mono text-slate-900 dark:text-white">
                          {item.chargePointCode}
                        </span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Cổng {item.connectorNumber}
                        </span>
                        <Badge variant="primary" size="sm">
                          {item.connectorType}
                        </Badge>
                        {item.ratedPowerKw && (
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {item.ratedPowerKw} kW
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.stationName && (
                          <div className="flex items-center space-x-1 truncate" title={item.stationName}>
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{item.stationName}</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-1 shrink-0 text-emerald-600 dark:text-emerald-400 font-medium">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{formatSuggestionAvailableTime(item.availableFrom)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Nút Đặt trụ này (chống bấm đôi) */}
                    <div className="shrink-0 self-end sm:self-center">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isAnySubmitting}
                        loading={isItemSubmitting}
                        onClick={() => handleSelect(item)}
                        className="w-full sm:w-auto font-bold text-xs px-3.5 py-2 shadow-sm"
                        title={`Đặt ngay cổng ${item.connectorNumber} của ${item.chargePointCode}`}
                      >
                        <span>Đặt trụ này</span>
                        {!isItemSubmitting && <ArrowRight className="w-3.5 h-3.5 ml-1" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Trạng thái rỗng: Không có trụ trống cùng giờ (Tiêu chí 4) */
            <div className="text-center py-6 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <Clock className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Hiện chưa có trụ trống cùng giờ
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                Tất cả các trụ sạc khác tại trạm này đều đang có lịch đặt trước hoặc đang phục vụ xe sạc khác trong khung giờ bạn chọn.
              </p>
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
                {onBackToStations ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={RotateCcw}
                    onClick={() => {
                      onClose();
                      onBackToStations();
                    }}
                    className="text-xs font-semibold px-4"
                  >
                    Quay về danh sách trạm
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onClose}
                    className="text-xs font-semibold px-4"
                  >
                    Đóng
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="flex items-center justify-end p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={loading || submittingId !== null}
            className="text-xs"
          >
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}

