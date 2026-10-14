import React, { useEffect } from 'react';
import {
  FileText,
  X,
  User,
  Calendar,
  Wallet,
  ShieldCheck,
  XCircle,
  Clock,
  Info,
  CheckCircle2,
} from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { mapErasureStatus, formatCurrencyVND } from '../../utils/dataErasure';
import { formatVNDateTime } from '../../utils/formatTime';

export default function ErasureDetailModal({
  isOpen,
  request,
  role,
  onClose,
  onOpenApprove,
  onOpenReject,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !request) return null;

  const statusMeta = mapErasureStatus(request.status);
  const isPending = (request.status || '').toUpperCase() === 'PENDING';
  const isAdmin = role === 'ADMIN';
  const hasPositiveBalance = Number(request.wallet_balance) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#151D2A] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-inner">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3
                  id="detail-modal-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  Chi Tiết Yêu Cầu Xóa Dữ Liệu #{request.id}
                </h3>
                <Badge variant={statusMeta.variant} size="sm">
                  {statusMeta.label}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Gửi lúc: {formatVNDateTime(request.requested_at)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Thông tin tài xế & Ví */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm">
            <div className="space-y-1">
              <span className="text-slate-400 dark:text-slate-500">Tài xế yêu cầu</span>
              <div className="flex items-center space-x-2 font-semibold text-slate-900 dark:text-slate-100">
                <User className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>{request.driver_name || 'Tài xế'}</span>
              </div>
              {request.driver_email && (
                <p className="text-slate-500 dark:text-slate-400 text-xs">{request.driver_email}</p>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-slate-400 dark:text-slate-500">Số dư ví hiện tại</span>
              <div className="flex items-center space-x-2">
                <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span
                  className={`font-bold ${
                    hasPositiveBalance
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {formatCurrencyVND(request.wallet_balance || 0)}
                </span>
                {hasPositiveBalance && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold">
                    Còn số dư
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Lý do từ tài xế */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Lý do tài xế cung cấp
            </h4>
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
              {request.reason ? (
                <p className="whitespace-pre-wrap leading-relaxed">{request.reason}</p>
              ) : (
                <span className="text-slate-400 italic">Không có lý do kèm theo</span>
              )}
            </div>
          </div>

          {/* Thông tin quyết định (nếu có) */}
          {(request.decided_by_name || request.decided_at || request.reject_reason) && (
            <div className="space-y-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Kết quả xử lý từ Quản trị viên
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {request.decided_by_name && (
                  <div>
                    <span className="text-slate-500">Người xử lý: </span>
                    <strong className="text-slate-800 dark:text-slate-200">{request.decided_by_name}</strong>
                  </div>
                )}
                {request.decided_at && (
                  <div>
                    <span className="text-slate-500">Thời điểm: </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {formatVNDateTime(request.decided_at)}
                    </span>
                  </div>
                )}
              </div>

              {request.reject_reason && (
                <div className="mt-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200 text-xs">
                  <span className="font-semibold">Lý do từ chối: </span>
                  <span>{request.reject_reason}</span>
                </div>
              )}
            </div>
          )}

          {/* Khối Phạm vi dữ liệu (Backend cung cấp hoặc ghi chú sơ bộ) */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Phạm vi dữ liệu ẩn danh hóa & lưu giữ</span>
              <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400">
                (Chờ người có thẩm quyền xác nhận)
              </span>
            </h4>

            {request.scope ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* To anonymize */}
                <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/40 space-y-2">
                  <span className="font-semibold text-sky-800 dark:text-sky-300 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-sky-600" />
                    <span>Dữ liệu sẽ ẩn danh hóa:</span>
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                    {(request.scope.to_anonymize || []).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                {/* To retain */}
                <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-800 space-y-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-300 flex items-center space-x-1.5">
                    <Info className="w-4 h-4 text-slate-500" />
                    <span>Dữ liệu bắt buộc lưu giữ (Kế toán):</span>
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                    {(request.scope.to_retain || []).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <p>
                  • <strong>Thông tin cá nhân & lịch sử sạc:</strong> Sẽ được ẩn danh hóa theo Nghị định 13/2023/NĐ-CP sau khi Quản trị viên duyệt.
                </p>
                <p>
                  • <strong>Sổ cái và tổng hợp doanh thu:</strong> Vẫn được giữ nguyên theo Luật Kế toán.
                </p>
                <p className="text-slate-400 italic text-[11px] pt-1">
                  * Nhóm phát triển không đưa ra tư vấn pháp lý. Phạm vi dữ liệu cụ thể do Backend và chính sách hệ thống quyết định.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 shrink-0">
          <Button variant="secondary" size="md" onClick={onClose}>
            Đóng
          </Button>

          {isAdmin && isPending && (
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="md"
                icon={XCircle}
                onClick={() => {
                  onClose();
                  onOpenReject(request);
                }}
              >
                Từ chối
              </Button>
              <Button
                variant="success"
                size="md"
                icon={ShieldCheck}
                disabled={hasPositiveBalance}
                title={
                  hasPositiveBalance
                    ? 'Không thể duyệt vì ví còn số dư dương'
                    : 'Phê duyệt yêu cầu xóa'
                }
                onClick={() => {
                  onClose();
                  onOpenApprove(request);
                }}
              >
                Duyệt yêu cầu
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
