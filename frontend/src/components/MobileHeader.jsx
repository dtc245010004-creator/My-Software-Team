import React, { useState, useEffect } from 'react';
import { Zap, User, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { telemetryWs, WS_STATUS } from '../services/websocket';
import { getRoleLabel } from '../config/roleConfig';
import ThemeToggle from './ui/ThemeToggle';

export default function MobileHeader() {
  const { user, rawUser, role, isGuest, logout } = useAuth();
  const [wsStatus, setWsStatus] = useState(WS_STATUS.IDLE);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const wsOnline = wsStatus === WS_STATUS.CONNECTED;
  const isDriver = role === 'CUSTOMER';

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
    <header className="h-14 shrink-0 z-40 bg-white dark:bg-[#151D2A] border-b border-slate-200 dark:border-slate-800 transition-colors duration-200 px-4 flex md:hidden items-center justify-between shadow-xs relative">
      {/* Bên trái: Logo EV CSMS & Icon tia sét ngọc */}
      <div className="flex items-center space-x-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-500 to-emerald-400 p-0.5 shadow-sm shadow-teal-500/20 flex items-center justify-center shrink-0">
          <div className="w-full h-full bg-slate-900/10 rounded-[6px] flex items-center justify-center">
            <Zap className="w-4 h-4 text-white fill-white/90" />
          </div>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
            EV CSMS
          </span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60">
            {isDriver ? 'Tài Xế' : 'Hệ Thống'}
          </span>
        </div>
      </div>

      {/* Bên phải: Trạng thái trực tuyến, Theme Toggle & Avatar Người dùng */}
      <div className="flex items-center space-x-2">
        {/* Badge trạng thái trực tuyến gọn gàng */}
        <div
          className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
            wsOnline
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/60'
          }`}
          title={wsOnline ? 'Trực tuyến' : 'Mất kết nối'}
        >
          <span className="relative flex h-1.5 w-1.5">
            {wsOnline && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                wsOnline ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
          </span>
          <span className="text-[10px] font-bold">
            {isDriver ? (wsOnline ? 'Sẵn sàng' : 'Offline') : (wsOnline ? 'Live' : 'Off')}
          </span>
        </div>

        {/* Nút chuyển theme sáng / tối */}
        <ThemeToggle />

        {/* Avatar Người dùng kèm Dropdown Menu */}
        {!isGuest && rawUser ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserMenu((prev) => !prev)}
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
              aria-label="Tài khoản"
            >
              {getInitials(rawUser.full_name || rawUser.username)}
            </button>

            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-3 text-xs animate-in fade-in zoom-in-95 duration-150">
                  <div className="pb-2.5 mb-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      {rawUser.full_name || rawUser.username}
                    </p>
                    <p className="text-sky-600 dark:text-sky-400 font-medium text-[11px] mt-0.5">
                      {getRoleLabel(rawUser.role)}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-2 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-medium transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <a
            href="/login"
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-600 text-white shadow-xs"
          >
            Đăng nhập
          </a>
        )}
      </div>
    </header>
  );
}

