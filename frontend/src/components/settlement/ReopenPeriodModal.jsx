import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, AlertTriangle, X, AlertCircle, FileText } from 'lucide-react';
import Button from '../ui/Button';
import {
  REOPEN_REASON_MIN_LENGTH,
  REOPEN_REASON_MAX_LENGTH,
} from '../../config/settlementConfig';
import { validateReopenReason, formatPeriodRange } from '../../utils/settlement';

/**
 * Hộp thoại mở lại kỳ đối soát (S-55 / SCRUM-408).
 * Tiêu chí:
 * - Chỉ vai trò ADMIN được thực hiện.
 * - Bắt buộc nhập lý do: trim, tối thiểu REOPEN_REASON_MIN_LENGTH, tối đa REOPEN_REASON_MAX_LENGTH.
 * - Hiển thị lỗi ngay trong/dưới ô nhập.
 * - Cảnh báo: "Thao tác này được ghi nhật ký kiểm toán."
 * - Lý do không hợp lệ thì KHÔNG gọi API.
 */
export default function ReopenPeriodModal({
  isOpen,
  period,
  onConfirm,
  onClose,
  loading = false,
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [inlineError, setInlineError] = useState(null);
  const textareaRef = useRef(null);

  // Reset form khi modal mở/đóng
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setTouched(false);
      setInlineError(null);
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Lắng nghe phím ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !period) return null;

  const currentLength = reason.trim().length;
  const isTooShort = currentLength > 0 && currentLength < REOPEN_REASON_MIN_LENGTH;

  const handleReasonChange = (e) => {
    const val = e.target.value;
    setReason(val);
    if (touched) {
      const validation = validateReopenReason(val);
      setInlineError(validation.valid ? null : validation.error);
    }
  };

  const handleBlur = () => {
    setTouched(true);
    const validation = validateReopenReason(reason);
    setInlineError(validation.valid ? null : validation.error);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched(true);

    const validation = validateReopenReason(reason);
    if (!validation.valid) {
      setInlineError(validation.error);
      textareaRef.current?.focus();
      return;
    }

    setInlineError(null);
    onConfirm(validation.reason);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reopen-period-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#151D2A] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="reopen-period-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Mở lại kỳ đối soát
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Thao tác quản trị cấp cao (ADMIN)
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {/* Tóm tắt thông tin kỳ */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Kỳ đối soát:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {period.label || `Kỳ #${period.id}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Thời gian:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {formatPeriodRange(period)}
                </span>
              </div>
            </div>

            {/* Ô nhập lý do */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="reopen-period-reason"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                >
                  Lý do mở lại kỳ <span className="text-rose-500">* (Bắt buộc)</span>
                </label>
                <span
                  className={`text-xs ${
                    isTooShort
                      ? 'text-amber-600 dark:text-amber-400 font-medium'
                      : 'text-slate-400'
                  }`}
                >
                  {currentLength} / {REOPEN_REASON_MAX_LENGTH} ký tự
                  {currentLength < REOPEN_REASON_MIN_LENGTH && (
                    <span className="ml-1">(tối thiểu {REOPEN_REASON_MIN_LENGTH})</span>
                  )}
                </span>
              </div>

              <textarea
                ref={textareaRef}
                id="reopen-period-reason"
                rows={4}
                maxLength={REOPEN_REASON_MAX_LENGTH}
                value={reason}
                onChange={handleReasonChange}
                onBlur={handleBlur}
                placeholder="Nhập lý do chi tiết mở lại kỳ (ví dụ: Điều chỉnh sai lệch số liệu đồng hồ đo trạm số 3 theo yêu cầu kiểm toán...)"
                aria-invalid={Boolean(inlineError)}
                aria-describedby={inlineError ? 'reopen-reason-error' : undefined}
                className={`w-full p-3 text-sm rounded-xl border bg-white dark:bg-[#0E1422] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 transition-all resize-none ${
                  inlineError
                    ? 'border-rose-500 focus:ring-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20'
                    : 'border-slate-300 dark:border-slate-700 focus:ring-sky-500/20 focus:border-sky-500'
                }`}
              />

              {/* Lỗi hiển thị ngay trong ô / dưới ô */}
              {inlineError && (
                <p
                  id="reopen-reason-error"
                  className="text-xs text-rose-600 dark:text-rose-400 mt-1.5 flex items-center space-x-1.5 font-medium animate-fade-in"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{inlineError}</span>
                </p>
              )}
            </div>

            {/* Cảnh báo ghi nhật ký kiểm toán */}
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="space-y-0.5">
                <p className="font-semibold">Thao tác này được ghi nhật ký kiểm toán.</p>
                <p className="text-amber-700 dark:text-amber-400/90 leading-relaxed text-[11px]">
                  Danh tính của bạn, thời điểm thực hiện và lý do mở lại kỳ sẽ được lưu lại
                  để phục vụ thanh tra và đối soát nội bộ.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={loading}
              onClick={onClose}
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={loading}
              disabled={loading || !reason.trim() || isTooShort}
              icon={RotateCcw}
            >
              Xác nhận mở lại
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

