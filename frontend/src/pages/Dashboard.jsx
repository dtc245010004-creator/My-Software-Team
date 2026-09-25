import React, { useState, useEffect } from 'react';
import { BatteryCharging, AlertTriangle, Zap, DollarSign, Activity, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import BusbarLoadIndicator from '../components/BusbarLoadIndicator';
import MetricBox from '../components/MetricBox';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const [stations, setStations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [stRes, sessRes] = await Promise.all([
        api.get('/stations'),
        api.get('/sessions/me').catch(() => ({ data: [] })),
      ]);

      const stationsData = stRes.data || [];
      setStations(stationsData);
      setSessions(sessRes.data || []);

      // Lấy danh sách trụ sạc từ các trạm
      const allChargers = [];
      stationsData.forEach((st) => {
        if (st.charging_points) {
          allChargers.push(...st.charging_points);
        }
      });
      setChargers(allChargers);
    } catch (err) {
      console.error('Lỗi nạp dữ liệu dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  // Tính toán số liệu thống kê kỹ thuật
  const totalStations = stations.length;
  const totalChargers = chargers.length;
  const chargingCount = chargers.filter((c) => c.status === 'CHARGING').length;
  const availableCount = chargers.filter((c) => c.status === 'AVAILABLE').length;
  const faultedCount = chargers.filter((c) => c.status === 'FAULTED' || c.status === 'UNAVAILABLE').length;

  const totalGridKw = stations.reduce((acc, st) => acc + (st.total_grid_capacity_kw || 0), 0);
  const activeKw = chargers
    .filter((c) => c.status === 'CHARGING')
    .reduce((acc, c) => acc + (c.max_power_kw || 30.0), 0);

  // Dữ liệu mô phỏng phụ tải 24 giờ
  const mockLoadProfile = [
    { time: '00:00', loadKw: 18, priceSlot: 'OFFPEAK' },
    { time: '03:00', loadKw: 12, priceSlot: 'OFFPEAK' },
    { time: '06:00', loadKw: 28, priceSlot: 'NORMAL' },
    { time: '09:00', loadKw: 65, priceSlot: 'PEAK' },
    { time: '11:00', loadKw: 82, priceSlot: 'PEAK' },
    { time: '13:00', loadKw: 54, priceSlot: 'NORMAL' },
    { time: '15:00', loadKw: 60, priceSlot: 'NORMAL' },
    { time: '18:00', loadKw: 95, priceSlot: 'PEAK' },
    { time: '20:00', loadKw: 78, priceSlot: 'PEAK' },
    { time: '22:00', loadKw: 35, priceSlot: 'OFFPEAK' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Technical Headline */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-tech-white">Tổng Quan Vận Hành Mạng Lưới Trạm Sạc</h1>
          <p className="text-xs text-steel-gray mt-0.5 font-mono">
            GIÁM SÁT THỜI GIAN THỰC — PHỤ TẢI NGUỒN LƯỚI & TRẠNG THÁI RƠ-LE CÔNG SUẤT
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="text-xs px-3 py-1.5 rounded bg-panel border border-hairline hover:bg-hairline text-steel-gray hover:text-tech-white transition-colors font-mono"
        >
          LÀM MỚI DỮ LIỆU
        </button>
      </div>

      {/* Grid Busbar Main Indicator */}
      <BusbarLoadIndicator
        currentKw={activeKw}
        limitKw={totalGridKw * 0.95 || 100}
        label="Tổng Phụ Tải Lưới Toàn Hệ Thống (Total Grid Load vs 95% Safety Limit)"
      />

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
          color="electric-cyan"
          subtext={`Công suất tiêu thụ: ~${activeKw.toFixed(1)} kW`}
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-tech-white">Đồ Thị Phụ Tải Lưới 24 Giờ (Power Load Profile)</h2>
              <p className="text-xs text-steel-gray font-mono">Đo đếm công suất tiêu thụ trung bình theo khung giờ (kW)</p>
            </div>
            <div className="flex items-center space-x-3 text-xs font-mono">
              <span className="flex items-center text-electric-cyan">
                <span className="w-2 h-2 rounded-full bg-electric-cyan mr-1.5" />
                Công suất kW
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockLoadProfile}>
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
                />
                <Area type="monotone" dataKey="loadKw" stroke="#0284C7" strokeWidth={2} fillOpacity={1} fill="url(#colorLoad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Bay Status */}
        <div className="bg-panel border border-hairline p-5 rounded-sm">
          <h2 className="text-sm font-semibold text-tech-white mb-1">Giám Sát Vị Trí Sạc (EVSE Bays)</h2>
          <p className="text-xs text-steel-gray font-mono mb-4">Trạng thái rơ-le và súng sạc vật lý</p>

          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {chargers.length === 0 ? (
              <div className="text-xs text-steel-gray text-center py-8 font-mono">Chưa có trụ sạc nào được cấu hình</div>
            ) : (
              chargers.slice(0, 6).map((c) => (
                <div key={c.id} className="bg-obsidian border border-hairline p-2.5 rounded-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-tech-white font-mono">{c.code}</div>
                    <div className="text-[11px] text-steel-gray font-mono">{c.vendor} — {c.max_power_kw} kW</div>
                  </div>
                  <div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                        c.status === 'CHARGING'
                          ? 'bg-electric-cyan/20 text-electric-cyan border border-electric-cyan/40'
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
