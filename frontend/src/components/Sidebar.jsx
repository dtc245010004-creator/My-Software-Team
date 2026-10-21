import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  LayoutGrid,
  BatteryCharging,
  Gauge,
  Wallet,
  History,
  Cpu,
  MapPin,
  Shield,
  ScrollText,
  Clock,
  AlertOctagon,
  Search,
  BarChart3,
  Scale,
  CalendarCheck,
  UserX,
  ShieldAlert,
  Zap,
  ChevronsLeft,
  ChevronsRight,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SIDEBAR_NAV_GROUPS = [
  {
    title: 'GIÁM SÁT & VẬN HÀNH',
    items: [
      { to: '/', label: 'Bảng Điều Khiển', icon: LayoutDashboard, roles: ['ADMIN', 'OPERATOR', 'ACCOUNTANT'] },
      { to: '/driver/stations', label: 'Tìm Trạm Sạc', icon: Search, roles: ['CUSTOMER'] },
      { to: '/map', label: 'Bản Đồ', icon: MapPin, roles: ['CUSTOMER'] },
      { to: '/charger-grid', label: 'Lưới Trụ Sạc', icon: LayoutGrid, roles: ['ADMIN', 'OPERATOR'] },
      { to: '/stations', label: 'Hạ Tầng Trạm Sạc', icon: BatteryCharging, roles: ['ADMIN', 'OPERATOR'] },
      { to: '/abnormal-sessions', label: 'Phiên Bất Thường', icon: AlertOctagon, roles: ['ADMIN', 'OPERATOR', 'ACCOUNTANT'] },
      { to: '/reservations', label: 'Đặt Chỗ', icon: Clock, roles: ['CUSTOMER', 'ADMIN', 'OPERATOR'] },
      { to: '/sessions', label: 'Nhật Ký Phiên Sạc', icon: History, roles: ['ADMIN', 'OPERATOR', 'ACCOUNTANT', 'CUSTOMER'] },
    ],
  },
  {
    title: 'TÀI CHÍNH & ĐỐI SOÁT',
    items: [
      { to: '/reports/revenue', label: 'Báo Cáo Doanh Thu', icon: BarChart3, roles: ['ADMIN', 'OPERATOR', 'ACCOUNTANT', 'CPO'] },
      { to: '/reconciliation', label: 'Đối Soát Kế Toán', icon: Scale, roles: ['ADMIN', 'ACCOUNTANT'] },
      { to: '/settlement', label: 'Kỳ Đối Soát', icon: CalendarCheck, roles: ['ADMIN', 'ACCOUNTANT'] },
      { to: '/tariffs', label: 'Biểu Giá', icon: Clock, roles: ['ADMIN', 'OPERATOR', 'CPO'] },
      { to: '/wallet', label: 'Ví & Nạp Tiền', icon: Wallet, roles: ['CUSTOMER', 'ADMIN', 'OPERATOR', 'ACCOUNTANT', 'CPO'] },
    ],
  },
  {
    title: 'TRA CỨU & HỖ TRỢ',
    items: [
      { to: '/audit-logs', label: 'Tra Cứu Nhật Ký', icon: ScrollText, roles: ['ADMIN', 'OPERATOR', 'ACCOUNTANT'] },
      { to: '/ai-advisor', label: 'Tư Vấn & Bảo Trì', icon: Cpu, roles: ['ADMIN', 'OPERATOR'] },
      { to: '/simulator', label: 'Bảng Giả Lập Sạc', icon: Gauge, roles: ['CUSTOMER', 'ADMIN', 'OPERATOR'] },
    ],
  },
  {
    title: 'HỆ THỐNG',
    items: [
      { to: '/admin', label: 'Quản Trị Hệ Thống', icon: Shield, roles: ['ADMIN'] },
      { to: '/admin/data-erasure', label: 'Duyệt Xóa Dữ Liệu', icon: ShieldAlert, roles: ['ADMIN'] },
      { to: '/data-erasure', label: 'Xóa Dữ Liệu', icon: UserX, roles: ['CUSTOMER'] },
    ],
  },
];

export default function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
}) {
  const { role } = useAuth();
  const location = useLocation();

  // Đóng sidebar trên thiết bị di động khi chuyển route
  useEffect(() => {
    if (setMobileOpen) {
      setMobileOpen(false);
    }
  }, [location.pathname, setMobileOpen]);

  return (
    <>
      {/* Mobile Backdrop Overlay khi mở drawer trên màn hình nhỏ */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Component (Ẩn hoàn toàn trên Mobile < 768px, hiển thị trên Desktop >= 768px) */}
      <aside
        className={`h-screen sticky top-0 hidden md:flex flex-col z-50 shrink-0 bg-white dark:bg-[#151D2A] border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ease-in-out select-none ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        {/* =========================================================================
            1. PHẦN ĐỈNH SIDEBAR (BRAND HEADER)
           ========================================================================= */}
        <div
          className={`h-16 flex items-center border-b border-slate-200 dark:border-slate-800 shrink-0 transition-all ${
            collapsed ? 'justify-center px-0' : 'justify-between px-4'
          }`}
        >
          <div className="flex items-center space-x-3 overflow-hidden">
            {/* Logo icon tia sét (Teal / Xanh ngọc) */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 p-0.5 shadow-md shadow-teal-500/20 flex items-center justify-center transform transition-transform hover:scale-105 shrink-0">
              <div className="w-full h-full bg-slate-900/10 rounded-[10px] flex items-center justify-center">
                <Zap className="w-5 h-5 text-white fill-white/80" />
              </div>
            </div>

            {/* Tên thương hiệu "EV CSMS" và badge nhỏ "Hệ Thống" khi mở rộng */}
            {!collapsed && (
              <div className="flex items-center space-x-2 truncate">
                <span className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                  EV CSMS
                </span>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60 shrink-0">
                  {role === 'CUSTOMER' ? 'Tài Xế' : 'Hệ Thống'}
                </span>
              </div>
            )}
          </div>

          {/* Nút đóng trên mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            title="Đóng menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* =========================================================================
            2. PHẦN THÂN SIDEBAR (DANH SÁCH ĐIỀU HƯỚNG 16 MỤC CHIA LÀM 4 NHÓM)
           ========================================================================= */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5 space-y-4 no-scrollbar">
          {SIDEBAR_NAV_GROUPS.map((group, groupIdx) => {
            const visibleItems = group.items.filter(
              (item) => !role || item.roles.includes(role)
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={groupIdx} className="space-y-1">
                {/* Tiêu đề nhóm (Section Title) */}
                {!collapsed ? (
                  <div className="text-[11px] font-bold text-[#64748b] dark:text-slate-400 uppercase tracking-wider px-3 py-1">
                    {group.title}
                  </div>
                ) : (
                  groupIdx > 0 && (
                    <div className="my-2 border-t border-slate-200/80 dark:border-slate-800/80 mx-2" />
                  )
                )}

                {/* Các mục điều hướng con */}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.to} className="relative group">
                        <NavLink
                          to={item.to}
                          end={item.to === '/'}
                          title={collapsed ? item.label : undefined}
                          className={({ isActive }) =>
                            `flex items-center rounded-lg text-sm transition-all duration-150 ${
                              collapsed
                                ? 'justify-center w-11 h-11 mx-auto'
                                : 'space-x-3 px-3 py-2.5 font-medium'
                            } ${
                              isActive
                                ? 'bg-[#f0fdfa] dark:bg-teal-950/60 text-[#0d9488] dark:text-teal-300 font-semibold shadow-sm border border-teal-200/80 dark:border-teal-800/60'
                                : 'text-[#475569] dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-[#f1f5f9] dark:hover:bg-slate-800/70 border border-transparent'
                            }`
                          }
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          {!collapsed && (
                            <span className="truncate">{item.label}</span>
                          )}
                        </NavLink>

                        {/* Tooltip hiển thị tên mục khi Sidebar đang thu gọn (Hover Tooltip) */}
                        {collapsed && (
                          <div className="fixed left-[76px] px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100 text-xs font-semibold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 z-[9999] whitespace-nowrap border border-slate-700/60">
                            {item.label}
                            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900 dark:border-r-slate-800" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* =========================================================================
            3. PHẦN CHÂN SIDEBAR (SIDEBAR FOOTER VỚI NÚT THU GỌN / MỞ RỘNG)
           ========================================================================= */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/60 dark:bg-[#151D2A]/60">
          {!collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-colors"
              title="Thu gọn menu"
            >
              <span>Thu gọn menu</span>
              <ChevronsLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="w-10 h-10 mx-auto flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-colors"
              title="Mở rộng menu"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

