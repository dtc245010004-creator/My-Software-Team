import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Filter,
  Calendar,
  Building2,
  TrendingUp,
  Zap,
  Layers,
  ArrowRight,
  StopCircle,
  Clock,
  AlertTriangle,
  WifiOff,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatVNDateTime } from '../utils/formatTime';
import InvoiceModal from '../components/InvoiceModal';

export default function Sessions() {
  const { user, role } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [accessibleStations, setAccessibleStations] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedSession, setSelectedSession] = useState(null);

  // S-23 / SCRUM-146: NFR RBAC — Chỉ vai trò Vận hành viên (OPERATOR) và Quản trị viên (ADMIN) mới thấy nút dừng
  const canRemoteStop = role === 'ADMIN' || role === 'OPERATOR';
  const [stoppingSessionId, setStoppingSessionId] = useState(null);
  const [stopElapsedSeconds, setStopElapsedSeconds] = useState(0);
  const [selectedSimCondition, setSelectedSimCondition] = useState('NORMAL');
  const [remoteStopModalSession, setRemoteStopModalSession] = useState(null);
  const [alertNotification, setAlertNotification] = useState(null);
  const timerIntervalRef = React.useRef(null);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Chế độ xem: 'DETAIL' | 'GROUP_DATE' | 'GROUP_STATION' | 'GROUP_MONTH'
  const [viewMode, setViewMode] = useState('DETAIL');

  // KPI & Dữ liệu tổng hợp từ backend
  const [summaryData, setSummaryData] = useState({
    kpi: { total_sessions: 0, total_kwh: 0.0, total_revenue: 0.0 },
    groups: [],
  });
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Nạp danh sách trạm khả dụng theo vai trò
  useEffect(() => {
    if (role === 'ADMIN' || role === 'OPERATOR') {
      api.get('/stations')
        .then((res) => setAccessibleStations(res.data || []))
        .catch((err) => console.error('Lỗi tải danh sách trạm:', err));
    } else {
      setAccessibleStations([]);
    }
    setSelectedStationId('ALL');
  }, [user, role]);

  // Nạp danh sách phiên chi tiết
  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      let res;
      if (role === 'ADMIN' || role === 'OPERATOR') {
        const params = {};
        if (selectedStationId !== 'ALL') params.station_id = selectedStationId;
        if (statusFilter !== 'ALL') params.status = statusFilter;
        res = await api.get('/sessions', { params });
      } else {
        res = await api.get('/sessions/me');
      }
      setSessions(res.data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách phiên sạc:', err);
    } finally {
      setLoading(false);
    }
  }, [role, selectedStationId, statusFilter]);

  // Nạp dữ liệu tổng hợp KPI và nhóm
  const fetchSummary = useCallback(async () => {
    if (role !== 'ADMIN' && role !== 'OPERATOR') return;
    try {
      setSummaryLoading(true);
      let groupBy = 'date';
      if (viewMode === 'GROUP_STATION') groupBy = 'station';
      if (viewMode === 'GROUP_MONTH') groupBy = 'month';

      const params = { group_by: groupBy };
      if (selectedStationId !== 'ALL') params.station_id = selectedStationId;

      const res = await api.get('/sessions/summary', { params });
      if (res && res.data) {
        setSummaryData(res.data);
      }
    } catch (err) {
      console.error('Lỗi nạp tổng hợp phiên sạc:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, [role, viewMode, selectedStationId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Tính toán KPI cho CUSTOMER hoặc lấy từ summary backend
  const displayKpi = useMemo(() => {
    if (role === 'ADMIN' || role === 'OPERATOR') {
      return summaryData.kpi || { total_sessions: 0, total_kwh: 0, total_revenue: 0 };
    }
    const totalSessions = sessions.length;
    const totalKwh = sessions.reduce((acc, s) => acc + (Number(s.total_kwh) || 0), 0);
    const totalRev = sessions.reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    return {
      total_sessions: totalSessions,
      total_kwh: totalKwh,
      total_revenue: totalRev,
    };
  }, [role, summaryData.kpi, sessions]);

  const filteredSessions = sessions.filter((s) => {
    if (statusFilter === 'ALL') return true;
    return s.status === statusFilter;
  });

  const handleDrilldownGroup = (group) => {
    if (viewMode === 'GROUP_STATION' && group.station_id) {
      setSelectedStationId(String(group.station_id));
      setViewMode('DETAIL');
    } else {
      setViewMode('DETAIL');
    }
  };

  // Lấy danh sách các phiên đang hoạt động (ACTIVE)
  const activeSessions = useMemo(() => {
    return sessions.filter((s) => s.status === 'ACTIVE');
  }, [sessions]);

  // S-23 / SCRUM-146: Hàm dừng phiên từ xa (RemoteStopTransaction)
  const handleRemoteStop = async (sessionToStop, condition = selectedSimCondition) => {
    if (!sessionToStop) return;
    const sessionId = sessionToStop.id;
    setStoppingSessionId(sessionId);
    setStopElapsedSeconds(0);
    setAlertNotification(null);
    setRemoteStopModalSession(null);

    // Khởi động đồng hồ đếm thời gian thực
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setStopElapsedSeconds((s) => s + 1);
    }, 1000);

    try {
      const payload = {};
      if (condition && condition !== 'NORMAL') {
        payload.simulate_condition = condition;
      }

      let res;
      if (condition === 'TIMEOUT') {
        // Mô phỏng chờ đồng hồ hiển thị 2.5 giây rồi ném lỗi Timeout
        await new Promise((r) => setTimeout(r, 2500));
        res = await api.post(`/sessions/${sessionId}/remote-stop`, { simulate_condition: 'TIMEOUT' });
      } else {
        const [apiRes] = await Promise.all([
          api.post(`/sessions/${sessionId}/remote-stop`, payload),
          new Promise((r) => setTimeout(r, 800)), // Đảm bảo đồng hồ chạy ít nhất 1 nhịp
        ]);
        res = apiRes;
      }

      // Ca thành công:
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      setStoppingSessionId(null);

      const updated = res.data;
      // Cập nhật phiên chuyển sang đã kết thúc KHÔNG CẦN TẢI LẠI TRANG
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                ...updated,
                status: 'COMPLETED',
                stop_reason: updated.stop_reason || 'Remote',
              }
            : s
        )
      );

      setAlertNotification({
        type: 'success',
        title: 'DỪNG PHIÊN THÀNH CÔNG (REMOTE)',
        message: `Phiên sạc #${sessionId} đã dừng từ xa thành công với lý do "Remote" và chuyển sang trạng thái ĐÃ KẾT THÚC.`,
      });
    } catch (err) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      setStoppingSessionId(null);

      const status = err.response?.status;
      const detail = err.response?.data?.detail || err.message;

      // Ba ca lỗi của S-23 hiển thị đúng 3 thông báo khác nhau:
      if (
        condition === 'REJECTED' ||
        status === 409 ||
        detail.includes('từ chối') ||
        detail.includes('Rejected')
      ) {
        // Ca 1: Trụ từ chối
        setAlertNotification({
          type: 'warning',
          title: 'TRỤ SẠC TỪ CHỐI LỆNH DỪNG (REJECTED)',
          message: 'Trụ sạc từ chối lệnh dừng (Rejected). Phiên sạc vẫn đang tiếp tục hoạt động.',
          code: 'REJECTED',
        });
      } else if (
        condition === 'OFFLINE' ||
        (status === 400 && detail.includes('ngoại tuyến')) ||
        detail.includes('Offline')
      ) {
        // Ca 2: Trụ ngoại tuyến
        setAlertNotification({
          type: 'error',
          title: 'TRỤ SẠC NGOẠI TUYẾN (OFFLINE)',
          message: 'Trụ sạc đang ngoại tuyến (Offline). Không thể gửi lệnh dừng từ xa, vui lòng kiểm tra kết nối mạng của trụ.',
          code: 'OFFLINE',
        });
      } else if (
        condition === 'TIMEOUT' ||
        status === 504 ||
        status === 408 ||
        detail.includes('hết thời gian') ||
        detail.includes('Timeout')
      ) {
        // Ca 3: Hết thời gian chờ
        setAlertNotification({
          type: 'error',
          title: 'HẾT THỜI GIAN CHỜ PHẢN HỒI (TIMEOUT)',
          message: 'Hết thời gian chờ phản hồi từ trụ sạc (Timeout). Phiên sạc đã được đánh dấu cần xem xét kỹ thuật.',
          code: 'TIMEOUT',
        });
      } else {
        setAlertNotification({
          type: 'error',
          title: 'LỖI GỬI LỆNH DỪNG',
          message: detail,
        });
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Tiêu đề & Thông số tổng quan */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-tech-white">Nhật Ký Phiên Sạc & Hóa Đơn Điện Tử</h1>
          <p className="text-xs text-steel-gray mt-0.5">
            {role === 'ADMIN'
              ? 'Quản lý toàn mạng lưới — Thống kê doanh thu & phân tích phụ tải theo ngày/trạm'
              : role === 'OPERATOR'
              ? 'Báo cáo các trạm của bạn — Theo dõi sản lượng & doanh thu theo ngày/tháng'
              : 'Lịch sử nạp điện, đo đếm điện năng kWh & hóa đơn chi tiết'}
          </p>
        </div>

        {/* Bộ lọc phạm vi trạm & trạng thái */}
        <div className="flex flex-wrap items-center gap-2">
          {(role === 'ADMIN' || role === 'OPERATOR') && accessibleStations.length > 0 && (
            <div className="flex items-center space-x-1.5 bg-panel border border-hairline rounded-lg px-2.5 py-1 text-xs">
              <Filter className="w-3.5 h-3.5 text-steel-gray" />
              <span className="text-steel-gray">Phạm vi:</span>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="bg-obsidian border border-hairline text-tech-white rounded px-2 py-0.5 text-xs focus:outline-none focus:border-electric-cyan font-medium"
              >
                <option value="ALL">
                  {role === 'ADMIN'
                    ? `Tất cả trạm (${accessibleStations.length})`
                    : `Tất cả trạm của tôi (${accessibleStations.length})`}
                </option>
                {accessibleStations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {viewMode === 'DETAIL' && (
            <div className="flex items-center bg-panel border border-hairline rounded-lg p-0.5 text-xs">
              {[
                { key: 'ALL', label: 'Tất cả' },
                { key: 'ACTIVE', label: 'Đang sạc' },
                { key: 'COMPLETED', label: 'Hoàn thành' },
                { key: 'INTERRUPTED', label: 'Gián đoạn' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1 rounded-md transition-colors font-medium ${
                    statusFilter === tab.key
                      ? 'bg-obsidian text-tech-white font-semibold border border-hairline shadow-sm'
                      : 'text-steel-gray hover:text-tech-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-panel border border-hairline p-4 rounded-xl flex items-center space-x-3.5 shadow-sm">
          <div className="p-2.5 rounded-xl bg-electric-cyan/10 border border-electric-cyan/30 text-electric-cyan">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-steel-gray">Tổng số phiên sạc</div>
            <div className="text-2xl font-bold text-tech-white tabular-nums mt-0.5">
              {displayKpi.total_sessions} <span className="text-xs font-normal text-steel-gray">phiên</span>
            </div>
          </div>
        </div>

        <div className="bg-panel border border-hairline p-4 rounded-xl flex items-center space-x-3.5 shadow-sm">
          <div className="p-2.5 rounded-xl bg-grid-green/10 border border-grid-green/30 text-grid-green">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-steel-gray">Tổng sản lượng điện năng</div>
            <div className="text-2xl font-bold text-grid-green tabular-nums mt-0.5">
              {Number(displayKpi.total_kwh || 0).toFixed(2)} <span className="text-xs font-normal text-steel-gray">kWh</span>
            </div>
          </div>
        </div>

        <div className="bg-panel border border-hairline p-4 rounded-xl flex items-center space-x-3.5 shadow-sm">
          <div className="p-2.5 rounded-xl bg-caution-amber/10 border border-caution-amber/30 text-caution-amber">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-steel-gray">Tổng doanh thu hóa đơn</div>
            <div className="text-2xl font-bold text-caution-amber tabular-nums mt-0.5">
              {Number(displayKpi.total_revenue || 0).toLocaleString()} <span className="text-xs font-normal text-steel-gray">VND</span>
            </div>
          </div>
        </div>
      </div>

      {/* Thông báo kết quả dừng từ xa */}
      {alertNotification && (
        <div
          id="remote-stop-alert-banner"
          className={`p-4 rounded-xl border text-xs flex items-start justify-between shadow-lg transition-all ${
            alertNotification.type === 'success'
              ? 'bg-grid-green/10 border-grid-green/40 text-grid-green'
              : alertNotification.type === 'warning'
              ? 'bg-caution-amber/10 border-caution-amber/40 text-caution-amber'
              : 'bg-critical-red/10 border-critical-red/40 text-critical-red'
          }`}
        >
          <div className="flex items-start space-x-3">
            <div className="mt-0.5">
              {alertNotification.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-grid-green shrink-0" />
              ) : alertNotification.code === 'OFFLINE' ? (
                <WifiOff className="w-5 h-5 text-critical-red shrink-0" />
              ) : alertNotification.code === 'TIMEOUT' ? (
                <Clock className="w-5 h-5 text-critical-red shrink-0" />
              ) : (
                <AlertOctagon className="w-5 h-5 text-caution-amber shrink-0" />
              )}
            </div>
            <div>
              <div className="font-semibold text-sm mb-1">
                {alertNotification.title}
              </div>
              <p className="text-tech-white leading-relaxed text-xs">{alertNotification.message}</p>
            </div>
          </div>
          <button
            onClick={() => setAlertNotification(null)}
            className="p-1 hover:bg-white/10 rounded text-steel-gray hover:text-tech-white transition-colors ml-3"
            title="Đóng thông báo"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Màn hình giám sát phiên đang chạy & Nút dừng từ xa */}
      {canRemoteStop && activeSessions.length > 0 && (
        <div className="bg-panel border border-electric-cyan/40 p-4 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-2.5">
            <div className="flex items-center space-x-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-electric-cyan opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-electric-cyan"></span>
              </span>
              <span className="font-semibold text-xs text-tech-white">
                Giám sát phiên đang sạc &amp; Lệnh dừng từ xa
              </span>
              <span className="text-xs bg-electric-cyan/20 text-electric-cyan px-2 py-0.5 rounded-full font-semibold">
                {activeSessions.length} phiên đang chạy
              </span>
            </div>

            {/* Điều khiển kịch bản kiểm thử mô phỏng */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-steel-gray">Chế độ thử nghiệm:</span>
              <select
                id="sim-condition-select"
                value={selectedSimCondition}
                onChange={(e) => setSelectedSimCondition(e.target.value)}
                className="bg-obsidian border border-hairline text-tech-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-electric-cyan font-medium"
              >
                <option value="NORMAL">Bình thường (Thành công)</option>
                <option value="REJECTED">Trụ từ chối (Rejected)</option>
                <option value="OFFLINE">Trụ ngoại tuyến (Offline)</option>
                <option value="TIMEOUT">Hết thời gian chờ (Timeout)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeSessions.map((actSess) => {
              const isStoppingThis = stoppingSessionId === actSess.id;

              return (
                <div
                  key={actSess.id}
                  className="bg-obsidian border border-hairline p-3.5 rounded-xl flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-tech-white text-sm tabular-nums">#SES-{actSess.id}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-electric-cyan/20 text-electric-cyan animate-pulse">
                          Đang sạc
                        </span>
                      </div>
                      <div className="text-xs text-steel-gray mt-1">
                        Trụ: <span className="text-tech-white font-semibold">{actSess.charger_code || 'EVSE-1'}</span> (Cổng #{actSess.connector_id})
                        {actSess.station_name && <span> — {actSess.station_name}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-steel-gray">Điện năng nạp:</div>
                      <div className="text-base font-bold text-electric-cyan tabular-nums">
                        {Number(actSess.total_kwh || 0).toFixed(2)} kWh
                      </div>
                    </div>
                  </div>

                  {/* Nút dừng từ xa có đồng hồ đếm */}
                  <div className="flex items-center justify-between border-t border-hairline pt-2.5">
                    <div className="text-xs text-steel-gray tabular-nums">
                      Bắt đầu: {formatVNDateTime(actSess.start_time)}
                    </div>

                    <button
                      id={`live-remote-stop-btn-${actSess.id}`}
                      onClick={() => handleRemoteStop(actSess)}
                      disabled={isStoppingThis}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all inline-flex items-center space-x-2 shadow-sm ${
                        isStoppingThis
                          ? 'bg-critical-red/25 border-critical-red text-critical-red cursor-wait'
                          : 'bg-critical-red/20 border-critical-red/60 hover:bg-critical-red hover:text-white text-critical-red'
                      }`}
                    >
                      {isStoppingThis ? (
                        <>
                          <Clock className="w-3.5 h-3.5 animate-spin text-critical-red" />
                          <span className="tabular-nums">
                            Đang dừng... ({String(Math.floor(stopElapsedSeconds / 60)).padStart(2, '0')}:{String(stopElapsedSeconds % 60).padStart(2, '0')} / 02:00)
                          </span>
                        </>
                      ) : (
                        <>
                          <StopCircle className="w-3.5 h-3.5" />
                          <span>Dừng phiên từ xa</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View Mode Switcher for Admin & Operator */}
      {(role === 'ADMIN' || role === 'OPERATOR') && (
        <div className="flex items-center space-x-2 border-b border-hairline pb-2 text-xs">
          <span className="text-steel-gray mr-1">Chế độ xem:</span>
          <button
            type="button"
            onClick={() => setViewMode('DETAIL')}
            className={`px-3 py-1 rounded-lg transition-colors font-medium ${
              viewMode === 'DETAIL'
                ? 'bg-panel text-electric-cyan font-semibold border border-electric-cyan/40 shadow-sm'
                : 'text-steel-gray hover:text-tech-white border border-transparent'
            }`}
          >
            Danh sách chi tiết
          </button>
          <button
            type="button"
            onClick={() => setViewMode('GROUP_DATE')}
            className={`px-3 py-1 rounded-lg transition-colors flex items-center space-x-1.5 font-medium ${
              viewMode === 'GROUP_DATE'
                ? 'bg-panel text-electric-cyan font-semibold border border-electric-cyan/40 shadow-sm'
                : 'text-steel-gray hover:text-tech-white border border-transparent'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Nhóm theo ngày</span>
          </button>
          {role === 'ADMIN' && (
            <button
              type="button"
              onClick={() => setViewMode('GROUP_STATION')}
              className={`px-3 py-1 rounded-lg transition-colors flex items-center space-x-1.5 font-medium ${
                viewMode === 'GROUP_STATION'
                  ? 'bg-panel text-electric-cyan font-semibold border border-electric-cyan/40 shadow-sm'
                  : 'text-steel-gray hover:text-tech-white border border-transparent'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Nhóm theo trạm</span>
            </button>
          )}
          {role === 'OPERATOR' && (
            <button
              type="button"
              onClick={() => setViewMode('GROUP_MONTH')}
              className={`px-3 py-1 rounded-lg transition-colors flex items-center space-x-1.5 font-medium ${
                viewMode === 'GROUP_MONTH'
                  ? 'bg-panel text-electric-cyan font-semibold border border-electric-cyan/40 shadow-sm'
                  : 'text-steel-gray hover:text-tech-white border border-transparent'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Nhóm theo tháng</span>
            </button>
          )}
        </div>
      )}

      {/* Main Content: Grouped View OR Detailed Table */}
      {viewMode !== 'DETAIL' ? (
        <div className="bg-panel border border-hairline rounded-xl overflow-hidden shadow-sm">
          <div className="p-3.5 border-b border-hairline bg-obsidian flex items-center justify-between text-xs">
            <span className="text-steel-gray font-semibold">
              {viewMode === 'GROUP_DATE'
                ? 'Tổng hợp theo ngày hoạt động'
                : viewMode === 'GROUP_STATION'
                ? 'Tổng hợp theo trạm sạc hệ thống'
                : 'Tổng hợp theo tháng vận hành'}
            </span>
            <span className="text-steel-gray">
              {summaryData.groups.length} nhóm dữ liệu
            </span>
          </div>

          {summaryLoading ? (
            <div className="text-xs text-steel-gray text-center py-12">
              Đang tải dữ liệu tổng hợp...
            </div>
          ) : summaryData.groups.length === 0 ? (
            <div className="text-xs text-steel-gray text-center py-12">
              Chưa có dữ liệu phiên sạc phù hợp cho nhóm này.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-hairline bg-obsidian/60 text-steel-gray">
                    <th className="py-3 px-4 font-semibold">
                      {viewMode === 'GROUP_DATE'
                        ? 'Ngày ghi nhận'
                        : viewMode === 'GROUP_STATION'
                        ? 'Trạm sạc'
                        : 'Tháng ghi nhận'}
                    </th>
                    <th className="py-3 px-4 font-semibold">Số phiên</th>
                    <th className="py-3 px-4 font-semibold">Tổng điện năng</th>
                    <th className="py-3 px-4 font-semibold">Tổng doanh thu</th>
                    <th className="py-3 px-4 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {summaryData.groups.map((group) => (
                    <tr key={group.key} className="hover:bg-panel-hover transition-colors">
                      <td className="py-3 px-4 font-semibold text-tech-white">
                        {group.label}
                      </td>
                      <td className="py-3 px-4 text-steel-gray tabular-nums">
                        {group.total_sessions} phiên
                      </td>
                      <td className="py-3 px-4 tabular-nums font-semibold text-electric-cyan">
                        {Number(group.total_kwh || 0).toFixed(2)} kWh
                      </td>
                      <td className="py-3 px-4 tabular-nums font-semibold text-caution-amber">
                        {Number(group.total_revenue || 0).toLocaleString()} VND
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDrilldownGroup(group)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-obsidian border border-hairline hover:border-electric-cyan text-steel-gray hover:text-tech-white text-xs transition-colors font-medium"
                        >
                          <span>Xem chi tiết</span>
                          <ArrowRight className="w-3 h-3 text-electric-cyan" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-panel border border-hairline rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="text-xs text-steel-gray text-center py-12">
              Đang tải danh sách phiên sạc...
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-xs text-steel-gray text-center py-12">
              {role === 'CUSTOMER' ? (
                <div className="flex flex-col items-center gap-3">
                  <span>Bạn chưa có phiên sạc nào phù hợp với bộ lọc.</span>
                  <Link
                    to="/map"
                    className="inline-flex items-center gap-2 rounded bg-electric-cyan px-4 py-2 font-bold text-obsidian hover:bg-electric-cyan-hover"
                  >
                    Tìm trạm sạc <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                'Không tìm thấy phiên sạc nào phù hợp với bộ lọc.'
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-hairline bg-obsidian text-steel-gray">
                    <th className="py-3 px-4 font-semibold">Mã phiên</th>
                    {(role === 'ADMIN' || role === 'OPERATOR') && (
                      <>
                        <th className="py-3 px-4 font-semibold">Trạm sạc</th>
                        <th className="py-3 px-4 font-semibold">Trụ sạc</th>
                      </>
                    )}
                    <th className="py-3 px-4 font-semibold">Cổng sạc</th>
                    <th className="py-3 px-4 font-semibold">Đơn giá</th>
                    <th className="py-3 px-4 font-semibold">Điện năng</th>
                    <th className="py-3 px-4 font-semibold">Tổng tiền</th>
                    <th className="py-3 px-4 font-semibold">Trạng thái</th>
                    <th className="py-3 px-4 font-semibold">Lý do dừng</th>
                    <th className="py-3 px-4 font-semibold">Thời gian</th>
                    <th className="py-3 px-4 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filteredSessions.map((sess) => {
                    const isCompleted = sess.status === 'COMPLETED';
                    const isActive = sess.status === 'ACTIVE';

                    return (
                      <tr key={sess.id} className="hover:bg-panel-hover transition-colors">
                        <td className="py-3 px-4 font-bold text-tech-white tabular-nums">#{sess.id}</td>
                        {(role === 'ADMIN' || role === 'OPERATOR') && (
                          <>
                            <td className="py-3 px-4 text-tech-white truncate max-w-[140px]" title={sess.station_name || `Trạm #${sess.station_id}`}>
                              {sess.station_name || `Trạm #${sess.station_id || 'N/A'}`}
                            </td>
                            <td className="py-3 px-4 text-steel-gray">
                              {sess.charger_code || 'N/A'}
                            </td>
                          </>
                        )}
                        <td className="py-3 px-4 text-steel-gray">Cổng #{sess.connector_id}</td>
                        <td className="py-3 px-4 tabular-nums text-steel-gray">
                          {Number(sess.applied_price_per_kwh).toLocaleString()} đ/kWh
                        </td>
                        <td className="py-3 px-4 tabular-nums font-semibold text-electric-cyan">
                          {Number(sess.total_kwh).toFixed(2)} kWh
                        </td>
                        <td className="py-3 px-4 tabular-nums font-bold text-tech-white">
                          {Number(sess.total_amount).toLocaleString()} đ
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              isActive
                                ? 'bg-electric-cyan/20 text-electric-cyan animate-pulse'
                                : isCompleted
                                ? 'bg-grid-green/20 text-grid-green'
                                : 'bg-critical-red/20 text-critical-red'
                            }`}
                          >
                            {isActive ? 'Đang sạc' : isCompleted ? 'Hoàn thành' : 'Gián đoạn'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-steel-gray">
                          {sess.stop_reason || (isActive ? 'Đang cấp dòng' : 'N/A')}
                        </td>
                        <td className="py-3 px-4 text-xs text-steel-gray tabular-nums">
                          {formatVNDateTime(sess.start_time)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {isActive && canRemoteStop && (
                              <button
                                id={`remote-stop-btn-${sess.id}`}
                                onClick={() => handleRemoteStop(sess)}
                                disabled={stoppingSessionId === sess.id}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all inline-flex items-center space-x-1 ${
                                  stoppingSessionId === sess.id
                                    ? 'bg-critical-red/25 border-critical-red text-critical-red cursor-wait'
                                    : 'bg-critical-red/15 border-critical-red/40 hover:bg-critical-red hover:text-white text-critical-red'
                                }`}
                                title="Dừng phiên sạc từ xa"
                              >
                                {stoppingSessionId === sess.id ? (
                                  <>
                                    <Clock className="w-3 h-3 animate-spin text-critical-red" />
                                    <span className="tabular-nums">
                                      {String(Math.floor(stopElapsedSeconds / 60)).padStart(2, '0')}:{String(stopElapsedSeconds % 60).padStart(2, '0')}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <StopCircle className="w-3 h-3" />
                                    <span>Dừng từ xa</span>
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedSession(sess)}
                              className="px-2.5 py-1 rounded-lg bg-obsidian border border-hairline hover:bg-hairline text-steel-gray hover:text-tech-white text-xs font-medium transition-colors"
                            >
                              Hóa đơn
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invoice Modal - S-33 / SCRUM-224: Diễn giải chi tiết từng đoạn giá */}
      <InvoiceModal
        sessionId={selectedSession?.id}
        isOpen={Boolean(selectedSession)}
        onClose={() => setSelectedSession(null)}
        initialData={selectedSession}
      />
    </div>
  );
}
