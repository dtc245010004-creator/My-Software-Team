import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { telemetryWs } from '../services/websocket';
import { DEMO_USERS } from '../config/roleConfig';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('ev_csms_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('ev_csms_token'));
  const [guestName, setGuestName] = useState(() => localStorage.getItem('ev_csms_guest_name') || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyUser = async () => {
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data);
          localStorage.setItem('ev_csms_user', JSON.stringify(res.data));
        } catch (err) {
          // Token hỏng hoặc hết hạn
          logout();
        }
      }
      setLoading(false);
    };
    verifyUser();
  }, [token]);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', {
      username,
      password,
    });

    const accessToken = res.data.access_token;
    localStorage.setItem('ev_csms_token', accessToken);
    setToken(accessToken);

    const userData = res.data.user;
    setUser(userData);
    localStorage.setItem('ev_csms_user', JSON.stringify(userData));
    return userData;
  };

  const register = async (userData) => {
    const res = await api.post('/auth/register', userData);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('ev_csms_token');
    localStorage.removeItem('ev_csms_user');
    setUser(null);
    setToken(null);
    // Đóng WS khi logout để không stream data của user cũ
    telemetryWs.disconnect();
  };

  const updateGuestName = (name) => {
    setGuestName(name);
    localStorage.setItem('ev_csms_guest_name', name);
  };

  // Nút 1-click chuyển nhanh vai trò cho buổi bảo vệ đồ án / demo
  const quickSwitch = async (roleKey) => {
    try {
      if (roleKey === 'ADMIN') {
        await login(DEMO_USERS.ADMIN.username, DEMO_USERS.ADMIN.password);
      } else if (roleKey === 'OPERATOR' || roleKey === 'OPERATOR_A' || roleKey === 'OPERATOR_B') {
        await login('operator_a', 'OpPass123');
      } else {
        // Role Tài xế không cần đăng nhập: chuyển trực tiếp sang chế độ tài xế tự do
        logout();
      }
    } catch (err) {
      console.warn('Đăng nhập nhanh demo thất bại:', err);
      throw err;
    }
  };

  // Xác định tài khoản demo hiện tại
  let currentDemoKey = 'CUSTOMER';
  if (user?.role === 'ADMIN') {
    currentDemoKey = 'ADMIN';
  } else if (user?.role === 'OPERATOR') {
    currentDemoKey = 'OPERATOR';
  }

  // Nếu chưa đăng nhập, mặc định hoạt động dưới vai trò CUSTOMER (Tài xế sạc không cần đăng nhập)
  const effectiveRole = user?.role || 'CUSTOMER';
  const effectiveUser = user || {
    username: 'driver_guest',
    full_name: guestName || 'Tài xế sạc (Khách)',
    role: 'CUSTOMER',
    is_guest: true,
  };

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        rawUser: user,
        token,
        role: effectiveRole,
        isGuest: !user,
        guestName,
        updateGuestName,
        loading,
        login,
        register,
        logout,
        quickSwitch,
        currentDemoKey,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
