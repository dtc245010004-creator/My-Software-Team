import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  Radio,
  Zap,
  Clock,
  Gauge,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  X,
  ShieldAlert,
  ArrowRight,
  Filter,
  FileText,
  Building2,
  PowerOff,
  CornerDownRight,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function AbnormalSessions() {
  const { user, role } = useAuth();

  // Danh sách các vai trò được phép truy cập theo NFR
  const isAuthorized = role === 'OPERATOR' || role === 'ACCOUNTANT' || role === 'ADMIN';

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStation, setSelectedStation] = useState('ALL');

  // Modal Can thiệp Đóng tay
  const [selectedSessionForClose, setSelectedSessionForClose] = useState(null);
  const [closeReason, setCloseReason] = useState('');
  const [manualMeterKwh, setManualMeterKwh] = useState('');
  const [reasonError, setReasonError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState(null);

  const showToast = useCallback((type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  // Tải danh sách phiên bất thường từ Backend (T-53)
  const fetchAbnormalSessions = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/sessions/abnormal');
      setSessions(res.data || []);
    } catch (err) {
      console.error('Lỗi khi tải danh sách phiên bất thường:', err);
      setError(err.response?.data?.detail || 'Không thể tải danh sách phiên sạc bất thường từ máy chủ.');
      showToast('error', 'LỖI HỆ THỐNG', err.response?.data?.detail || 'Lỗi khi tải danh sách phiên bất thường.');
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, showToast]);

  useEffect(() => {
    fetchAbnormalSessions();
  }, [fetchAbnormalSessions]);

  // Bộ lọc tìm kiếm
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        String(s.id).includes(query) ||
        `#ses-${s.id}`.toLowerCase().includes(query) ||
        (s.charger_code || '').toLowerCase().includes(query) ||
        (s.station_name || '').toLowerCase().includes(query) ||
        (s.stop_reason || '').toLowerCase().includes(query);

      const matchStation =
        selectedStation === 'ALL' ||
        String(s.station_id) === String(selectedStation);

      return matchSearch && matchStation;
    });
  }, [sessions, searchQuery, selectedStation]);

  // Thống kê KPI tóm tắt
  const kpiStats = useMemo(() => {
    const totalCount = sessions.length;
    const totalPendingKwh = sessions.reduce((sum, s) => sum + Number(s.total_kwh || 0), 0);
    const affectedStationIds = new Set(sessions.map((s) => s.station_id).filter(Boolean));
    const totalInterrupted = sessions.filter((s) => s.status === 'INTERRUPTED').length;

    return {
      totalCount,
      totalPendingKwh: Math.round(totalPendingKwh * 100) / 100,
      affectedStations: affectedStationIds.size,
      totalInterrupted,
    };
  }, [sessions]);

  // Danh sách các trạm sạc duy nhất để lọc
  const uniqueStations = useMemo(() => {
    const map = new Map();
    sessions.forEach((s) => {
      if (s.station_id && s.station_name) {
        map.set(s.station_id, s.station_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sessions]);

  // Định dạng ngày giờ hiển thị
  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Chưa ghi nhận';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Tính khoảng thời gian mất liên lạc tương đối
  const getTimeElapsed = (dateStr) => {
    if (!dateStr) return 'Không xác định';
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 1) return 'Vừa mới đây';
      if (diffMinutes < 60) return `${diffMinutes} phút trước`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} giờ ${diffMinutes % 60} phút trước`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} ngày trước`;
    } catch {
      return 'Không xác định';
    }
  };

  // Mở modal đóng tay
  const handleOpenCloseModal = (session) => {
    setSelectedSessionForClose(session);
    setCloseReason('');
    setManualMeterKwh(session.meter_stop_kwh != null ? String(session.meter_stop_kwh) : String(session.total_kwh || ''));
    setReasonError(null);
  };

  // Đóng modal
  const handleDismissModal = () => {
    if (isSubmitting) return;
    setSelectedSessionForClose(null);
    setCloseReason('');
    setReasonError(null);
  };

  // Gợi ý lý do đóng tay nhanh
  const quickReasonPresets = [
    'Mất tín hiệu truyền thông OCPP với trụ sạc',
    'Trạm sạc mất nguồn điện lưới EVN đột ngột',
    'Xe đã rút súng sạc thủ công an toàn',
    'Tài xế yêu cầu can thiệp ngắt phiên khẩn cấp',
    'Cảm biến nhiệt súng sạc báo lỗi quá nhiệt',
  ];

  // Xử lý đóng tay phiên sạc có kiểm tra lý do
  const handleForceCloseSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSessionForClose) return;

    const trimmedReason = closeReason.trim();

    // KIỂM TRA BẮT BUỘC: Đóng tay không có lý do thì bị chặn
    if (!trimmedReason) {
      setReasonError('Bắt buộc phải nhập lý do can thiệp đóng phiên sạc.');
      showToast('error', 'CHẶN CAN THIỆP', 'Bạn phải nhập lý do đóng tay trước khi thực hiện.');
      return;
    }

    if (trimmedReason.length < 5) {
      setReasonError('Lý do can thiệp phải có ít nhất 5 ký tự để đảm bảo hồ sơ đối soát.');
      showToast('error', 'LÝ DO QUÁ NGẮN', 'Vui lòng mô tả cụ thể lý do can thiệp (tối thiểu 5 ký tự).');
      return;
    }

    setIsSubmitting(true);
    setReasonError(null);

    try {
      const payload = {
        reason: trimmedReason,
        meter_stop_kwh: manualMeterKwh ? parseFloat(manualMeterKwh) : null,
      };

      const res = await api.post(`/sessions/${selectedSessionForClose.id}/force-close`, payload);
      
      showToast(
        'success',
        'ĐÓNG PHIÊN THÀNH CÔNG',
        `Đã can thiệp đóng tay phiên #SES-${selectedSessionForClose.id}. Cổng sạc đã được giải phóng về trạng thái Sẵn sàng.`
      );

      handleDismissModal();
      await fetchAbnormalSessions();
    } catch (err) {
      console.error('Lỗi can thiệp đóng tay phiên sạc:', err);
      const detail = err.response?.data?.detail;
      const errorMsg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : err.message);
      setReasonError(errorMsg || 'Không thể đóng tay phiên sạc.');
      showToast('error', 'LỖI ĐÓNG PHIÊN', errorMsg || 'Không thể đóng tay phiên sạc.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // KIỂM TRA PHÂN QUYỀN RBAC (NFR): Chỉ Vận hành viên và Kế toán vào được trang này
  if (!isAuthorized) {
    return (
      <div className="py-16 text-center max-w-xl mx-auto space-y-4 font-mono">
        <div className="p-4 rounded-full bg-critical-red/20 border border-critical-red/40 w-16 h-16 mx-auto flex items-center justify-center text-critical-red">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-tech-white tracking-wide">
          TRUY CẬP BỊ TỪ CHỐI (403 ACCESS DENIED)
        </h2>
        <div className="p-4 rounded bg-panel border border-hairline text-steel-gray text-xs leading-relaxed">
          <p className="text-critical-red font-semibold mb-1">Ràng buộc kỹ thuật (NFR):</p>
          <p>
            Màn hình <strong>Danh sách phiên bất thường</strong> chỉ dành riêng cho vai trò{' '}
            <span className="text-tech-white font-bold">Vận hành viên (OPERATOR)</span> và{' '}
            <span className="text-tech-white font-bold">Kế toán (ACCOUNTANT)</span> để phục vụ công tác điều phối trạm và đối soát tài chính.
          </p>
          <p className="mt-2 text-[11px] text-steel-gray">
            Vai trò hiện tại của bạn: <span className="text-caution-amber font-bold uppercase">{role || 'GUEST'}</span>.
          </p>
        </div>
        <a
          href="/"
          className="inline-flex items-center space-x-2 px-4 py-2 rounded bg-panel hover:bg-panel-hover text-electric-cyan border border-electric-cyan/40 text-xs font-bold transition-all"
        >
          <span>QUAY LẠI TRANG CHỦ</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[999] max-w-md p-4 rounded-xl shadow-2xl border backdrop-blur-md flex items-start space-x-3 transition-all animate-fadeIn ${
            toast.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-300'
              : 'bg-rose-950/95 border-rose-500/60 text-rose-300'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 pr-2 font-mono">
            <h4 className="font-bold text-xs uppercase tracking-wide">{toast.title}</h4>
            <p className="text-xs text-tech-white/90 mt-0.5 font-sans leading-relaxed">{toast.message}</p>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-steel-gray hover:text-tech-white p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="bg-critical-red/20 border border-critical-red/40 p-2 rounded">
              <AlertOctagon className="w-5 h-5 text-critical-red" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-tech-white uppercase tracking-wider font-mono">
                  DANH SÁCH PHIÊN BẤT THƯỜNG TRÊN MÀN HÌNH VẬN HÀNH
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-critical-red/20 text-critical-red border border-critical-red/40">
                  {kpiStats.totalCount} PHIÊN CẦN XỬ LÝ
                </span>
              </div>
              <p className="text-xs text-steel-gray font-mono mt-0.5">
                GIÁM SÁT MẤT TÍN HIỆU, SỰ CỐ TRỤ SẠC & CAN THIỆP ĐÓNG TAY THỦ CÔNG (SCRUM-52 / SCRUM-148)
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchAbnormalSessions}
          disabled={loading}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-panel hover:bg-panel-hover border border-hairline text-steel-gray hover:text-tech-white text-xs font-mono transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-electric-cyan' : ''}`} />
          <span>LÀM MỚI DỮ LIỆU</span>
        </button>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-panel border border-hairline p-3 rounded-lg flex items-center space-x-3">
          <div className="p-2 rounded bg-critical-red/10 border border-critical-red/30 text-critical-red">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-steel-gray font-mono uppercase block">TỔNG PHIÊN BẤT THƯỜNG</span>
            <span className="text-lg font-bold font-mono text-tech-white">{kpiStats.totalCount}</span>
          </div>
        </div>

        <div className="bg-panel border border-hairline p-3 rounded-lg flex items-center space-x-3">
          <div className="p-2 rounded bg-caution-amber/10 border border-caution-amber/30 text-caution-amber">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] text-steel-gray font-mono uppercase block">MẤT TÍN HIỆU (INTERRUPTED)</span>
            <span className="text-lg font-bold font-mono text-caution-amber">{kpiStats.totalInterrupted}</span>
          </div>
        </div>

        <div className="bg-panel border border-hairline p-3 rounded-lg flex items-center space-x-3">
          <div className="p-2 rounded bg-electric-cyan/10 border border-electric-cyan/30 text-electric-cyan">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-steel-gray font-mono uppercase block">ĐIỆN NĂNG TREO (KWH)</span>
            <span className="text-lg font-bold font-mono text-electric-cyan">{kpiStats.totalPendingKwh}</span>
          </div>
        </div>

        <div className="bg-panel border border-hairline p-3 rounded-lg flex items-center space-x-3">
          <div className="p-2 rounded bg-panel-hover border border-hairline text-steel-gray">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-steel-gray font-mono uppercase block">TRẠM BỊ ẢNH HƯỞNG</span>
            <span className="text-lg font-bold font-mono text-tech-white">{kpiStats.affectedStations}</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-panel/60 p-3 rounded-lg border border-hairline">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã phiên (#SES-..), trụ, trạm sạc..."
            className="w-full bg-obsidian border border-hairline rounded-lg pl-9 pr-8 py-1.5 text-xs text-tech-white placeholder-steel-gray/60 focus:outline-none focus:border-electric-cyan font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-steel-gray hover:text-tech-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {uniqueStations.length > 0 && (
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-steel-gray text-[11px] uppercase">Lọc theo trạm:</span>
            <select
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
              className="bg-obsidian border border-hairline rounded px-2.5 py-1 text-xs text-tech-white focus:outline-none focus:border-electric-cyan"
            >
              <option value="ALL">Tất cả các trạm ({uniqueStations.length})</option>
              {uniqueStations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Abnormal Sessions List / Table */}
      {loading ? (
        <div className="py-16 text-center text-steel-gray font-mono text-xs space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-electric-cyan" />
          <p>Đang tải danh sách các phiên sạc bất thường...</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="py-16 text-center bg-panel/30 border border-dashed border-hairline rounded-xl space-y-3 font-mono">
          <CheckCircle2 className="w-10 h-10 text-grid-green mx-auto opacity-70" />
          <div>
            <h3 className="text-sm font-bold text-tech-white">HỆ THỐNG HOẠT ĐỘNG BÌNH THƯỜNG</h3>
            <p className="text-xs text-steel-gray mt-1">
              Không có phiên sạc nào bị gián đoạn kết nối hoặc gặp sự cố bất thường.
            </p>
          </div>
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedStation('ALL');
              }}
              className="px-3 py-1.5 rounded text-xs bg-panel hover:bg-panel-hover text-electric-cyan border border-electric-cyan/30"
            >
              Xóa bộ lọc tìm kiếm
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session) => {
            const isInterrupted = session.status === 'INTERRUPTED';
            const lostTime = session.last_checkpoint_at || session.end_time || session.start_time;

            return (
              <div
                key={session.id}
                className="bg-panel border border-hairline hover:border-hairline-bright rounded-lg p-4 transition-all shadow-sm space-y-3"
              >
                {/* Header row: ID, Badge Status, and Force Close Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-hairline">
                  <div className="flex items-center space-x-3">
                    <span className="px-2.5 py-1 rounded bg-critical-red/20 text-critical-red border border-critical-red/40 font-mono text-xs font-bold">
                      #SES-{session.id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center space-x-1 ${
                        isInterrupted
                          ? 'bg-caution-amber/20 text-caution-amber border border-caution-amber/40'
                          : 'bg-critical-red/20 text-critical-red border border-critical-red/40'
                      }`}
                    >
                      <Radio className="w-3 h-3 animate-pulse" />
                      <span>{session.status}</span>
                    </span>
                    <span className="text-xs font-bold text-tech-white font-mono">
                      {session.station_name || `Trạm sạc #${session.station_id || 'N/A'}`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenCloseModal(session)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-critical-red/20 hover:bg-critical-red/30 text-critical-red border border-critical-red/50 hover:border-critical-red text-xs font-mono font-bold transition-all shadow-sm self-start sm:self-auto"
                    title="Can thiệp đóng tay phiên sạc và giải phóng trụ"
                  >
                    <PowerOff className="w-3.5 h-3.5" />
                    <span>ĐÓNG TAY PHIÊN SẠC</span>
                  </button>
                </div>

                {/* Information Grid: AC Deliverables */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                  {/* 1. Trụ sạc & Cổng sạc */}
                  <div className="bg-obsidian/70 p-2.5 rounded border border-hairline space-y-1">
                    <span className="text-[10px] text-steel-gray block uppercase">TRỤ SẠC & CỔNG</span>
                    <div className="text-tech-white font-bold flex items-center space-x-1.5">
                      <Zap className="w-3.5 h-3.5 text-electric-cyan" />
                      <span>{session.charger_code || 'EVSE-Unknown'}</span>
                    </div>
                    <span className="text-[11px] text-steel-gray block">
                      Cổng sạc: ID #{session.connector_id}
                    </span>
                  </div>

                  {/* 2. Thời điểm mất liên lạc */}
                  <div className="bg-obsidian/70 p-2.5 rounded border border-hairline space-y-1">
                    <span className="text-[10px] text-steel-gray block uppercase">THỜI ĐIỂM MẤT LIÊN LẠC</span>
                    <div className="text-caution-amber font-bold flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-caution-amber" />
                      <span>{getTimeElapsed(lostTime)}</span>
                    </div>
                    <span className="text-[11px] text-steel-gray block">
                      {formatDateTime(lostTime)}
                    </span>
                  </div>

                  {/* 3. Số đo cuối & Pin */}
                  <div className="bg-obsidian/70 p-2.5 rounded border border-hairline space-y-1">
                    <span className="text-[10px] text-steel-gray block uppercase">SỐ ĐO CÔNG TƠ CUỐI</span>
                    <div className="text-grid-green font-bold flex items-center space-x-1.5">
                      <Gauge className="w-3.5 h-3.5 text-grid-green" />
                      <span>{Number(session.total_kwh || 0).toFixed(2)} kWh</span>
                    </div>
                    <span className="text-[11px] text-steel-gray block">
                      SoC Pin cuối: {session.current_soc != null ? `${session.current_soc}%` : 'N/A'}
                    </span>
                  </div>

                  {/* 4. Tài xế & Tiền điện */}
                  <div className="bg-obsidian/70 p-2.5 rounded border border-hairline space-y-1">
                    <span className="text-[10px] text-steel-gray block uppercase">TIỀN TẠM TÍNH</span>
                    <div className="text-tech-white font-bold">
                      {Number(session.total_amount || 0).toLocaleString('vi-VN')} VND
                    </div>
                    <span className="text-[11px] text-steel-gray block">
                      Tài xế ID #{session.user_id}
                    </span>
                  </div>
                </div>

                {/* Reason description bar */}
                {session.stop_reason && (
                  <div className="bg-obsidian/40 border border-hairline/60 px-3 py-1.5 rounded flex items-start space-x-2 text-[11px] font-mono text-steel-gray">
                    <AlertCircle className="w-3.5 h-3.5 text-caution-amber shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-tech-white">Chi tiết sự cố:</strong> {session.stop_reason}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Can thiệp Đóng tay phiên sạc (Force Close Modal) */}
      {selectedSessionForClose && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-panel border border-hairline p-6 rounded-lg max-w-xl w-full shadow-2xl space-y-4 font-mono text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-hairline">
              <div className="flex items-center space-x-2 text-critical-red">
                <PowerOff className="w-5 h-5" />
                <h3 className="text-sm font-bold text-tech-white uppercase tracking-wider">
                  CAN THIỆP ĐÓNG TAY PHIÊN SẠC BẤT THƯỜNG
                </h3>
              </div>
              <button
                type="button"
                onClick={handleDismissModal}
                disabled={isSubmitting}
                className="text-steel-gray hover:text-tech-white p-1 rounded hover:bg-obsidian transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Session Summary Card */}
            <div className="bg-obsidian p-3 rounded border border-hairline space-y-2">
              <div className="flex items-center justify-between text-steel-gray">
                <span>MÃ PHIÊN:</span>
                <span className="text-tech-white font-bold">#SES-{selectedSessionForClose.id}</span>
              </div>
              <div className="flex items-center justify-between text-steel-gray">
                <span>TRỤ SẠC:</span>
                <span className="text-tech-white font-bold">{selectedSessionForClose.charger_code} ({selectedSessionForClose.station_name})</span>
              </div>
              <div className="flex items-center justify-between text-steel-gray">
                <span>THỜI ĐIỂM MẤT LIÊN LẠC:</span>
                <span className="text-caution-amber font-bold">
                  {formatDateTime(selectedSessionForClose.last_checkpoint_at || selectedSessionForClose.end_time || selectedSessionForClose.start_time)}
                </span>
              </div>
              <div className="flex items-center justify-between text-steel-gray">
                <span>SỐ ĐO CÔNG TƠ CUỐI:</span>
                <span className="text-grid-green font-bold">{Number(selectedSessionForClose.total_kwh || 0).toFixed(2)} kWh</span>
              </div>
            </div>

            {/* Form can thiệp */}
            <form onSubmit={handleForceCloseSubmit} className="space-y-4">
              <div>
                <label className="text-steel-gray block mb-1 font-bold">
                  LÝ DO CAN THIỆP ĐÓNG PHIÊN <span className="text-critical-red">* (BẮT BUỘC)</span>
                </label>
                <textarea
                  id="force-close-reason-input"
                  rows={3}
                  value={closeReason}
                  onChange={(e) => {
                    setCloseReason(e.target.value);
                    if (reasonError) setReasonError(null);
                  }}
                  placeholder="Nhập lý do can thiệp (Ví dụ: Trụ sạc mất kết nối lưới điện, xe đã rút súng sạc an toàn...)"
                  className={`w-full bg-obsidian border p-2.5 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono resize-none ${
                    reasonError || (!closeReason.trim() && closeReason.length > 0)
                      ? 'border-critical-red bg-rose-950/20'
                      : 'border-hairline'
                  }`}
                />

                {/* Validation message: "đóng tay không có lý do thì bị chặn" */}
                {reasonError && (
                  <p className="text-critical-red text-[11px] mt-1 flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{reasonError}</span>
                  </p>
                )}
                {!closeReason.trim() && !reasonError && (
                  <p className="text-critical-red text-[10px] mt-1 flex items-center space-x-1 opacity-85">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>Đóng tay không có lý do thì bị chặn theo quy định vận hành.</span>
                  </p>
                )}
              </div>

              {/* Quick Reason Chips */}
              <div>
                <span className="text-[10px] text-steel-gray uppercase block mb-1.5 font-bold">
                  GỢI Ý LÝ DO NHANH:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {quickReasonPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setCloseReason(preset);
                        if (reasonError) setReasonError(null);
                      }}
                      className="px-2 py-1 rounded bg-obsidian hover:bg-hairline text-steel-gray hover:text-tech-white border border-hairline text-[11px] transition-colors text-left"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Số đo cuối điều chỉnh nếu cần */}
              <div>
                <label className="text-steel-gray block mb-1">
                  SỐ ĐO CÔNG TƠ CHỐT CUỐI CÙNG (KWH)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualMeterKwh}
                  onChange={(e) => setManualMeterKwh(e.target.value)}
                  placeholder="Lấy theo số đo công tơ trước khi mất liên lạc"
                  className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono"
                />
              </div>

              {/* Warning note */}
              <div className="p-2.5 rounded bg-caution-amber/10 border border-caution-amber/30 text-caution-amber text-[11px] flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Hành động đóng tay sẽ chuyển trạng thái phiên sang <strong>COMPLETED</strong>, ghi nhận nguyên nhân can thiệp và mở khóa cổng sạc về trạng thái <strong>AVAILABLE</strong> cho các xe khác tiếp tục sạc.
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-hairline">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleDismissModal}
                  className="px-3.5 py-1.5 rounded bg-hairline text-steel-gray hover:text-tech-white transition-colors"
                >
                  HỦY BỎ
                </button>
                <button
                  id="confirm-force-close-btn"
                  type="submit"
                  disabled={isSubmitting || !closeReason.trim() || closeReason.trim().length < 5}
                  className={`flex items-center space-x-1.5 px-4 py-1.5 rounded font-bold transition-all shadow-md ${
                    isSubmitting || !closeReason.trim() || closeReason.trim().length < 5
                      ? 'bg-hairline text-steel-gray/60 cursor-not-allowed border border-hairline'
                      : 'bg-critical-red hover:bg-critical-red-hover text-white'
                  }`}
                  title={
                    !closeReason.trim()
                      ? 'Bắt buộc phải nhập lý do trước khi đóng tay phiên sạc'
                      : 'Xác nhận đóng tay phiên sạc bất thường'
                  }
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>ĐANG XỬ LÝ...</span>
                    </>
                  ) : (
                    <>
                      <PowerOff className="w-3.5 h-3.5" />
                      <span>XÁC NHẬN ĐÓNG PHIÊN</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
