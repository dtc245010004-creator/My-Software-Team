import React, { useState, useEffect } from 'react';
import { Zap, Shield, User, LogOut, Radio, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { telemetryWs } from '../services/websocket';

export default function Header() {
  const { user, rawUser, role, isGuest, logout, quickSwitch } = useAuth();
  const [wsOnline, setWsOnline] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    telemetryWs.connect();
    const interval = setInterval(() => {
      setWsOnline(telemetryWs.isConnected);
    }, 1000);
    return () => clearInterval(interval);
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

  return (
    <header className="bg-panel border-b border-hairline px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      {/* Brand & Substation Identifier */}
      <div className="flex items-center space-x-3">
        <div className="bg-electric-cyan/20 border border-electric-cyan/40 p-2 rounded">
          <Zap className="w-5 h-5 text-electric-cyan" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-base tracking-wide text-tech-white">EV CSMS</span>
            <span className="text-xs px-2 py-0.5 rounded bg-hairline text-steel-gray font-mono">
              OPERATIONS CONSOLE v1.0
            </span>
          </div>
          <p className="text-xs text-steel-gray">Hệ thống Điều phối Trạm sạc & Quản trị Lưới điện Thông minh</p>
        </div>
      </div>

      {/* Realtime Status & Role Switcher */}
      <div className="flex items-center space-x-5">
        {/* WebSocket Signal Indicator */}
        <div className="flex items-center space-x-2 bg-obsidian px-3 py-1.5 rounded border border-hairline text-xs font-mono">
          <Radio className={`w-3.5 h-3.5 ${wsOnline ? 'text-grid-green' : 'text-critical-red animate-pulse'}`} />
          <span className={wsOnline ? 'text-grid-green' : 'text-critical-red'}>
            {wsOnline ? 'TELEMETRY LIVE' : 'DISCONNECTED'}
          </span>
        </div>

        {/* 1-Click Role Switcher for Demo / Defense */}
        <div className="flex items-center bg-obsidian rounded border border-hairline p-0.5 text-xs font-mono">
          <span className="px-2 text-steel-gray text-[11px] uppercase tracking-wider">Demo Role:</span>
          <button
            onClick={() => handleRoleChange('ADMIN')}
            disabled={switching}
            className={`px-2.5 py-1 rounded transition-colors ${
              role === 'ADMIN'
                ? 'bg-critical-red/20 text-critical-red border border-critical-red/40 font-bold'
                : 'text-steel-gray hover:text-tech-white'
            }`}
          >
            Admin
          </button>
          <button
            onClick={() => handleRoleChange('OPERATOR')}
            disabled={switching}
            className={`px-2.5 py-1 rounded transition-colors ${
              role === 'OPERATOR'
                ? 'bg-caution-amber/20 text-caution-amber border border-caution-amber/40 font-bold'
                : 'text-steel-gray hover:text-tech-white'
            }`}
          >
            CPO
          </button>
          <button
            onClick={() => handleRoleChange('CUSTOMER')}
            disabled={switching}
            className={`px-2.5 py-1 rounded transition-colors ${
              role === 'CUSTOMER'
                ? 'bg-grid-green/20 text-grid-green border border-grid-green/40 font-bold'
                : 'text-steel-gray hover:text-tech-white'
            }`}
          >
            Tài xế
          </button>
        </div>

        {/* User Info & Role State */}
        {!isGuest && rawUser ? (
          <div className="flex items-center space-x-3 pl-2 border-l border-hairline">
            <div className="text-right">
              <p className="text-xs font-medium text-tech-white">{rawUser.full_name || rawUser.username}</p>
              <p className="text-[10px] text-steel-gray font-mono uppercase">{rawUser.role}</p>
            </div>
            <button
              onClick={logout}
              title="Đăng xuất"
              className="p-1.5 rounded hover:bg-hairline text-steel-gray hover:text-critical-red transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-3 pl-2 border-l border-hairline">
            <div className="text-right">
              <p className="text-xs font-medium text-tech-white">{user.full_name || 'Tài xế sạc'}</p>
              <p className="text-[10px] text-grid-green font-mono">Tự do (Không cần đăng nhập)</p>
            </div>
            <a
              href="/login"
              className="text-xs px-2.5 py-1 rounded bg-obsidian border border-hairline text-steel-gray hover:text-tech-white hover:bg-hairline font-mono transition-colors"
            >
              Đăng nhập CPO/Admin
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
