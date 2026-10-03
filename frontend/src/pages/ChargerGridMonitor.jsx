import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutGrid,
  CheckCircle2,
  Zap,
  AlertTriangle,
  Ban,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Eye,
  SlidersHorizontal,
  X,
  Layers,
  ChevronRight,
  BatteryCharging,
  Info,
  Activity,
  ShieldCheck,
  Power
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { telemetryWs } from '../services/websocket';

// Định nghĩa cấu hình trạng thái: Nhãn chữ, Icon và Mã ký hiệu trợ năng WCAG
const STATUS_CONFIG = {
  AVAILABLE: {
    label: 'SẴN SÀNG',
    englishLabel: 'AVAILABLE',
    code: '[OK]',
    icon: CheckCircle2,
    badgeBg: 'bg-emerald-950/80',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/50',
    dotColor: 'bg-emerald-500',
    cardBorder: 'border-hairline hover:border-emerald-500/60',
    cbCardBorder: 'border-2 border-solid border-emerald-400',
    cbBadgeBg: 'bg-emerald-900 text-tech-white border-2 border-emerald-400 font-bold',
    description: 'Trụ sạc sẵn sàng tiếp nhận xe',
  },
  CHARGING: {
    label: 'ĐANG SẠC',
    englishLabel: 'CHARGING',
    code: '[CHG]',
    icon: Zap,
    badgeBg: 'bg-sky-950/80',
    badgeText: 'text-sky-300',
    badgeBorder: 'border-sky-500/50',
    dotColor: 'bg-sky-400',
    cardBorder: 'border-hairline hover:border-sky-400/70 shadow-[0_0_15px_rgba(2,132,199,0.15)]',
    cbCardBorder: 'border-2 border-solid border-sky-400',
    cbBadgeBg: 'bg-sky-900 text-tech-white border-2 border-sky-400 font-bold',
    description: 'Đang truyền năng lượng vào xe điện',
  },
  FAULTED: {
    label: 'BỊ LỖI',
    englishLabel: 'FAULTED',
    code: '[ERR]',
    icon: AlertTriangle,
    badgeBg: 'bg-rose-950/80',
    badgeText: 'text-rose-400',
    badgeBorder: 'border-rose-500/60',
    dotColor: 'bg-rose-500',
    cardBorder: 'border-hairline hover:border-rose-500/70',
    cbCardBorder: 'border-2 border-dashed border-rose-500',
    cbBadgeBg: 'bg-rose-900 text-tech-white border-2 border-rose-400 font-bold',
    description: 'Sự cố phần cứng hoặc kết nối',
  },
  UNAVAILABLE: {
    label: 'TẠM NGƯNG',
    englishLabel: 'UNAVAILABLE',
    code: '[OFF]',
    icon: Ban,
    badgeBg: 'bg-amber-950/70',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-500/50',
    dotColor: 'bg-amber-500',
    cardBorder: 'border-hairline hover:border-amber-500/60',
    cbCardBorder: 'border-2 border-dotted border-amber-400',
    cbBadgeBg: 'bg-amber-900 text-tech-white border-2 border-amber-400 font-bold',
    description: 'Tạm dừng phục vụ hoặc bảo trì',
  },
  PREPARING: {
    label: 'CHUẨN BỊ',
    englishLabel: 'PREPARING',
    code: '[RDY]',
    icon: Clock,
    badgeBg: 'bg-indigo-950/80',
    badgeText: 'text-indigo-300',
    badgeBorder: 'border-indigo-500/50',
    dotColor: 'bg-indigo-400',
    cardBorder: 'border-hairline hover:border-indigo-500/60',
    cbCardBorder: 'border-2 border-double border-indigo-400',
    cbBadgeBg: 'bg-indigo-900 text-tech-white border-2 border-indigo-400 font-bold',
    description: 'Đang xác thực thẻ hoặc cắm súng sạc',
  },
};

export default function ChargerGridMonitor() {
  const { role } = useAuth();
  const [chargers, setChargers] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bộ lọc
  const [selectedStationId, setSelectedStationId] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Chế độ Trợ Năng Mù Màu (Accessibility Color-blind Mode)
  const [colorBlindMode, setColorBlindMode] = useState(() => {
    return localStorage.getItem('ev_csms_colorblind') === 'true';
  });

  // Modal chi tiết trụ sạc
  const [selectedCharger, setSelectedCharger] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateMessage, setStatusUpdateMessage] = useState(null);

  // ID của trụ sạc vừa có cập nhật realtime (để tạo hiệu ứng flash)
  const [updatedChargerId, setUpdatedChargerId] = useState(null);

  // Bật/tắt chế độ mù màu
  const toggleColorBlindMode = () => {
    setColorBlindMode((prev) => {
      const next = !prev;
      localStorage.setItem('ev_csms_colorblind', String(next));
      return next;
    });
  };

  // Tải danh sách trạm sạc & trụ sạc
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [chargersRes, stationsRes] = await Promise.all([
        api.get('/chargers'),
        api.get('/stations'),
      ]);
      setChargers(chargersRes.data || []);
      setStations(stationsRes.data || []);
    } catch (err) {
      console.error('Lỗi tải dữ liệu màn hình lưới:', err);
      setError('Không thể kết nối máy chủ để tải danh sách trụ sạc.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Kết nối WebSocket Telemetry cập nhật thời gian thực
  useEffect(() => {
    telemetryWs.connect();

    const handleWsMessage = (data) => {
      if (!data) return;

      // Sự kiện thay đổi trạng thái trụ sạc
      if (data.event === 'STATUS_CHANGED' && data.entity_type === 'CHARGING_POINT') {
        const targetId = Number(data.id);
        const newStatus = data.status;

        setChargers((prev) =>
          prev.map((c) => (c.id === targetId ? { ...c, status: newStatus } : c))
        );

        setUpdatedChargerId(targetId);
        setTimeout(() => setUpdatedChargerId(null), 2500);

        // Nếu modal đang mở đúng trụ này, cập nhật modal luôn
        setSelectedCharger((prev) =>
          prev && prev.id === targetId ? { ...prev, status: newStatus } : prev
        );
      }

      // Sự kiện đo đếm tải lưới điện tức thời
      if (data.event === 'GRID_TELEMETRY' && data.session_id) {
        // Cập nhật công suất sạc nếu biết session_id
        if (data.active_kw !== undefined) {
          setChargers((prev) =>
            prev.map((c) =>
              c.active_session_id === data.session_id
                ? { ...c, current_power_kw: data.active_kw }
                : c
            )
          );
        }
      }

      // Sự kiện phiên sạc kết thúc
      if (data.event === 'SESSION_STOPPED') {
        fetchData();
      }
    };

    const removeListener = telemetryWs.addListener(handleWsMessage);
    return () => {
      removeListener();
    };
  }, [fetchData]);

  // Thao tác đổi trạng thái trụ sạc nhanh (Admin / Operator)
  const handleUpdateStatus = async (newStatus) => {
    if (!selectedCharger) return;
    try {
      setIsUpdatingStatus(true);
      setStatusUpdateMessage(null);
      const res = await api.patch(`/chargers/${selectedCharger.id}/status`, {
        status: newStatus,
      });

      // Cập nhật state cục bộ
      const updated = res.data;
      setChargers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelectedCharger(updated);
      setStatusUpdateMessage({
        type: 'success',
        text: `Đã cập nhật trạng thái trụ thành ${STATUS_CONFIG[newStatus]?.label || newStatus}`,
      });
      setTimeout(() => setStatusUpdateMessage(null), 3000);
    } catch (err) {
      console.error('Lỗi cập nhật trạng thái trụ sạc:', err);
      setStatusUpdateMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Không thể cập nhật trạng thái.',
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Tính toán KPI tổng hợp
  const kpiStats = useMemo(() => {
    const total = chargers.length;
    let available = 0;
    let charging = 0;
    let faulted = 0;
    let unavailable = 0;
    let preparing = 0;
    let totalLivePower = 0;

    chargers.forEach((c) => {
      const st = (c.status || '').toUpperCase();
      if (st === 'AVAILABLE') available++;
      else if (st === 'CHARGING') {
        charging++;
        totalLivePower += c.current_power_kw || 0;
      } else if (st === 'FAULTED') faulted++;
      else if (st === 'UNAVAILABLE') unavailable++;
      else if (st === 'PREPARING') preparing++;
    });

    return {
      total,
      available,
      charging,
      faulted,
      unavailable,
      preparing,
      totalLivePower: Math.round(totalLivePower * 10) / 10,
    };
  }, [chargers]);

  // Lọc danh sách trụ sạc
  const filteredChargers = useMemo(() => {
    return chargers.filter((c) => {
      // Lọc theo trạm
      if (selectedStationId !== 'ALL' && c.station_id !== Number(selectedStationId)) {
        return false;
      }
      // Lọc theo trạng thái
      if (selectedStatus !== 'ALL' && c.status !== selectedStatus) {
        return false;
      }
      // Lọc theo từ khóa tìm kiếm
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchCode = (c.code || '').toLowerCase().includes(query);
        const matchVendor = (c.vendor || '').toLowerCase().includes(query);
        const matchModel = (c.model || '').toLowerCase().includes(query);
        const matchStation = (c.station_name || '').toLowerCase().includes(query);
        if (!matchCode && !matchVendor && !matchModel && !matchStation) {
          return false;
        }
      }
      return true;
    });
  }, [chargers, selectedStationId, selectedStatus, searchQuery]);

  return (
    <div className="w-full space-y-4 overflow-x-hidden">
      {/* 1. Header Bar & Chế độ trợ năng mù màu */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-panel/70 border border-hairline p-4 rounded-xl backdrop-blur-md">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-electric-cyan/10 border border-electric-cyan/30 rounded-lg text-electric-cyan">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base md:text-lg font-bold text-tech-white tracking-wide">
                  LƯỚI THEO DÕI TRỤ SẠC (CHARGER GRID MONITOR)
                </h1>
                <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>TRỰC TIẾP WS</span>
                </span>
              </div>
              <p className="text-xs text-steel-gray mt-0.5">
                Giám sát tập trung trạng thái hoạt động của toàn bộ trụ sạc EVSE không cần cuộn ngang
              </p>
            </div>
          </div>
        </div>

        {/* Nút hành động: Trợ năng mù màu & Làm mới */}
        <div className="flex items-center space-x-2 self-start md:self-auto">
          {/* Nút bật/tắt Chế độ trợ năng mù màu (WCAG) */}
          <button
            onClick={toggleColorBlindMode}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              colorBlindMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                : 'bg-panel text-steel-gray hover:text-tech-white border-hairline hover:border-steel-gray/40'
            }`}
            title="Chế độ trợ năng cho người mù màu: Hiển thị nhãn chữ lớn, hoa văn viền và ký hiệu [OK], [CHG], [ERR]"
          >
            <Eye className="w-4 h-4" />
            <span>
              {colorBlindMode ? 'Mù màu: ĐANG BẬT' : 'Chế độ trợ năng Mù màu'}
            </span>
          </button>

          {/* Nút Làm mới */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-panel hover:bg-panel-hover text-tech-white border border-hairline hover:border-electric-cyan/40 transition-colors disabled:opacity-50"
            title="Tải lại dữ liệu"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-electric-cyan' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {/* 2. Dải KPI Thống Kê Nhanh (KPI Summary Strip) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
        <div className="bg-panel border border-hairline p-2.5 rounded-lg flex flex-col justify-between">
          <div className="text-[11px] font-mono text-steel-gray uppercase">Tổng số trụ</div>
          <div className="text-xl font-bold font-mono text-tech-white mt-1">
            {kpiStats.total} <span className="text-xs font-normal text-steel-gray">trụ</span>
          </div>
        </div>

        <div className="bg-panel border border-hairline p-2.5 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 uppercase">
            <span>Sẵn sàng</span>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {kpiStats.available}
          </div>
        </div>

        <div className="bg-panel border border-hairline p-2.5 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-sky-400 uppercase">
            <span>Đang sạc</span>
            <Zap className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <div className="text-xl font-bold font-mono text-sky-400 mt-1">
            {kpiStats.charging}
          </div>
        </div>

        <div className="bg-panel border border-hairline p-2.5 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-rose-400 uppercase">
            <span>Bị lỗi</span>
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-400 mt-1">
            {kpiStats.faulted}
          </div>
        </div>

        <div className="bg-panel border border-hairline p-2.5 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-amber-400 uppercase">
            <span>Tạm ngưng</span>
            <Ban className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {kpiStats.unavailable}
          </div>
        </div>

        <div className="bg-panel border border-hairline p-2.5 rounded-lg flex flex-col justify-between">
          <div className="text-[11px] font-mono text-electric-cyan uppercase">Công suất tải</div>
          <div className="text-xl font-bold font-mono text-electric-cyan mt-1">
            {kpiStats.totalLivePower} <span className="text-xs font-normal text-steel-gray">kW</span>
          </div>
        </div>
      </div>

      {/* 3. Thanh Công Cụ Bộ Lọc (Filter Toolbar) */}
      <div className="bg-panel/90 border border-hairline p-3 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Tìm kiếm & Trạm */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
          {/* Ô tìm kiếm */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã trụ EVSE, hãng, model..."
              className="w-full bg-obsidian border border-hairline rounded-lg pl-9 pr-3 py-1.5 text-xs text-tech-white placeholder-steel-gray/60 focus:outline-none focus:border-electric-cyan transition-colors font-mono"
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

          {/* Chọn Trạm sạc */}
          <div className="flex items-center space-x-1.5 bg-obsidian border border-hairline rounded-lg px-2.5 py-1">
            <Layers className="w-3.5 h-3.5 text-steel-gray" />
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-transparent text-xs text-tech-white focus:outline-none cursor-pointer pr-2"
            >
              <option value="ALL" className="bg-obsidian">Tất cả trạm sạc ({stations.length})</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id} className="bg-obsidian">
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Các nút bấm lọc nhanh Trạng thái */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          <span className="text-[11px] font-mono text-steel-gray mr-1 hidden sm:inline">Trạng thái:</span>
          {[
            { id: 'ALL', label: 'TẤT CẢ', count: kpiStats.total },
            { id: 'AVAILABLE', label: 'SẴN SÀNG', count: kpiStats.available, color: 'text-emerald-400' },
            { id: 'CHARGING', label: 'ĐANG SẠC', count: kpiStats.charging, color: 'text-sky-400' },
            { id: 'FAULTED', label: 'BỊ LỖI', count: kpiStats.faulted, color: 'text-rose-400' },
            { id: 'UNAVAILABLE', label: 'TẠM NGƯNG', count: kpiStats.unavailable, color: 'text-amber-400' },
            { id: 'PREPARING', label: 'CHUẨN BỊ', count: kpiStats.preparing, color: 'text-indigo-400' },
          ].map((item) => {
            const active = selectedStatus === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedStatus(item.id)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-electric-cyan text-tech-white font-bold shadow-sm'
                    : 'bg-obsidian/70 text-steel-gray hover:text-tech-white hover:bg-obsidian border border-hairline'
                }`}
              >
                <span>{item.label}</span>
                <span
                  className={`px-1 rounded text-[10px] ${
                    active ? 'bg-black/30 text-white' : item.color || 'text-steel-gray'
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Thông báo lỗi nếu có */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchData}
            className="underline hover:text-white font-semibold ml-2"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 4. Màn Hình Lưới Theo Dõi Trụ Sạc (Grid Layout - 20+ trụ không cuộn ngang) */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-electric-cyan animate-spin" />
          <div className="text-xs font-mono text-steel-gray">
            Đang tải dữ liệu mạng lưới trụ sạc...
          </div>
        </div>
      ) : filteredChargers.length === 0 ? (
        <div className="py-16 text-center bg-panel/40 border border-dashed border-hairline rounded-xl">
          <Ban className="w-10 h-10 text-steel-gray mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium text-steel-gray">
            Không tìm thấy trụ sạc nào phù hợp với bộ lọc hiện tại.
          </p>
          <button
            onClick={() => {
              setSelectedStationId('ALL');
              setSelectedStatus('ALL');
              setSearchQuery('');
            }}
            className="mt-3 px-3 py-1.5 rounded-lg text-xs bg-panel hover:bg-panel-hover text-electric-cyan border border-electric-cyan/30"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-2.5">
          {filteredChargers.map((charger) => {
            const stKey = (charger.status || 'AVAILABLE').toUpperCase();
            const config = STATUS_CONFIG[stKey] || STATUS_CONFIG.AVAILABLE;
            const StatusIcon = config.icon;
            const isJustUpdated = updatedChargerId === charger.id;

            return (
              <div
                key={charger.id}
                onClick={() => setSelectedCharger(charger)}
                className={`relative group bg-panel rounded-xl p-3 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none ${
                  colorBlindMode
                    ? config.cbCardBorder
                    : `border ${config.cardBorder}`
                } ${
                  isJustUpdated
                    ? 'ring-2 ring-electric-cyan bg-electric-cyan/10 animate-pulse'
                    : ''
                }`}
                style={{ minHeight: '142px' }}
                title={`Nhấn để xem chi tiết trụ sạc ${charger.code}`}
              >
                {/* Header card: Mã trụ sạc & Tên trạm */}
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-mono font-bold text-xs text-tech-white tracking-wide group-hover:text-electric-cyan transition-colors">
                      {charger.code}
                    </span>
                    <span className="text-[10px] font-mono text-steel-gray shrink-0">
                      {charger.max_power_kw}kW
                    </span>
                  </div>

                  <div className="text-[11px] text-steel-gray truncate mt-0.5" title={charger.station_name}>
                    {charger.station_name || 'Chưa gán trạm'}
                  </div>
                </div>

                {/* Phần Nhãn Trạng Thái Chính (WCAG Text Badge + Icon + Color-Blind Code) */}
                <div className="my-2">
                  <div
                    className={`flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-center transition-all ${
                      colorBlindMode
                        ? config.cbBadgeBg
                        : `${config.badgeBg} ${config.badgeText} border ${config.badgeBorder}`
                    }`}
                  >
                    <StatusIcon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        stKey === 'CHARGING' ? 'animate-bounce text-sky-400' : ''
                      }`}
                    />
                    <span className="font-bold text-[11px] tracking-wider uppercase font-mono">
                      {colorBlindMode ? `${config.code} ${config.label}` : config.label}
                    </span>
                  </div>

                  {/* Hiển thị số liệu khi đang sạc */}
                  {stKey === 'CHARGING' && (
                    <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-sky-300 px-1">
                      <span className="flex items-center space-x-1">
                        <Activity className="w-2.5 h-2.5 animate-pulse" />
                        <span>Tải thực:</span>
                      </span>
                      <span className="font-bold">
                        {charger.current_power_kw ? `${charger.current_power_kw} kW` : 'Đang nạp'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer card: Danh sách loại cổng & Model */}
                <div className="pt-1.5 border-t border-hairline/60 flex items-center justify-between text-[10px] font-mono text-steel-gray">
                  <div className="flex items-center space-x-1 truncate max-w-[80%]">
                    {charger.connectors && charger.connectors.length > 0 ? (
                      charger.connectors.map((conn) => (
                        <span
                          key={conn.id}
                          className="px-1 py-0.2 bg-obsidian rounded border border-hairline text-[9px] text-tech-white/80"
                        >
                          #{conn.connector_number} {conn.connector_type}
                        </span>
                      ))
                    ) : (
                      <span>{charger.vendor || 'EVSE'}</span>
                    )}
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-steel-gray/60 group-hover:text-tech-white group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Modal Chi Tiết & Điều Khiển Trụ Sạc (Control Modal) */}
      {selectedCharger && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
          onClick={() => setSelectedCharger(null)}
        >
          <div
            className="bg-panel border border-hairline w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-hairline pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-electric-cyan/10 border border-electric-cyan/30 rounded-xl text-electric-cyan">
                  <BatteryCharging className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-tech-white font-mono">
                      {selectedCharger.code}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-obsidian border border-hairline text-steel-gray font-mono">
                      ID: #{selectedCharger.id}
                    </span>
                  </div>
                  <p className="text-xs text-steel-gray mt-0.5">
                    {selectedCharger.station_name || 'Chưa gán trạm'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedCharger(null)}
                className="p-1 rounded-lg text-steel-gray hover:text-tech-white hover:bg-panel-hover"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thông báo cập nhật trạng thái nếu có */}
            {statusUpdateMessage && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
                  statusUpdateMessage.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                }`}
              >
                <Info className="w-4 h-4 shrink-0" />
                <span>{statusUpdateMessage.text}</span>
              </div>
            )}

            {/* Trạng thái hiện tại to rõ (WCAG Accessible) */}
            <div className="bg-obsidian border border-hairline p-4 rounded-xl space-y-2">
              <div className="text-xs font-mono text-steel-gray flex items-center justify-between">
                <span>TRẠNG THÁI VẬN HÀNH HIỆN TẠI</span>
                {colorBlindMode && (
                  <span className="text-[10px] text-amber-400 font-bold">
                    [CHẾ ĐỘ TRỢ NĂNG WCAG ĐANG BẬT]
                  </span>
                )}
              </div>
              {(() => {
                const conf = STATUS_CONFIG[selectedCharger.status] || STATUS_CONFIG.AVAILABLE;
                const CurrentIcon = conf.icon;
                return (
                  <div
                    className={`flex items-center space-x-3 p-3 rounded-lg ${
                      colorBlindMode
                        ? conf.cbBadgeBg
                        : `${conf.badgeBg} ${conf.badgeText} border ${conf.badgeBorder}`
                    }`}
                  >
                    <CurrentIcon className="w-5 h-5 shrink-0" />
                    <div>
                      <div className="font-bold text-sm font-mono tracking-wider">
                        {conf.code} {conf.label} ({conf.englishLabel})
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5 font-sans">
                        {conf.description}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Thông số kỹ thuật của trụ */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-obsidian/60 border border-hairline p-2.5 rounded-lg">
                <span className="text-steel-gray text-[11px] block">Hãng sản xuất / Model:</span>
                <span className="font-semibold text-tech-white mt-0.5 block truncate">
                  {selectedCharger.vendor} {selectedCharger.model ? `- ${selectedCharger.model}` : ''}
                </span>
              </div>
              <div className="bg-obsidian/60 border border-hairline p-2.5 rounded-lg">
                <span className="text-steel-gray text-[11px] block">Công suất tối đa:</span>
                <span className="font-semibold text-tech-white mt-0.5 block font-mono">
                  {selectedCharger.max_power_kw} kW
                </span>
              </div>
              <div className="bg-obsidian/60 border border-hairline p-2.5 rounded-lg">
                <span className="text-steel-gray text-[11px] block">Firmware version:</span>
                <span className="font-semibold text-tech-white mt-0.5 block font-mono">
                  v{selectedCharger.firmware_version || '1.0.0'}
                </span>
              </div>
              <div className="bg-obsidian/60 border border-hairline p-2.5 rounded-lg">
                <span className="text-steel-gray text-[11px] block">Chia sẻ tải động:</span>
                <span className="font-semibold text-tech-white mt-0.5 block">
                  {selectedCharger.power_sharing_enabled ? 'Bật (Enabled)' : 'Tắt (Disabled)'}
                </span>
              </div>
            </div>

            {/* Danh sách các cổng sạc con */}
            <div className="space-y-2">
              <h4 className="text-xs font-mono font-semibold text-steel-gray uppercase">
                Danh sách Cổng sạc vật lý ({selectedCharger.connectors?.length || 0} cổng)
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {selectedCharger.connectors && selectedCharger.connectors.length > 0 ? (
                  selectedCharger.connectors.map((c) => (
                    <div
                      key={c.id}
                      className="bg-obsidian border border-hairline p-2.5 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded bg-panel flex items-center justify-center font-mono font-bold text-[11px] text-electric-cyan">
                          #{c.connector_number}
                        </span>
                        <div>
                          <span className="font-bold text-tech-white font-mono">{c.connector_type}</span>
                          <span className="text-steel-gray text-[11px] ml-2">Tối đa {c.max_power_kw} kW</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-panel border border-hairline text-steel-gray">
                        {c.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-steel-gray italic py-2">Chưa cấu hình cổng sạc nào</div>
                )}
              </div>
            </div>

            {/* Quyền quản trị: Thao tác đổi trạng thái nhanh */}
            {(role === 'ADMIN' || role === 'OPERATOR') && (
              <div className="pt-3 border-t border-hairline space-y-2">
                <div className="flex items-center justify-between text-xs text-steel-gray font-mono">
                  <span>ĐIỀU KHIỂN NHANH TRẠNG THÁI (ADMIN / OPERATOR):</span>
                  {isUpdatingStatus && <span className="text-electric-cyan animate-pulse">Đang lưu...</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    disabled={isUpdatingStatus || selectedCharger.status === 'AVAILABLE'}
                    onClick={() => handleUpdateStatus('AVAILABLE')}
                    className="px-2.5 py-2 rounded-lg text-xs font-medium bg-emerald-950/70 hover:bg-emerald-900 text-emerald-400 border border-emerald-500/40 transition-all disabled:opacity-40"
                  >
                    Sẵn sàng
                  </button>
                  <button
                    disabled={isUpdatingStatus || selectedCharger.status === 'PREPARING'}
                    onClick={() => handleUpdateStatus('PREPARING')}
                    className="px-2.5 py-2 rounded-lg text-xs font-medium bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/40 transition-all disabled:opacity-40"
                  >
                    Chuẩn bị
                  </button>
                  <button
                    disabled={isUpdatingStatus || selectedCharger.status === 'UNAVAILABLE'}
                    onClick={() => handleUpdateStatus('UNAVAILABLE')}
                    className="px-2.5 py-2 rounded-lg text-xs font-medium bg-amber-950/70 hover:bg-amber-900 text-amber-400 border border-amber-500/40 transition-all disabled:opacity-40"
                  >
                    Tạm ngưng
                  </button>
                  <button
                    disabled={isUpdatingStatus || selectedCharger.status === 'FAULTED'}
                    onClick={() => handleUpdateStatus('FAULTED')}
                    className="px-2.5 py-2 rounded-lg text-xs font-medium bg-rose-950/70 hover:bg-rose-900 text-rose-400 border border-rose-500/40 transition-all disabled:opacity-40"
                  >
                    Báo lỗi
                  </button>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedCharger(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-panel-hover text-tech-white hover:bg-obsidian border border-hairline transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
