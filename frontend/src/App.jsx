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
import DriverStationsList from './pages/DriverStationsList';
import AbnormalSessions from './pages/AbnormalSessions';
import AuditLogs from './pages/AuditLogs';
import TariffForm from './components/TariffForm';
import ChargerDetail from './pages/ChargerDetail';
import ChargerGridMonitor from './pages/ChargerGridMonitor';
import InvoiceDetail from './pages/InvoiceDetail';
import Reservations from './pages/Reservations';
import StationReport from './pages/StationReport';
import ReconciliationReport from './pages/ReconciliationReport';
import Settlement from './pages/Settlement';
import DataErasure from './pages/DataErasure';
import AdminDataErasure from './pages/AdminDataErasure';
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
          <Route
            path="/"
            element={
              role === 'CUSTOMER' ? <Navigate to="/driver/stations" replace /> : <Dashboard />
            }
          />
          {/* Màn hình tìm trạm và thấy đầu nối rảnh cho Tài xế (SCRUM-351 / SCRUM-359 / SCRUM-360) */}
          <Route path="/driver/stations" element={<DriverStationsList />} />
          <Route path="/map" element={<DriverMap />} />
          <Route
            path="/stations"
            element={
              role === 'CUSTOMER' ? <Navigate to="/driver/stations" replace /> : <Stations />
            }
          />
          {/* Màn hình báo cáo doanh thu & sản lượng theo trạm (SCRUM-384 / SCRUM-392) */}
          <Route
            path="/reports/revenue"
            element={
              ['ADMIN', 'OPERATOR', 'ACCOUNTANT', 'CPO'].includes(role)
                ? <StationReport />
                : <Navigate to={homeRoute} replace />
            }
          />
          <Route path="/reports" element={<Navigate to="/reports/revenue" replace />} />
          {/* Màn hình đối soát kế toán kWh với tiền đã thu (SCRUM-385 / SCRUM-397) */}
          <Route
            path="/reconciliation"
            element={
              ['ADMIN', 'ACCOUNTANT'].includes(role)
                ? <ReconciliationReport />
                : <Navigate to={homeRoute} replace />
            }
          />
          <Route path="/reports/reconciliation" element={<Navigate to="/reconciliation" replace />} />
          {/* Màn hình chốt/mở lại kỳ đối soát và chia doanh thu (S-55 / SCRUM-387 / SCRUM-408) */}
          <Route
            path="/settlement"
            element={
              ['ADMIN', 'ACCOUNTANT'].includes(role)
                ? <Settlement />
                : <Navigate to={homeRoute} replace />
            }
          />
          <Route
            path="/tariffs"
            element={
              ['ADMIN', 'OPERATOR', 'CPO'].includes(role) ? <TariffForm /> : <Navigate to={homeRoute} replace />
            }
          />
          <Route
            path="/simulator"
            element={
              role === 'CUSTOMER' ? <Simulator /> : <Navigate to={homeRoute} replace />
            }
          />
          <Route path="/wallet" element={<Wallet />} />
          {/* Return URL / Callback từ cổng thanh toán Sandbox (SCRUM-239 & SCRUM-240) */}
          <Route path="/wallet/topup/result" element={<Wallet />} />
          {/* Lịch sử đặt chỗ và phí quá hạn giữ chỗ (S-50 / SCRUM-354 / SCRUM-378) */}
          <Route path="/reservations" element={<Reservations />} />
          <Route path="/sessions" element={<Sessions />} />
          {/* Danh sách phiên bất thường trên màn hình vận hành (SCRUM-52 / SCRUM-148): Chỉ Vận hành viên (OPERATOR) và Kế toán (ACCOUNTANT) */}
          <Route
            path="/abnormal-sessions"
            element={
              ['ADMIN', 'OPERATOR', 'ACCOUNTANT'].includes(role)
                ? <AbnormalSessions />
                : <Navigate to={homeRoute} replace />
            }
          />
          <Route path="/session/:id" element={<ActiveSession />} />
          {/* Màn hình lưới theo dõi trụ sạc (SCRUM-52 / SCRUM-129 / SCRUM-320) */}
          <Route
            path="/charger-grid"
            element={
              ['ADMIN', 'OPERATOR'].includes(role)
                ? <ChargerGridMonitor />
                : <Navigate to={homeRoute} replace />
            }
          />
          {/* Màn hình trụ sạc và điều khiển bắt đầu từ xa (S-24 / T-52 / SCRUM-154) */}
          <Route path="/chargers/:id" element={<ChargerDetail />} />
          <Route path="/charger/:id" element={<ChargerDetail />} />
          {/* Màn hình hóa đơn chi tiết từng đoạn giá (S-33 / SCRUM-224) */}
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/invoice/:id" element={<InvoiceDetail />} />
          {/* Tra cứu nhật ký vận hành (T-58): Chỉ ADMIN và OPERATOR */}
          <Route
            path="/audit-logs"
            element={
              role === 'CUSTOMER' ? <Navigate to="/map" replace /> : <AuditLogs />
            }
          />
          <Route
            path="/ai-advisor"
            element={
              role === 'CUSTOMER' ? <Navigate to="/map" replace /> : <AIAdvisor />
            }
          />
          <Route
            path="/admin"
            element={
              role === 'ADMIN' ? <AdminPanel /> : <Navigate to={homeRoute} replace />
            }
          />
          {/* Quản lý yêu cầu xóa dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP (SCRUM-418 / SCRUM-389) */}
          <Route
            path="/data-erasure"
            element={
              role === 'CUSTOMER' ? <DataErasure /> : <Navigate to={homeRoute} replace />
            }
          />
          <Route
            path="/admin/data-erasure"
            element={
              role === 'ADMIN' ? <AdminDataErasure /> : <Navigate to={homeRoute} replace />
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
