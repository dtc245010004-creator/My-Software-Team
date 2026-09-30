import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn, UserPlus, Mail, Lock, User, Phone, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '../services/api'
import './LoginPage.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(form) {
  const errors = {}
  if (!form.full_name.trim()) errors.full_name = 'Vui lòng nhập họ tên'
  else if (form.full_name.trim().length < 2) errors.full_name = 'Họ tên phải có ít nhất 2 ký tự'
  if (!form.email.trim()) errors.email = 'Vui lòng nhập email'
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Email không đúng định dạng'
  if (!form.password) errors.password = 'Vui lòng nhập mật khẩu'
  else if (form.password.length < 6) errors.password = 'Mật khẩu phải có ít nhất 6 ký tự'
  else if (form.password.length > 72) errors.password = 'Mật khẩu không được vượt quá 72 ký tự'
  if (form.password !== form.confirmPassword) errors.confirmPassword = 'Mật khẩu xác nhận không khớp'
  return errors
}

function firstErrorMessage(errors) {
  if (errors.full_name) return errors.full_name
  if (errors.email) return errors.email
  if (errors.password) return errors.password
  if (errors.confirmPassword) return errors.confirmPassword
  return null
}

function mapFieldErrors(err) {
  const detail = err?.response?.data?.detail
  if (!Array.isArray(detail)) return {}
  const out = {}
  for (const item of detail) {
    const field = item.loc?.[item.loc.length - 1]
    if (field && item.msg) out[field] = item.msg
  }
  return out
}

function friendlyApiMessage(err) {
  const status = err?.response?.status
  const detail = err?.response?.data?.detail
  if (status === 409) return detail || 'Email đã được sử dụng. Vui lòng chọn email khác.'
  if (status === 422) return 'Thông tin đăng ký chưa hợp lệ. Vui lòng kiểm tra lại.'
  if (status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'
  if (err?.request) return 'Không thể kết nối đến máy chủ. Kiểm tra kết nối mạng.'
  if (typeof detail === 'string' && detail.trim()) return detail
  return 'Đã xảy ra lỗi không xác định'
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setForm({ full_name: '', email: '', phone: '', password: '', confirmPassword: '' })
    setErrors({})
    setShowPassword(false)
    setShowConfirm(false)
  }, [])

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
    setSubmitting(true)
    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || null,
      }
      await apiClient.post('/auth/register', payload)
      toast.success('Đăng ký thành công. Vui lòng đăng nhập.')
      navigate('/login', {
        replace: true,
        state: { registeredEmail: payload.email },
      })
    } catch (err) {
      const fieldMap = mapFieldErrors(err)
      if (Object.keys(fieldMap).length > 0) {
        setErrors((prev) => ({ ...prev, ...fieldMap }))
      }
      toast.error(friendlyApiMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card login-card-wide">
        <div className="login-header">
          <UserPlus size={32} className="login-icon" aria-hidden />
          <h1>Đăng ký tài khoản</h1>
          <p>Tạo tài khoản khách hàng để bắt đầu sạc xe điện</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="login-form">
          <div className={`login-field ${errors.full_name ? 'has-error' : ''}`}>
            <label htmlFor="full_name">
              <User size={16} aria-hidden /> Họ và tên
            </label>
            <input
              id="full_name"
              type="text"
              autoComplete="name"
              placeholder="Nguyễn Văn A"
              value={form.full_name}
              onChange={handleChange('full_name')}
              disabled={submitting}
              aria-invalid={Boolean(errors.full_name)}
            />
            {errors.full_name && (
              <span className="login-error" role="alert">
                <AlertCircle size={14} aria-hidden /> {errors.full_name}
              </span>
            )}
          </div>

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

          <div className="login-field">
            <label htmlFor="phone">
              <Phone size={16} aria-hidden /> Số điện thoại <span className="login-optional">(tùy chọn)</span>
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="0901234567"
              value={form.phone}
              onChange={handleChange('phone')}
              disabled={submitting}
            />
          </div>

          <div className={`login-field ${errors.password ? 'has-error' : ''}`}>
            <label htmlFor="password">
              <Lock size={16} aria-hidden /> Mật khẩu
            </label>
            <div className="login-password-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Ít nhất 6 ký tự"
                value={form.password}
                onChange={handleChange('password')}
                disabled={submitting}
                aria-invalid={Boolean(errors.password)}
              />
              <button
                type="button"
                className="login-toggle-eye"
                onClick={() => setShowPassword((s) => !s)}
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

          <div className={`login-field ${errors.confirmPassword ? 'has-error' : ''}`}>
            <label htmlFor="confirmPassword">
              <Lock size={16} aria-hidden /> Xác nhận mật khẩu
            </label>
            <div className="login-password-wrap">
              <input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu"
                value={form.confirmPassword}
                onChange={handleChange('confirmPassword')}
                disabled={submitting}
                aria-invalid={Boolean(errors.confirmPassword)}
              />
              <button
                type="button"
                className="login-toggle-eye"
                onClick={() => setShowConfirm((s) => !s)}
                disabled={submitting}
                aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <span className="login-error" role="alert">
                <AlertCircle size={14} aria-hidden /> {errors.confirmPassword}
              </span>
            )}
          </div>

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? 'Đang đăng ký…' : 'Đăng ký'}
          </button>

          <p className="login-hint">
            Đã có tài khoản? <Link to="/login"><LogIn size={14} aria-hidden style={{ verticalAlign: 'middle' }} /> Đăng nhập</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
