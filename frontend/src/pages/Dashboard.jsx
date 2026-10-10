import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BatteryCharging,
  AlertTriangle,
  Zap,
  CheckCircle2,
  Radio,
  Activity,
  BarChart3,
  Filter,
  RefreshCw,
  Clock,
  Layers,
  Inbox,
  AlertCircle,
} from 'lucide-react';
import api from '../services/api';
import { telemetryWs } from '../services/websocket';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import BusbarLoadIndicator from '../components/BusbarLoadIndicator';
import MetricBox from '../components/MetricBox';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export default function Dashboard() {
  const { user, role } = useAuth();
  const { isDark } = useTheme();

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
  const [refreshing, setRefreshing] = useState(false);
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
      setRefreshing(true);
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
      setRefreshing(false);
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
          const isOwned = msg.station_id && accessibleStations.some((st) => st.id === msg.station_id);
          if (!isOwned) return;

          if (selectedStationId !== 'ALL' && msg.station_id !== Number(selectedStationId)) {
            return;
          }
          fetchLiveMetricsOnly();
        } else {
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
    const step = 3;
    for (let i = 0; i < timelineData.length; i += step) {
      const chunk = timelineData.slice(i, i + step);
      const maxPower = Math.max(...chunk.map((item) => Number(item.powerKw || 0)));
      const hasRealData = chunk.some((item) => !item.isPlaceholder);
      const isFuture = chunk.every((item) => item.isPlaceholder && !item.noData);
      const isPastNoData = chunk.every((item) => item.isPlaceholder && item.noData);

      result.push({
        time: chunk[0].time,
        realPowerKw: hasRealData ? maxPower : null,
        placeholderHeight: isFuture ? 2.5 : isPastNoData ? 1.2 : null,
        hasRealData,
        isFuture,
        isPastNoData,
        isPlaceholder: !hasRealData,
      });
    }
    return result;
  }, [timelineData]);

  // Cấu hình domain trục Y cố định hợp lý theo công suất tối đa của trạm/hệ thống
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

  // Màu sắc Recharts theo Theme
  const chartColors = useMemo(() => {
    return {
      grid: isDark ? '#222F44' : '#E2E8F0',
      axisText: isDark ? '#94A3B8' : '#64748B',
      tooltipBg: isDark ? '#151D2A' : '#FFFFFF',
      tooltipBorder: isDark ? '#222F44' : '#E2E8F0',
      tooltipText: isDark ? '#F1F5F9' : '#0F172A',
    };
  }, [isDark]);

  return (
    <div className="space-y-6">
      
      {/* Top Headline & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Tổng Quan Vận Hành Mạng Lưới Trạm Sạc
            </h1>
            <Badge variant="primary" dot pulse size="sm">
              Live Telemetry
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Giám sát thời gian thực — Phụ tải nguồn lưới & trạng thái rơ-le công suất
            {lastUpdated && ` (Cập nhật: ${lastUpdated.toLocaleTimeString('vi-VN')})`}
          </p>
        </div>

        {/* Scope Selector & Refresh */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center space-x-2 bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-sm text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400 font-medium">Phạm vi:</span>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-transparent border-none text-slate-900 dark:text-white text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">
                {role === 'ADMIN'
                  ? `Tất cả trạm (${accessibleStations.length} trạm)`
                  : `Tất cả trạm của tôi (${accessibleStations.length} trạm)`}
              </option>
              {accessibleStations.map((st) => (
                <option key={st.id} value={st.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  [ST-{st.id}] {st.name} ({st.total_grid_capacity_kw || 0} kW)
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            loading={refreshing}
            onClick={fetchDashboardData}
            title="Làm mới toàn bộ số liệu"
            className="rounded-xl"
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* Overload Alert Warning */}
      {hasOverloadStation && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 p-4 rounded-2xl flex items-center space-x-3 text-rose-800 dark:text-rose-300 text-xs sm:text-sm shadow-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <strong className="font-bold">[CẢNH BÁO QUÁ TẢI LƯỚI ĐIỆN]</strong> Phát hiện trạm sạc đang vượt ngưỡng an toàn 95% công suất lưới! Thuật toán điều phối Smart Charging / Fallback đang tự động can thiệp giảm dòng sạc để bảo vệ trạm.
          </div>
        </div>
      )}

      {/* Empty State Banner if no stations owned */}
      {emptyState && (
        <EmptyState
          icon={Inbox}
          title="Bạn chưa sở hữu trạm sạc nào trong hệ thống"
          description="Hiện tại tài khoản chưa được phân quyền trạm sạc nào. Hãy liên hệ Quản trị viên hệ thống để được gán quyền sở hữu trạm, hoặc chuyển sang vai trò demo khác để kiểm thử."
        />
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
        <Card padding="p-5" className="shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Phân Phối Phụ Tải Từng Trạm Sạc Trong Mạng Lưới ({stationsDetail.length} Trạm)
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Ngưỡng an toàn = 95% công suất lưới định mức
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {stationsDetail.map((st) => (
              <div
                key={st.station_id}
                onClick={() => setSelectedStationId(String(st.station_id))}
                className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all duration-150 hover:-translate-y-0.5 ${
                  st.is_over_limit
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800'
                    : 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-sky-500'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-900 dark:text-white truncate max-w-[180px]">
                    {st.station_name}
                  </span>
                  <Badge variant={st.is_over_limit ? 'danger' : 'success'} size="sm">
                    {st.is_over_limit ? 'Quá tải' : 'Bình thường'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
                  <span>Phụ tải live:</span>
                  <span className={`font-mono font-bold ${st.is_over_limit ? 'text-rose-600 dark:text-rose-400' : 'text-sky-600 dark:text-sky-400'}`}>
                    {st.active_power_kw} kW / {st.safe_limit_kw} kW
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${st.is_over_limit ? 'bg-rose-500' : 'bg-sky-500'}`}
                    style={{ width: `${Math.min(100, (st.active_power_kw / (st.safe_limit_kw || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 4 Metric Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricBox
          label="Tổng Hạ Tầng Trạm Sạc"
          value={totalStations}
          unit="Trạm"
          icon={Zap}
          color="tech-white"
          subtext={`Tổng công suất lưới: ${totalGridKw.toFixed(0)} kW`}
        />
        <MetricBox
          label="Trụ Đang Cấp Nguồn"
          value={chargingCount}
          unit={`/ ${totalChargers} Trụ`}
          icon={BatteryCharging}
          color={chargingCount > 0 ? 'electric-cyan' : 'tech-white'}
          subtext={
            activeKw > 0
              ? `Công suất live: ~${activeKw.toFixed(1)} kW`
              : 'Hiện không có phiên sạc nào'
          }
          trend={chargingCount > 0 ? 'Đang sạc' : 'Chờ'}
        />
        <MetricBox
          label="Trụ Sẵn Sàng (Trống)"
          value={availableCount}
          unit="Trụ trống"
          icon={CheckCircle2}
          color="grid-green"
          subtext="Sẵn sàng tiếp nhận xe mới"
          trend="Khả dụng"
        />
        <MetricBox
          label="Cảnh Báo Lỗi / Bảo Trì"
          value={faultedCount}
          unit="Cảnh báo"
          icon={AlertTriangle}
          color={faultedCount > 0 ? 'critical-red' : 'grid-green'}
          subtext={faultedCount > 0 ? 'Cần kỹ thuật viên kiểm tra' : 'Hệ thống vận hành an toàn'}
          trend={faultedCount > 0 ? 'Cảnh báo' : 'Ổn định'}
        />
      </div>

      {/* 24-Hour Load Chart & Live Chargers Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Load Curve Chart */}
        <Card padding="p-5" className="lg:col-span-2 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Đồ Thị Phụ Tải Lưới 24 Giờ
                  </h2>
                  {activeKw > 0 && (
                    <Badge variant="primary" size="sm">
                      Realtime +{activeKw.toFixed(1)} kW
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {chartViewMode === 'EQUALIZER'
                    ? 'Mật độ cao theo từng phút (Equalizer 480 cột / 24h)'
                    : 'Đo đếm công suất tiêu thụ thực tế theo 12 khung giờ TOU 2h (kW)'}
                </p>
              </div>

              {/* Toggle Switcher giữa 2 chế độ hiển thị */}
              <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium shrink-0">
                <button
                  type="button"
                  onClick={() => setChartViewMode('EQUALIZER')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    chartViewMode === 'EQUALIZER'
                      ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Equalizer (Phút)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChartViewMode('TOU_2H')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    chartViewMode === 'TOU_2H'
                      ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>TOU 12 Mốc (2h)</span>
                </button>
              </div>
            </div>

            {/* Legend mô tả cho Equalizer */}
            {chartViewMode === 'EQUALIZER' && (
              <div className="flex flex-wrap items-center gap-4 text-xs mb-3 text-slate-500 dark:text-slate-400">
                <span className="flex items-center">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 mr-1.5" />
                  Có tải sạc ({activeKw > 0 ? `${activeKw.toFixed(1)} kW live` : 'Đang hoạt động'})
                </span>
                <span className="flex items-center">
                  <span className="w-2.5 h-2.5 rounded-sm bg-teal-500 mr-1.5" />
                  Không tải (0 kW)
                </span>
                <span className="flex items-center">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-700 mr-1.5" />
                  Chưa tới (Placeholder)
                </span>
              </div>
            )}
          </div>

          <div className="h-64 sm:h-72 w-full mt-2">
            {chartViewMode === 'EQUALIZER' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={downsampledTimeline} barGap="-100%" barCategoryGap={0.5}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke={chartColors.axisText}
                    fontSize={11}
                    fontFamily="'JetBrains Mono', monospace"
                    interval={59}
                    tickFormatter={(val) => val}
                  />
                  <YAxis
                    yAxisId="power"
                    stroke={chartColors.axisText}
                    fontSize={11}
                    fontFamily="'JetBrains Mono', monospace"
                    unit=" kW"
                    domain={[0, yAxisMax]}
                  />
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
                        <div className="p-3 text-xs rounded-xl shadow-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                          <div className="font-bold mb-1 font-mono">{data.time}</div>
                          {data.hasRealData ? (
                            <div className="flex items-center space-x-2">
                              <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{
                                  backgroundColor:
                                    data.realPowerKw > 80 ? '#F59E0B' : data.realPowerKw > 0 ? '#0284C7' : '#0D9488',
                                }}
                              />
                              <span>
                                {data.realPowerKw > 0 ? 'Phụ tải: ' : 'Trạng thái: '}
                                <strong className="font-mono font-bold">{(data.realPowerKw ?? 0).toFixed(1)} kW</strong>
                                {data.realPowerKw === 0 && ' (Không tải)'}
                              </span>
                            </div>
                          ) : data.isFuture ? (
                            <div className="text-slate-400">Thời gian chưa tới</div>
                          ) : (
                            <div className="text-slate-400">Chưa ghi nhận log quá khứ</div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar
                    yAxisId="decor"
                    dataKey="placeholderHeight"
                    isAnimationActive={false}
                  >
                    {downsampledTimeline.map((entry, index) => {
                      const fill = entry.isFuture ? (isDark ? '#334155' : '#E2E8F0') : entry.isPastNoData ? (isDark ? '#151D2A' : '#F1F5F9') : 'transparent';
                      return <Cell key={`decor-${index}`} fill={fill} />;
                    })}
                  </Bar>
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
                    <linearGradient id="colorLoadModern" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284C7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="time" stroke={chartColors.axisText} fontSize={11} fontFamily="'JetBrains Mono', monospace" />
                  <YAxis stroke={chartColors.axisText} fontSize={11} fontFamily="'JetBrains Mono', monospace" unit=" kW" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartColors.tooltipBg,
                      borderColor: chartColors.tooltipBorder,
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                    }}
                    labelStyle={{ color: chartColors.tooltipText, fontWeight: 'bold' }}
                    itemStyle={{ color: '#0284C7' }}
                    formatter={(val, name, item) => [
                      `${val} kW (${item?.payload?.priceSlot || 'NORMAL'})`,
                      'Phụ tải thực tế',
                    ]}
                  />
                  <Area type="monotone" dataKey="loadKw" stroke="#0284C7" strokeWidth={2.5} fillOpacity={1} fill="url(#colorLoadModern)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Live Bay Status (EVSE Bays) */}
        <Card padding="p-5" className="shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Giám Sát Vị Trí Sạc
              </h2>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {chargingCount}/{totalChargers} Đang sạc
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Trạng thái rơ-le và súng sạc vật lý tại trạm
            </p>

            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {chargers.length === 0 ? (
                <EmptyState
                  icon={BatteryCharging}
                  title="Chưa có trụ sạc nào"
                  description="Hiện tại chưa có trụ sạc nào được cấu hình trong phạm vi trạm này."
                  className="py-6"
                />
              ) : (
                chargers.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between transition-all hover:bg-slate-100 dark:hover:bg-slate-800/80"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white font-mono flex items-center space-x-1.5">
                        <Zap className="w-3.5 h-3.5 text-sky-500" />
                        <span>{c.code}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {c.vendor} — <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{c.max_power_kw} kW</span>
                      </div>
                    </div>
                    <div>
                      <Badge
                        variant={
                          c.status === 'CHARGING'
                            ? 'primary'
                            : c.status === 'AVAILABLE'
                            ? 'success'
                            : 'danger'
                        }
                        dot
                        pulse={c.status === 'CHARGING'}
                        size="sm"
                      >
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}

