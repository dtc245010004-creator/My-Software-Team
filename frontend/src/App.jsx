import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import { getHomeRouteByRole } from './utils/routeUtils';

function AppLayout() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center font-mono text-xs text-steel-gray">
        Khởi tạo hệ thống điều phối EV CSMS...
      </div>
    );
  }

  const homeRoute = getHomeRouteByRole(role);

  return (
    <div className="min-h-screen bg-obsidian text-tech-white flex flex-col font-sans">
      <Header />
      <Navigation />
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
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
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
