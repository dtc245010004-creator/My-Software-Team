import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wallet,
  RefreshCw,
  Search,
  Filter,
  Info,
  Calendar,
  MapPin,
  Zap,
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  PlusCircle,
  HelpCircle,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatVNDateTime } from '../utils/formatTime';
import {
  RESERVATION_STATUS,
  DEFAULT_NO_SHOW_FEE,
  getReservationStatusMeta,
  formatReservationFee,
  calculateRemainingHoldTime,
  filterReservations,
} from '../utils/reservationUtils';

// Dữ liệu mẫu chuẩn nghiệp vụ S-50 / SCRUM-354 khi Backend subtask đang hoàn thiện
const INITIAL_DEMO_RESERVATIONS = [
  {
    id: 101,
    reservation_code: 'RES-20261013-001',
    station_id: 1,
    station_name: 'Trạm Sạc VinFast Thảo Điền',
    station_address: 'Số 12 Mai Chí Thọ, P. An Phú, TP. Thủ Đức, TP.HCM',
    charger_id: 1,
    charger_code: 'SIM-001',
    connector_id: 1,
    connector_number: 1,
    connector_type: 'CCS 2',
    max_power_kw: 60,
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    valid_until: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    status: 'EXPIRED',
    no_show_fee: 20000,
    wallet_transaction_id: 'TX-LEDGER-901',
    reason: 'Quá hạn 15 phút giữ chỗ nhưng tài xế không tới nhận trụ. Trụ đã mở lại (Available).',
  },
  {
    id: 102,
    reservation_code: 'RES-20261013-002',
    station_id: 2,
    station_name: 'Trạm Sạc Landmark 81',
    station_address: '720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP.HCM',
    charger_id: 2,
    charger_code: 'SIM-002',
    connector_id: 2,
    connector_number: 1,
    connector_type: 'CCS 2',
    max_power_kw: 120,
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    valid_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    status: 'ACTIVE',
    no_show_fee: 25000,
    wallet_transaction_id: null,
    reason: 'Đang trong thời gian giữ chỗ an toàn.',
  },
  {
    id: 103,
    reservation_code: 'RES-20261012-008',
    station_id: 1,
    station_name: 'Trạm Sạc VinFast Thảo Điền',
    station_address: 'Số 12 Mai Chí Thọ, P. An Phú, TP. Thủ Đức, TP.HCM',
    charger_id: 1,
    charger_code: 'SIM-001',
    connector_id: 1,
    connector_number: 1,
    connector_type: 'CCS 2',
    max_power_kw: 60,
    created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    valid_until: new Date(Date.now() - 25.75 * 60 * 60 * 1000).toISOString(),
    status: 'COMPLETED',
    session_id: 9,
    no_show_fee: 0,
    wallet_transaction_id: null,
    reason: 'Khách đến cắm súng lúc 14:08 và bắt đầu phiên sạc đúng hạn.',
  },
  {
    id: 104,
    reservation_code: 'RES-20261011-004',
    station_id: 3,
    station_name: 'Trạm Sạc Cao Tốc Long Thành',
    station_address: 'Km 12 Đường cao tốc TP.HCM - Long Thành - Dầu Giây',
    charger_id: 3,
    charger_code: 'SIM-003',
    connector_id: 1,
    connector_number: 1,
    connector_type: 'CCS 2',
    max_power_kw: 150,
    created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    valid_until: new Date(Date.now() - 47.75 * 60 * 60 * 1000).toISOString(),
    status: 'EXPIRED',
    no_show_fee: 30000,
    wallet_transaction_id: 'TX-LEDGER-842',
    reason: 'Hết thời gian giữ chỗ theo cấu hình trạm cao tốc. Đã trừ phí không đến.',
  },
];

export default function Reservations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();

  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [now, setNow] = useState(new Date());

  // Cập nhật đồng hồ mỗi giây để hiển thị đếm ngược chính xác
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Tải danh sách đặt chỗ (thử gọi API thực, nếu chưa có thì dùng dữ liệu mẫu)
  const fetchReservations = async () => {
    setLoading(true);
    try {
      // Gọi endpoint BE (nếu BE đã triển khai)
      const res = await api.get('/reservations');
      if (Array.isArray(res.data) && res.data.length > 0) {
        setReservations(res.data);
      } else {
        setReservations(INITIAL_DEMO_RESERVATIONS);
      }
    } catch {
      // Fallback dữ liệu demo phục vụ kiểm thử giao diện SCRUM-378
      setReservations(INITIAL_DEMO_RESERVATIONS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservations();
  }, []);

  // Đồng bộ tab với URL
  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setSearchParams(tabKey === 'ALL' ? {} : { tab: tabKey });
  };

  // Thống kê tóm tắt
  const stats = useMemo(() => {
    const total = reservations.length;
    const active = reservations.filter((r) =>
      ['ACTIVE', 'HOLDING', 'PENDING'].includes(String(r.status).toUpperCase())
    ).length;
    const expiredList = reservations.filter((r) =>
      ['EXPIRED', 'OVERDUE', 'CANCELLED_NO_SHOW'].includes(String(r.status).toUpperCase())
    );
    const expiredCount = expiredList.length;
    const totalPenaltyFee = expiredList.reduce(
      (sum, r) => sum + (Number(r.no_show_fee) || DEFAULT_NO_SHOW_FEE),
      0
    );
    const completed = reservations.filter((r) =>
      ['COMPLETED', 'STARTED'].includes(String(r.status).toUpperCase())
    ).length;

    return { total, active, expiredCount, totalPenaltyFee, completed };
  }, [reservations]);

  // Danh sách sau khi lọc
  const filteredList = useMemo(() => {
    return filterReservations(reservations, activeTab, searchTerm);
  }, [reservations, activeTab, searchTerm]);

  // Hành động giả lập tạo 1 lượt đặt chỗ quá hạn mới (Phục vụ hội đồng nghiệm thu / kiểm thử SCRUM-379)
  const handleSimulateExpiredReservation = () => {
    const newExpired = {
      id: Date.now(),
      reservation_code: `RES-MOCK-${Math.floor(1000 + Math.random() * 9000)}`,
      station_id: 1,
      station_name: 'Trạm Sạc VinFast Thảo Điền',
      station_address: 'Số 12 Mai Chí Thọ, P. An Phú, TP. Thủ Đức, TP.HCM',
      charger_id: 1,
      charger_code: 'SIM-001',
      connector_id: 1,
      connector_number: 1,
      connector_type: 'CCS 2',
      max_power_kw: 60,
      created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      valid_until: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      status: 'EXPIRED',
      no_show_fee: 20000,
      wallet_transaction_id: `TX-LEDGER-${Math.floor(100 + Math.random() * 900)}`,
      reason: 'Mô phỏng: Quá giờ giữ chỗ 15 phút không tới nhận trụ. Đã trừ phí không đến 20.000 đ vào ví.',
    };

    setReservations((prev) => [newExpired, ...prev]);
    setActiveTab('EXPIRED');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Tiêu đề trang */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/60 pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/60">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <span>LỊCH SỬ ĐẶT CHỖ &amp; QUẢN LÝ GIỮ CHỖ</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60">
                  S-50 / SCRUM-378
                </span>
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Theo dõi thời hạn giữ chỗ trụ sạc và chi tiết các khoản phí phạt nếu quá giờ không tới nhận trụ.
              </p>
            </div>
          </div>
        </div>

        {/* Nút hành động thao tác */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            type="button"
            onClick={fetchReservations}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center space-x-1.5 shadow-sm"
            title="Làm mới danh sách đặt chỗ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={handleSimulateExpiredReservation}
            className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800/60 transition-colors flex items-center space-x-1.5 shadow-sm"
            title="Tạo giả lập 1 lượt đặt chỗ quá hạn bị tính phí để kiểm thử đối soát với ví"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Giả Lập Quá Hạn (Demo)</span>
          </button>

          <Link
            to="/wallet"
            className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center space-x-1.5 shadow-sm"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Ví Cá Nhân</span>
          </Link>
        </div>
      </div>

      {/* Thẻ thống kê 4 chỉ số chính */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Tổng đặt chỗ */}
        <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-mono font-semibold block">
              TỔNG ĐẶT CHỖ
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono mt-1 block">
              {stats.total}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* Đang giữ chỗ */}
        <div className="bg-white dark:bg-[#151D2A] border border-sky-200 dark:border-sky-800/60 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] text-sky-800 dark:text-sky-400 uppercase font-mono font-semibold block">
              ĐANG GIỮ CHỖ (ACTIVE)
            </span>
            <span className="text-2xl font-bold text-sky-700 dark:text-sky-300 font-mono mt-1 block">
              {stats.active}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Quá hạn không đến */}
        <div className="bg-white dark:bg-[#151D2A] border border-rose-200 dark:border-rose-800/60 p-4 rounded-2xl shadow-sm flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-600" />
          <div>
            <span className="text-[11px] text-rose-800 dark:text-rose-400 uppercase font-mono font-bold block">
              QUÁ HẠN KHÔNG ĐẾN
            </span>
            <span className="text-2xl font-bold text-rose-700 dark:text-rose-300 font-mono mt-1 block">
              {stats.expiredCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Tổng phí phạt đã trừ ví */}
        <div className="bg-white dark:bg-[#151D2A] border border-amber-200 dark:border-amber-800/60 p-4 rounded-2xl shadow-sm flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
          <div>
            <span className="text-[11px] text-amber-800 dark:text-amber-400 uppercase font-mono font-bold block">
              PHÍ PHẠT ĐÃ TRỪ VÍ
            </span>
            <span className="text-xl font-bold text-amber-800 dark:text-amber-300 font-mono mt-1 block">
              -{stats.totalPenaltyFee.toLocaleString('vi-VN')} đ
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Banner thông báo chính sách giữ chỗ */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 text-xs font-mono text-amber-900 dark:text-amber-200 flex items-start space-x-3 shadow-sm">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
        <div className="space-y-1">
          <strong className="block text-amber-900 dark:text-amber-300 font-bold uppercase tracking-wider text-[11px]">
            CHÍNH SÁCH THU PHÍ KHI GIỮ CHỖ QUÁ GIỜ KHÔNG TỚI NHẬN TRỤ (TIÊU CHUẨN S-50):
          </strong>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-sans text-xs">
            Mỗi lượt đặt chỗ có hiệu lực trong <strong>15 phút</strong>. Nếu tài xế đến cắm súng và bắt đầu sạc trước hạn: <strong>HOÀN TOÀN MIỄN PHÍ</strong>.
            Nếu quá hạn giữ mà chưa cắm súng, hệ thống sẽ tự động chuyển trạng thái sang <span className="text-rose-700 dark:text-rose-400 font-bold">QUÁ HẠN (EXPIRED)</span>, gửi lệnh hủy giữ chỗ mở lại đầu súng cho xe khác, và <strong>tự động trừ phí phạt không đến ({DEFAULT_NO_SHOW_FEE.toLocaleString('vi-VN')} đ)</strong> vào Ví cá nhân qua một dòng sổ cái bất biến (S-41).
          </p>
        </div>
      </div>

      {/* Thanh công cụ tìm kiếm và lọc theo Tab trạng thái */}
      <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-3.5 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tab chọn trạng thái */}
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {[
              { key: 'ALL', label: 'TẤT CẢ', count: stats.total },
              { key: 'ACTIVE', label: 'ĐANG GIỮ CHỖ', count: stats.active },
              {
                key: 'EXPIRED',
                label: 'QUÁ HẠN & TÍNH PHÍ',
                count: stats.expiredCount,
                highlight: true,
              },
              { key: 'COMPLETED', label: 'ĐÃ HOÀN THÀNH', count: stats.completed },
              { key: 'CANCELLED', label: 'ĐÃ HỦY', count: reservations.filter((r) => r.status === 'CANCELLED').length },
            ].map((tab) => {
              const isSelected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabChange(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                    isSelected
                      ? tab.highlight
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-sky-600 text-white shadow-sm'
                      : tab.highlight && tab.count > 0
                      ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50 hover:bg-rose-100'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      isSelected ? 'bg-black/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Ô tìm kiếm */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm mã đặt, tên trạm, trụ..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Danh sách các lượt đặt chỗ (Thẻ chi tiết) */}
      <div className="space-y-3">
        {filteredList.length === 0 ? (
          <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 rounded-2xl p-12 text-center text-slate-500 font-mono text-xs space-y-2 shadow-sm">
            <Clock className="w-8 h-8 mx-auto text-slate-400 opacity-60 mb-2" />
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Không có lượt đặt chỗ nào phù hợp</p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              {activeTab === 'EXPIRED'
                ? 'Tuyệt vời! Bạn không có lượt đặt chỗ nào bị quá hạn tính phí.'
                : 'Thử đổi bộ lọc trạng thái hoặc từ khóa tìm kiếm.'}
            </p>
          </div>
        ) : (
          filteredList.map((res) => {
            const meta = getReservationStatusMeta(res.status);
            const feeInfo = formatReservationFee(res);
            const remaining = calculateRemainingHoldTime(res.valid_until, now);

            return (
              <div
                key={res.id}
                id={`reservation-card-${res.id}`}
                className={`bg-white dark:bg-[#151D2A] border rounded-2xl p-4 sm:p-5 transition-all relative shadow-sm hover:shadow-md ${
                  meta.isOverdue
                    ? 'border-rose-300 dark:border-rose-800/60 bg-rose-50/20 dark:bg-rose-950/20'
                    : meta.key === 'ACTIVE'
                    ? 'border-sky-300 dark:border-sky-800/60 bg-sky-50/20 dark:bg-sky-950/10'
                    : 'border-slate-200 dark:border-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Cột 1: Thông tin mã đặt chỗ & Trạm sạc */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                        #{res.reservation_code || `RES-${res.id}`}
                      </span>

                      {/* Badge trạng thái */}
                      <span
                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${meta.badgeClass}`}
                      >
                        {meta.isOverdue && <AlertTriangle className="w-3 h-3" />}
                        {meta.key === 'ACTIVE' && <Clock className="w-3 h-3 animate-pulse" />}
                        {meta.key === 'COMPLETED' && <CheckCircle2 className="w-3 h-3" />}
                        {meta.key === 'CANCELLED' && <XCircle className="w-3 h-3" />}
                        <span>{meta.label}</span>
                      </span>

                      {/* Đếm ngược nếu đang ACTIVE */}
                      {meta.key === 'ACTIVE' && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                            remaining.isExpired
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                          }`}
                        >
                          {remaining.text}
                        </span>
                      )}
                    </div>

                    {/* Tên trạm & địa chỉ */}
                    <div className="space-y-0.5">
                      <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                        <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                        <span>{res.station_name}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 pl-5">
                        {res.station_address || 'Khu đô thị VinHomes, TP. Hồ Chí Minh'}
                      </p>
                    </div>

                    {/* Trụ & Đầu súng */}
                    <div className="flex items-center space-x-3 text-xs font-mono text-slate-600 dark:text-slate-400 pl-5 pt-0.5">
                      <span className="flex items-center space-x-1 text-slate-900 dark:text-slate-100 font-semibold">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <strong>Trụ #{res.charger_code}</strong>
                      </span>
                      <span>•</span>
                      <span>Súng #{res.connector_number} ({res.connector_type})</span>
                      <span>•</span>
                      <span>Công suất: {res.max_power_kw || 60} kW</span>
                    </div>
                  </div>

                  {/* Cột 2: Thời gian đặt & Hạn chót giữ chỗ */}
                  <div className="text-left md:text-right font-mono text-xs space-y-1 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100 dark:border-slate-800">
                    <div className="text-slate-600 dark:text-slate-400 text-[11px]">
                      <span>Đặt lúc: </span>
                      <strong className="text-slate-900 dark:text-slate-100 font-semibold">{formatVNDateTime(res.created_at)}</strong>
                    </div>
                    <div className="text-slate-600 dark:text-slate-400 text-[11px]">
                      <span>Hạn giữ chỗ: </span>
                      <strong className={meta.isOverdue ? 'text-rose-700 dark:text-rose-400 font-bold' : 'text-sky-700 dark:text-sky-300 font-bold'}>
                        {formatVNDateTime(res.valid_until)}
                      </strong>
                    </div>
                  </div>

                  {/* Cột 3: Khung hiển thị KHOẢN PHÍ & THAO TÁC (SCRUM-378 Core Element) */}
                  <div className="flex flex-col items-start md:items-end justify-center shrink-0 min-w-[200px] border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800">
                    {/* Khoản phí phạt hoặc miễn phí */}
                    <div className="text-right w-full">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono font-semibold block">
                        KHOẢN PHÍ GIỮ CHỖ
                      </span>
                      <div className="flex items-center md:justify-end space-x-1.5 mt-0.5">
                        <span
                          className={`text-base font-mono font-bold tabular-nums ${
                            feeInfo.isPenalty
                              ? 'text-rose-700 dark:text-rose-400'
                              : meta.key === 'COMPLETED'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {feeInfo.formatted}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono block mt-0.5 ${
                          feeInfo.isPenalty ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {feeInfo.note}
                      </span>
                    </div>

                    {/* Nút hành động liên kết */}
                    <div className="mt-2.5 flex items-center space-x-2">
                      {meta.isOverdue && (
                        <Link
                          to={`/wallet?highlight=${res.wallet_transaction_id || 'penalty'}`}
                          className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800/60 text-[11px] font-mono font-bold transition-all shadow-sm inline-flex items-center space-x-1"
                        >
                          <Wallet className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                          <span>Xem Trừ Ví</span>
                          <ChevronRight className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                        </Link>
                      )}

                      {meta.key === 'ACTIVE' && (
                        <Link
                          to={`/chargers/${res.charger_id}`}
                          className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-mono font-bold transition-all shadow-sm inline-flex items-center space-x-1"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Đến Trụ Sạc</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}

                      {meta.key === 'COMPLETED' && res.session_id && (
                        <Link
                          to={`/session/${res.session_id}`}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/60 text-[11px] font-mono font-medium transition-all shadow-sm inline-flex items-center space-x-1"
                        >
                          <span>Xem Phiên Sạc</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dòng lý do / giải thích chi tiết */}
                {res.reason && (
                  <div
                    className={`mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 text-[11px] font-mono flex items-center justify-between ${
                      meta.isOverdue ? 'text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      <span>{res.reason}</span>
                    </div>
                    {res.wallet_transaction_id && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0 pl-2">
                        Mã giao dịch ví: <strong className="text-slate-900 dark:text-slate-100 font-semibold">#{res.wallet_transaction_id}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

