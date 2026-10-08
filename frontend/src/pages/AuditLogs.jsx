import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import AuditFilters from '../components/audit/AuditFilters';
import AuditTable from '../components/audit/AuditTable';

/** AC T-58: phân trang cố định 50 dòng mỗi trang. */
const PAGE_SIZE = 50;

const EMPTY_DRAFT = { chargerId: '', userId: '', from: '', to: '', fromLocal: '', toLocal: '' };

/**
 * Màn hình Tra cứu nhật ký (T-58).
 *
 * [CẦN XÁC NHẬN - HỢP ĐỒNG API TẠM THỜI]
 * Endpoint `GET /api/v1/audit-logs` CHƯA TỒN TẠI trong Backend. T-57 (bảng
 * `audit_logs` + hàm `ghi_nhat_ky` + API tra cứu) chưa được triển khai trong mã
 * nguồn hiện tại. Màn hình này được viết theo hợp đồng sau, và sẽ hiển thị lỗi
 * rõ ràng cho tới khi Backend được bổ sung:
 *
 *   GET /api/v1/audit-logs
 *     ?page=1&page_size=50
 *     &charger_id=<int>            (tùy chọn)
 *     &user_id=<int>               (tùy chọn)
 *     &from=<ISO 8601 UTC>         (tùy chọn)
 *     &to=<ISO 8601 UTC>           (tùy chọn)
 *   -> {
 *        "items": [{
 *          "id": int, "timestamp": ISO 8601, "action": str, "result": str|null,
 *          "object_type": str, "object_id": int|null, "object_code": str|null,
 *          "description": str|null, "detail": str|null,
 *          "actor_id": int|null, "actor_username": str|null, "actor_name": str|null,
 *          "station_id": int|null, "station_name": str|null
 *        }],
 *        "total": int, "page": int, "page_size": int
 *      }
 *
 * Yêu cầu bắt buộc khi Backend xây dựng endpoint này:
 * - Phân trang và lọc tại tầng Database (OFFSET/LIMIT), KHÔNG trả về toàn bộ bảng.
 * - Sắp xếp theo `timestamp` giảm dần; hỗ trợ chỉ mục theo cột thời điểm.
 * - Chỉ trả về nhật ký trong phạm vi quyền của người gọi (phân vùng tại Backend).
 * - Nhận mốc thời gian dạng ISO 8601 có múi giờ; CSDL lưu UTC.
 */
export default function AuditLogs() {
  const { role } = useAuth();

  const [chargers, setChargers] = useState([]);
  const [users, setUsers] = useState([]);

  // Bộ lọc nháp: người dùng đang chọn, CHƯA gửi lên API.
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  // Bộ lọc đã áp dụng: đúng tham số đã dùng cho request gần nhất.
  const [applied, setApplied] = useState({ ...EMPTY_DRAFT, chargerLabel: '', userLabel: '' });

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [referenceError, setReferenceError] = useState(null);

  // Chống phản hồi cũ ghi đè phản hồi mới khi người dùng đổi bộ lọc liên tục.
  const requestSeq = useRef(0);

  // Nhãn hiển thị lấy từ danh sách tham chiếu đã tải.
  const chargerLabel = useMemo(
    () => chargers.find((c) => String(c.id) === String(draft.chargerId))?.code || draft.chargerId,
    [chargers, draft.chargerId]
  );
  const userLabel = useMemo(() => {
    const u = users.find((x) => String(x.id) === String(draft.userId));
    return u ? u.fullName || u.username : draft.userId;
  }, [users, draft.userId]);

  // Tải danh sách tham chiếu: trụ sạc (từ /stations) và người dùng (từ /admin/users).
  useEffect(() => {
    let cancelled = false;

    const loadReferences = async () => {
      // Danh sách trụ: /stations đã trả về charging_points lồng nhau.
      try {
        const res = await api.get('/stations', { params: { limit: 100 } });
        const list = (res.data || [])
          .filter((s) => s.is_active !== false)
          .flatMap((s) =>
            (s.charging_points || [])
              .filter((c) => c.is_active !== false)
              .map((c) => ({ id: c.id, code: c.code, stationName: s.name }))
          );
        if (!cancelled) setChargers(list);
      } catch (err) {
        if (!cancelled) setReferenceError('Không tải được danh sách trụ sạc.');
      }

      // Danh sách người thực hiện: Chỉ ADMIN mới có quyền truy cập /admin/users
      if (role === 'ADMIN') {
        try {
          const res = await api.get('/admin/users');
          if (!cancelled) {
            setUsers(
              (res.data || []).map((u) => ({
                id: u.id,
                username: u.username,
                fullName: u.full_name,
              }))
            );
          }
        } catch (err) {
          if (!cancelled) {
            console.warn('Không tải được danh mục người dùng:', err);
          }
        }
      }
    };

    loadReferences();
    return () => {
      cancelled = true;
    };
  }, [role]);

  /**
   * Gọi API tra nhật ký. Mọi tham số lọc và phân trang đều gửi ngay từ request;
   * không tải toàn bộ nhật ký về trình duyệt để lọc thủ công.
   */
  const fetchLogs = useCallback(
    async (filters, targetPage) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setErrorMessage(null);

      const params = { page: targetPage, page_size: PAGE_SIZE };
      if (filters.chargerId) params.charger_id = filters.chargerId;
      if (filters.userId) params.user_id = filters.userId;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      try {
        const res = await api.get('/audit-logs', { params });
        // Bỏ qua phản hồi của request cũ nếu đã có request mới hơn.
        if (seq !== requestSeq.current) return;

        setRows(res.data?.items || []);
        setTotal(typeof res.data?.total === 'number' ? res.data.total : 0);
        setPage(res.data?.page || targetPage);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setRows([]);
        setTotal(0);
        setErrorMessage(
          err.response?.status === 403
            ? 'Bạn không có quyền xem nhật ký vận hành.'
            : err.response?.status === 404
              ? 'Chưa có API tra nhật ký trên máy chủ (GET /api/v1/audit-logs chưa được triển khai — phụ thuộc T-57).'
              : err.response?.data?.detail
                ? String(err.response.data.detail)
                : 'Không tải được danh sách nhật ký. Vui lòng thử lại.'
        );
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    []
  );

  // Tải trang đầu tiên khi màn hình vừa mở.
  useEffect(() => {
    fetchLogs(EMPTY_DRAFT, 1);
  }, [fetchLogs]);

  // Áp dụng bộ lọc nháp: đặt về trang 1 rồi gọi API với điều kiện mới.
  const handleSearch = () => {
    const next = { ...draft, chargerLabel, userLabel };
    setApplied(next);
    setPage(1);
    fetchLogs(draft, 1);
  };

  // Đặt lại: xóa bộ lọc và tải lại không còn điều kiện nào.
  const handleReset = () => {
    setDraft(EMPTY_DRAFT);
    setApplied({ ...EMPTY_DRAFT, chargerLabel: '', userLabel: '' });
    setPage(1);
    fetchLogs(EMPTY_DRAFT, 1);
  };

  // Làm mới: tải lại với bộ lọc ĐANG ÁP DỤNG, giữ nguyên trang hiện tại.
  const handleRefresh = () => {
    fetchLogs(applied, page);
  };

  // Đổi trang: chỉ gọi API, không lọc lại ở phía trình duyệt.
  const handlePageChange = (nextPage) => {
    if (nextPage < 1) return;
    setPage(nextPage);
    fetchLogs(applied, nextPage);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-tech-white flex items-center gap-2">
            <History className="w-5 h-5 text-electric-cyan" />
            Tra cứu nhật ký
          </h1>
          <p className="text-xs text-steel-gray mt-0.5 font-mono">
            Theo dõi lịch sử thao tác và sự kiện trên các trụ.
            {total > 0 && <> Hiện {total.toLocaleString('vi-VN')} bản ghi khớp bộ lọc.</>}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="self-start md:self-auto px-3 py-1.5 rounded bg-obsidian border border-hairline text-steel-gray hover:text-tech-white hover:border-electric-cyan disabled:opacity-50 transition-colors font-mono text-xs"
        >
          Làm mới
        </button>
      </div>

      {referenceError && (
        <div
          role="status"
          className="px-4 py-2.5 bg-caution-amber/10 border border-caution-amber/40 rounded-sm flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-caution-amber shrink-0 mt-0.5" />
          <span className="text-[11px] font-mono text-caution-amber">{referenceError}</span>
        </div>
      )}

      <AuditFilters
        chargers={chargers}
        users={users}
        draft={draft}
        applied={applied}
        onChange={setDraft}
        onSearch={handleSearch}
        onReset={handleReset}
        onRefresh={handleRefresh}
        loading={loading}
        errorMessage={errorMessage}
      />

      <AuditTable
        rows={rows}
        loading={loading}
        error={null}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
