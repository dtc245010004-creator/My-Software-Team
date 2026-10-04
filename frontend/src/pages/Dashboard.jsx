import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BatteryCharging, AlertTriangle, Zap, CheckCircle2, Radio, Activity, BarChart3, Sliders, Filter } from 'lucide-react';
import api from '../services/api';
import { telemetryWs } from '../services/websocket';
import { useAuth } from '../context/AuthContext';
import BusbarLoadIndicator from '../components/BusbarLoadIndicator';
import MetricBox from '../components/MetricBox';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const { user, role } = useAuth();
  const [accessibleStations, setAccessibleStations] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState('ALL');

  const [totalStations, setTotalStations] = useState(0);
  const [totalChargers, setTotalChargers] = useState(0);
  const [chargingCount, setChargingCount] = useState(0);
  const [availableCount, setAvailableCount] = useState(0);
  const [faultedCount, setFaultedCount] = useState(0);
  const [totalGridKw, setTotalGridKw] = useState(0);
  const [safeLimitKw, setSafeLimitKw] = useState(0);
  const [activeKw, setActiveKw] = useState(0.0);
  const [chargers, setChargers] = useState([]);
  const [loadProfile, setLoadProfile] = useState([]);
  const [timelineData, setTimelineData] = useState([]);
  const [stationsDetail, setStationsDetail] = useState([]);
  const [hasOverloadStation, setHasOverloadStation] = useState(false);
  const [emptyState, setEmptyState] = useState(false);

  const [chartViewMode, setChartViewMode] = useState('EQUALIZER'); // 'EQUALIZER' | 'TOU_2H'
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Nạp danh sách các trạm trong phạm vi phân quyền
  useEffect(() => {
    const fetchAccessibleStations = async () => {
      try {
        const res = await api.get('/stations');
        setAccessibleStations(res.data || []);
      } catch (err) {
        console.error('Lỗi nạp danh sách trạm:', err);
      }
    };
    fetchAccessibleStations();
    setSelectedStationId('ALL');
  }, [user]);

  // Nạp toàn bộ dữ liệu Dashboard (Metrics, Load Profile 2h, Timeline 1440m, Chargers) theo phạm vi trạm
  const fetchDashboardData = useCallback(async () => {
    try {
      const params = selectedStationId !== 'ALL' ? { station_id: selectedStationId } : {};
      const [liveRes, profileRes, timelineRes] = await Promise.all([
        api.get('/stations/metrics/live', { params }).catch(() => null),
        api.get('/stations/metrics/load-profile', { params }).catch(() => null),
        api.get('/stations/metrics/load-profile-timeline', { params }).catch(() => null),
      ]);

      if (liveRes && liveRes.data) {
        const d = liveRes.data;
        setTotalStations(d.total_stations || 0);
        setTotalChargers(d.total_chargers || 0);
        setChargingCount(d.charging_chargers_count || 0);
        setAvailableCount(d.available_chargers_count || 0);
        setFaultedCount(d.faulted_chargers_count || 0);
        setTotalGridKw(d.total_grid_capacity_kw || 0);
        setSafeLimitKw(d.safe_limit_kw || 0);
        setActiveKw(d.active_power_kw || 0.0);
        setChargers(d.chargers || []);
        setStationsDetail(d.stations_detail || []);
        setHasOverloadStation(!!d.has_overload_station);
        setEmptyState(!!d.empty_state);
      }

      if (profileRes && Array.isArray(profileRes.data)) {
        setLoadProfile(profileRes.data);
      }

      if (timelineRes && Array.isArray(timelineRes.data)) {
        setTimelineData(timelineRes.data);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Lỗi nạp dữ liệu dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStationId]);

  // Chỉ lấy live metrics nhanh để cập nhật nhẹ
  const fetchLiveMetricsOnly = useCallback(async () => {
    try {
      const params = selectedStationId !== 'ALL' ? { station_id: selectedStationId } : {};
      const res = await api.get('/stations/metrics/live', { params });
      if (res && res.data) {
        const d = res.data;
        setChargingCount(d.charging_chargers_count || 0);
        setAvailableCount(d.available_chargers_count || 0);
        setFaultedCount(d.faulted_chargers_count || 0);
        setActiveKw(d.active_power_kw || 0.0);
        setSafeLimitKw(d.safe_limit_kw || 0);
        setHasOverloadStation(!!d.has_overload_station);
        setStationsDetail(d.stations_detail || []);
        if (d.chargers) {
          setChargers(d.chargers);
        }
      }
    } catch (e) {
      // Bỏ qua lỗi polling nhẹ
    }
  }, [selectedStationId]);

  useEffect(() => {
    fetchDashboardData();

    // Kết nối WebSocket và lắng nghe sự kiện telemetry thời gian thực
    const unsubscribe = telemetryWs.addListener((msg) => {
      if (msg.event === 'GRID_TELEMETRY') {
        if (role === 'OPERATOR') {
          // Chỉ nhận dữ liệu telemetry nếu thuộc trạm mà chủ sở hữu
          const isOwned = msg.station_id && accessibleStations.some((st) => st.id === msg.station_id);
          if (!isOwned) return;

          if (selectedStationId !== 'ALL' && msg.station_id !== Number(selectedStationId)) {
            return;
          }

          // Cập nhật live metrics theo phạm vi sở hữu để không bị công suất toàn mạng ghi đè
          fetchLiveMetricsOnly();
        } else {
          // ADMIN: nếu đang chọn trạm cụ thể thì lọc theo trạm đó
          if (selectedStationId !== 'ALL') {
            if (msg.station_id && msg.station_id !== Number(selectedStationId)) {
              return;
            }
            fetchLiveMetricsOnly();
          } else {
            if (typeof msg.active_kw === 'number') {
              setActiveKw(msg.active_kw);
            }
            if (typeof msg.active_chargers_count === 'number') {
              setChargingCount(msg.active_chargers_count);
            }
          }
        }
      } else if (
        msg.event === 'STATUS_CHANGED' ||
        msg.event === 'SESSION_STOPPED' ||
        msg.event === 'SESSION_STARTED'
      ) {
        fetchDashboardData();
      }
    });

    // Polling định kỳ mỗi 4 giây để đồng bộ trạng thái khi không có WebSocket
    const pollInterval = setInterval(() => {
      fetchLiveMetricsOnly();
    }, 4000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [fetchDashboardData, fetchLiveMetricsOnly, role, accessibleStations, selectedStationId]);

  // Downsample từ 1440 điểm (1 phút/điểm) về 480 cột (3 phút/cột) phục vụ Equalizer mượt 60 FPS
  const downsampledTimeline = useMemo(() => {
    if (!Array.isArray(timelineData) || timelineData.length === 0) return [];
    const result = [];
    const step = 3; // 1440 / 3 = 480 cột
    for (let i = 0; i < timelineData.length; i += step) {
      const chunk = timelineData.slice(i, i + step);
      const maxPower = Math.max(...chunk.map((item) => Number(item.powerKw || 0)));
      const hasRealData = chunk.some((item) => !item.isPlaceholder);
      const isFuture = chunk.every((item) => item.isPlaceholder && !item.noData);
      const isPastNoData = chunk.every((item) => item.isPlaceholder && item.noData);

      // Tách biệt hoàn toàn: realPowerKw cho số liệu thật, placeholderHeight cho layer trang trí
      result.push({
        time: chunk[0].time,
        realPowerKw: hasRealData ? maxPower : null,
        // Chiều cao tượng trưng (2.5% cho tương lai, 1.2% cho quá khứ không log) trên thang 0-100% của layer trang trí
        placeholderHeight: isFuture ? 2.5 : isPastNoData ? 1.2 : null,
        hasRealData,
        isFuture,
        isPastNoData,
        isPlaceholder: !hasRealData,
      });
    }
    return result;
  }, [timelineData]);

  // Cấu hình domain trục Y cố định hợp lý theo công suất tối đa của trạm/hệ thống (tối thiểu 120kW theo trụ DC)
  const yAxisMax = useMemo(() => {
    const maxChargerKw =
      Array.isArray(chargers) && chargers.length > 0
        ? Math.max(...chargers.map((c) => Number(c.max_power_kw) || 0))
        : 120;
    const maxObserved =
      downsampledTimeline.length > 0
        ? Math.max(...downsampledTimeline.map((d) => (d.realPowerKw != null ? d.realPowerKw : 0)))
        : 0;
    return Math.max(120, maxChargerKw, Math.ceil(maxObserved * 1.15));
  }, [chargers, downsampledTimeline]);

  return (
    <div className="space-y-6">
      {/* Top Technical Headline */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold tracking-tight text-tech-white">Tổng Quan Vận Hành Mạng Lưới Trạm Sạc</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30">
              <Radio className="w-3 h-3 mr-1 animate-pulse" />
              LIVE TELEMETRY
            </span>
          </div>
          <p className="text-xs text-steel-gray mt-0.5 font-mono">
            GIÁM SÁT THỜI GIAN THỰC — PHỤ TẢI NGUỒN LƯỚI & TRẠNG THÁI RƠ-LE CÔNG SUẤT
            {lastUpdated && ` (Cập nhật: ${lastUpdated.toLocaleTimeString('vi-VN')})`}
          </p>
        </div>

        {/* Scope Selector & Refresh */}
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-2 bg-panel border border-hairline rounded px-2.5 py-1 text-xs font-mono">
            <Filter className="w-3.5 h-3.5 text-steel-gray" />
            <span className="text-steel-gray">Phạm vi:</span>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-obsidian border border-hairline text-tech-white rounded px-2 py-1 text-xs focus:outline-none focus:border-electric-cyan font-mono"
            >
              <option value="ALL">
                {role === 'ADMIN'
                  ? `Tất cả trạm (${accessibleStations.length} trạm)`
                  : `Tất cả trạm của tôi (${accessibleStations.length} trạm)`}
              </option>
              {accessibleStations.map((st) => (
                <option key={st.id} value={st.id}>
                  [ST-{st.id}] {st.name} ({st.total_grid_capacity_kw || 0} kW)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchDashboardData}
            className="text-xs px-3 py-1.5 rounded bg-panel border border-hairline hover:bg-hairline text-steel-gray hover:text-tech-white transition-colors font-mono"
          >
            LÀM MỚI DỮ LIỆU
          </button>
        </div>
      </div>

      {/* Overload Alert Warning */}
      {hasOverloadStation && (
        <div className="bg-critical-red/10 border border-critical-red/40 p-3 rounded flex items-center space-x-3 text-critical-red text-xs font-mono animate-pulse">
          <AlertTriangle className="w-5 h-5 shrink-0 text-critical-red" />
          <div>
            <span className="font-bold">[CẢNH BÁO QUÁ TẢI LƯỚI ĐIỆN]</span> Phát hiện trạm sạc đang vượt ngưỡng an toàn 95% công suất lưới! Thuật toán điều phối Smart Charging / Fallback đang tự động can thiệp giảm dòng sạc.
          </div>
        </div>
      )}

      {/* Empty State Banner if no stations owned */}
      {emptyState && (
        <div className="bg-panel border border-hairline p-6 rounded text-center space-y-2 font-mono">
          <Zap className="w-8 h-8 text-steel-gray mx-auto opacity-50" />
          <h3 className="text-sm font-bold text-tech-white">Bạn chưa sở hữu trạm sạc nào trong hệ thống</h3>
          <p className="text-xs text-steel-gray max-w-md mx-auto">
            Hiện tại tài khoản chưa được gán trạm sạc nào. Hãy liên hệ Quản trị viên hệ thống để được gán quyền sở hữu trạm, hoặc chuyển tài khoản demo để kiểm thử.
          </p>
        </div>
      )}

      {/* Grid Busbar Main Indicator */}
      <BusbarLoadIndicator
        currentKw={activeKw}
        limitKw={safeLimitKw || (totalGridKw * 0.95) || 100}
        label={
          selectedStationId === 'ALL'
            ? `Tổng Phụ Tải Lưới Các Trạm (vs Ngưỡng An Toàn 95% = ${safeLimitKw.toFixed(1)} kW)`
            : `Phụ Tải Lưới Trạm Đang Chọn (vs Ngưỡng An Toàn 95% = ${safeLimitKw.toFixed(1)} kW)`
        }
      />

      {/* Stations Detail Breakdown (Chủ có nhiều trạm hoặc Admin) */}
      {selectedStationId === 'ALL' && stationsDetail.length > 1 && (
        <div className="bg-panel border border-hairline p-4 rounded-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-steel-gray font-mono">
              Phân Phối Phụ Tải Từng Trạm Sạc Trong Phạm Vi ({stationsDetail.length} Trạm)
            </span>
            <span className="text-[11px] font-mono text-steel-gray">
              Ngưỡng an toàn = 95% công suất lưới định mức
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stationsDetail.map((st) => (
              <div
                key={st.station_id}
                onClick={() => setSelectedStationId(String(st.station_id))}
                className={`p-3 rounded border font-mono text-xs cursor-pointer transition-colors ${
                  st.is_over_limit
                    ? 'bg-critical-red/10 border-critical-red/50 hover:bg-critical-red/20'
                    : 'bg-obsidian border-hairline hover:border-electric-cyan/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-tech-white truncate max-w-[180px]">{st.station_name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      st.is_over_limit
                        ? 'bg-critical-red/20 text-critical-red border border-critical-red/40'
                        : 'bg-grid-green/20 text-grid-green border border-grid-green/40'
                    }`}
                  >
                    {st.is_over_limit ? 'QUÁ TẢI' : 'BÌNH THƯỜNG'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-steel-gray text-[11px]">
                  <span>Phụ tải live:</span>
                  <span className={`font-bold tabular-nums ${st.is_over_limit ? 'text-critical-red' : 'text-electric-cyan'}`}>
                    {st.active_power_kw} kW / {st.safe_limit_kw} kW
                  </span>
                </div>
                <div className="w-full h-1.5 bg-panel rounded overflow-hidden mt-1.5 border border-hairline">
                  <div
                    className={`h-full ${st.is_over_limit ? 'bg-critical-red' : 'bg-electric-cyan'}`}
                    style={{ width: `${Math.min(100, (st.active_power_kw / (st.safe_limit_kw || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 Metric Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricBox
          label="Tổng Hạ Tầng Trạm Sạc"
          value={totalStations}
          unit="Trạm"
          icon={Zap}
          color="tech-white"
          subtext={`Tổng công suất lưới cấp: ${totalGridKw.toFixed(0)} kW`}
        />
        <MetricBox
          label="Trụ Đang Cấp Nguồn (Active)"
          value={chargingCount}
          unit={`/ ${totalChargers} Trụ`}
          icon={BatteryCharging}
          color={chargingCount > 0 ? 'electric-cyan' : 'steel-gray'}
          subtext={
            activeKw > 0
              ? `Công suất tiêu thụ: ~${activeKw.toFixed(1)} kW`
              : 'Hiện không có phiên sạc nào hoạt động (0.0 kW)'
          }
        />
        <MetricBox
          label="Trụ Sẵn Sàng (Available)"
          value={availableCount}
          unit="Trụ trống"
          icon={CheckCircle2}
          color="grid-green"
          subtext="Sẵn sàng tiếp nhận xe mới"
        />
        <MetricBox
          label="Cảnh Báo Lỗi / Bảo Trì"
          value={faultedCount}
          unit="Cảnh báo"
          icon={AlertTriangle}
          color={faultedCount > 0 ? 'critical-red' : 'tech-white'}
          subtext={faultedCount > 0 ? 'Cần kỹ thuật viên kiểm tra' : 'Hệ thống vận hành an toàn'}
        />
      </div>

      {/* 24-Hour Load Chart & Live Chargers Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Load Curve Chart */}
        <div className="lg:col-span-2 bg-panel border border-hairline p-5 rounded-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-semibold text-tech-white">Đồ Thị Phụ Tải Lưới 24 Giờ (Power Load Profile)</h2>
                {activeKw > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-electric-cyan/20 text-electric-cyan border border-electric-cyan/40">
                    REALTIME +{activeKw.toFixed(1)} kW
                  </span>
                )}
              </div>
              <p className="text-xs text-steel-gray font-mono">
                {chartViewMode === 'EQUALIZER'
                  ? 'Mật độ cao theo từng phút (Equalizer 480 cột / 24h) — Cột xám thể hiện mốc chưa tới'
                  : 'Đo đếm công suất tiêu thụ thực tế theo 12 khung giờ TOU 2h (kW)'}
              </p>
            </div>

            {/* Toggle Switcher giữa 2 chế độ hiển thị */}
            <div className="flex items-center space-x-1 bg-obsidian p-0.5 rounded border border-hairline font-mono text-[11px] shrink-0">
              <button
                type="button"
                onClick={() => setChartViewMode('EQUALIZER')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-colors ${
                  chartViewMode === 'EQUALIZER'
                    ? 'bg-electric-cyan text-white font-bold shadow-sm'
                    : 'text-steel-gray hover:text-tech-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>EQUALIZER (PHÚT)</span>
              </button>
              <button
                type="button"
                onClick={() => setChartViewMode('TOU_2H')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-colors ${
                  chartViewMode === 'TOU_2H'
                    ? 'bg-panel border border-hairline text-white font-bold shadow-sm'
                    : 'text-steel-gray hover:text-tech-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>TOU 12 MỐC (2H)</span>
              </button>
            </div>
          </div>

          {/* Legend mô tả cho Equalizer */}
          {chartViewMode === 'EQUALIZER' && (
            <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono mb-3 text-steel-gray">
              <span className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-sm bg-electric-cyan mr-1.5" />
                Có tải sạc ({activeKw > 0 ? `${activeKw.toFixed(1)} kW live` : 'Đang hoạt động'})
              </span>
              <span className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-sm bg-teal-600 mr-1.5" />
                Không tải (0 kW)
              </span>
              <span className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-700 mr-1.5" />
                Chưa tới (Placeholder)
              </span>
              <span className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-900 border border-hairline mr-1.5" />
                Chưa có log quá khứ
              </span>
            </div>
          )}

          <div className="h-64 w-full">
            {chartViewMode === 'EQUALIZER' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={downsampledTimeline} barGap="-100%" barCategoryGap={0.5}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222F44" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#94A3B8"
                    fontSize={10}
                    fontFamily="monospace"
                    interval={59}
                    tickFormatter={(val) => val}
                  />
                  {/* Trục Y chính: Công suất thật (kW), domain tối thiểu 120kW hoặc theo max tải */}
                  <YAxis
                    yAxisId="power"
                    stroke="#94A3B8"
                    fontSize={10}
                    fontFamily="monospace"
                    unit=" kW"
                    domain={[0, yAxisMax]}
                  />
                  {/* Trục Y phụ (ẩn): Dành riêng cho layer vạch xám trang trí Placeholder (thang 0-100%) */}
                  <YAxis
                    yAxisId="decor"
                    hide={true}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      if (!data) return null;
                      return (
                        <div className="bg-[#151D2A] border border-[#222F44] p-2 text-xs font-mono rounded shadow">
                          <div className="text-slate-300 font-bold mb-1">{data.time}</div>
                          {data.hasRealData ? (
                            <div className="flex items-center space-x-1.5">
                              <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{
                                  backgroundColor:
                                    data.realPowerKw > 80 ? '#F59E0B' : data.realPowerKw > 0 ? '#0284C7' : '#0D9488',
                                }}
                              />
                              <span className="text-white">
                                {data.realPowerKw > 0 ? 'Phụ tải trung bình: ' : 'Trạng thái: '}
                                <strong className="text-white">{(data.realPowerKw ?? 0).toFixed(1)} kW</strong>
                                {data.realPowerKw === 0 && ' (Không tải)'}
                              </span>
                            </div>
                          ) : data.isFuture ? (
                            <div className="text-slate-400">Thời gian chưa tới (Vạch placeholder)</div>
                          ) : (
                            <div className="text-slate-500">Chưa ghi nhận log quá khứ</div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* Layer 1: Vạch xám trang trí cho Placeholder (chiều cao cố định nhỏ ~2.5% của biểu đồ) */}
                  <Bar
                    yAxisId="decor"
                    dataKey="placeholderHeight"
                    isAnimationActive={false}
                  >
                    {downsampledTimeline.map((entry, index) => {
                      const fill = entry.isFuture ? '#334155' : entry.isPastNoData ? '#151D2A' : 'transparent';
                      return <Cell key={`decor-${index}`} fill={fill} />;
                    })}
                  </Bar>
                  {/* Layer 2: Dữ liệu công suất thật (kW), minPointSize={2} giúp mốc 0kW vẫn thấy vạch mỏng xanh ngọc */}
                  <Bar
                    yAxisId="power"
                    dataKey="realPowerKw"
                    minPointSize={2}
                    isAnimationActive={false}
                  >
                    {downsampledTimeline.map((entry, index) => {
                      let fillColor = 'transparent';
                      if (entry.hasRealData) {
                        if (entry.realPowerKw > 80) fillColor = '#F59E0B';
                        else if (entry.realPowerKw > 0) fillColor = '#0284C7';
                        else fillColor = '#0D9488';
                      }
                      return <Cell key={`real-${index}`} fill={fillColor} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={loadProfile}>
                  <defs>
                    <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284C7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222F44" />
                  <XAxis dataKey="time" stroke="#94A3B8" fontSize={11} fontFamily="monospace" />
                  <YAxis stroke="#94A3B8" fontSize={11} fontFamily="monospace" unit=" kW" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#151D2A', borderColor: '#222F44', borderRadius: '2px' }}
                    labelStyle={{ color: '#F1F5F9', fontFamily: 'monospace' }}
                    itemStyle={{ color: '#0284C7', fontFamily: 'monospace' }}
                    formatter={(val, name, item) => [
                      `${val} kW (${item?.payload?.priceSlot || 'NORMAL'})`,
                      'Phụ tải thực tế',
                    ]}
                  />
                  <Area type="monotone" dataKey="loadKw" stroke="#0284C7" strokeWidth={2} fillOpacity={1} fill="url(#colorLoad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Live Bay Status */}
        <div className="bg-panel border border-hairline p-5 rounded-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-tech-white">Giám Sát Vị Trí Sạc (EVSE Bays)</h2>
            <span className="text-[11px] font-mono text-steel-gray">
              {chargingCount}/{totalChargers} Đang sạc
            </span>
          </div>
          <p className="text-xs text-steel-gray font-mono mb-4">Trạng thái rơ-le và súng sạc vật lý</p>

          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {chargers.length === 0 ? (
              <div className="text-xs text-steel-gray text-center py-8 font-mono">Chưa có trụ sạc nào được cấu hình</div>
            ) : (
              chargers.map((c) => (
                <div key={c.id} className="bg-obsidian border border-hairline p-2.5 rounded-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-tech-white font-mono">{c.code}</div>
                    <div className="text-[11px] text-steel-gray font-mono">{c.vendor} — {c.max_power_kw} kW</div>
                  </div>
                  <div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                        c.status === 'CHARGING'
                          ? 'bg-electric-cyan/20 text-electric-cyan border border-electric-cyan/40 animate-pulse'
                          : c.status === 'AVAILABLE'
                          ? 'bg-grid-green/20 text-grid-green border border-grid-green/40'
                          : 'bg-critical-red/20 text-critical-red border border-critical-red/40'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
