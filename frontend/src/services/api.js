import axios from 'axios'

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
