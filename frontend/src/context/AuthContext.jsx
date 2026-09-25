import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('ev_csms_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('ev_csms_token'));
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
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const res = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const accessToken = res.data.access_token;
    localStorage.setItem('ev_csms_token', accessToken);
    setToken(accessToken);

    const meRes = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setUser(meRes.data);
    localStorage.setItem('ev_csms_user', JSON.stringify(meRes.data));
    return meRes.data;
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
  };

  // Nút 1-click chuyển nhanh vai trò cho buổi bảo vệ đồ án / demo
  const quickSwitch = async (role) => {
    try {
      if (role === 'ADMIN') {
        await login('admin', 'AdminPass123');
      } else if (role === 'OPERATOR') {
        await login('operator_a', 'OpPass123');
      } else {
        await login('customer_user', 'CusPass123');
      }
    } catch (err) {
      console.warn('Tài khoản demo mặc định chưa tồn tại, vui lòng đăng ký hoặc đăng nhập:', err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, role: user?.role, loading, login, register, logout, quickSwitch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
