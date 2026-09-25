import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Interceptor tự động gắn JWT Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ev_csms_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor xử lý lỗi chung
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Khi token hết hạn, chỉ dọn dẹp nếu không phải đang ở trang login
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('ev_csms_token');
        localStorage.removeItem('ev_csms_user');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
