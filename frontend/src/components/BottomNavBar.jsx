import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BatteryCharging,
  BarChart3,
  AlertOctagon,
  Menu,
  X,
  Zap,
  Search,
  MapPin,
  Clock,
  Wallet,
  History,
  Gauge,
  UserX,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getRoleLabel } from '../config/roleConfig';
import { SIDEBAR_NAV_GROUPS } from './Sidebar';

export default function BottomNavBar() {
  const { role, rawUser, logout } = useAuth();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isDriver = role === 'CUSTOMER';

  // Tự động đóng modal menu khi chuyển trang
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  // Cấu hình 4 mục chính cho Tài Xế (Customer)
  const driverNavItems = [
    {
      to: '/driver/stations',
      label: 'Trạm Sạc',
      icon: Search,
    },
    {
      to: '/map',
      label: 'Bản Đồ',
      icon: MapPin,
    },
    {
      to: '/reservations',
      label: 'Đặt Chỗ',
      icon: Clock,
    },
    {
      to: '/wallet',
      label: 'Ví Tiền',
      icon: Wallet,
    },
  ];

  // Cấu hình 4 mục chính cho Quản trị viên & Điều hành lưới (Admin / Operator / Accountant / CPO)
  const adminNavItems = [
    {
      to: '/',
      label: 'Điều Khiển',
      icon: LayoutDashboard,
      end: true,
    },
    {
      to: '/stations',
      label: 'Hạ Tầng',
      icon: BatteryCharging,
    },
    {
      to: '/reports/revenue',
      label: 'Doanh Thu',
      icon: BarChart3,
    },
    {
      to: '/abnormal-sessions',
      label: 'Bất Thường',
      icon: AlertOctagon,
    },
  ];

  const navItems = isDriver ? driverNavItems : adminNavItems;

  // Danh sách dịch vụ dành riêng cho Tài xế trong Bottom Sheet
  const driverServices = [
    { to: '/driver/stations', label: 'Tìm Trạm Sạc', desc: 'Tra cứu trạm & đầu nối rảnh', icon: Search },
    { to: '/map', label: 'Bản Đồ Trực Quan', desc: 'Định vị GPS & dẫn đường tới trạm', icon: MapPin },
    { to: '/reservations', label: 'Đặt Chỗ Trụ Sạc', desc: 'Giữ chỗ trước khi di chuyển', icon: Clock },
    { to: '/wallet', label: 'Ví & Nạp Tiền', desc: 'Quản lý số dư & lịch sử giao dịch', icon: Wallet },
    { to: '/sessions', label: 'Nhật Ký Phiên Sạc', desc: 'Xem chi tiết các lần sạc xe', icon: History },
    { to: '/simulator', label: 'Bảng Giả Lập Sạc', desc: 'Mô phỏng sạc pin & demo phạt đỗ', icon: Gauge },
    { to: '/data-erasure', label: 'Xóa Dữ Liệu', desc: 'Yêu cầu xóa thông tin cá nhân', icon: UserX },
  ];

  return (
    <>
      {/* =========================================================================
          1. BOTTOM NAVIGATION BAR CỐ ĐỊNH Ở ĐÁY MÀN HÌNH (HEIGHT: 60PX)
         ========================================================================= */}
      <nav
        className="fixed bottom-0 left-0 right-0 h-[60px] z-[1000] bg-white/95 dark:bg-[#151D2A]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-1 shadow-lg md:hidden select-none"
        aria-label="Thanh điều hướng đáy điện thoại"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 px-1 transition-colors ${
                  isActive
                    ? 'text-teal-600 dark:text-teal-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
                }`
              }
            >
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive
                    ? 'bg-teal-50 dark:bg-teal-950/60 scale-105'
                    : 'bg-transparent'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 line-clamp-1">
                {item.label}
              </span>
            </NavLink>
          );
        })}

        {/* Nút Mục thứ 5: Menu tiện ích (Mở danh sách dạng Popup trượt từ dưới lên) */}
        <button
          type="button"
          onClick={() => setSheetOpen((prev) => !prev)}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-colors ${
            sheetOpen
              ? 'text-teal-600 dark:text-teal-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
          }`}
          aria-label={isDriver ? 'Mở menu tiện ích tài xế' : 'Mở tất cả 16 mục menu'}
        >
          <div
            className={`p-1 rounded-xl transition-all ${
              sheetOpen
                ? 'bg-teal-50 dark:bg-teal-950/60 scale-105'
                : 'bg-transparent'
            }`}
          >
            <Menu className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight mt-0.5 font-medium">
            {isDriver ? 'Tiện Ích' : 'Menu'}
          </span>
        </button>
      </nav>

      {/* =========================================================================
          2. BOTTOM SHEET MODAL / POPUP TRƯỢT TỪ DƯỚI LÊN
         ========================================================================= */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[1050] md:hidden">
          {/* Lớp phủ mờ (Backdrop) */}
          <div
            onClick={() => setSheetOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            aria-hidden="true"
          />

          {/* Khung Sheet nổi trượt từ đáy lên */}
          <div
            data-testid="bottom-sheet-menu"
            className="fixed inset-x-0 bottom-0 max-h-[85vh] bg-white dark:bg-[#151D2A] rounded-t-2xl z-[1060] flex flex-col shadow-2xl border-t border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-250 ease-out"
          >
            {/* Thanh gạt kéo nhỏ ở đỉnh sheet */}
            <div className="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto my-2.5 shrink-0" />

            {/* Header của Sheet */}
            <div className="px-4 pb-3 pt-1 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-teal-500 flex items-center justify-center text-white shadow-xs">
                  <Zap className="w-4 h-4 fill-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    {isDriver ? 'Dịch Vụ Tài Xế' : 'Tất Cả Chức Năng'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isDriver
                      ? 'Cổng dịch vụ sạc xe điện EV CSMS'
                      : 'Hệ thống 16 mục điều phối EV CSMS'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Đóng popup menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thông tin tài khoản người dùng */}
            {rawUser && (
              <div className="mx-4 mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {(rawUser.full_name || rawUser.username || 'U')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {rawUser.full_name || rawUser.username}
                    </p>
                    <p className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                      {getRoleLabel(rawUser.role)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSheetOpen(false);
                    logout();
                  }}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}

            {/* Nội dung danh sách điều hướng */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 pb-12">
              {isDriver ? (
                /* Giao diện dành riêng cho Tài Xế: Danh sách dịch vụ thân thiện, dễ bấm */
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
                    Tiện Ích Cho Tài Xế
                  </span>
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {driverServices.map((item) => {
                      const ItemIcon = item.icon;
                      const isCurrentActive = location.pathname.startsWith(item.to);

                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={() => setSheetOpen(false)}
                          className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                            isCurrentActive
                              ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold border border-teal-200 dark:border-teal-800/60 shadow-xs'
                              : 'bg-white dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 font-medium'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isCurrentActive
                                  ? 'bg-teal-500 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <ItemIcon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 text-left">
                              <p className="text-xs font-semibold leading-tight truncate">
                                {item.label}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal truncate mt-0.5">
                                {item.desc}
                              </p>
                            </div>
                          </div>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Giao diện dành cho Admin & Vận hành viên (16 mục chia 4 nhóm) */
                SIDEBAR_NAV_GROUPS.map((group, groupIdx) => {
                  const visibleItems = group.items.filter(
                    (item) => !role || item.roles.includes(role)
                  );
                  if (visibleItems.length === 0) return null;

                  return (
                    <div key={groupIdx} className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2">
                        {group.title}
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        {visibleItems.map((item) => {
                          const ItemIcon = item.icon;
                          const isCurrentActive =
                            item.to === '/'
                              ? location.pathname === '/'
                              : location.pathname.startsWith(item.to);

                          return (
                            <NavLink
                              key={item.to}
                              to={item.to}
                              end={item.to === '/'}
                              onClick={() => setSheetOpen(false)}
                              className={`flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs transition-colors ${
                                isCurrentActive
                                  ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold border border-teal-200 dark:border-teal-800/60'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 font-medium'
                              }`}
                            >
                              <ItemIcon className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" />
                              <span className="truncate">{item.label}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
