import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap,
  Play,
  Square,
  AlertTriangle,
  Battery,
  Thermometer,
  DollarSign,
  Radio,
  Sliders,
  CheckCircle2,
  Info,
  Clock,
  Plug,
  Wallet as WalletIcon,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import api from '../services/api';
import { telemetryWs } from '../services/websocket';
import { useAuth } from '../context/AuthContext';
import { formatVNTime } from '../utils/formatTime';
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

  // Cấu hình xe điện & dung lượng pin
  const [batteryCapacity, setBatteryCapacity] = useState('60');
  const [customCapacity, setCustomCapacity] = useState('');
  const [initialSoc, setInitialSoc] = useState('25');

  const batteryOptions = [
    { label: '42.0 kWh — VinFast VF 5 / VF e34 / Wuling', value: '42' },
    { label: '60.0 kWh — VinFast VF 6 / Tesla Model 3 / Ioniq 5 (Mặc định)', value: '60' },
    { label: '87.7 kWh — VinFast VF 8 / Kia EV6 Long Range', value: '87.7' },
    { label: '123.0 kWh — VinFast VF 9 / Tesla Model X Plaid', value: '123' },
    { label: 'Tùy chỉnh dung lượng...', value: 'CUSTOM' },
  ];

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
          const timeLabel = formatVNTime(msg.timestamp, {
            minute: '2-digit',
            second: '2-digit',
          });
          const next = [...prev, { time: timeLabel, powerKw: msg.power_kw, soc: msg.soc, tempC: msg.temp_c }];
          return next.slice(-25); // Giữ lại 25 mẫu gần nhất
        });
      } else if (
        (msg.event === 'STOPPED' || msg.event === 'SESSION_STOPPED') &&
        msg.session_id === activeSession.id
      ) {
        setStatusMessage(`Phiên sạc đã kết thúc: ${msg.stop_reason || msg.reason || 'Hoàn tất'}`);
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
      const searchParams = new URLSearchParams(window.location.search);
      const queryStationId = searchParams.get('station_id');
      if (queryStationId && stData.some((st) => String(st.id) === String(queryStationId))) {
        setSelectedStationId(String(queryStationId));
      } else if (stData.length > 0) {
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
      // Bỏ qua nếu lỗi
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
          chargerStatus: cp.status,
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

    // Kiểm tra tính khả dụng của cổng và trụ sạc được chọn
    const targetConn = availableConnectors.find((c) => String(c.id) === String(selectedConnectorId));
    if (targetConn) {
      if (targetConn.chargerStatus === 'UNAVAILABLE' || targetConn.chargerStatus === 'FAULTED' || targetConn.chargerStatus === 'MAINTENANCE') {
        alert(`Trụ sạc [${targetConn.chargerCode}] hiện đang trong trạng thái bảo trì hoặc sự cố. Vui lòng chọn trụ sạc khác.`);
        return;
      }
      if (targetConn.status !== 'AVAILABLE') {
        alert(`Cổng sạc hiện không khả dụng (Trạng thái: ${targetConn.status}). Vui lòng chọn cổng sạc khác.`);
        return;
      }
    }

    const finalCapacity = batteryCapacity === 'CUSTOM' ? parseFloat(customCapacity) : parseFloat(batteryCapacity);
    if (!finalCapacity || finalCapacity <= 0) {
      alert('Vui lòng chọn hoặc nhập dung lượng pin hợp lệ (> 0 kWh).');
      return;
    }

    const finalSoc = parseFloat(initialSoc);
    if (isNaN(finalSoc) || finalSoc < 0 || finalSoc >= 100) {
      alert('Vui lòng nhập mức pin hiện có hợp lệ (0% - 99%).');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage('Đang kiểm tra số dư và kích hoạt cổng sạc...');
      const res = await api.post('/sessions/start', {
        connector_id: Number(selectedConnectorId),
        battery_capacity_kwh: finalCapacity,
        initial_soc: finalSoc,
      });

      const session = res.data;
      setActiveSession(session);
      setChartData([]);
      setStatusMessage(
        `Phiên sạc #${session.id} khởi động: Pin ${finalCapacity} kWh, Mức pin ${finalSoc}% (Đơn giá: ${Number(
          session.applied_price_per_kwh
        ).toLocaleString()} đ/kWh)`
      );
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
      setStatusMessage('Đang dừng sạc và quyết toán giao dịch ví...');
      const res = await api.post(`/sessions/${activeSession.id}/stop`, {
        meter_stop_kwh: telemetry?.energy_kwh || null,
      });

      const finished = res.data;
      setStatusMessage(
        `Phiên #${finished.id} đã hoàn tất: ${finished.total_kwh} kWh — Tổng tiền: ${Number(finished.total_amount).toLocaleString()} đ`
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
      setStatusMessage('Đang gửi tín hiệu mô phỏng quá nhiệt cổng sạc (>75°C)...');
      await api.post(`/simulator/sessions/${activeSession.id}/trigger-event`, {
        event_type: 'OVERHEAT',
      });
    } catch (err) {
      alert('Lỗi kích hoạt sự cố: ' + (err.response?.data?.detail || err.message));
    }
  };


  // State Demo Phạt không rút sạc (Pin 100%)
  const [demoMinutes, setDemoMinutes] = useState(3);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoSuccess, setDemoSuccess] = useState(null);
  const [demoError, setDemoError] = useState('');
  const [isOverstayActive, setIsOverstayActive] = useState(false);
  const [overstayTimerMinutes, setOverstayTimerMinutes] = useState(1);

  // Kích hoạt mô phỏng pin đạt 100% trên phiên sạc đang chạy
  const handleFastForwardSoc100 = () => {
    setIsOverstayActive(true);
    setTelemetry((prev) => ({
      ...(prev || {}),
      soc: 100.0,
      power_kw: 0.0,
      temp_c: 32.0,
      energy_kwh: prev?.energy_kwh || 18.5,
      cost_estimate: prev?.cost_estimate || 72000,
    }));
    setStatusMessage('Xe đã sạc đầy 100%! Trạng thái không rút sạc đang kích hoạt tính phí phạt 3.000 đ/phút.');
  };

  // Áp dụng phạt không rút sạc vào ví
  const handleApplyOverstayPenalty = async (customMinutes) => {
    const mins = Number(customMinutes !== undefined ? customMinutes : demoMinutes);
    if (!mins || mins <= 0) {
      alert('Vui lòng chọn hoặc nhập số phút hợp lệ (> 0).');
      return;
    }

    try {
      setDemoLoading(true);
      setDemoError('');
      setDemoSuccess(null);

      const res = await api.post('/simulator/overstay-penalty', {
        minutes: mins,
        session_id: activeSession ? activeSession.id : null,
        rate_per_minute: 3000,
        note_custom: `Phạt không rút sạc - ${mins} phút`,
      });

      setDemoSuccess({
        amount: res.data.amount,
        minutes: mins,
        note: res.data.note,
        new_balance: res.data.new_balance,
      });

      setStatusMessage(
        `Đã trừ phạt ${Math.abs(res.data.amount).toLocaleString('vi-VN')} đ vào ví với nội dung: "${res.data.note}"`
      );

      // Nếu đang trong phiên sạc, rút sạc và hoàn tất
      if (isOverstayActive) {
        setIsOverstayActive(false);
        if (activeSession) {
          handleStopCharging();
        }
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi khi áp dụng phạt ví.';
      setDemoError(msg);
    } finally {
      setDemoLoading(false);
    }
  };

  // 4. Điều tiết giới hạn công suất trần
  const handleSetPowerLimit = async (e) => {
    e.preventDefault();
    if (!activeSession || !powerLimitInput) return;

    try {
      const limit = parseFloat(powerLimitInput);
      await api.post(`/simulator/sessions/${activeSession.id}/set-power-limit`, {
        power_limit_kw: limit,
      });
      setStatusMessage(`Đã cập nhật công suất tối đa mới: ${limit} kW`);
      setPowerLimitInput('');
    } catch (err) {
      alert('Lỗi điều tiết công suất: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div className="space-y-6">
      {/* Tiêu đề trang & Thông báo trạng thái */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Bảng Giả Lập Sạc Pin & Giám Sát Thời Gian Thực
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Mô phỏng chu trình sạc xe điện, theo dõi công suất và điện năng nạp thực tế
          </p>
        </div>
        {statusMessage && (
          <div className="flex items-center space-x-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 px-3.5 py-2 rounded-xl text-xs font-medium text-sky-700 dark:text-sky-300 shadow-sm">
            <Info className="w-4 h-4 shrink-0 text-sky-500" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cột trái: Bảng điều khiển sạc */}
        <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-5 rounded-2xl shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-sky-500" />
              <span>Điều khiển phiên sạc</span>
            </h2>
            {activeSession && (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Đang sạc</span>
              </span>
            )}
          </div>

          {!activeSession ? (
            <div className="space-y-4 text-xs">
              {/* Chọn trạm */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Chọn trạm sạc:
                </label>
                <select
                  value={selectedStationId}
                  onChange={(e) => setSelectedStationId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                >
                  {stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.total_grid_capacity_kw} kW)
                    </option>
                  ))}
                </select>
              </div>

              {/* Chọn cổng sạc */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Chọn cổng sạc:
                </label>
                <select
                  value={selectedConnectorId}
                  onChange={(e) => setSelectedConnectorId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                >
                  <option value="">-- Chọn cổng sạc sẵn sàng --</option>
                  {availableConnectors.map((c) => {
                    const isChargerMaintenance =
                      c.chargerStatus === 'UNAVAILABLE' ||
                      c.chargerStatus === 'FAULTED' ||
                      c.chargerStatus === 'MAINTENANCE';
                    const isCharging = c.status === 'CHARGING';
                    const isConnUnavailable = c.status === 'UNAVAILABLE' || c.status === 'FAULTED';
                    const isDisabled = isChargerMaintenance || isCharging || isConnUnavailable;

                    let statusTag = `[${c.status}]`;
                    if (isChargerMaintenance) {
                      statusTag = '[Trụ bảo trì]';
                    } else if (isCharging) {
                      statusTag = '[Đang có xe sạc]';
                    } else if (isConnUnavailable) {
                      statusTag = '[Không khả dụng]';
                    } else if (c.status === 'AVAILABLE') {
                      statusTag = '[Sẵn sàng]';
                    }

                    return (
                      <option key={c.id} value={c.id} disabled={isDisabled}>
                        {statusTag} [{c.chargerCode}] Cổng #{c.connector_number} - {c.connector_type} ({c.max_power_kw} kW)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Dung lượng pin xe */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Dung lượng pin xe:
                  </label>
                  <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
                    {batteryCapacity === 'CUSTOM' ? (customCapacity || '0') : batteryCapacity} kWh
                  </span>
                </div>
                <select
                  value={batteryCapacity}
                  onChange={(e) => setBatteryCapacity(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                >
                  {batteryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {batteryCapacity === 'CUSTOM' && (
                  <div className="mt-2">
                    <input
                      type="number"
                      min="10"
                      max="250"
                      step="1"
                      placeholder="Nhập dung lượng pin (VD: 75 kWh)..."
                      value={customCapacity}
                      onChange={(e) => setCustomCapacity(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                    />
                  </div>
                )}
              </div>

              {/* Mức pin hiện có */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Mức pin hiện có:
                  </label>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {initialSoc}%
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {['10', '20', '35', '50', '70'].map((socVal) => (
                    <button
                      key={socVal}
                      type="button"
                      onClick={() => setInitialSoc(socVal)}
                      className={`py-1.5 rounded-xl border text-xs font-medium text-center transition-all ${
                        initialSoc === socVal
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {socVal}%
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="range"
                    min="5"
                    max="90"
                    step="1"
                    value={initialSoc}
                    onChange={(e) => setInitialSoc(e.target.value)}
                    className="w-full accent-emerald-600 cursor-pointer"
                  />
                  <div className="w-14 shrink-0">
                    <input
                      type="number"
                      min="1"
                      max="95"
                      value={initialSoc}
                      onChange={(e) => setInitialSoc(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-xl py-1 px-1.5 text-center text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Nút Bắt đầu sạc */}
              <div className="pt-2">
                <button
                  onClick={handleStartCharging}
                  disabled={loading || !selectedConnectorId}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-all shadow-sm shadow-sky-600/10"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Bắt đầu sạc</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Thẻ thông tin phiên đang chạy */}
              <div className="bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/50 p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-sky-100 dark:border-sky-900/40">
                  <span className="font-semibold text-sky-800 dark:text-sky-300">Phiên sạc đang chạy</span>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>TRỰC TIẾP</span>
                  </span>
                </div>
                <div className="text-slate-600 dark:text-slate-300 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Mã phiên:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">#{activeSession.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Cổng sạc:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">Cổng #{activeSession.connector_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Đơn giá:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {Number(activeSession.applied_price_per_kwh).toLocaleString()} đ/kWh
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Pin ban đầu:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{activeSession.current_soc}%</span>
                  </div>
                </div>
              </div>

              {/* Nút dừng sạc */}
              <button
                onClick={handleStopCharging}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-all shadow-sm"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Dừng phiên sạc</span>
              </button>

              {/* Mô phỏng nhiệt độ cao */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Thử nghiệm an toàn hệ thống:
                </span>
                <button
                  onClick={handleTriggerOverheat}
                  className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium text-xs transition-all"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Mô phỏng nhiệt độ cao (&gt; 75°C)</span>
                </button>
              </div>

              {/* Điều tiết công suất tối đa */}
              <form onSubmit={handleSetPowerLimit} className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Giới hạn công suất tối đa (kW):
                </span>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    step="5"
                    min="10"
                    placeholder="Nhập công suất tối đa..."
                    value={powerLimitInput}
                    onChange={(e) => setPowerLimitInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs border border-slate-200 dark:border-slate-700 transition-all shrink-0"
                  >
                    Áp dụng
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Cột giữa & phải: Thống kê thời gian thực & Biểu đồ */}
        <div className="lg:col-span-2 space-y-6">
          {/* Thanh trạng thái phiên sạc */}
          <div className="flex items-center justify-between bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 px-4 py-3 rounded-2xl shadow-sm text-xs">
            <div className="flex items-center space-x-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  activeSession ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-slate-600'
                }`}
              />
              <span className="text-slate-500 dark:text-slate-400">Trạng thái:</span>
              <span className={`font-semibold ${activeSession ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {activeSession ? 'Đang sạc — Đang nhận dữ liệu thời gian thực' : 'Sẵn sàng — Chờ bắt đầu phiên sạc'}
              </span>
            </div>
            {activeSession ? (
              <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 hidden sm:inline">
                Phiên #{activeSession.id} (Cập nhật 2s)
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
                Chọn cổng và nhấn Bắt đầu sạc để khởi động
              </span>
            )}
          </div>

          {/* 4 Thẻ chỉ số giám sát */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Công suất hiện tại */}
            <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm">
              <div className="text-slate-500 dark:text-slate-400 text-xs font-medium flex items-center justify-between mb-1.5">
                <span>Công suất hiện tại</span>
                <div className="w-6 h-6 rounded-lg bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-sky-500" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {telemetry ? telemetry.power_kw.toFixed(1) : '0.0'}{' '}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">kW</span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                {telemetry ? 'Cập nhật mỗi 2 giây' : 'Chưa bắt đầu sạc'}
              </div>
            </div>

            {/* 2. Mức pin (SoC) */}
            <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm">
              <div className="text-slate-500 dark:text-slate-400 text-xs font-medium flex items-center justify-between mb-1.5">
                <span>Mức pin (SoC)</span>
                <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
                  <Battery className="w-3.5 h-3.5 text-emerald-500" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {telemetry
                  ? telemetry.soc.toFixed(1)
                  : activeSession
                  ? (activeSession.current_soc != null ? Number(activeSession.current_soc).toFixed(1) : '0.0')
                  : parseFloat(initialSoc || '25').toFixed(1)}{' '}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">%</span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                {telemetry ? 'Tự động ngắt khi 100%' : 'Mức pin ban đầu'}
              </div>
            </div>

            {/* 3. Nhiệt độ đầu sạc */}
            <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm">
              <div className="text-slate-500 dark:text-slate-400 text-xs font-medium flex items-center justify-between mb-1.5">
                <span>Nhiệt độ đầu sạc</span>
                <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                  <Thermometer
                    className={`w-3.5 h-3.5 ${
                      telemetry?.temp_c > 75
                        ? 'text-rose-500 animate-bounce'
                        : telemetry?.temp_c > 65
                        ? 'text-amber-500'
                        : 'text-emerald-500'
                    }`}
                  />
                </div>
              </div>
              <div
                className={`text-xl sm:text-2xl font-bold tabular-nums ${
                  telemetry?.temp_c > 75
                    ? 'text-rose-600 dark:text-rose-400'
                    : telemetry?.temp_c > 65
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {telemetry ? telemetry.temp_c.toFixed(1) : '30.0'}{' '}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">°C</span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                {telemetry ? 'Tự ngắt ở ngưỡng 75°C' : 'Nhiệt độ hoạt động'}
              </div>
            </div>

            {/* 4. Điện năng & Tiền */}
            <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm">
              <div className="text-slate-500 dark:text-slate-400 text-xs font-medium flex items-center justify-between mb-1.5">
                <span>Chi phí tạm tính</span>
                <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-amber-500" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {telemetry ? telemetry.cost_estimate?.toLocaleString() : '0'}{' '}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">đ</span>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                {telemetry ? `${telemetry.energy_kwh.toFixed(3)} kWh` : '0.000 kWh'}
              </div>
            </div>
          </div>

          {/* Biểu đồ thời gian thực */}
          <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-5 rounded-2xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Biểu đồ công suất &amp; mức pin theo thời gian
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Theo dõi công suất sạc và tiến độ nạp pin xe điện theo thời gian thực
                </p>
              </div>
              <div className="flex items-center space-x-4 text-xs font-medium">
                <span className="flex items-center text-sky-600 dark:text-sky-400">
                  <span className="w-3 h-1 bg-sky-500 rounded mr-1.5" />
                  Công suất (kW)
                </span>
                <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                  <span className="w-3 h-1 bg-emerald-500 rounded mr-1.5" />
                  Mức pin (%)
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              {chartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs space-y-2.5 py-8">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center">
                    <Radio className="w-6 h-6 text-slate-400 animate-pulse" />
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                    Chưa có dữ liệu phiên sạc
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 max-w-sm text-center leading-relaxed">
                    Hệ thống đang ở trạng thái sẵn sàng. Vui lòng chọn cổng sạc và nhấn <strong className="text-sky-600 dark:text-sky-400">"Bắt đầu sạc"</strong> ở bảng điều khiển để theo dõi đồ thị thời gian thực.
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                    <XAxis
                      dataKey="time"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#0284c7"
                      fontSize={11}
                      unit=" kW"
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#10b981"
                      fontSize={11}
                      unit=" %"
                      domain={[0, 100]}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        color: '#f8fafc',
                        fontSize: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      }}
                      labelStyle={{ color: '#f8fafc', fontWeight: 600 }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="powerKw"
                      name="Công suất"
                      stroke="#0284c7"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="soc"
                      name="Mức pin"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BẢNG GIẢ LẬP PHẠT KHÔNG RÚT SẠC KHI PIN ĐẦY 100% (3.000 VNĐ / PHÚT)     */}
      {/* ========================================================================= */}
      <section className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              <span>CHÍNH SÁCH QUẢN LÝ TRỤ SẠC & CHỐNG CHIẾM CHỖ</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Demo Bảng Giả Lập: Phạt Không Rút Sạc Khi Pin Đầy 100%
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Khi pin xe điện sạc đầy 100% mà tài xế không rút sạc, hệ thống áp dụng mức phạt{' '}
              <strong className="text-rose-600 dark:text-rose-400 font-semibold">3.000 VNĐ / phút</strong>.
              Tiền phạt sẽ tự động trừ vào ví điện tử và hiển thị minh bạch trong sổ cái lịch sử giao dịch.
            </p>
          </div>

          <Link
            to="/wallet"
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors self-start md:self-auto shrink-0"
          >
            <WalletIcon className="w-4 h-4 text-sky-500" />
            <span>Xem Lịch Sử Giao Dịch Ví</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Thông báo kết quả áp dụng phạt */}
        {demoSuccess && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 p-4 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <span>ĐÃ ÁP DỤNG PHẠT VÀ TRỪ TIỀN VÍ THÀNH CÔNG!</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
              <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900">
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Số tiền bị trừ:</span>
                <strong className="text-rose-600 text-sm font-extrabold">
                  -{Math.abs(demoSuccess.amount).toLocaleString('vi-VN')} ₫
                </strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900">
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Nội dung ghi nhận trong ví:</span>
                <strong className="text-slate-900 dark:text-slate-100 font-semibold">
                  "{demoSuccess.note}"
                </strong>
              </div>
              <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900">
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Số dư ví sau khi trừ:</span>
                <strong className="text-sky-600 text-sm font-bold">
                  {Math.round(demoSuccess.new_balance).toLocaleString('vi-VN')} ₫
                </strong>
              </div>
            </div>
            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Giao dịch đã được lưu vào CSDL và đồng bộ thời gian thực sang màn hình Ví.
              </span>
              <Link
                to="/wallet"
                className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center space-x-1"
              >
                <span>Kiểm tra trong Ví ngay</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {demoError && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 p-3.5 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{demoError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Cột 1: Thông số giả lập hiện tại */}
          <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-800">
              1. Trạng thái giả lập sạc xe
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Mức pin xe:</span>
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
                <Battery className="w-3.5 h-3.5" />
                <span>100% (Pin đầy)</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Tình trạng súng sạc:</span>
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-700">
                <Plug className="w-3.5 h-3.5" />
                <span>Chưa rút sạc</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Đơn giá phạt:</span>
              <strong className="text-slate-900 dark:text-slate-100">3.000 VNĐ / 1 phút</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Chính sách ân hạn:</span>
              <span className="text-slate-600 dark:text-slate-300">0 phút (Tính phạt tức thì)</span>
            </div>
          </div>

          {/* Cột 2: Chọn thời gian không rút sạc */}
          <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-800">
              2. Chọn số thời gian tài xế không rút sạc
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Thời gian chưa rút sạc:</span>
              <strong className="text-base text-rose-600 font-extrabold">{demoMinutes} phút</strong>
            </div>

            {/* Các mốc thời gian mẫu */}
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {[1, 2, 3, 5, 10].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDemoMinutes(mins)}
                  className={`py-1.5 px-1 rounded-xl text-xs font-semibold text-center border transition-all ${
                    demoMinutes === mins
                      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  {mins} phút
                </button>
              ))}
            </div>

            {/* Slider tùy chỉnh */}
            <div className="pt-2">
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={demoMinutes}
                  onChange={(e) => setDemoMinutes(Number(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer"
                />
                <div className="w-16 shrink-0">
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={demoMinutes}
                    onChange={(e) => setDemoMinutes(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-1.5 text-center text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Cột 3: Tính toán & Kích hoạt trừ phạt */}
          <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs flex flex-col justify-between">
            <div className="space-y-2">
              <div className="font-semibold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-800">
                3. Dự kiến tiền phạt & Nội dung ghi ví
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Tiền phạt:</span>
                <strong className="text-base text-rose-600 font-extrabold">
                  {(demoMinutes * 3000).toLocaleString('vi-VN')} ₫
                </strong>
              </div>

              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                  Nội dung ghi nhận trong lịch sử ví:
                </span>
                <div className="text-xs font-bold text-sky-600 dark:text-sky-400">
                  "Phạt không rút sạc - {demoMinutes} phút"
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleApplyOverstayPenalty()}
              disabled={demoLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition-all shadow-sm shadow-rose-600/20 flex items-center justify-center space-x-2"
            >
              <Plug className="w-4 h-4" />
              <span>{demoLoading ? 'Đang thực hiện trừ tiền...' : '⚡ Rút Sạc & Kích Hoạt Phạt Trừ Ví'}</span>
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
