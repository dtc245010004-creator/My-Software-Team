import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Play,
  Square,
  AlertTriangle,
  Sliders,
  Battery,
  Thermometer,
  Activity,
  DollarSign,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import api from '../services/api';
import { telemetryWs } from '../services/websocket';
import { useAuth } from '../context/AuthContext';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function Simulator() {
  const { user, token } = useAuth();
  const [stations, setStations] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState('');
  const [selectedConnectorId, setSelectedConnectorId] = useState('');

  // Trạng thái phiên sạc hiện hành
  const [activeSession, setActiveSession] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [chartData, setChartData] = useState([]);

  // Điều khiển
  const [powerLimitInput, setPowerLimitInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    fetchStations();
    checkExistingActiveSession();
  }, []);

  // Lắng nghe dữ liệu realtime từ WebSocket
  useEffect(() => {
    if (!activeSession) return;

    telemetryWs.subscribeSession(activeSession.id);

    const unsubscribe = telemetryWs.addListener((msg) => {
      if (msg.event === 'TELEMETRY' && msg.session_id === activeSession.id) {
        setTelemetry(msg);
        setChartData((prev) => {
          const timeLabel = new Date(msg.timestamp).toLocaleTimeString('vi-VN', {
            minute: '2-digit',
            second: '2-digit',
          });
          const next = [...prev, { time: timeLabel, powerKw: msg.power_kw, soc: msg.soc, tempC: msg.temp_c }];
          return next.slice(-25); // Giữ lại 25 mẫu gần nhất
        });
      } else if (msg.event === 'SESSION_STOPPED' && msg.session_id === activeSession.id) {
        setStatusMessage(`Phiên sạc đã kết thúc: ${msg.stop_reason || 'Hoàn tất'}`);
        setActiveSession(null);
        telemetryWs.unsubscribeSession(activeSession.id);
      }
    });

    return () => {
      unsubscribe();
      if (activeSession) {
        telemetryWs.unsubscribeSession(activeSession.id);
      }
    };
  }, [activeSession]);

  const fetchStations = async () => {
    try {
      const res = await api.get('/stations');
      const stData = res.data || [];
      setStations(stData);
      if (stData.length > 0) {
        setSelectedStationId(String(stData[0].id));
      }
    } catch (err) {
      console.error('Lỗi tải danh sách trạm:', err);
    }
  };

  const checkExistingActiveSession = async () => {
    try {
      const res = await api.get('/sessions/me');
      const active = (res.data || []).find((s) => s.status === 'ACTIVE');
      if (active) {
        setActiveSession(active);
        setStatusMessage(`Đang kết nối lại phiên sạc đang chạy #${active.id}`);
      }
    } catch (e) {
      // Bỏ qua nếu chưa đăng nhập
    }
  };

  // Lấy danh sách cổng sạc của trạm được chọn
  const currentStation = stations.find((st) => String(st.id) === String(selectedStationId));
  const availableConnectors = [];
  if (currentStation?.charging_points) {
    currentStation.charging_points.forEach((cp) => {
      (cp.connectors || []).forEach((conn) => {
        availableConnectors.push({
          ...conn,
          chargerCode: cp.code,
          chargerMaxPower: cp.max_power_kw,
        });
      });
    });
  }

  // 1. Bắt đầu phiên sạc
  const handleStartCharging = async () => {
    if (!selectedConnectorId) {
      alert('Vui lòng chọn một cổng sạc trước khi bắt đầu.');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage('Đang kiểm tra số dư ví & khóa rơ-le cổng sạc...');
      const res = await api.post('/sessions/start', {
        connector_id: Number(selectedConnectorId),
      });

      const session = res.data;
      setActiveSession(session);
      setChartData([]);
      setStatusMessage(`Phiên sạc #${session.id} đã khởi động thành công (Biểu giá: ${Number(session.applied_price_per_kwh).toLocaleString()} đ/kWh)`);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      setStatusMessage(`Không thể bắt đầu sạc: ${detail}`);
      alert(`Lỗi: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  // 2. Dừng phiên sạc an toàn
  const handleStopCharging = async () => {
    if (!activeSession) return;

    try {
      setLoading(true);
      setStatusMessage('Đang ngắt rơ-le và quyết toán giao dịch ví tiền ACID...');
      const res = await api.post(`/sessions/${activeSession.id}/stop`, {
        meter_stop_kwh: telemetry?.energy_kwh || null,
      });

      const finished = res.data;
      setStatusMessage(
        `Phiên #${finished.id} đã chốt: ${finished.total_kwh} kWh — Tổng tiền: ${Number(finished.total_amount).toLocaleString()} VND`
      );
      setActiveSession(null);
    } catch (err) {
      alert('Lỗi dừng sạc: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // 3. Kích hoạt giả lập sự cố quá nhiệt
  const handleTriggerOverheat = async () => {
    if (!activeSession) return;

    try {
      setStatusMessage('Đang phát lệnh sự cố quá nhiệt cổng sạc > 75°C...');
      await api.post(`/simulator/sessions/${activeSession.id}/trigger-event`, {
        event_type: 'OVERHEAT',
      });
    } catch (err) {
      alert('Lỗi kích hoạt sự cố: ' + (err.response?.data?.detail || err.message));
    }
  };

  // 4. Điều tiết giới hạn công suất trần từ Admin/CPO
  const handleSetPowerLimit = async (e) => {
    e.preventDefault();
    if (!activeSession || !powerLimitInput) return;

    try {
      const limit = parseFloat(powerLimitInput);
      await api.post(`/simulator/sessions/${activeSession.id}/set-power-limit`, {
        power_limit_kw: limit,
      });
      setStatusMessage(`Đã cập nhật công suất trần mới: ${limit} kW`);
      setPowerLimitInput('');
    } catch (err) {
      alert('Lỗi điều tiết công suất: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Headline */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-tech-white">Bảng Giả Lập Sạc Pin & Giám Sát Telemetry</h1>
          <p className="text-xs text-steel-gray mt-0.5 font-mono">
            MÔ PHỎNG ĐƯỜNG CONG SẠC CC-CV, BẢO VỆ RƠ-LE VÀ TRUYỀN PHÁT WEBSOCKET REALTIME
          </p>
        </div>
        {statusMessage && (
          <div className="bg-obsidian border border-hairline px-3 py-1.5 rounded text-xs font-mono text-electric-cyan">
            {statusMessage}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Charging Dispatch Controller */}
        <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-steel-gray font-mono">
            ĐIỀU KHIỂN RƠ-LE SẠC (DISPATCH CONSOLE)
          </h2>

          {!activeSession ? (
            <div className="space-y-4 font-mono text-xs">
              <div>
                <label className="text-steel-gray block mb-1">CHỌN TRẠM SẠC ĐIỀU PHỐI:</label>
                <select
                  value={selectedStationId}
                  onChange={(e) => setSelectedStationId(e.target.value)}
                  className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                >
                  {stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.total_grid_capacity_kw} kW)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-steel-gray block mb-1">CHỌN SÚNG SẠC VẬT LÝ:</label>
                <select
                  value={selectedConnectorId}
                  onChange={(e) => setSelectedConnectorId(e.target.value)}
                  className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                >
                  <option value="">-- Chọn cổng sạc sẵn sàng --</option>
                  {availableConnectors.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.status === 'CHARGING'}>
                      [{c.chargerCode}] Súng #{c.connector_number} - {c.connector_type} ({c.max_power_kw}kW) [
                      {c.status}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleStartCharging}
                  disabled={loading || !selectedConnectorId}
                  className="w-full flex items-center justify-center space-x-2 py-3 rounded bg-electric-cyan hover:bg-electric-cyan-hover disabled:opacity-50 text-white font-bold transition-all shadow-sm"
                >
                  <Play className="w-4 h-4" />
                  <span>KẾT NỐI & BẬT RƠ-LE SẠC</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 font-mono text-xs">
              <div className="bg-obsidian border border-electric-cyan/40 p-3 rounded">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-electric-cyan font-bold">PHIÊN SẠC ĐANG CHẠY</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-electric-cyan/20 text-electric-cyan font-bold animate-pulse">
                    LIVE
                  </span>
                </div>
                <div className="text-steel-gray space-y-1">
                  <div>Mã phiên: #{activeSession.id}</div>
                  <div>Cổng sạc ID: #{activeSession.connector_id}</div>
                  <div>Đơn giá: {Number(activeSession.applied_price_per_kwh).toLocaleString()} đ/kWh</div>
                </div>
              </div>

              {/* Stop Session Button */}
              <button
                onClick={handleStopCharging}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 rounded bg-critical-red hover:bg-red-700 text-white font-bold transition-all"
              >
                <Square className="w-4 h-4" />
                <span>DỪNG SẠC & QUYẾT TOÁN VÍ</span>
              </button>

              {/* Overheat Simulation Button */}
              <div className="pt-3 border-t border-hairline">
                <span className="text-steel-gray text-[11px] block mb-2">THỬ NGHIỆM AN TOÀN HỆ THỐNG:</span>
                <button
                  onClick={handleTriggerOverheat}
                  className="w-full flex items-center justify-center space-x-1.5 py-2 rounded bg-caution-amber/20 border border-caution-amber/40 hover:bg-caution-amber/30 text-caution-amber font-semibold transition-all"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>GIẢ LẬP SỰ CỐ QUÁ NHIỆT &gt;75°C</span>
                </button>
              </div>

              {/* Power Limit Override */}
              <form onSubmit={handleSetPowerLimit} className="pt-3 border-t border-hairline space-y-2">
                <span className="text-steel-gray text-[11px] block">ĐIỀU TIẾT CÔNG SUẤT TRẦN (AI/CPO):</span>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    step="5"
                    min="10"
                    placeholder="kW trần"
                    value={powerLimitInput}
                    onChange={(e) => setPowerLimitInput(e.target.value)}
                    className="w-full bg-obsidian border border-hairline p-1.5 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-hairline hover:bg-panel text-tech-white font-bold shrink-0"
                  >
                    GÁN
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Middle & Right Column: Realtime Telemetry Indicators & CC-CV Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Telemetry 4 Metric Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-panel border border-hairline p-3 rounded-sm font-mono">
              <div className="text-steel-gray text-[11px] flex items-center justify-between mb-1">
                <span>CÔNG SUẤT TỨC THỜI</span>
                <Zap className="w-3.5 h-3.5 text-electric-cyan" />
              </div>
              <div className="text-xl font-bold text-electric-cyan tabular-nums">
                {telemetry ? telemetry.power_kw.toFixed(1) : '0.0'} <span className="text-xs text-steel-gray font-normal">kW</span>
              </div>
              <div className="text-[10px] text-steel-gray mt-1">Đo đếm theo chu kỳ 2s</div>
            </div>

            <div className="bg-panel border border-hairline p-3 rounded-sm font-mono">
              <div className="text-steel-gray text-[11px] flex items-center justify-between mb-1">
                <span>DUNG LƯỢNG PIN (SoC)</span>
                <Battery className="w-3.5 h-3.5 text-grid-green" />
              </div>
              <div className="text-xl font-bold text-grid-green tabular-nums">
                {telemetry ? telemetry.soc.toFixed(1) : '0.0'} <span className="text-xs text-steel-gray font-normal">%</span>
              </div>
              <div className="text-[10px] text-steel-gray mt-1">Ngắt khi đạt 100%</div>
            </div>

            <div className="bg-panel border border-hairline p-3 rounded-sm font-mono">
              <div className="text-steel-gray text-[11px] flex items-center justify-between mb-1">
                <span>NHIỆT ĐỘ CỔNG SẠC</span>
                <Thermometer
                  className={`w-3.5 h-3.5 ${
                    telemetry?.temp_c > 75
                      ? 'text-critical-red animate-ping'
                      : telemetry?.temp_c > 65
                      ? 'text-caution-amber'
                      : 'text-grid-green'
                  }`}
                />
              </div>
              <div
                className={`text-xl font-bold tabular-nums ${
                  telemetry?.temp_c > 75
                    ? 'text-critical-red'
                    : telemetry?.temp_c > 65
                    ? 'text-caution-amber'
                    : 'text-tech-white'
                }`}
              >
                {telemetry ? telemetry.temp_c.toFixed(1) : '30.0'} <span className="text-xs text-steel-gray font-normal">°C</span>
              </div>
              <div className="text-[10px] text-steel-gray mt-1">Ngưỡng ngắt: 75°C</div>
            </div>

            <div className="bg-panel border border-hairline p-3 rounded-sm font-mono">
              <div className="text-steel-gray text-[11px] flex items-center justify-between mb-1">
                <span>ĐIỆN NĂNG & TIỀN</span>
                <DollarSign className="w-3.5 h-3.5 text-caution-amber" />
              </div>
              <div className="text-lg font-bold text-caution-amber tabular-nums">
                {telemetry ? telemetry.cost_estimate?.toLocaleString() : '0'} <span className="text-xs text-steel-gray font-normal">đ</span>
              </div>
              <div className="text-[10px] text-steel-gray mt-1">
                {telemetry ? telemetry.energy_kwh.toFixed(3) : '0.000'} kWh
              </div>
            </div>
          </div>

          {/* Realtime Recharts CC-CV Curve */}
          <div className="bg-panel border border-hairline p-5 rounded-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-tech-white">Đồ Thị Realtime Đường Cong Sạc Pin CC-CV</h2>
                <p className="text-xs text-steel-gray font-mono">
                  Quan sát trực tiếp pha Dòng không đổi (CC: &lt;80% SoC) và pha Áp không đổi (CV: &ge;80% SoC)
                </p>
              </div>
              <div className="flex items-center space-x-4 text-xs font-mono">
                <span className="flex items-center text-electric-cyan">
                  <span className="w-2.5 h-0.5 bg-electric-cyan mr-1.5" />
                  Công suất (kW)
                </span>
                <span className="flex items-center text-grid-green">
                  <span className="w-2.5 h-0.5 bg-grid-green mr-1.5" />
                  Pin SoC (%)
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              {chartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-steel-gray font-mono text-xs">
                  <Radio className="w-6 h-6 mb-2 text-hairline animate-pulse" />
                  Đang chờ kết nối phiên sạc để vẽ đồ thị đường cong...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222F44" />
                    <XAxis dataKey="time" stroke="#94A3B8" fontSize={11} fontFamily="monospace" />
                    <YAxis yAxisId="left" stroke="#0284C7" fontSize={11} fontFamily="monospace" unit=" kW" />
                    <YAxis yAxisId="right" orientation="right" stroke="#10B981" fontSize={11} fontFamily="monospace" unit=" %" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#151D2A', borderColor: '#222F44', borderRadius: '2px' }}
                      labelStyle={{ color: '#F1F5F9', fontFamily: 'monospace' }}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="powerKw" stroke="#0284C7" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="soc" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
