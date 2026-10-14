import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Search,
  Filter,
  Eye,
  Check,
  XCircle,
  Calendar,
  Wallet,
  Clock,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ApproveErasureModal from '../components/dataErasure/ApproveErasureModal';
import RejectErasureModal from '../components/dataErasure/RejectErasureModal';
import ErasureDetailModal from '../components/dataErasure/ErasureDetailModal';
import {
  getAdminErasureRequests,
  getAdminErasureRequestDetail,
  approveErasureRequest,
  rejectErasureRequest,
} from '../services/dataErasureApi';
import {
  mapErasureStatus,
  canApprove,
  canReject,
  mapErasureError,
  createSingleFlightHandler,
  formatCurrencyVND,
  DEMO_ERASURE_REQUESTS,
} from '../utils/dataErasure';
import { formatVNDateTime } from '../utils/formatTime';
import {
  ADMIN_ERASURE_ROLES,
  DATA_ERASURE_TOAST_MS,
} from '../config/dataErasureConfig';

export default function AdminDataErasure() {
  const { role } = useAuth();
  const isAuthorized = role && ADMIN_ERASURE_ROLES.includes(role);

  // Danh sách yêu cầu & Bộ lọc
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Modals
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [requestToApprove, setRequestToApprove] = useState(null);
  const [requestToReject, setRequestToReject] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, DATA_ERASURE_TOAST_MS);
  }, []);

  // Tải danh sách yêu cầu từ API (tự động fallback dữ liệu mẫu khi backend chưa có API)
  const fetchRequests = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    setFetchError(null);

    try {
      const data = await getAdminErasureRequests(statusFilter);
      const list = Array.isArray(data) ? data : [];
      if (list.length === 0) {
        // Fallback demo data
        const filteredDemo =
          statusFilter === 'ALL'
            ? DEMO_ERASURE_REQUESTS
            : DEMO_ERASURE_REQUESTS.filter(
                (r) => (r.status || '').toUpperCase() === statusFilter.toUpperCase()
              );
        setRequests(filteredDemo);
        setIsDemoMode(true);
      } else {
        setRequests(list);
        setIsDemoMode(false);
      }
    } catch (err) {
      // Khi backend trả 404/501 (chưa merge endpoint), tự động bật demo data để test UI
      if (err.response?.status === 404 || err.response?.status === 501) {
        const filteredDemo =
          statusFilter === 'ALL'
            ? DEMO_ERASURE_REQUESTS
            : DEMO_ERASURE_REQUESTS.filter(
                (r) => (r.status || '').toUpperCase() === statusFilter.toUpperCase()
              );
        setRequests(filteredDemo);
        setIsDemoMode(true);
        setFetchError(null);
      } else {
        const mapped = mapErasureError(err);
        setFetchError(mapped.message);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Lọc theo từ khóa tìm kiếm (tên tài xế hoặc ID)
  const filteredRequests = useMemo(() => {
    let result = [...requests];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          String(r.id).includes(q) ||
          (r.driver_name && r.driver_name.toLowerCase().includes(q)) ||
          (r.driver_email && r.driver_email.toLowerCase().includes(q))
      );
    }
    // Sắp xếp mới nhất lên đầu
    return result.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
  }, [requests, searchQuery]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((r) => (r.status || '').toUpperCase() === 'PENDING').length;
    const approved = requests.filter((r) => (r.status || '').toUpperCase() === 'APPROVED').length;
    const completed = requests.filter((r) => (r.status || '').toUpperCase() === 'COMPLETED').length;
    return { total, pending, approved, completed };
  }, [requests]);

  // Xử lý phê duyệt (chống bấm đôi)
  const handleApprove = useCallback(
    createSingleFlightHandler(async (payload) => {
      if (!requestToApprove) return;
      setActionLoading(true);
      try {
        if (isDemoMode) {
          await new Promise((res) => setTimeout(res, 350));
          setRequests((prev) =>
            prev.map((r) =>
              r.id === requestToApprove.id
                ? {
                    ...r,
                    status: 'APPROVED',
                    decided_at: new Date().toISOString(),
                    decided_by_name: 'Quản Trị Viên Hệ Thống',
                  }
                : r
            )
          );
          showToast('success', `Đã phê duyệt yêu cầu xóa dữ liệu #${requestToApprove.id}.`);
          setRequestToApprove(null);
          return;
        }

        await approveErasureRequest(requestToApprove.id, payload);
        showToast('success', `Đã phê duyệt yêu cầu xóa dữ liệu #${requestToApprove.id}.`);
        setRequestToApprove(null);
        await fetchRequests();
      } catch (err) {
        const mapped = mapErasureError(err);
        showToast('error', mapped.message);
      } finally {
        setActionLoading(false);
      }
    }),
    [requestToApprove, isDemoMode, showToast, fetchRequests]
  );

  // Xử lý từ chối (chống bấm đôi)
  const handleReject = useCallback(
    createSingleFlightHandler(async (payload) => {
      if (!requestToReject) return;
      setActionLoading(true);
      try {
        if (isDemoMode) {
          await new Promise((res) => setTimeout(res, 350));
          setRequests((prev) =>
            prev.map((r) =>
              r.id === requestToReject.id
                ? {
                    ...r,
                    status: 'REJECTED',
                    reject_reason: payload.reason,
                    decided_at: new Date().toISOString(),
                    decided_by_name: 'Quản Trị Viên Hệ Thống',
                  }
                : r
            )
          );
          showToast('success', `Đã từ chối yêu cầu xóa dữ liệu #${requestToReject.id}.`);
          setRequestToReject(null);
          return;
        }

        await rejectErasureRequest(requestToReject.id, payload);
        showToast('success', `Đã từ chối yêu cầu xóa dữ liệu #${requestToReject.id}.`);
        setRequestToReject(null);
        await fetchRequests();
      } catch (err) {
        const mapped = mapErasureError(err);
        showToast('error', mapped.message);
      } finally {
        setActionLoading(false);
      }
    }),
    [requestToReject, isDemoMode, showToast, fetchRequests]
  );

  // Mở modal chi tiết
  const handleOpenDetail = async (req) => {
    if (isDemoMode) {
      setSelectedDetail(req);
      return;
    }
    try {
      const detail = await getAdminErasureRequestDetail(req.id);
      setSelectedDetail(detail);
    } catch (err) {
      setSelectedDetail(req);
    }
  };

  // Kiểm tra quyền
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
          Màn hình duyệt xóa dữ liệu cá nhân chỉ dành riêng cho vai trò{' '}
          <strong className="text-slate-700 dark:text-slate-200">Quản trị viên (ADMIN)</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
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
              Duyệt Yêu Cầu Xóa Dữ Liệu
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Xét duyệt yêu cầu xóa thông tin cá nhân và ẩn danh hóa lịch sử sạc của tài xế
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="secondary"
            size="md"
            icon={RefreshCw}
            loading={loading}
            disabled={loading}
            onClick={fetchRequests}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card padding="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Tổng yêu cầu
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {loading ? '...' : stats.total}
          </p>
        </Card>

        <Card padding="p-4">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            Chờ duyệt
          </p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {loading ? '...' : stats.pending}
          </p>
        </Card>

        <Card padding="p-4">
          <p className="text-xs font-medium text-sky-600 dark:text-sky-400 uppercase tracking-wider">
            Đang xử lý
          </p>
          <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">
            {loading ? '...' : stats.approved}
          </p>
        </Card>

        <Card padding="p-4">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Đã hoàn tất
          </p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {loading ? '...' : stats.completed}
          </p>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên tài xế hoặc mã yêu cầu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
          {[
            { key: 'ALL', label: 'Tất cả' },
            { key: 'PENDING', label: 'Chờ duyệt' },
            { key: 'APPROVED', label: 'Đang xử lý' },
            { key: 'REJECTED', label: 'Từ chối' },
            { key: 'COMPLETED', label: 'Hoàn tất' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all select-none whitespace-nowrap ${
                statusFilter === tab.key
                  ? 'bg-sky-600 text-white shadow-sm font-semibold'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TRẠNG THÁI 1: ĐANG TẢI (SKELETON) */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} padding="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <Skeleton variant="text" width="160px" height="20px" />
                  <Skeleton variant="text" width="280px" height="16px" />
                </div>
                <Skeleton variant="rectangular" width="140px" height="36px" />
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
                Không thể tải danh sách yêu cầu
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{fetchError}</p>
            </div>
            <Button variant="primary" size="md" onClick={fetchRequests}>
              Thử lại
            </Button>
          </div>
        </Card>
      )}

      {/* TRẠNG THÁI 3: RỖNG (EMPTYSTATE) */}
      {!loading && !fetchError && filteredRequests.length === 0 && (
        <EmptyState
          icon={UserX}
          title="Không có yêu cầu xóa dữ liệu nào"
          description={
            statusFilter !== 'ALL' || searchQuery
              ? 'Không tìm thấy yêu cầu phù hợp với bộ lọc hiện tại.'
              : 'Hiện tại chưa có tài xế nào gửi yêu cầu xóa dữ liệu cá nhân.'
          }
          actionLabel="Làm mới danh sách"
          onAction={fetchRequests}
        />
      )}

      {/* TRẠNG THÁI 4: THÀNH CÔNG - DANH SÁCH YÊU CẦU */}
      {!loading && !fetchError && filteredRequests.length > 0 && (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const statusMeta = mapErasureStatus(req.status);
            const userCanApprove = canApprove(req, role);
            const userCanReject = canReject(req, role);
            const hasPositiveBalance = Number(req.wallet_balance) > 0;

            return (
              <Card
                key={req.id}
                padding="p-5"
                className="hover:border-slate-300 dark:hover:border-slate-700 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Thông tin chính */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {req.driver_name || `Tài xế #${req.driver_id || req.id}`}
                      </h3>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                        (#{req.id})
                      </span>
                      <Badge variant={statusMeta.variant} size="sm">
                        {statusMeta.label}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>Gửi lúc: {formatVNDateTime(req.requested_at)}</span>
                      </span>

                      {/* Số dư ví */}
                      <span className="flex items-center space-x-1">
                        <Wallet className="w-3.5 h-3.5 shrink-0" />
                        <span>Số dư ví: </span>
                        <strong
                          className={
                            hasPositiveBalance
                              ? 'text-rose-600 dark:text-rose-400 font-bold'
                              : 'text-slate-700 dark:text-slate-300'
                          }
                        >
                          {formatCurrencyVND(req.wallet_balance || 0)}
                        </strong>
                      </span>

                      {/* Cảnh báo số dư */}
                      {hasPositiveBalance && (
                        <span className="inline-flex items-center space-x-1 text-rose-600 dark:text-rose-400 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Ví còn tiền, cần hoàn tiền trước</span>
                        </span>
                      )}
                    </div>

                    {req.reason && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1 italic pt-0.5">
                        "{req.reason}"
                      </p>
                    )}
                  </div>

                  {/* Hành động */}
                  <div className="flex items-center space-x-2 self-start md:self-auto shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Eye}
                      onClick={() => handleOpenDetail(req)}
                    >
                      Chi tiết
                    </Button>

                    {userCanReject && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={XCircle}
                        onClick={() => setRequestToReject(req)}
                      >
                        Từ chối
                      </Button>
                    )}

                    {userCanApprove && (
                      <Button
                        variant="success"
                        size="sm"
                        icon={ShieldCheck}
                        disabled={hasPositiveBalance}
                        title={
                          hasPositiveBalance
                            ? 'Không thể duyệt do ví tài xế còn số dư dương'
                            : 'Phê duyệt yêu cầu xóa'
                        }
                        onClick={() => setRequestToApprove(req)}
                      >
                        Duyệt
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL 1: DUYỆT YÊU CẦU */}
      <ApproveErasureModal
        isOpen={Boolean(requestToApprove)}
        request={requestToApprove}
        loading={actionLoading}
        onConfirm={handleApprove}
        onClose={() => {
          if (!actionLoading) setRequestToApprove(null);
        }}
      />

      {/* MODAL 2: TỪ CHỐI YÊU CẦU */}
      <RejectErasureModal
        isOpen={Boolean(requestToReject)}
        request={requestToReject}
        loading={actionLoading}
        onConfirm={handleReject}
        onClose={() => {
          if (!actionLoading) setRequestToReject(null);
        }}
      />

      {/* MODAL 3: XEM CHI TIẾT YÊU CẦU */}
      <ErasureDetailModal
        isOpen={Boolean(selectedDetail)}
        request={selectedDetail}
        role={role}
        onClose={() => setSelectedDetail(null)}
        onOpenApprove={(req) => setRequestToApprove(req)}
        onOpenReject={(req) => setRequestToReject(req)}
      />
    </div>
  );
}

