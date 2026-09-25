import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BatteryCharging, Gauge, Wallet, History, Cpu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navigation() {
  const { role } = useAuth();

  const navItems = [
    { to: '/', label: 'Bảng Điều Khiển', icon: LayoutDashboard, roles: ['ADMIN', 'OPERATOR'] },
    { to: '/stations', label: 'Hạ Tầng Trạm Sạc', icon: BatteryCharging, roles: ['ADMIN', 'OPERATOR'] },
    { to: '/simulator', label: 'Bảng Giả Lập Sạc (Console)', icon: Gauge, roles: ['ADMIN', 'OPERATOR', 'CUSTOMER'] },
    { to: '/wallet', label: 'Ví Cá Nhân', icon: Wallet, roles: ['ADMIN', 'OPERATOR', 'CUSTOMER'] },
    { to: '/sessions', label: 'Nhật Ký Phiên Sạc', icon: History, roles: ['ADMIN', 'OPERATOR', 'CUSTOMER'] },
    { to: '/ai-advisor', label: 'AI Cố Vấn & Bảo Trì', icon: Cpu, roles: ['ADMIN', 'OPERATOR'] },
  ];

  const visibleItems = navItems.filter((item) => !role || item.roles.includes(role));

  return (
    <nav className="bg-obsidian border-b border-hairline px-6 py-2 flex items-center space-x-1">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center space-x-2 px-3.5 py-1.5 rounded text-xs font-medium transition-all ${
                isActive
                  ? 'bg-panel text-tech-white border border-electric-cyan/40 shadow-sm'
                  : 'text-steel-gray hover:text-tech-white hover:bg-panel/50'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
