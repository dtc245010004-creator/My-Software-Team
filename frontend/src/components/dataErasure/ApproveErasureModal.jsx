import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, AlertTriangle, X, Check, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';
import { formatCurrencyVND } from '../../utils/dataErasure';
import { formatVNDateTime } from '../../utils/formatTime';

export default function ApproveErasureModal({
  isOpen,
  request,
  loading = false,
  onConfirm,
  onClose,
}) {
  const [confirmedScope, setConfirmedScope] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setConfirmedScope(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !request) return null;

  const hasPositiveBalance = Number(request.wallet_balance) > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!confirmedScope || hasPositiveBalance || loading) return;
    onConfirm({ confirm_scope: true });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approve-modal-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-white dark:bg-[#151D2A] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="approve-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Duyệt Yêu Cầu Xóa Dữ Liệu
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mã yêu cầu #{request.id} • {request.driver_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Cảnh báo số dư ví */}
          {hasPositiveBalance ? (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs sm:text-sm space-y-1.5">
              <div className="flex items-center space-x-2 font-bold text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Không thể phê duyệt do ví còn số dư dương</span>
              </div>
              <p className="leading-relaxed">
                Tài xế đang có số dư ví là{' '}
                <strong className="font-semibold text-rose-900 dark:text-rose-100">
                  {formatCurrencyVND(request.wallet_balance)}
                </strong>
                . Theo quy định, tài xế phải xử lý hoàn tiền hoặc rút hết số dư trước khi yêu cầu xóa được chấp thuận.
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Tài xế:</span>
                <strong className="text-slate-800 dark:text-slate-100">{request.driver_name}</strong>
              </div>
              <div className="flex justify-between">
                <span>Thời điểm gửi:</span>
                <span>{formatVNDateTime(request.requested_at)}</span>
              </div>
              <div className="flex justify-between">
                <span>Số dư ví hiện tại:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCurrencyVND(request.wallet_balance || 0)} (Hợp lệ)
                </span>
              </div>
            </div>
          )}

          {/* Cảnh báo hệ quả */}
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 text-xs sm:text-sm space-y-1">
            <div className="flex items-center space-x-2 font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Hệ quả sau khi phê duyệt</span>
            </div>
            <p className="leading-relaxed">
              Toàn bộ thông tin cá nhân và lịch sử sạc của tài xế sẽ được ẩn danh hóa. Thao tác này{' '}
              <strong>không thể hoàn tác</strong>. Dữ liệu kế toán và sổ cái tổng hợp vẫn được giữ nguyên vẹn.
            </p>
          </div>

          {/* Checkbox xác nhận phạm vi */}
          <div className="pt-1">
            <label className="flex items-start space-x-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmedScope}
                onChange={(e) => setConfirmedScope(e.target.checked)}
                disabled={hasPositiveBalance || loading}
                className="mt-0.5 w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 dark:border-slate-700 dark:bg-slate-800"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                Tôi đã xem phạm vi dữ liệu được hiển thị và xác nhận phê duyệt ẩn danh hóa cho yêu cầu này.
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="secondary"
              size="md"
              disabled={loading}
              onClick={onClose}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              variant="success"
              size="md"
              icon={Check}
              loading={loading}
              disabled={!confirmedScope || hasPositiveBalance || loading}
            >
              Xác nhận duyệt
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

