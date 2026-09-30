import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Cpu, Zap, Activity } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { createTelemetrySocket } from '../services/websocket'
import './DashboardPage.css'

const STATUS_META = {
  idle: { label: 'Chưa kết nối', color: 'idle' },
  connecting: { label: 'Đang kết nối…', color: 'connecting' },
  connected: { label: 'Đã kết nối', color: 'connected' },
  reconnecting: { label: 'Mất kết nối — đang thử lại…', color: 'reconnecting' },
  disconnected: { label: 'Mất kết nối', color: 'disconnected' },
  closed: { label: 'Đã đóng', color: 'closed' },
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [wsStatus, setWsStatus] = useState('connecting')
  const [lastMessage, setLastMessage] = useState(null)

  useEffect(() => {
    const conn = createTelemetrySocket({
      onStatusChange: ({ status }) => setWsStatus(status),
      onMessage: (payload) => setLastMessage(payload),
    })
    return () => conn.close()
  }, [])

  const handleLogout = () => {
    logout()
    toast.success('Đã đăng xuất')
    navigate('/login', { replace: true })
  }

  const meta = STATUS_META[wsStatus] ?? STATUS_META.idle

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Bảng điều khiển EV CSMS</h1>
          <p>
            Xin chào, <strong>{user?.email ?? 'Người dùng'}</strong>
            {user?.role && <span className={`role-badge role-${user.role}`}> {user.role} </span>}
          </p>
        </div>
        <button className="logout-btn" onClick={handleLogout} aria-label="Đăng xuất">
          <LogOut size={16} /> Đăng xuất
        </button>
      </header>

      <section className="dashboard-status" data-status={meta.color}>
        <span className={`status-light status-${meta.color}`} aria-hidden />
        <span className="status-label">Trạng thái Telemetry: {meta.label}</span>
      </section>

      <section className="dashboard-grid">
        <Link to="/simulator" className="dashboard-card">
          <Cpu size={28} />
          <h3>Giả lập trụ sạc</h3>
          <p>Mở màn hình Simulator để test kết nối Telemetry thời gian thực.</p>
        </Link>
        <div className="dashboard-card dashboard-card-static">
          <Zap size={28} />
          <h3>Phiên sạc</h3>
          <p>Quản lý phiên sạc (đang phát triển).</p>
        </div>
        <div className="dashboard-card dashboard-card-static">
          <Activity size={28} />
          <h3>AI Advisor</h3>
          <p>Điều phối tải & bảo trì dự đoán (đang phát triển).</p>
        </div>
      </section>

      {lastMessage && (
        <section className="dashboard-telemetry">
          <h3>Telemetry mới nhất</h3>
          <pre>{JSON.stringify(lastMessage, null, 2)}</pre>
        </section>
      )}
    </div>
  )
}
