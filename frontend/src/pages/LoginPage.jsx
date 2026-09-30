import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Mail, Lock, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { extractApiError } from '../services/authService'
import './LoginPage.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(form) {
  const errors = {}
  if (!form.email.trim()) errors.email = 'Vui lòng nhập email'
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Email không đúng định dạng'
  if (!form.password) errors.password = 'Vui lòng nhập mật khẩu'
  return errors
}

function firstErrorMessage(errors) {
  if (errors.email) return errors.email
  if (errors.password) return errors.password
  return null
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, status } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const submitting = status === 'loading'

  // Reset form mỗi khi vào /login.
  // Nếu có location.state.registeredEmail (từ trang đăng ký chuyển sang),
  // điền sẵn email để người dùng chỉ cần nhập mật khẩu.
  useEffect(() => {
    const prefillEmail = location.state?.registeredEmail
    setForm({ email: prefillEmail || '', password: '' })
    setErrors({})
    setShowPassword(false)
    if (prefillEmail) {
      // Xoá state để F5 không bị giữ lại vĩnh viễn
      window.history.replaceState({}, '')
    }
  }, [location.state])

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const v = validate(form)
    setErrors(v)
    if (Object.keys(v).length > 0) {
      toast.error(firstErrorMessage(v) || 'Vui lòng kiểm tra lại biểu mẫu')
      return
    }
    try {
      await login(form.email.trim(), form.password)
      toast.success('Đăng nhập thành công')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const message = extractApiError(err)
      toast.error(message)
      // Sai email hoặc password: xóa trắng cả 2 ô để user nhập lại từ đầu
      setForm({ email: '', password: '' })
      setErrors({})
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <LogIn size={32} className="login-icon" aria-hidden />
          <h1>Đăng nhập</h1>
          <p>Hệ thống quản lý trạm sạc xe điện EV CSMS</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="login-form">
          <div className={`login-field ${errors.email ? 'has-error' : ''}`}>
            <label htmlFor="email">
              <Mail size={16} aria-hidden /> Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="ten@vi-du.com"
              value={form.email}
              onChange={handleChange('email')}
              disabled={submitting}
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && (
              <span className="login-error" role="alert">
                <AlertCircle size={14} aria-hidden /> {errors.email}
              </span>
            )}
          </div>

          <div className={`login-field ${errors.password ? 'has-error' : ''}`}>
            <label htmlFor="password">
              <Lock size={16} aria-hidden /> Mật khẩu
            </label>
            <div className="login-password-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                value={form.password}
                onChange={handleChange('password')}
                disabled={submitting}
                aria-invalid={Boolean(errors.password)}
              />
              <button
                type="button"
                className="login-toggle-eye"
                onClick={() => setShowPassword((v) => !v)}
                disabled={submitting}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <span className="login-error" role="alert">
                <AlertCircle size={14} aria-hidden /> {errors.password}
              </span>
            )}
          </div>

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>

          <p className="login-hint">
            Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
