import React, { useEffect, useRef } from 'react';
import { Lock, AlertTriangle, X } from 'lucide-react';
import Button from '../ui/Button';
import { formatPeriodRange } from '../../utils/settlement';

/**
 * Hộp thoại xác nhận Chốt kỳ đối soát (S-55 / SCRUM-408).
 * Tiêu chí:
 * - Sau khi chốt: phiên, hóa đơn, dòng sổ cái trong kỳ thành chỉ đọc.
 * - Có trạng thái loading và chống bấm đôi.
 * - Phím ESC và focus trap thân thiện với người dùng.
 */
export default function ClosePeriodConfirmModal({
  isOpen,
  period,
  onConfirm,
  onClose,
  loading = false,
}) {
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Autofocus nút xác nhận khi mở modal
    const timer = setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen || !period) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-period-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#151D2A] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="close-period-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Xác nhận chốt kỳ đối soát
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Khóa dữ liệu tài chính cho kỳ kế toán
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

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 dark:text-slate-400">Kỳ đối soát:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {period.label || `Kỳ #${period.id}`}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 dark:text-slate-400">Khoảng thời gian:</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {formatPeriodRange(period)}
              </span>
            </div>
          </div>

          {/* Cảnh báo chỉ đọc theo yêu cầu nghiệp vụ */}
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs sm:text-sm flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <p className="font-semibold">
                Sau khi chốt, phiên/hoá đơn/sổ cái trong kỳ chỉ đọc.
              </p>
              <p className="text-amber-700/90 dark:text-amber-400/90 leading-relaxed text-xs">
                Mọi giao dịch và dữ liệu tài chính trong khoảng thời gian này sẽ được đóng băng.
                Nếu vẫn còn phiên sạc bất thường chưa được can thiệp xử lý, hệ thống sẽ tự động chặn việc chốt kỳ.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end space-x-3 p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <Button
            variant="secondary"
            size="md"
            disabled={loading}
            onClick={onClose}
          >
            Hủy bỏ
          </Button>
          <Button
            ref={confirmButtonRef}
            variant="danger"
            size="md"
            loading={loading}
            disabled={loading}
            icon={Lock}
            onClick={onConfirm}
          >
            Xác nhận chốt kỳ
          </Button>
        </div>
      </div>
    </div>
  );
}

