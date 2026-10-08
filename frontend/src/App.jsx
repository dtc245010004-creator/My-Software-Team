import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Header from './components/Header';
import Navigation from './components/Navigation';

import Dashboard from './pages/Dashboard';
import Stations from './pages/Stations';
import Simulator from './pages/Simulator';
import Wallet from './pages/Wallet';
import Sessions from './pages/Sessions';
import ActiveSession from './pages/ActiveSession';
import AIAdvisor from './pages/AIAdvisor';
import Login from './pages/Login';
import AdminPanel from './pages/AdminPanel';
import DriverMap from './pages/DriverMap';
import AuditLogs from './pages/AuditLogs';
import ChargerDetail from './pages/ChargerDetail';
import { getHomeRouteByRole } from './utils/routeUtils';

function AppLayout() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] flex items-center justify-center font-sans text-sm text-slate-500 dark:text-slate-400">
        <div className="flex items-center space-x-3">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span>Khởi tạo hệ thống điều phối EV CSMS...</span>
        </div>
      </div>
    );
  }

  const homeRoute = getHomeRouteByRole(role);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-[#F1F5F9] flex flex-col font-sans transition-colors duration-200">
      <Header />
      <Navigation />
      <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
        <Routes>
          {/* Trang chủ /: Chỉ ADMIN và OPERATOR xem Dashboard; CUSTOMER tự động chuyển sang Bản đồ */}
          <Route
            path="/"
            element={
              role === 'CUSTOMER' ? <Navigate to="/map" replace /> : <Dashboard />
            }
          />
          {/* Bản đồ trạm sạc: Dành cho Tài xế */}
          <Route path="/map" element={<DriverMap />} />
          {/* Quản lý Hạ tầng trạm sạc: ADMIN và OPERATOR */}
          <Route
            path="/stations"
            element={
              role === 'CUSTOMER' ? <Navigate to="/map" replace /> : <Stations />
            }
          />
          {/* Giả lập sạc & Ví: Chỉ mở cho CUSTOMER; ADMIN & OPERATOR bị chặn URL */}
          <Route
            path="/simulator"
            element={
              role === 'CUSTOMER' ? <Simulator /> : <Navigate to={homeRoute} replace />
            }
          />
          <Route
            path="/wallet"
            element={
              role === 'CUSTOMER' ? <Wallet /> : <Navigate to={homeRoute} replace />
            }
          />
          {/* Nhật ký phiên sạc: Mọi vai trò đều được xem (phân vùng dữ liệu tại backend) */}
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/session/:id" element={<ActiveSession />} />
          {/* Màn hình trụ sạc và điều khiển bắt đầu từ xa (S-24 / T-52 / SCRUM-154) */}
          <Route path="/chargers/:id" element={<ChargerDetail />} />
          <Route path="/charger/:id" element={<ChargerDetail />} />
          {/* Tra cứu nhật ký vận hành (T-58): Chỉ ADMIN và OPERATOR */}
          <Route
            path="/audit-logs"
            element={
              role === 'CUSTOMER' ? <Navigate to="/map" replace /> : <AuditLogs />
            }
          />
          {/* AI Cố Vấn: ADMIN và OPERATOR */}
          <Route
            path="/ai-advisor"
            element={
              role === 'CUSTOMER' ? <Navigate to="/map" replace /> : <AIAdvisor />
            }
          />
          {/* Admin Panel: Chỉ ADMIN */}
          <Route
            path="/admin"
            element={
              role === 'ADMIN' ? <AdminPanel /> : <Navigate to={homeRoute} replace />
            }
          />
          <Route path="*" element={<Navigate to={homeRoute} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
