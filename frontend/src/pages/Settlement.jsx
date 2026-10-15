import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarCheck,
  Lock,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Layers,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ClosePeriodConfirmModal from '../components/settlement/ClosePeriodConfirmModal';
import ReopenPeriodModal from '../components/settlement/ReopenPeriodModal';
import BlockedSessionsModal from '../components/settlement/BlockedSessionsModal';
import {
  getSettlementPeriods,
  closeSettlementPeriod,
  reopenSettlementPeriod,
} from '../services/settlementApi';
import {
  canClose,
  canReopen,
  formatPeriodRange,
  mapSettlementError,
  DEMO_SETTLEMENT_PERIODS,
  DEMO_BLOCKING_SESSIONS,
} from '../utils/settlement';
import { formatVNDateTime } from '../utils/formatTime';
import {
  SETTLEMENT_PAGE_ROLES,
  SETTLEMENT_SUCCESS_TOAST_MS,
} from '../config/settlementConfig';

export default function Settlement() {
  const { user, role } = useAuth();

  // Kiểm tra phân quyền truy cập trang
  const isAuthorized = role && SETTLEMENT_PAGE_ROLES.includes(role);

  // Dữ liệu danh sách kỳ
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Thao tác chốt kỳ
  const [periodToClose, setPeriodToClose] = useState(null);
  const [closing, setClosing] = useState(false);

  // Thao tác mở lại kỳ
  const [periodToReopen, setPeriodToReopen] = useState(null);
  const [reopening, setReopening] = useState(false);

  // Cảnh báo phiên bất thường chặn chốt (409)
  const [blockedData, setBlockedData] = useState(null);

  // Thông báo Toast phản hồi người dùng
  const [toast, setToast] = useState(null);

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, SETTLEMENT_SUCCESS_TOAST_MS);
  }, []);

  // Tải danh sách kỳ từ API (fallback dữ liệu mẫu khi backend chưa có API)
  const fetchPeriods = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    setFetchError(null);

    try {
      const data = await getSettlementPeriods();
      const list = Array.isArray(data) ? data : [];
      if (list.length === 0) {
        setPeriods(DEMO_SETTLEMENT_PERIODS);
        setIsDemoMode(true);
      } else {
        setPeriods(list);
        setIsDemoMode(false);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách kỳ đối soát:', err);
      // Khi backend trả 404/501 (chưa triển khai endpoint), tự động kích hoạt demo data để test UI
      if (err.response?.status === 404 || err.response?.status === 501) {
        setPeriods(DEMO_SETTLEMENT_PERIODS);
        setIsDemoMode(true);
        setFetchError(null);
      } else {
        const mapped = mapSettlementError(err);
        setFetchError(mapped.message);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = periods.length;
    const openCount = periods.filter((p) => (p.status || '').toUpperCase() === 'OPEN').length;
    const closedCount = periods.filter((p) => (p.status || '').toUpperCase() === 'CLOSED').length;
    return { total, openCount, closedCount };
  }, [periods]);

  // Xử lý xác nhận chốt kỳ
  const handleConfirmClose = async () => {
    if (!periodToClose || closing) return;
    setClosing(true);

    try {
      if (isDemoMode) {
        await new Promise((res) => setTimeout(res, 350));
        if (periodToClose.has_abnormal_sessions) {
          // Kịch bản kiểm thử: Chặn chốt do còn phiên bất thường (HTTP 409)
          const targetPeriod = periodToClose;
          setPeriodToClose(null);
          setBlockedData({
            period: targetPeriod,
            sessions: DEMO_BLOCKING_SESSIONS,
            message: 'Không thể chốt kỳ: còn phiên bất thường chưa xử lý.',
          });
          return;
        }

        // Kịch bản kiểm thử: Chốt kỳ thành công
        setPeriods((prev) =>
          prev.map((p) =>
            p.id === periodToClose.id
              ? {
                  ...p,
                  status: 'CLOSED',
                  closed_at: new Date().toISOString(),
                  closed_by_name: user?.full_name || 'Kế Toán Viên Hệ Thống',
                }
              : p
          )
        );
        showToast('success', `Đã chốt thành công kỳ đối soát "${periodToClose.label || periodToClose.id}".`);
        setPeriodToClose(null);
        return;
      }

      await closeSettlementPeriod(periodToClose.id);
      showToast('success', `Đã chốt thành công kỳ đối soát "${periodToClose.label || periodToClose.id}".`);
      setPeriodToClose(null);
      await fetchPeriods();
    } catch (err) {
      console.error('Lỗi khi chốt kỳ:', err);
      const mapped = mapSettlementError(err);

      // Nếu 409 BLOCKED_BY_ABNORMAL_SESSIONS: hiển thị hộp danh sách phiên chặn
      if (mapped.isBlocked) {
        const targetPeriod = periodToClose;
        setPeriodToClose(null);
        setBlockedData({
          period: targetPeriod,
          sessions: mapped.sessions,
          message: mapped.message,
        });
      } else {
        showToast('error', mapped.message);
      }
    } finally {
      setClosing(false);
    }
  };

  // Xử lý xác nhận mở lại kỳ (chỉ ADMIN)
  const handleConfirmReopen = async (reason) => {
    if (!periodToReopen || reopening) return;
    setReopening(true);

    try {
      if (isDemoMode) {
        await new Promise((res) => setTimeout(res, 350));
        setPeriods((prev) =>
          prev.map((p) =>
            p.id === periodToReopen.id
              ? {
                  ...p,
                  status: 'OPEN',
                  closed_at: null,
                  closed_by_name: null,
                }
              : p
          )
        );
        showToast('success', `Đã mở lại thành công kỳ đối soát "${periodToReopen.label || periodToReopen.id}".`);
        setPeriodToReopen(null);
        return;
      }

      await reopenSettlementPeriod(periodToReopen.id, reason);
      showToast('success', `Đã mở lại thành công kỳ đối soát "${periodToReopen.label || periodToReopen.id}".`);
      setPeriodToReopen(null);
      await fetchPeriods();
    } catch (err) {
      console.error('Lỗi khi mở lại kỳ:', err);
      const mapped = mapSettlementError(err);
      showToast('error', mapped.message);
    } finally {
      setReopening(false);
    }
  };

  // Kiểm tra quyền truy cập trang
  if (!isAuthorized) {
    return (
      <div className="py-16 text-center max-w-lg mx-auto space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Không có quyền truy cập (403 Forbidden)
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Trang <strong>Kỳ đối soát</strong> chỉ dành riêng cho vai trò{' '}
          <strong className="text-slate-700 dark:text-slate-200">Kế toán (ACCOUNTANT)</strong> và{' '}
          <strong className="text-slate-700 dark:text-slate-200">Quản trị viên (ADMIN)</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
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
              Quản Lý Kỳ Đối Soát
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản lý vòng đời kỳ đối soát tài chính, chốt sổ và bảo vệ tính toàn vẹn dữ liệu
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="secondary"
            size="md"
            icon={RefreshCw}
            loading={loading}
            disabled={loading}
            onClick={fetchPeriods}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* NỘI DUNG KỲ ĐỐI SOÁT (SCRUM-408 / S-55) */}
      <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card padding="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Tổng số kỳ
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {loading ? '...' : stats.total}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
              </div>
            </Card>

            <Card padding="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Kỳ đang mở
                  </p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                    {loading ? '...' : stats.openCount}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
            </Card>

            <Card padding="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Kỳ đã chốt
                  </p>
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1 tabular-nums">
                    {loading ? '...' : stats.closedCount}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
              </div>
            </Card>
          </div>

          {/* TRẠNG THÁI 1: ĐANG TẢI (SKELETON) */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} padding="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center space-x-3">
                        <Skeleton variant="text" width="120px" height="20px" />
                        <Skeleton variant="rectangular" width="80px" height="24px" />
                      </div>
                      <Skeleton variant="text" width="240px" height="16px" />
                    </div>
                    <Skeleton variant="rectangular" width="110px" height="36px" />
                  </div>
                </Card>
              ))}
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
                    Không thể tải danh sách kỳ đối soát
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {fetchError}
                  </p>
                </div>
                <Button variant="primary" size="md" onClick={fetchPeriods}>
                  Thử lại
                </Button>
              </div>
            </Card>
          )}

          {/* TRẠNG THÁI 3: RỖNG (EMPTYSTATE) */}
          {!loading && !fetchError && periods.length === 0 && (
            <EmptyState
              icon={CalendarCheck}
              title="Chưa có kỳ đối soát nào"
              description="Hiện tại hệ thống chưa ghi nhận kỳ đối soát tài chính nào từ máy chủ."
              actionLabel="Làm mới dữ liệu"
              onAction={fetchPeriods}
            />
          )}

          {/* TRẠNG THÁI 4: THÀNH CÔNG - DANH SÁCH KỲ ĐỐI SOÁT */}
          {!loading && !fetchError && periods.length > 0 && (
            <div className="space-y-3">
              {periods.map((period) => {
                const isOpen = (period.status || '').toUpperCase() === 'OPEN';
                const isClosed = (period.status || '').toUpperCase() === 'CLOSED';
                const userCanClose = canClose(period, role);
                const userCanReopen = canReopen(period, role);

                return (
                  <Card
                    key={period.id}
                    padding="p-5"
                    className="hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Thông tin kỳ */}
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            {period.label || `Kỳ #${period.id}`}
                          </h3>

                          {/* Badge trạng thái: Mở (xanh lá) / Đã chốt (ổ khóa) */}
                          {isOpen && (
                            <Badge variant="success" size="sm">
                              Đang mở
                            </Badge>
                          )}
                          {isClosed && (
                            <Badge variant="neutral" size="sm">
                              <Lock className="w-3 h-3 mr-1 text-slate-500 shrink-0" />
                              <span>Đã chốt</span>
                            </Badge>
                          )}
                        </div>

                        {/* Khoảng ngày lấy từ backend */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>{formatPeriodRange(period)}</span>
                          </span>

                          {/* Thông tin chốt: Đã chốt bởi <closed_by_name> lúc <closed_at> */}
                          {isClosed && (
                            <span className="text-slate-600 dark:text-slate-300 font-medium">
                              Đã chốt bởi{' '}
                              <strong className="text-slate-800 dark:text-slate-100">
                                {period.closed_by_name || 'Hệ thống'}
                              </strong>{' '}
                              lúc {formatVNDateTime(period.closed_at)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Hành động theo vai trò */}
                      <div className="flex items-center space-x-2 self-start md:self-auto shrink-0">
                        {/* Nút Chốt kỳ: Chỉ kỳ đang Mở; ACCOUNTANT và ADMIN thấy */}
                        {userCanClose && (
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Lock}
                            onClick={() => setPeriodToClose(period)}
                          >
                            Chốt kỳ
                          </Button>
                        )}

                        {/* Nút Mở lại kỳ: Chỉ kỳ đã chốt; CHỈ ADMIN thấy */}
                        {userCanReopen && (
                          <Button
                            variant="outline"
                            size="sm"
                            icon={RotateCcw}
                            onClick={() => setPeriodToReopen(period)}
                          >
                            Mở lại kỳ
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

      {/* MODAL 1: XÁC NHẬN CHỐT KỲ (ACCOUNTANT & ADMIN) */}
      <ClosePeriodConfirmModal
        isOpen={Boolean(periodToClose)}
        period={periodToClose}
        loading={closing}
        onConfirm={handleConfirmClose}
        onClose={() => {
          if (!closing) setPeriodToClose(null);
        }}
      />

      {/* MODAL 2: MỞ LẠI KỲ (CHỈ ADMIN) */}
      <ReopenPeriodModal
        isOpen={Boolean(periodToReopen)}
        period={periodToReopen}
        loading={reopening}
        onConfirm={handleConfirmReopen}
        onClose={() => {
          if (!reopening) setPeriodToReopen(null);
        }}
      />

      {/* MODAL 3: CẢNH BÁO PHIÊN BẤT THƯỜNG CHẶN CHỐT (409) */}
      <BlockedSessionsModal
        isOpen={Boolean(blockedData)}
        period={blockedData?.period}
        sessions={blockedData?.sessions || []}
        errorMessage={blockedData?.message}
        onClose={() => setBlockedData(null)}
      />
    </div>
  );
}

