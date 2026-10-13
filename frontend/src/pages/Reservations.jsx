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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/30">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-tech-white flex items-center space-x-2">
                <span>LỊCH SỬ ĐẶT CHỖ &amp; QUẢN LÝ GIỮ CHỖ</span>
                <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  S-50 / SCRUM-378
                </span>
              </h1>
              <p className="text-xs text-steel-gray mt-0.5">
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
            className="px-3 py-2 rounded text-xs font-mono font-medium bg-panel border border-hairline hover:bg-hairline text-steel-gray hover:text-tech-white transition-colors flex items-center space-x-1.5"
            title="Làm mới danh sách đặt chỗ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={handleSimulateExpiredReservation}
            className="px-3 py-2 rounded text-xs font-mono font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 transition-colors flex items-center space-x-1.5 shadow-sm"
            title="Tạo giả lập 1 lượt đặt chỗ quá hạn bị tính phí để kiểm thử đối soát với ví"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Giả Lập Quá Hạn (Demo)</span>
          </button>

          <Link
            to="/wallet"
            className="px-3.5 py-2 rounded text-xs font-mono font-bold bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center space-x-1.5 shadow-sm"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Ví Cá Nhân</span>
          </Link>
        </div>
      </div>

      {/* Thẻ thống kê 4 chỉ số chính */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Tổng đặt chỗ */}
        <div className="bg-panel border border-hairline p-4 rounded-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] text-steel-gray uppercase font-mono block">
              TỔNG ĐẶT CHỖ
            </span>
            <span className="text-2xl font-bold text-tech-white font-mono mt-1 block">
              {stats.total}
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-panel-hover flex items-center justify-center text-steel-gray border border-hairline">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* Đang giữ chỗ */}
        <div className="bg-panel border border-sky-500/30 p-4 rounded-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] text-sky-400 uppercase font-mono block">
              ĐANG GIỮ CHỖ (ACTIVE)
            </span>
            <span className="text-2xl font-bold text-sky-400 font-mono mt-1 block">
              {stats.active}
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400 border border-sky-500/30">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Quá hạn không đến (SCRUM-354 / SCRUM-378 Core KPI) */}
        <div className="bg-panel border border-critical-red/40 p-4 rounded-sm flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-critical-red" />
          <div>
            <span className="text-[11px] text-critical-red uppercase font-mono font-bold block">
              QUÁ HẠN KHÔNG ĐẾN
            </span>
            <span className="text-2xl font-bold text-critical-red font-mono mt-1 block">
              {stats.expiredCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-critical-red/10 flex items-center justify-center text-critical-red border border-critical-red/30">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Tổng phí phạt đã trừ ví */}
        <div className="bg-panel border border-amber-500/40 p-4 rounded-sm flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <div>
            <span className="text-[11px] text-amber-400 uppercase font-mono font-bold block">
              PHÍ PHẠT ĐÃ TRỪ VÍ
            </span>
            <span className="text-xl font-bold text-amber-400 font-mono mt-1 block">
              -{stats.totalPenaltyFee.toLocaleString('vi-VN')} đ
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/30">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Banner thông báo chính sách giữ chỗ (S-50 / SCRUM-354 Rule Notice) */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-sm p-4 text-xs font-mono text-amber-300 flex items-start space-x-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
        <div className="space-y-1">
          <strong className="block text-amber-300 font-bold uppercase tracking-wider text-[11px]">
            CHÍNH SÁCH THU PHÍ KHI GIỮ CHỖ QUÁ GIỜ KHÔNG TỚI NHẬN TRỤ (TIÊU CHUẨN S-50):
          </strong>
          <p className="text-steel-gray leading-relaxed">
            Mỗi lượt đặt chỗ có hiệu lực trong <strong>15 phút</strong>. Nếu tài xế đến cắm súng và bắt đầu sạc trước hạn: <strong>HOÀN TOÀN MIỄN PHÍ</strong>.
            Nếu quá hạn giữ mà chưa cắm súng, hệ thống sẽ tự động chuyển trạng thái sang <span className="text-critical-red font-bold">QUÁ HẠN (EXPIRED)</span>, gửi lệnh hủy giữ chỗ mở lại đầu súng cho xe khác, và <strong>tự động trừ phí phạt không đến ({DEFAULT_NO_SHOW_FEE.toLocaleString('vi-VN')} đ)</strong> vào Ví cá nhân qua một dòng sổ cái bất biến (S-41).
          </p>
        </div>
      </div>

      {/* Thanh công cụ tìm kiếm và lọc theo Tab trạng thái */}
      <div className="bg-panel border border-hairline p-4 rounded-sm space-y-3">
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
                  className={`px-3 py-1.5 rounded text-xs font-mono font-bold flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                    isSelected
                      ? tab.highlight
                        ? 'bg-critical-red text-white shadow-sm'
                        : 'bg-sky-600 text-white shadow-sm'
                      : tab.highlight && tab.count > 0
                      ? 'bg-critical-red/15 text-critical-red border border-critical-red/30 hover:bg-critical-red/25'
                      : 'bg-obsidian border border-hairline text-steel-gray hover:text-tech-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected ? 'bg-black/20 text-white' : 'bg-panel text-steel-gray'
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
            <Search className="w-3.5 h-3.5 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm mã đặt, tên trạm, trụ..."
              className="w-full pl-8 pr-3 py-1.5 bg-obsidian border border-hairline rounded text-xs font-mono text-tech-white placeholder:text-steel-gray focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Danh sách các lượt đặt chỗ (Thẻ chi tiết) */}
      <div className="space-y-3">
        {filteredList.length === 0 ? (
          <div className="bg-panel border border-hairline rounded p-12 text-center text-steel-gray font-mono text-xs space-y-2">
            <Clock className="w-8 h-8 mx-auto text-steel-gray opacity-40 mb-2" />
            <p className="font-bold text-tech-white">Không có lượt đặt chỗ nào phù hợp</p>
            <p className="text-[11px]">
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
                className={`bg-panel border rounded-sm p-4 transition-all relative ${
                  meta.isOverdue
                    ? 'border-critical-red/40 hover:border-critical-red/70 bg-gradient-to-r from-critical-red/5 via-panel to-panel'
                    : meta.key === 'ACTIVE'
                    ? 'border-sky-500/40 hover:border-sky-500/70'
                    : 'border-hairline hover:border-steel-gray/50'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Cột 1: Thông tin mã đặt chỗ & Trạm sạc */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-tech-white">
                        #{res.reservation_code || `RES-${res.id}`}
                      </span>

                      {/* Badge trạng thái */}
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${meta.badgeClass}`}
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
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                            remaining.isExpired
                              ? 'bg-critical-red/20 text-critical-red'
                              : 'bg-sky-500/20 text-sky-400'
                          }`}
                        >
                          {remaining.text}
                        </span>
                      )}
                    </div>

                    {/* Tên trạm & địa chỉ */}
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-tech-white flex items-center space-x-1.5">
                        <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span>{res.station_name}</span>
                      </div>
                      <p className="text-[11px] text-steel-gray pl-5">
                        {res.station_address || 'Khu đô thị VinHomes, TP. Hồ Chí Minh'}
                      </p>
                    </div>

                    {/* Trụ & Đầu súng */}
                    <div className="flex items-center space-x-3 text-xs font-mono text-steel-gray pl-5 pt-0.5">
                      <span className="flex items-center space-x-1 text-tech-white">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <strong>Trụ #{res.charger_code}</strong>
                      </span>
                      <span>•</span>
                      <span>Súng #{res.connector_number} ({res.connector_type})</span>
                      <span>•</span>
                      <span>Công suất: {res.max_power_kw || 60} kW</span>
                    </div>
                  </div>

                  {/* Cột 2: Thời gian đặt & Hạn chót giữ chỗ */}
                  <div className="text-left md:text-right font-mono text-xs space-y-1 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-hairline">
                    <div className="text-steel-gray text-[11px]">
                      <span>Đặt lúc: </span>
                      <strong className="text-tech-white">{formatVNDateTime(res.created_at)}</strong>
                    </div>
                    <div className="text-steel-gray text-[11px]">
                      <span>Hạn giữ chỗ: </span>
                      <strong className={meta.isOverdue ? 'text-critical-red' : 'text-sky-400'}>
                        {formatVNDateTime(res.valid_until)}
                      </strong>
                    </div>
                  </div>

                  {/* Cột 3: Khung hiển thị KHOẢN PHÍ & THAO TÁC (SCRUM-378 Core Element) */}
                  <div className="flex flex-col items-start md:items-end justify-center shrink-0 min-w-[200px] border-t md:border-t-0 pt-3 md:pt-0 border-hairline">
                    {/* Khoản phí phạt hoặc miễn phí */}
                    <div className="text-right w-full">
                      <span className="text-[10px] text-steel-gray uppercase font-mono block">
                        KHOẢN PHÍ GIỮ CHỖ
                      </span>
                      <div className="flex items-center md:justify-end space-x-1.5 mt-0.5">
                        <span
                          className={`text-base font-mono font-bold tabular-nums ${
                            feeInfo.isPenalty
                              ? 'text-critical-red'
                              : meta.key === 'COMPLETED'
                              ? 'text-grid-green'
                              : 'text-tech-white'
                          }`}
                        >
                          {feeInfo.formatted}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono block mt-0.5 ${
                          feeInfo.isPenalty ? 'text-critical-red font-medium' : 'text-steel-gray'
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
                          className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-mono font-bold transition-colors inline-flex items-center space-x-1"
                        >
                          <Wallet className="w-3 h-3" />
                          <span>Xem Trừ Ví</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}

                      {meta.key === 'ACTIVE' && (
                        <Link
                          to={`/chargers/${res.charger_id}`}
                          className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-mono font-bold transition-colors inline-flex items-center space-x-1"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Đến Trụ Sạc</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}

                      {meta.key === 'COMPLETED' && res.session_id && (
                        <Link
                          to={`/session/${res.session_id}`}
                          className="px-2.5 py-1 rounded bg-panel hover:bg-hairline text-steel-gray hover:text-tech-white border border-hairline text-[11px] font-mono transition-colors inline-flex items-center space-x-1"
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
                    className={`mt-3 pt-2.5 border-t border-hairline text-[11px] font-mono flex items-center justify-between ${
                      meta.isOverdue ? 'text-critical-red/90' : 'text-steel-gray'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      <span>{res.reason}</span>
                    </div>
                    {res.wallet_transaction_id && (
                      <span className="text-[10px] text-steel-gray shrink-0 pl-2">
                        Mã giao dịch ví: <strong className="text-tech-white">#{res.wallet_transaction_id}</strong>
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

