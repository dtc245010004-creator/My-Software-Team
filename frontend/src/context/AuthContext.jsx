import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { clearSession, loadStoredSession, performLogin } from '../services/authService'

const AuthContext = createContext(null)

<<<<<<< Updated upstream
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => loadStoredSession())
  const [status, setStatus] = useState('idle')

  const login = useCallback(async (email, password) => {
    setStatus('loading')
    try {
      const result = await performLogin(email, password)
      setSession({ token: result.token, user: result.user })
      setStatus('idle')
      return result
=======
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('ev_csms_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(null);
  const [guestName, setGuestName] = useState(() => localStorage.getItem('ev_csms_guest_name') || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyUser = async () => {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
        setToken('cookie-session');
        localStorage.setItem('ev_csms_user', JSON.stringify(res.data));
      } catch (err) {
        setUser(null);
        setToken(null);
        localStorage.removeItem('ev_csms_user');
      }
      setLoading(false);
    };
    verifyUser();
  }, []);

  const login = async (identifier, password) => {
    const credential = identifier.includes('@') ? { email: identifier } : { username: identifier };
    const res = await api.post('/auth/login', { ...credential, password });

    setToken('cookie-session');

    const userData = res.data.user;
    setUser(userData);
    localStorage.setItem('ev_csms_user', JSON.stringify(userData));
    return userData;
  };

  const register = async (userData) => {
    const res = await api.post('/auth/register', userData);
    return res.data;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // Xóa trạng thái cục bộ kể cả khi phiên đã hết hạn.
    }
    localStorage.removeItem('ev_csms_user');
    setUser(null);
    setToken(null);
  };

  const updateGuestName = (name) => {
    setGuestName(name);
    localStorage.setItem('ev_csms_guest_name', name);
  };

  // Nút 1-click chuyển nhanh vai trò cho buổi bảo vệ đồ án / demo
  const quickSwitch = async (role) => {
    try {
      if (role === 'ADMIN') {
        await login('admin@evcsms.vn', 'AdminPass123');
      } else if (role === 'OPERATOR') {
        await login('cpo_vinfast@evcsms.vn', 'OpPass123');
      } else {
        // Role Tài xế không cần đăng nhập: chuyển trực tiếp sang chế độ tài xế tự do
        logout();
      }
>>>>>>> Stashed changes
    } catch (err) {
      setStatus('idle')
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      isAuthenticated: Boolean(session?.token),
      status,
      login,
      logout,
    }),
    [session, status, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
