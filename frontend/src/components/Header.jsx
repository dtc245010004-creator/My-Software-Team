import React, { useState, useEffect } from 'react';
import { User, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { telemetryWs, WS_STATUS } from '../services/websocket';
import { getRoleLabel } from '../config/roleConfig';
import ThemeToggle from './ui/ThemeToggle';

export default function Header({ onToggleMobileSidebar }) {
  const { user, rawUser, role, isGuest, logout } = useAuth();
  const [wsStatus, setWsStatus] = useState(WS_STATUS.IDLE);
  const wsOnline = wsStatus === WS_STATUS.CONNECTED;

  useEffect(() => {
    const unsubscribe = telemetryWs.addStatusListener((status) => setWsStatus(status));
    telemetryWs.connect();
    return unsubscribe;
  }, []);

  const getInitials = (name) => {
    if (!name) return 'QT';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="h-16 shrink-0 z-30 bg-white dark:bg-[#151D2A] border-b border-slate-200 dark:border-slate-800 transition-colors duration-200 px-4 sm:px-6 hidden md:flex items-center justify-between shadow-sm">
      {/* Bên trái Header: Nút mở menu trên Mobile & Phụ đề hệ thống */}
      <div className="flex items-center space-x-3 min-w-0">
        {onToggleMobileSidebar && (
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            className="p-1.5 -ml-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden transition-colors"
            title="Mở thanh điều hướng"
            aria-label="Mở thanh điều hướng"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 truncate">
          {role === 'CUSTOMER'
            ? 'Cổng Dịch Vụ Sạc Xe Điện Dành Cho Tài Xế'
            : 'Hệ thống Điều phối Trạm sạc & Quản trị Lưới điện'}
        </p>
      </div>

      {/* Bên phải Header: Cụm công cụ (Trạng thái trực tuyến, Theme, User info, Logout) */}
      <div className="flex items-center space-x-2.5 sm:space-x-4 shrink-0 ml-4">
        {/* Badge trạng thái trực tuyến (nền xanh lá nhạt, chữ xanh lá) */}
        <div
          className={`flex items-center space-x-2 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
            wsOnline
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/60'
          }`}
          title={wsOnline ? 'Kết nối Telemetry thời gian thực đang hoạt động' : 'Mất kết nối WebSocket'}
        >
          <span className="relative flex h-2 w-2">
            {wsOnline && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                wsOnline ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
          </span>
          <span className="text-xs font-semibold hidden sm:inline">
            {wsOnline ? 'Trực tuyến' : 'Mất kết nối'}
          </span>
        </div>

        {/* Nút chuyển đổi giao diện Sáng / Tối */}
        <ThemeToggle />

        {/* Cụm thông tin người dùng: Avatar tròn, tên người dùng / vai trò, nút đăng xuất */}
        {!isGuest && rawUser ? (
          <div className="flex items-center space-x-2 sm:space-x-3 pl-2 sm:pl-3 border-l border-slate-200 dark:border-slate-800">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
              {getInitials(rawUser.full_name || rawUser.username)}
            </div>
            <div className="hidden sm:block text-left text-xs leading-tight">
              <p className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[130px]">
                {rawUser.full_name || rawUser.username}
              </p>
              <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                {getRoleLabel(rawUser.role)}
              </p>
            </div>
            <button
              onClick={logout}
              title="Đăng xuất"
              className="p-2 rounded-xl text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-slate-800">
            <a
              href="/login"
              className="text-xs font-medium px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-600/20 transition-all duration-150 inline-flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5" />
              <span>Đăng nhập</span>
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
