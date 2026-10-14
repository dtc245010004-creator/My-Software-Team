import React, { useState, useEffect } from 'react';
import { XCircle, X, AlertTriangle } from 'lucide-react';
import Button from '../ui/Button';
import {
  REJECT_REASON_MIN_LENGTH,
  REJECT_REASON_MAX_LENGTH,
} from '../../config/dataErasureConfig';
import { validateRejectReason } from '../../utils/dataErasure';

export default function RejectErasureModal({
  isOpen,
  request,
  loading = false,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setTouched(false);
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

  const validation = validateRejectReason(reason);
  const showError = touched && !validation.valid;

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!validation.valid || loading) return;
    onConfirm({ reason: validation.reason });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#151D2A] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-inner">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="reject-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Từ Chối Yêu Cầu Xóa Dữ Liệu
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
          <div className="space-y-1.5">
            <label
              htmlFor="reject-reason-input"
              className="block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              Lý do từ chối <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Vui lòng nêu rõ lý do để tài xế nắm thông tin (tối thiểu {REJECT_REASON_MIN_LENGTH} ký tự).
            </p>
            <textarea
              id="reject-reason-input"
              rows={4}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (!touched) setTouched(true);
              }}
              onBlur={() => setTouched(true)}
              maxLength={REJECT_REASON_MAX_LENGTH}
              disabled={loading}
              placeholder="Ví dụ: Tài khoản hiện đang có tranh chấp giao dịch khiếu nại chưa được xử lý xong..."
              className={`w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border transition-colors bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                showError
                  ? 'border-rose-400 dark:border-rose-600 focus:ring-rose-500/20'
                  : 'border-slate-300 dark:border-slate-700 focus:ring-sky-500/20 focus:border-sky-500'
              }`}
            />

            {/* Error & Character Count */}
            <div className="flex items-center justify-between text-xs">
              <div>
                {showError && (
                  <span className="text-rose-600 dark:text-rose-400 font-medium">
                    {validation.error}
                  </span>
                )}
              </div>
              <span className="text-slate-400 dark:text-slate-500">
                {reason.trim().length}/{REJECT_REASON_MAX_LENGTH}
              </span>
            </div>
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
              variant="danger"
              size="md"
              loading={loading}
              disabled={!validation.valid || loading}
            >
              Xác nhận từ chối
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

