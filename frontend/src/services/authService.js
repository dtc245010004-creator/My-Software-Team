import { loginRequest } from './api'

const TOKEN_KEY = 'access_token'
const USER_KEY = 'auth_user'

function readUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function performLogin(email, password) {
  const data = await loginRequest(email, password)
  if (!data?.access_token) {
    throw new Error('Phản hồi từ máy chủ không hợp lệ')
  }
  localStorage.setItem(TOKEN_KEY, data.access_token)
  localStorage.setItem(USER_KEY, JSON.stringify(data.user ?? null))
  return { token: data.access_token, user: data.user ?? null }
}

export function loadStoredSession() {
  const token = localStorage.getItem(TOKEN_KEY)
  const user = readUser()
  return token ? { token, user } : null
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function extractApiError(error) {
  if (!error) return 'Đã xảy ra lỗi không xác định'
  if (error.response) {
    const status = error.response.status
    const detail = error.response.data?.detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (status === 401) return 'Email hoặc mật khẩu không chính xác'
    if (status === 403) return 'Tài khoản tạm thời bị khóa. Vui lòng thử lại sau.'
    if (status === 423) return 'Tài khoản tạm thời bị khóa. Vui lòng thử lại sau.'
    if (status === 429) return 'Bạn đã thao tác quá nhiều. Vui lòng chờ một lát.'
    if (status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'
    return `Lỗi ${status}`
  }
  if (error.request) return 'Không thể kết nối đến máy chủ. Kiểm tra kết nối mạng.'
  return error.message || 'Đã xảy ra lỗi không xác định'
}
