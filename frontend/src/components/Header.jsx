import React, { useState, useEffect } from 'react';
import { Zap, Shield, User, LogOut, Radio, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { telemetryWs, WS_STATUS } from '../services/websocket';
import { getRoleLabel } from '../config/roleConfig';
import ThemeToggle from './ui/ThemeToggle';

const STATUS_LABELS = {
  [WS_STATUS.IDLE]: 'CHƯA KẾT NỐI',
  [WS_STATUS.CONNECTING]: 'ĐANG KẾT NỐI…',
  [WS_STATUS.CONNECTED]: 'TELEMETRY LIVE',
  [WS_STATUS.RECONNECTING]: 'ĐANG KẾT NỐI LẠI…',
  [WS_STATUS.DISCONNECTED]: 'DISCONNECTED',
  [WS_STATUS.CLOSED]: 'ĐÃ ĐÓNG',
};

const STATUS_OK = new Set([WS_STATUS.CONNECTED]);
const STATUS_WARN = new Set([WS_STATUS.CONNECTING, WS_STATUS.RECONNECTING]);

export default function Header() {
  const { user, rawUser, role, isGuest, logout, quickSwitch, currentDemoKey } = useAuth();
  const [wsStatus, setWsStatus] = useState(WS_STATUS.IDLE);
  const [switching, setSwitching] = useState(false);
  const wsOnline = STATUS_OK.has(wsStatus);

  useEffect(() => {
    // Subscribe status thay vì poll setInterval(1s) — tiết kiệm CPU và cleanup đúng cách
    const unsubscribe = telemetryWs.addStatusListener((status) => setWsStatus(status));
    // Đảm bảo WS được mở khi Header mount
    telemetryWs.connect();
    return unsubscribe;
  }, []);

  const handleRoleChange = async (targetRole) => {
    try {
      setSwitching(true);
      await quickSwitch(targetRole);
    } catch (err) {
      alert(`Không thể chuyển sang ${targetRole}. Hãy đăng ký hoặc kiểm tra backend.`);
    } finally {
      setSwitching(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#151D2A]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        
        {/* Brand & Substation Identifier */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 p-0.5 shadow-md shadow-sky-500/20 flex items-center justify-center transform transition-transform hover:scale-105">
            <div className="w-full h-full bg-slate-900/10 rounded-[10px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white fill-white/80" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">
                EV CSMS
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">
                Console
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              Hệ thống Điều phối Trạm sạc & Quản trị Lưới điện
            </p>
          </div>
        </div>

        {/* Realtime Status & Role Switcher (Thanh ảnh 2 - chuyển sang bên phải) */}
        <div className="flex items-center space-x-3 sm:space-x-4 shrink-0 ml-auto">
        {/* WebSocket Signal Indicator */}
        <div className="flex items-center space-x-2 bg-obsidian px-3 py-1.5 rounded border border-hairline text-xs font-mono">
          <Radio
            className={`w-3.5 h-3.5 ${
              STATUS_OK.has(wsStatus)
                ? 'text-grid-green'
                : STATUS_WARN.has(wsStatus)
                ? 'text-caution-amber animate-pulse'
                : 'text-critical-red animate-pulse'
            }`}
          />
          <span
            className={
              STATUS_OK.has(wsStatus)
                ? 'text-grid-green'
                : STATUS_WARN.has(wsStatus)
                ? 'text-caution-amber'
                : 'text-critical-red'
            }
          >
            {STATUS_LABELS[wsStatus] || 'DISCONNECTED'}
          </span>
        </div>

        {/* Realtime Status & Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          
          {/* WebSocket Signal Indicator */}
          <div
            className={`hidden md:flex items-center space-x-2 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
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
            <span className="text-[11px] font-mono font-semibold">
              {wsOnline ? 'LIVE' : 'DISCONNECTED'}
            </span>
          </div>

          {/* 1-Click Role Switcher for Demo / Defense */}
          <div className="hidden lg:flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <span className="px-2 text-slate-500 dark:text-slate-400 text-[11px] font-medium">Vai trò:</span>
            <button
              onClick={() => handleRoleChange('ADMIN')}
              disabled={switching}
              title="Quản trị viên toàn hệ thống"
              className={`px-2.5 py-1 rounded-lg font-medium transition-all duration-150 ${
                currentDemoKey === 'ADMIN'
                  ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Admin
            </button>
            <button
              onClick={() => handleRoleChange('OPERATOR')}
              disabled={switching}
              title="Chủ trạm sạc: Quản lý trạm sở hữu"
              className={`px-2.5 py-1 rounded-lg font-medium transition-all duration-150 ${
                currentDemoKey === 'OPERATOR'
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Chủ trạm
            </button>
            <button
              onClick={() => handleRoleChange('ACCOUNTANT')}
              disabled={switching}
              title="Kế toán viên: Tra cứu kiểm toán & đối soát tài chính"
              className={`px-2.5 py-1 rounded-lg font-medium transition-all duration-150 ${
                currentDemoKey === 'ACCOUNTANT'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Kế toán
            </button>
            <button
              onClick={() => handleRoleChange('CUSTOMER')}
              disabled={switching}
              title="Tài xế khách hàng"
              className={`px-2.5 py-1 rounded-lg font-medium transition-all duration-150 ${
                currentDemoKey === 'CUSTOMER'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tài xế
            </button>
          </div>

          {/* Theme Toggle Button */}
          <ThemeToggle />

          {/* User Info & Role State */}
          {!isGuest && rawUser ? (
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {getInitials(rawUser.full_name || rawUser.username)}
              </div>
              <div className="hidden sm:block text-left text-xs leading-tight">
                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[110px]">
                  {rawUser.full_name || rawUser.username}
                </p>
                <p className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">
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
      </div>
    </div>
  </header>
  );
}

