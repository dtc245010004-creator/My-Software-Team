import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Zap,
  Thermometer,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Send,
  Radio,
  CheckCircle2,
  DollarSign,
  BarChart2,
} from 'lucide-react';
import api from '../services/api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

export default function AIAdvisor() {
  const [activeTab, setActiveTab] = useState('SMART_CHARGING');
  const [stations, setStations] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState('');
  const [selectedChargerId, setSelectedChargerId] = useState('');

  // Dữ liệu kết quả AI
  const [smartChargingData, setSmartChargingData] = useState(null);
  const [maintenanceData, setMaintenanceData] = useState(null);
  const [pricingData, setPricingData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Chat NLP
  const [question, setQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: 'Xin chào! Tôi là Trợ lý AI Cố vấn Vận hành Trạm Sạc. Tôi được kết nối trực tiếp với cơ sở dữ liệu để giải đáp về công suất lưới, doanh thu, phiên sạc và cảnh báo bảo trì.',
      source: 'SYSTEM',
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetchInfrastructure();
  }, []);

  const fetchInfrastructure = async () => {
    try {
      const stRes = await api.get('/stations');
      const stData = stRes.data || [];
      setStations(stData);
      if (stData.length > 0) {
        setSelectedStationId(String(stData[0].id));
        const allChargers = [];
        stData.forEach((st) => {
          if (st.charging_points) allChargers.push(...st.charging_points);
        });
        setChargers(allChargers);
        if (allChargers.length > 0) {
          setSelectedChargerId(String(allChargers[0].id));
        }
      }
    } catch (e) {
      console.error('Lỗi tải dữ liệu hạ tầng:', e);
    }
  };

  // 1. Phân tích Smart Charging
  const handleAnalyzeSmartCharging = async () => {
    if (!selectedStationId) return;
    try {
      setLoading(true);
      const res = await api.post(`/ai/smart-charging/${selectedStationId}`);
      setSmartChargingData(res.data);
    } catch (err) {
      alert('Lỗi phân tích smart charging: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // 2. Phân tích Predictive Maintenance
  const handleAnalyzeMaintenance = async () => {
    if (!selectedChargerId) return;
    try {
      setLoading(true);
      const res = await api.post(`/ai/predictive-maintenance/${selectedChargerId}`);
      setMaintenanceData(res.data);
    } catch (err) {
      alert('Lỗi phân tích bảo trì: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // 3. Phân tích Pricing Advice
  const handleAnalyzePricing = async () => {
    if (!selectedStationId) return;
    try {
      setLoading(true);
      // Giả lập tỉ lệ lấp đầy giờ cao điểm 85% và thấp điểm 22% để kích hoạt khuyến nghị dịch chuyển tải
      const res = await api.post(
        `/ai/pricing-advice/${selectedStationId}?peak_occupancy=85.0&offpeak_occupancy=22.0`
      );
      setPricingData(res.data);
    } catch (err) {
      alert('Lỗi tư vấn giá: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // 4. Hỏi đáp NLP
  const handleSendQuestion = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    const userQ = question;
    setQuestion('');
    setChatMessages((prev) => [...prev, { role: 'user', text: userQ }]);

    try {
      setChatLoading(true);
      const res = await api.post('/ai/ask', { question: userQ });
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.data.answer,
          source: res.data.source,
          is_fallback: res.data.is_fallback,
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Xin lỗi, không thể kết nối tới dịch vụ AI vào lúc này.',
          source: 'ERROR',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Dữ liệu mô phỏng cho biểu đồ 24h TOU
  const touChartData = [
    { hour: '00:00', occupancy: 18, slot: 'THẤP ĐIỂM (-10%)', color: '#10B981' },
    { hour: '02:00', occupancy: 15, slot: 'THẤP ĐIỂM (-10%)', color: '#10B981' },
    { hour: '04:00', occupancy: 22, slot: 'THẤP ĐIỂM (-10%)', color: '#10B981' },
    { hour: '06:00', occupancy: 35, slot: 'BÌNH THƯỜNG', color: '#94A3B8' },
    { hour: '08:00', occupancy: 65, slot: 'BÌNH THƯỜNG', color: '#94A3B8' },
    { hour: '10:00', occupancy: 88, slot: 'CAO ĐIỂM (+15%)', color: '#F59E0B' },
    { hour: '12:00', occupancy: 55, slot: 'BÌNH THƯỜNG', color: '#94A3B8' },
    { hour: '14:00', occupancy: 60, slot: 'BÌNH THƯỜNG', color: '#94A3B8' },
    { hour: '16:00', occupancy: 70, slot: 'BÌNH THƯỜNG', color: '#94A3B8' },
    { hour: '18:00', occupancy: 92, slot: 'CAO ĐIỂM (+15%)', color: '#F59E0B' },
    { hour: '20:00', occupancy: 82, slot: 'CAO ĐIỂM (+15%)', color: '#F59E0B' },
    { hour: '22:00', occupancy: 30, slot: 'THẤP ĐIỂM (-10%)', color: '#10B981' },
  ];

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-tech-white">Trung Tâm Cố Vấn Năng Lượng & Bảo Trì AI</h1>
          <p className="text-xs text-steel-gray mt-0.5 font-mono">
            KIẾN TRÚC DUAL-LOOP — SLOW LOOP (GEMINI AI) &amp; FAST LOOP (HEURISTIC FALLBACK)
          </p>
        </div>
      </div>

      {/* Domain Navigation Tabs */}
      <div className="flex border-b border-hairline space-x-1 font-mono text-xs">
        {[
          { key: 'SMART_CHARGING', label: 'Điều Phối Tải Lưới (Smart Charging)', icon: Zap },
          { key: 'PREDICTIVE_MAINTENANCE', label: 'Bảo Trì Dự Đoán (Thermal Matrix)', icon: Thermometer },
          { key: 'PRICING_ADVISOR', label: 'Tối Ưu Biểu Giá TOU (Load Profile)', icon: DollarSign },
          { key: 'NLP_CHAT', label: 'Trợ Lý Vận Hành (Grounding Q&A)', icon: Cpu },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 font-semibold transition-all ${
                isActive
                  ? 'border-electric-cyan text-electric-cyan bg-panel'
                  : 'border-transparent text-steel-gray hover:text-tech-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: SMART CHARGING BUSBAR ALLOCATION */}
      {activeTab === 'SMART_CHARGING' && (
        <div className="space-y-6">
          <div className="bg-panel border border-hairline p-4 rounded-sm flex items-center justify-between">
            <div className="flex items-center space-x-3 font-mono text-xs">
              <span className="text-steel-gray">CHỌN TRẠM SẠC ĐIỀU PHỐI:</span>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="bg-obsidian border border-hairline p-1.5 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
              >
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.total_grid_capacity_kw} kW)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAnalyzeSmartCharging}
              disabled={loading}
              className="px-4 py-2 rounded bg-electric-cyan hover:bg-electric-cyan-hover disabled:opacity-50 text-white font-bold font-mono text-xs"
            >
              {loading ? 'ĐANG PHÂN TÍCH...' : 'CHẠY ĐIỀU PHỐI TẢI (AI / HEURISTIC)'}
            </button>
          </div>

          {smartChargingData ? (
            <div className="space-y-6">
              {/* Metadata Badge */}
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="text-steel-gray">NGUỒN TÍNH TOÁN:</span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      smartChargingData.source === 'GEMINI_AI'
                        ? 'bg-purple-900/30 text-purple-400 border border-purple-800'
                        : 'bg-electric-cyan/20 text-electric-cyan border border-electric-cyan/40'
                    }`}
                  >
                    {smartChargingData.source} {smartChargingData.is_fallback ? '(FALLBACK ACTIVE)' : ''}
                  </span>
                </div>
                <div className="text-steel-gray">
                  Trần an toàn: <span className="text-tech-white font-bold">{smartChargingData.grid_limit_kw} kW</span>
                </div>
              </div>

              {/* Power Busbar Visualization (Thanh cái nguồn điện) */}
              <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-steel-gray font-mono">
                    SƠ ĐỒ PHÂN BỔ THANH CÁI NGUỒN LƯỚI (GRID BUSBAR ALLOCATION)
                  </h3>
                  <div className="font-mono text-xs text-steel-gray">
                    Đã phân bổ:{' '}
                    <span className="font-bold text-electric-cyan">
                      {smartChargingData.total_allocated_kw} kW
                    </span>{' '}
                    / Yêu cầu: {smartChargingData.total_requested_kw} kW
                  </div>
                </div>

                {/* The Busbar Bar */}
                <div className="w-full h-8 bg-obsidian border border-hairline rounded-sm flex overflow-hidden p-1 relative">
                  {smartChargingData.allocations.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center text-[11px] text-steel-gray font-mono">
                      Không có xe cắm sạc — Thanh cái ở trạng thái dự phòng 100%
                    </div>
                  ) : (
                    smartChargingData.allocations.map((item, idx) => {
                      const sharePct = (item.allocated_power_kw / smartChargingData.grid_limit_kw) * 100;
                      const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-cyan-600'];
                      const col = colors[idx % colors.length];

                      return (
                        <div
                          key={item.connector_id}
                          className={`${col} h-full border-r border-obsidian transition-all duration-300 flex items-center justify-center text-[10px] font-mono text-white font-bold truncate px-1`}
                          style={{ width: `${sharePct}%` }}
                          title={`Cổng #${item.connector_id}: ${item.allocated_power_kw} kW (SoC: ${item.soc}%)`}
                        >
                          Cổng #{item.connector_id} ({item.allocated_power_kw}kW)
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Recommendations */}
                <div className="bg-obsidian border border-hairline p-3 rounded text-xs font-mono space-y-1">
                  <span className="text-steel-gray font-bold block">KHUYẾN NGHỊ ĐIỀU TIẾT:</span>
                  {(smartChargingData.recommendations || []).map((rec, i) => (
                    <div key={i} className="text-tech-white">
                      • {rec}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-panel border border-hairline p-12 text-center text-xs text-steel-gray font-mono">
              Bấm nút "Chạy điều phối tải" để xem sơ đồ phân bổ công suất thanh cái cho trạm được chọn.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PREDICTIVE MAINTENANCE THERMAL STRIP */}
      {activeTab === 'PREDICTIVE_MAINTENANCE' && (
        <div className="space-y-6">
          <div className="bg-panel border border-hairline p-4 rounded-sm flex items-center justify-between">
            <div className="flex items-center space-x-3 font-mono text-xs">
              <span className="text-steel-gray">CHỌN TRỤ SẠC CHẨN ĐOÁN:</span>
              <select
                value={selectedChargerId}
                onChange={(e) => setSelectedChargerId(e.target.value)}
                className="bg-obsidian border border-hairline p-1.5 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
              >
                {chargers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} ({c.vendor} — {c.max_power_kw} kW)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAnalyzeMaintenance}
              disabled={loading}
              className="px-4 py-2 rounded bg-electric-cyan hover:bg-electric-cyan-hover disabled:opacity-50 text-white font-bold font-mono text-xs"
            >
              {loading ? 'ĐANG CHẨN ĐOÁN...' : 'CHẨN ĐOÁN NHIỆT & SỨC KHỎE'}
            </button>
          </div>

          {maintenanceData ? (
            <div className="space-y-6">
              {/* Metric Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
                <div className="bg-panel border border-hairline p-4 rounded-sm">
                  <div className="text-xs text-steel-gray mb-1">MỨC ĐỘ RỦI RO (RISK LEVEL)</div>
                  <div
                    className={`text-2xl font-bold ${
                      maintenanceData.risk_level === 'CRITICAL'
                        ? 'text-critical-red animate-pulse'
                        : maintenanceData.risk_level === 'HIGH'
                        ? 'text-critical-red'
                        : maintenanceData.risk_level === 'MEDIUM'
                        ? 'text-caution-amber'
                        : 'text-grid-green'
                    }`}
                  >
                    {maintenanceData.risk_level}
                  </div>
                  <div className="text-[10px] text-steel-gray mt-1">Đánh giá theo ngưỡng nhiệt &amp; sụt áp</div>
                </div>

                <div className="bg-panel border border-hairline p-4 rounded-sm">
                  <div className="text-xs text-steel-gray mb-1">ĐIỂM SỨC KHỎE LINH KIỆN</div>
                  <div className="text-2xl font-bold text-tech-white tabular-nums">
                    {maintenanceData.health_score} <span className="text-xs text-steel-gray font-normal">/ 100</span>
                  </div>
                  <div className="text-[10px] text-steel-gray mt-1">Khấu trừ theo hàm phạt liên tục</div>
                </div>

                <div className="bg-panel border border-hairline p-4 rounded-sm">
                  <div className="text-xs text-steel-gray mb-1">NHIỆT ĐỘ TIẾP ĐIỂM ĐỈNH</div>
                  <div className="text-2xl font-bold text-caution-amber tabular-nums">
                    {maintenanceData.max_temperature} <span className="text-xs text-steel-gray font-normal">°C</span>
                  </div>
                  <div className="text-[10px] text-steel-gray mt-1">
                    Trung bình: {maintenanceData.avg_temperature} °C
                  </div>
                </div>

                <div className="bg-panel border border-hairline p-4 rounded-sm">
                  <div className="text-xs text-steel-gray mb-1">XU HƯỚNG NHIỆT ĐỘ</div>
                  <div className="text-2xl font-bold text-tech-white flex items-center space-x-1">
                    {maintenanceData.thermal_trend === 'increasing' ? (
                      <>
                        <TrendingUp className="w-5 h-5 text-critical-red" />
                        <span className="text-critical-red">TĂNG DẦN</span>
                      </>
                    ) : maintenanceData.thermal_trend === 'decreasing' ? (
                      <>
                        <TrendingDown className="w-5 h-5 text-grid-green" />
                        <span className="text-grid-green">GIẢM DẦN</span>
                      </>
                    ) : (
                      <>
                        <Minus className="w-5 h-5 text-steel-gray" />
                        <span className="text-steel-gray">ỔN ĐỊNH</span>
                      </>
                    )}
                  </div>
                  <div className="text-[10px] text-steel-gray mt-1">So sánh 3 phiên gần nhất vs trước</div>
                </div>
              </div>

              {/* Thermal Strip Component (Thước đo nhiệt phân tầng 4 dải) */}
              <div className="bg-panel border border-hairline p-5 rounded-sm space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-steel-gray">
                    THƯỚC ĐO DẢI NHIỆT ĐỘ TIẾP XÚC CÁP SẠC (THERMAL HEAT STRIP)
                  </h3>
                  <span className="text-xs text-steel-gray">
                    Hiện hành:{' '}
                    <span className="text-caution-amber font-bold">{maintenanceData.max_temperature}°C</span>
                  </span>
                </div>

                {/* 4 Heat Zones Bar */}
                <div className="relative pt-6">
                  {/* Kim chỉ thị nhiệt độ */}
                  <div
                    className="absolute top-0 transform -translate-x-1/2 flex flex-col items-center z-10 transition-all duration-300"
                    style={{
                      left: `${Math.min(100, Math.max(0, ((maintenanceData.max_temperature - 30) / 70) * 100))}%`,
                    }}
                  >
                    <span className="text-[10px] font-bold text-tech-white bg-obsidian border border-hairline px-1.5 py-0.5 rounded">
                      {maintenanceData.max_temperature}°C
                    </span>
                    <div className="w-0.5 h-2 bg-tech-white" />
                  </div>

                  <div className="w-full h-4 rounded-sm overflow-hidden flex border border-hairline">
                    <div className="w-[21%] bg-blue-600 h-full" title="< 45°C: Vùng mát lý tưởng" />
                    <div className="w-[29%] bg-emerald-600 h-full" title="45-65°C: Vùng hoạt động bình thường" />
                    <div className="w-[14%] bg-amber-500 h-full" title="65-75°C: Vùng cảnh báo ấm" />
                    <div className="w-[36%] bg-red-600 h-full" title="> 75°C: Vùng nguy hiểm ngắt khẩn cấp" />
                  </div>

                  <div className="flex justify-between text-[10px] text-steel-gray mt-1">
                    <span>30°C (Mát)</span>
                    <span>45°C</span>
                    <span>65°C</span>
                    <span>75°C (Ngưỡng ngắt)</span>
                    <span>100°C</span>
                  </div>
                </div>

                {/* Action recommendations */}
                <div className="bg-obsidian border border-hairline p-3 rounded text-xs space-y-1 mt-4">
                  <span className="text-steel-gray font-bold block">HÀNH ĐỘNG KỸ THUẬT ĐỀ XUẤT:</span>
                  <p className="text-tech-white">• {maintenanceData.recommended_action}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-panel border border-hairline p-12 text-center text-xs text-steel-gray font-mono">
              Bấm nút "Chẩn đoán nhiệt &amp; sức khỏe" để kiểm tra tình trạng cáp và rơ-le trụ sạc.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DYNAMIC PRICING ADVISOR */}
      {activeTab === 'PRICING_ADVISOR' && (
        <div className="space-y-6">
          <div className="bg-panel border border-hairline p-4 rounded-sm flex items-center justify-between">
            <div className="flex items-center space-x-3 font-mono text-xs">
              <span className="text-steel-gray">CHỌN TRẠM CẦN TƯ VẤN BIỂU GIÁ:</span>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="bg-obsidian border border-hairline p-1.5 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
              >
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAnalyzePricing}
              disabled={loading}
              className="px-4 py-2 rounded bg-electric-cyan hover:bg-electric-cyan-hover disabled:opacity-50 text-white font-bold font-mono text-xs"
            >
              {loading ? 'ĐANG TÍNH TOÁN...' : 'PHÂN TÍCH TỶ LỆ LẤP ĐẦY & TỐI ƯU GIÁ'}
            </button>
          </div>

          {pricingData ? (
            <div className="space-y-6">
              {/* 24-Hour TOU Histogram */}
              <div className="bg-panel border border-hairline p-5 rounded-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-steel-gray font-mono">
                      PHÂN BỔ TỶ LỆ LẤP ĐẦY THEO KHUNG GIỜ TOU (24-HOUR OCCUPANCY PROFILE)
                    </h3>
                    <p className="text-xs text-steel-gray font-mono">
                      Cao điểm:{' '}
                      <span className="text-caution-amber font-bold">{pricingData.occupancy_peak_pct}%</span> — Thấp
                      điểm:{' '}
                      <span className="text-grid-green font-bold">{pricingData.occupancy_offpeak_pct}%</span>
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 text-[11px] font-mono">
                    <span className="flex items-center text-caution-amber">
                      <span className="w-2 h-2 rounded bg-amber-500 mr-1" /> Cao điểm (+15%)
                    </span>
                    <span className="flex items-center text-grid-green">
                      <span className="w-2 h-2 rounded bg-emerald-500 mr-1" /> Thấp điểm (-10%)
                    </span>
                  </div>
                </div>

                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={touChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222F44" />
                      <XAxis dataKey="hour" stroke="#94A3B8" fontSize={11} fontFamily="monospace" />
                      <YAxis stroke="#94A3B8" fontSize={11} fontFamily="monospace" unit=" %" domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#151D2A', borderColor: '#222F44', borderRadius: '2px' }}
                        labelStyle={{ color: '#F1F5F9', fontFamily: 'monospace' }}
                      />
                      <Bar dataKey="occupancy" radius={[2, 2, 0, 0]}>
                        {touChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Price adjustments table */}
              <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4 font-mono text-xs">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-steel-gray">
                  ĐỀ XUẤT ĐIỀU CHỈNH BIỂU GIÁ CHI TIẾT
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(pricingData.adjustments || []).map((adj) => (
                    <div key={adj.time_slot} className="bg-obsidian border border-hairline p-3 rounded">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-steel-gray font-bold">GIỜ {adj.time_slot}</span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            adj.change_pct > 0
                              ? 'bg-caution-amber/20 text-caution-amber'
                              : adj.change_pct < 0
                              ? 'bg-grid-green/20 text-grid-green'
                              : 'bg-hairline text-steel-gray'
                          }`}
                        >
                          {adj.change_pct > 0 ? `+${adj.change_pct}%` : `${adj.change_pct}%`}
                        </span>
                      </div>
                      <div className="text-lg font-bold text-tech-white tabular-nums">
                        {adj.suggested_price.toLocaleString()} đ/kWh
                      </div>
                      <div className="text-[10px] text-steel-gray">
                        Hiện hành: {adj.current_price.toLocaleString()} đ/kWh
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-obsidian border border-hairline p-3 rounded space-y-1">
                  <span className="text-steel-gray font-bold block">GIẢI TRÌNH CƠ SỞ ĐỊNH GIÁ:</span>
                  <p className="text-tech-white">• {pricingData.reasoning}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-panel border border-hairline p-12 text-center text-xs text-steel-gray font-mono">
              Bấm nút "Phân tích tỷ lệ lấp đầy &amp; tối ưu giá" để nhận biểu đồ phụ tải và khuyến nghị điều chỉnh.
            </div>
          )}
        </div>
      )}

      {/* TAB 4: GROUNDING NLP ASSISTANT */}
      {activeTab === 'NLP_CHAT' && (
        <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4 font-mono text-xs">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-steel-gray">
              TRỢ LÝ VẬN HÀNH AI (GROUNDING DỮ LIỆU CSDL THẬT)
            </h2>
            <p className="text-steel-gray text-[11px] mt-0.5">
              Hỏi đáp tự do về tải lưới, doanh thu, phiên sạc và trạng thái thiết bị
            </p>
          </div>

          {/* Chat Messages Log */}
          <div className="bg-obsidian border border-hairline p-4 rounded h-80 overflow-y-auto space-y-3">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-3 rounded max-w-2xl ${
                  msg.role === 'user'
                    ? 'ml-auto bg-electric-cyan/20 border border-electric-cyan/40 text-tech-white'
                    : 'mr-auto bg-panel border border-hairline text-tech-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1 text-[10px] text-steel-gray">
                  <span>{msg.role === 'user' ? 'BẠN (CPO)' : 'TRỢ LÝ AI CSMS'}</span>
                  {msg.source && (
                    <span className="font-bold text-electric-cyan">[{msg.source}]</span>
                  )}
                </div>
                <div className="leading-relaxed whitespace-pre-wrap">{msg.text}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="mr-auto bg-panel border border-hairline p-2 text-steel-gray animate-pulse">
                Đang đối chiếu dữ liệu CSDL và sinh câu trả lời...
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendQuestion} className="flex space-x-2">
            <input
              type="text"
              placeholder="Ví dụ: Doanh thu tuần này thế nào? Có trụ sạc nào đang bị quá nhiệt không?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={chatLoading}
              className="w-full bg-obsidian border border-hairline p-2.5 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono"
            />
            <button
              type="submit"
              disabled={chatLoading || !question.trim()}
              className="px-4 py-2.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover disabled:opacity-50 text-white font-bold flex items-center space-x-1 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>GỬI</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
