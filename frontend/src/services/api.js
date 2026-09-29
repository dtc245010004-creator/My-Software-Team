import axios from 'axios'

<<<<<<< Updated upstream
const API_BASE = '/api'

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
=======
const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
  withCredentials: true,
});

// Interceptor xử lý lỗi chung
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Khi token hết hạn, chỉ dọn dẹp nếu ĐÃ CÓ token và không phải đang ở trang login
      const hadUser = localStorage.getItem('ev_csms_user');
      if (hadUser && !window.location.pathname.includes('/login')) {
        localStorage.removeItem('ev_csms_user');
      }
    }
    return Promise.reject(error);
>>>>>>> Stashed changes
  }
  return config
})

export async function loginRequest(email, password) {
  const res = await apiClient.post('/auth/login', { email, password })
  return res.data
}

export async function fetchCurrentUser() {
  const res = await apiClient.get('/auth/me')
  return res.data
}
