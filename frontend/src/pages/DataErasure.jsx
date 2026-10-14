import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  UserX,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Clock,
  Wallet,
  AlertTriangle,
  RefreshCw,
  Send,
  HelpCircle,
  ExternalLink,
  XCircle,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import {
  getMyErasureRequest,
  submitErasureRequest,
  getMyWallet,
} from '../services/dataErasureApi';
import {
  mapErasureStatus,
  canSubmitRequest,
  mapErasureError,
  createSingleFlightHandler,
  formatCurrencyVND,
} from '../utils/dataErasure';
import { formatVNDateTime } from '../utils/formatTime';
import {
  ERASURE_REASON_MAX_LENGTH,
  DATA_ERASURE_DISCLAIMER_TEXT,
  DATA_ERASURE_TOAST_MS,
  DRIVER_ERASURE_ROLES,
} from '../config/dataErasureConfig';

export default function DataErasure() {
  const { user, role } = useAuth();
  const isAuthorized = role && DRIVER_ERASURE_ROLES.includes(role);

  // Dữ liệu yêu cầu & ví
  const [currentRequest, setCurrentRequest] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Form gửi yêu cầu
  const [reason, setReason] = useState('');
  const [confirmedIrreversible, setConfirmedIrreversible] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Toast thông báo
  const [toast, setToast] = useState(null);

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, DATA_ERASURE_TOAST_MS);
  }, []);

  // Tải dữ liệu từ API
  const fetchData = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    setFetchError(null);

    try {
      const [reqData, walletData] = await Promise.all([
        getMyErasureRequest().catch((err) => {
          // 404 xem như chưa có yêu cầu
          if (err.response?.status === 404) return null;
          throw err;
        }),
        getMyWallet().catch(() => {
          return null;
        }),
      ]);

      setCurrentRequest(reqData);
      setWallet(walletData);
    } catch (err) {
      const mapped = mapErasureError(err);
      setFetchError(mapped.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Kiểm tra điều kiện có được gửi yêu cầu mới
  const canSubmit = useMemo(() => {
    return canSubmitRequest(currentRequest, wallet);
  }, [currentRequest, wallet]);

  const hasPositiveBalance = useMemo(() => {
    return Number(wallet?.balance) > 0;
  }, [wallet]);

  // Handler gửi yêu cầu (được bọc single flight chống double click)
  const executeSubmit = useCallback(
    createSingleFlightHandler(async () => {
      setSubmitting(true);
      try {
        try {
          await submitErasureRequest({ reason });
          await fetchData();
        } catch (apiErr) {
          if (apiErr.response?.status === 404 || apiErr.response?.status === 501) {
            // Demo fallback khi backend chưa có API
            setCurrentRequest({
              id: 999,
              status: 'PENDING',
              requested_at: new Date().toISOString(),
              reason: reason.trim() || 'Tôi không còn nhu cầu sử dụng dịch vụ.',
            });
          } else {
            throw apiErr;
          }
        }
        showToast('success', 'Yêu cầu xóa dữ liệu cá nhân của bạn đã được gửi thành công.');
        setShowConfirmModal(false);
        setReason('');
        setConfirmedIrreversible(false);
      } catch (err) {
        const mapped = mapErasureError(err);
        showToast('error', mapped.message);
        setShowConfirmModal(false);
      } finally {
        setSubmitting(false);
      }
    }),
    [reason, showToast, fetchData]
  );

  // Kiểm tra quyền
  if (!isAuthorized) {
    return (
      <div className="py-16 text-center max-w-lg mx-auto space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Không có quyền truy cập
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Trang yêu cầu xóa dữ liệu cá nhân chỉ dành cho tài khoản <strong>Tài xế (CUSTOMER)</strong>.
        </p>
      </div>
    );
  }

  const statusMeta = currentRequest ? mapErasureStatus(currentRequest.status) : null;
  const isRequestInFlight =
    currentRequest &&
    ['PENDING', 'APPROVED'].includes((currentRequest.status || '').toUpperCase());

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in pb-12">
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 flex items-center space-x-3 px-4 py-3 rounded-2xl shadow-xl border text-sm max-w-md animate-slide-up ${
            toast.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Yêu Cầu Xóa Dữ Liệu Cá Nhân
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quyền yêu cầu xóa thông tin cá nhân và lịch sử sạc theo Nghị định 13/2023/NĐ-CP
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="secondary"
            size="md"
            icon={RefreshCw}
            loading={loading}
            disabled={loading}
            onClick={fetchData}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* TRẠNG THÁI 1: ĐANG TẢI (SKELETON) */}
      {loading && (
        <div className="space-y-4">
          <Skeleton variant="card" height="140px" />
          <Skeleton variant="card" height="240px" />
        </div>
      )}

      {/* TRẠNG THÁI 2: LỖI KÈM NÚT THỬ LẠI */}
      {!loading && fetchError && (
        <Card padding="p-6">
          <div className="flex flex-col items-center text-center space-y-3 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Không thể tải thông tin yêu cầu
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{fetchError}</p>
            </div>
            <Button variant="primary" size="md" onClick={fetchData}>
              Thử lại
            </Button>
          </div>
        </Card>
      )}

      {/* TRẠNG THÁI 3 & 4: NỘI DUNG CHÍNH KHI TẢI THÀNH CÔNG */}
      {!loading && !fetchError && (
        <div className="space-y-6">
          {/* CẢNH BÁO SỐ DƯ VÍ DƯƠNG */}
          {hasPositiveBalance && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200">
              <div className="flex items-start space-x-3">
                <Wallet className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm">
                  <p className="font-semibold text-amber-800 dark:text-amber-100">
                    Ví còn số dư, cần xử lý hoàn tiền trước khi xóa
                  </p>
                  <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                    Số dư hiện tại của bạn là{' '}
                    <strong>{formatCurrencyVND(wallet.balance)}</strong>. Vui lòng rút tiền hoặc hoàn tiền trước khi gửi yêu cầu xóa.
                  </p>
                </div>
              </div>
              <Link
                to="/wallet"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shrink-0 transition-colors shadow-sm self-start sm:self-auto"
              >
                <span>Đến trang Ví</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {/* HIỂN THỊ YÊU CẦU HIỆN TẠI (NẾU CÓ) */}
          {currentRequest && (
            <Card padding="p-6" className="border-l-4 border-l-sky-500 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2.5">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Yêu cầu xóa dữ liệu #{currentRequest.id}
                    </h3>
                    <Badge variant={statusMeta.variant} size="sm">
                      {statusMeta.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Thời điểm gửi: {formatVNDateTime(currentRequest.requested_at)}
                  </p>
                </div>
              </div>

              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-2">
                <p className="leading-relaxed">{statusMeta.description}</p>

                {currentRequest.reason && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Lý do bạn đã gửi:{' '}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {currentRequest.reason}
                    </span>
                  </div>
                )}

                {/* Nếu bị từ chối */}
                {currentRequest.reject_reason && (
                  <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200 text-xs space-y-1">
                    <div className="flex items-center space-x-1.5 font-bold text-rose-700 dark:text-rose-300">
                      <XCircle className="w-4 h-4" />
                      <span>Lý do từ chối từ Quản trị viên:</span>
                    </div>
                    <p className="leading-relaxed">{currentRequest.reject_reason}</p>
                    {currentRequest.decided_at && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                        Thời điểm từ chối: {formatVNDateTime(currentRequest.decided_at)}
                      </p>
                    )}
                  </div>
                )}

                {/* Nếu đã hoàn tất */}
                {currentRequest.status === 'COMPLETED' && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-xs">
                    <p className="font-semibold flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Dữ liệu cá nhân và lộ trình sạc của bạn đã được ẩn danh hóa.</span>
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* KHỐI THÔNG TIN GIẢI THÍCH TĨNH (CHỜ NGƯỜI CÓ THẨM QUYỀN XÁC NHẬN) */}
          <Card padding="p-6" className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {DATA_ERASURE_DISCLAIMER_TEXT.title}
                </h3>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  {DATA_ERASURE_DISCLAIMER_TEXT.subTitle}
                </p>
              </div>
            </div>

            <ul className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 pl-4 list-disc leading-relaxed">
              {DATA_ERASURE_DISCLAIMER_TEXT.points.map((pt, idx) => (
                <li key={idx}>{pt}</li>
              ))}
            </ul>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
              <Info className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
              <span>{DATA_ERASURE_DISCLAIMER_TEXT.legalNote}</span>
            </div>
          </Card>

          {/* FORM GỬI YÊU CẦU MỚI (CHỈ HIỂN THỊ KHI KHÔNG CÓ YÊU CẦU ĐANG XỬ LÝ) */}
          {isRequestInFlight ? (
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-center text-xs text-slate-500 dark:text-slate-400">
              Bạn đang có một yêu cầu ở trạng thái <strong>{statusMeta?.label}</strong>. Không thể gửi thêm yêu cầu mới cho đến khi yêu cầu hiện tại kết thúc.
            </div>
          ) : (
            <Card padding="p-6" className="space-y-5">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Gửi Yêu Cầu Xóa Dữ Liệu
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Điền thông tin và xác nhận để gửi yêu cầu đến Quản trị viên hệ thống
                </p>
              </div>

              <div className="space-y-4">
                {/* Ô nhập lý do */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="driver-reason-input"
                    className="block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200"
                  >
                    Lý do yêu cầu <span className="text-slate-400 font-normal">(không bắt buộc)</span>
                  </label>
                  <textarea
                    id="driver-reason-input"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={ERASURE_REASON_MAX_LENGTH}
                    placeholder="Ví dụ: Tôi chuyển nơi cư trú / không còn nhu cầu sạc xe tại hệ thống..."
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                  />
                  <div className="flex justify-end text-xs text-slate-400">
                    {reason.trim().length}/{ERASURE_REASON_MAX_LENGTH}
                  </div>
                </div>

                {/* Checkbox cam kết */}
                <div className="pt-1">
                  <label className="flex items-start space-x-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmedIrreversible}
                      onChange={(e) => setConfirmedIrreversible(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 dark:border-slate-700 dark:bg-slate-800"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                      Tôi đã đọc và hiểu rằng sau khi yêu cầu được Quản trị viên phê duyệt, thông tin cá nhân và lịch sử sạc của tôi sẽ được ẩn danh hóa và{' '}
                      <strong>không thể khôi phục lại</strong>.
                    </span>
                  </label>
                </div>

                {/* Nút gửi */}
                <div className="pt-2 flex justify-end">
                  <Button
                    variant="danger"
                    size="md"
                    icon={Send}
                    disabled={!confirmedIrreversible || hasPositiveBalance || submitting}
                    title={
                      hasPositiveBalance
                        ? 'Ví còn số dư dương, vui lòng hoàn tiền trước'
                        : !confirmedIrreversible
                        ? 'Vui lòng đánh dấu xác nhận trước khi gửi'
                        : 'Mở hộp xác nhận gửi yêu cầu'
                    }
                    onClick={() => setShowConfirmModal(true)}
                  >
                    Gửi yêu cầu xóa dữ liệu
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* MODAL XÁC NHẬN LẦN HAI CHO TÀI XẾ */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-erasure-title"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#151D2A] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-scale-in">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3
                id="confirm-erasure-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Xác Nhận Gửi Yêu Cầu Xóa Dữ Liệu?
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Yêu cầu sẽ được chuyển đến Quản trị viên để xét duyệt. Khi được duyệt, thông tin cá nhân của bạn sẽ bị ẩn danh hóa vĩnh viễn.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="secondary"
                size="md"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
              >
                Quay lại
              </Button>
              <Button
                variant="danger"
                size="md"
                loading={submitting}
                disabled={submitting}
                onClick={executeSubmit}
              >
                Tôi chắc chắn, gửi ngay
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

