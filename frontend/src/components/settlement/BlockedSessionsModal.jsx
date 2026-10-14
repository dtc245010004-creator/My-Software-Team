import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, ExternalLink, ArrowRight, X, Clock, Zap } from 'lucide-react';
import Button from '../ui/Button';
import { describeBlockingSession } from '../../utils/settlement';

/**
 * Hộp thoại / Khối cảnh báo khi việc chốt kỳ bị chặn do còn phiên bất thường chưa xử lý (S-55 / SCRUM-408).
 * Tiêu chí:
 * - Khi API trả 409 BLOCKED_BY_ABNORMAL_SESSIONS.
 * - Hiện "Không thể chốt kỳ: còn phiên bất thường chưa xử lý".
 * - Danh sách phiên chặn: mã trụ, thời điểm bắt đầu, lý do.
 * - Có liên kết sang /session/:id cho từng phiên.
 * - Có liên kết sang /abnormal-sessions để xử lý.
 * - Kỳ vẫn giữ nguyên trạng thái MỞ.
 */
export default function BlockedSessionsModal({
  isOpen,
  period,
  sessions = [],
  errorMessage,
  onClose,
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const normalizedSessions = (sessions || []).map(describeBlockingSession);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="blocked-sessions-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#151D2A] rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/60 overflow-hidden transform transition-all flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-rose-100 dark:border-rose-950/60 bg-rose-50/70 dark:bg-rose-950/30">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="blocked-sessions-modal-title"
                className="text-base font-bold text-rose-700 dark:text-rose-300"
              >
                Không thể chốt kỳ: còn phiên bất thường chưa xử lý
              </h3>
              <p className="text-xs text-rose-600/80 dark:text-rose-400/80">
                Kỳ đối soát {period?.label ? `"${period.label}"` : ''} vẫn giữ trạng thái MỞ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-rose-100/50 dark:hover:bg-rose-900/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="text-sm text-slate-700 dark:text-slate-300 space-y-2">
            <p className="font-medium">
              {errorMessage ||
                'Hệ thống phát hiện còn các phiên sạc ở trạng thái bất thường hoặc chưa hoàn tất trong kỳ đối soát này. Bạn phải xử lý hoặc can thiệp đóng tay các phiên này trước khi chốt sổ.'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Danh sách các phiên sạc đang chặn việc chốt kỳ ({normalizedSessions.length} phiên):
            </p>
          </div>

          {/* Danh sách phiên chặn */}
          {normalizedSessions.length > 0 ? (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
              <div className="bg-slate-50 dark:bg-slate-900/70 px-4 py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider grid grid-cols-12 gap-2">
                <span className="col-span-3">Mã phiên</span>
                <span className="col-span-3">Mã trụ</span>
                <span className="col-span-3">Thời điểm bắt đầu</span>
                <span className="col-span-3">Lý do chặn</span>
              </div>
              {normalizedSessions.map((s, idx) => (
                <div
                  key={s.id || idx}
                  className="px-4 py-3 text-xs grid grid-cols-12 gap-2 items-center hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors"
                >
                  {/* Mã phiên + Link /session/:id */}
                  <div className="col-span-3">
                    {s.id !== 'N/A' ? (
                      <Link
                        to={`/session/${s.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                        title="Xem chi tiết phiên sạc"
                      >
                        <span>#SES-{s.id}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </Link>
                    ) : (
                      <span className="text-slate-400 font-mono">N/A</span>
                    )}
                  </div>

                  {/* Mã trụ */}
                  <div className="col-span-3 flex items-center space-x-1.5 text-slate-700 dark:text-slate-300">
                    <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="font-medium font-mono">{s.chargePointCode}</span>
                  </div>

                  {/* Thời điểm bắt đầu */}
                  <div className="col-span-3 flex items-center space-x-1.5 text-slate-600 dark:text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{s.startedAtFormatted}</span>
                  </div>

                  {/* Lý do */}
                  <div className="col-span-3 text-rose-600 dark:text-rose-400 font-medium truncate" title={s.reason}>
                    {s.reason}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              Không có thông tin chi tiết danh sách phiên từ máy chủ. Vui lòng kiểm tra màn hình Phiên bất thường.
            </div>
          )}

          {/* Khối gợi ý hành động */}
          <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 text-sky-900 dark:text-sky-200 text-xs flex items-center justify-between">
            <div>
              <p className="font-semibold">Cần giải quyết phiên bất thường?</p>
              <p className="text-sky-700 dark:text-sky-300/80 text-[11px]">
                Truy cập trang quản lý phiên bất thường để thực hiện can thiệp đóng tay hoặc xử lý số liệu.
              </p>
            </div>
            <Link
              to="/abnormal-sessions"
              onClick={onClose}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-sm transition-all shrink-0 ml-3"
            >
              <span>Xử lý ngay</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Trạng thái kỳ: <span className="font-bold text-emerald-600 dark:text-emerald-400">ĐANG MỞ</span>
          </span>
          <Button variant="secondary" size="md" onClick={onClose}>
            Đã hiểu, đóng lại
          </Button>
        </div>
      </div>
    </div>
  );
}

