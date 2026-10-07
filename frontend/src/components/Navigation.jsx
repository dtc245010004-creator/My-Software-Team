import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  BatteryCharging,
  Gauge,
  Wallet,
  History,
  Cpu,
  MapPin,
  Shield,
  ScrollText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navigation() {
  const { role } = useAuth();

  const navItems = [
    { to: '/', label: 'Bảng Điều Khiển', icon: LayoutDashboard, roles: ['ADMIN', 'OPERATOR'] },
    { to: '/map', label: 'Bản Đồ', icon: MapPin, roles: ['CUSTOMER'] },
    { to: '/stations', label: 'Hạ Tầng Trạm Sạc', icon: BatteryCharging, roles: ['ADMIN', 'OPERATOR'] },
    { to: '/simulator', label: 'Bảng Giả Lập Sạc', icon: Gauge, roles: ['CUSTOMER'] },
    { to: '/wallet', label: 'Ví Cá Nhân', icon: Wallet, roles: ['CUSTOMER'] },
    { to: '/sessions', label: 'Nhật Ký Phiên Sạc', icon: History, roles: ['ADMIN', 'OPERATOR', 'CUSTOMER'] },
    { to: '/audit-logs', label: 'Tra Cứu Nhật Ký', icon: ScrollText, roles: ['ADMIN', 'OPERATOR'] },
    { to: '/ai-advisor', label: 'AI Cố Vấn & Bảo Trì', icon: Cpu, roles: ['ADMIN', 'OPERATOR'] },
    { to: '/admin', label: 'Quản Trị Hệ Thống', icon: Shield, roles: ['ADMIN'] },
  ];

  const visibleItems = navItems.filter((item) => !role || item.roles.includes(role));

  return (
    <nav className="bg-slate-100/70 dark:bg-[#0E1422]/90 border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center space-x-1.5 py-2 overflow-x-auto no-scrollbar scroll-smooth">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-150 select-none ${
                    isActive
                      ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 font-semibold shadow-sm border border-slate-200/90 dark:border-slate-700/80'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/40'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

