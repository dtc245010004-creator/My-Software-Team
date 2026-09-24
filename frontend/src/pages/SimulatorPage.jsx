import { useEffect, useRef, useState } from 'react'
import { Battery, Plug, Thermometer, Zap, Wifi, WifiOff } from 'lucide-react'
import { createTelemetrySocket } from '../services/websocket'
import './SimulatorPage.css'

const STATUS_LABEL = {
  connecting: 'Đang kết nối',
  connected: 'Đã kết nối',
  reconnecting: 'Mất kết nối — đang thử lại',
  disconnected: 'Mất kết nối',
  closed: 'Đã đóng',
  idle: 'Chưa kết nối',
}

const STATUS_KIND = {
  connecting: 'warn',
  connected: 'ok',
  reconnecting: 'warn',
  disconnected: 'err',
  closed: 'idle',
  idle: 'idle',
}

function formatNum(v, digits = 1, suffix = '') {
  if (typeof v !== 'number' || Number.isNaN(v)) return `--${suffix}`
  return `${v.toFixed(digits)}${suffix}`
}

export default function SimulatorPage() {
  const [status, setStatus] = useState('connecting')
  const [telemetry, setTelemetry] = useState({
    soc: 0,
    powerKw: 0,
    kwh: 0,
    temperatureC: 25,
    voltage: 0,
    current: 0,
  })
  const lastFrame = useRef(null)

  useEffect(() => {
    const conn = createTelemetrySocket({
      onStatusChange: ({ status }) => setStatus(status),
      onMessage: (payload) => {
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          if (payload.type === 'pong' || payload.type === 'ping') return
          if (payload.soc !== undefined || payload.power_kw !== undefined || payload.kwh !== undefined) {
            lastFrame.current = payload
            setTelemetry({
              soc: payload.soc ?? payload.soc_percent ?? 0,
              powerKw: payload.power_kw ?? payload.powerKw ?? 0,
              kwh: payload.kwh ?? payload.energy_kwh ?? 0,
              temperatureC: payload.temperature_c ?? payload.temperature ?? 25,
              voltage: payload.voltage ?? payload.voltage_v ?? 0,
              current: payload.current ?? payload.current_a ?? 0,
            })
          }
        }
      },
    })
    return () => conn.close()
  }, [])

  const kind = STATUS_KIND[status] ?? 'idle'

  return (
    <div className="simulator-page">
      <header className="sim-header">
        <h1>Giả lập Trụ sạc ảo</h1>
        <div className={`sim-status sim-status-${kind}`} role="status">
          {kind === 'ok' ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span>{STATUS_LABEL[status] ?? status}</span>
        </div>
      </header>

      <section className="sim-grid">
        <div className="sim-card">
          <div className="sim-card-head">
            <Battery size={20} /> Trạng thái Pin
          </div>
          <div className="sim-card-value">{formatNum(telemetry.soc, 0, '%')}</div>
          <div className="sim-bar">
            <div className="sim-bar-fill" style={{ width: `${Math.min(100, Math.max(0, telemetry.soc))}%` }} />
          </div>
        </div>

        <div className="sim-card">
          <div className="sim-card-head">
            <Zap size={20} /> Công suất tức thời
          </div>
          <div className="sim-card-value">{formatNum(telemetry.powerKw, 1, ' kW')}</div>
          <div className="sim-card-sub">
            Đã nạp: {formatNum(telemetry.kwh, 2, ' kWh')}
          </div>
        </div>

        <div className="sim-card">
          <div className="sim-card-head">
            <Plug size={20} /> Điện áp / Dòng điện
          </div>
          <div className="sim-card-value">{formatNum(telemetry.voltage, 0, ' V')}</div>
          <div className="sim-card-sub">
            Dòng: {formatNum(telemetry.current, 1, ' A')}
          </div>
        </div>

        <div className={`sim-card sim-temp ${telemetry.temperatureC > 70 ? 'sim-temp-warn' : ''}`}>
          <div className="sim-card-head">
            <Thermometer size={20} /> Nhiệt độ cổng sạc
          </div>
          <div className="sim-card-value">{formatNum(telemetry.temperatureC, 1, '°C')}</div>
          <div className="sim-card-sub">
            {telemetry.temperatureC > 85
              ? '⚠️ CẢNH BÁO: Ngắt sạc khẩn cấp'
              : telemetry.temperatureC > 70
                ? '⚠ Đang nóng — chú ý'
                : 'Trong ngưỡng an toàn'}
          </div>
        </div>
      </section>

      <section className="sim-help">
        <h3>Hướng dẫn</h3>
        <ul>
          <li>Trang này kết nối <code>/ws/telemetry</code> từ backend (qua Vite proxy).</li>
          <li>
            WebSocket giữ kết nối bằng <strong>Heartbeat Ping/Pong mỗi 30 giây</strong>.
          </li>
          <li>
            Khi mất kết nối sẽ tự động <strong>reconnect với backoff 1s → 15s</strong>.
          </li>
        </ul>
      </section>
    </div>
  )
}
