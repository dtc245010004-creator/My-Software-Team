import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Navigation as NavigationIcon,
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
  X,
  Check,
  Loader2,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatVNDateTime } from '../utils/formatTime';
import ReservationRouteMap from '../components/reservation/ReservationRouteMap';
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

  // Trạng thái modal Đặt Chỗ Mới (S-48, S-49, S-50)
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(
    () => searchParams.get('book') === 'true'
  );
  const [stationsList, setStationsList] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState(
    () => searchParams.get('station_id') || ''
  );
  const [selectedConnectorId, setSelectedConnectorId] = useState(
    () => searchParams.get('connector_id') || ''
  );
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [suggestedConnectors, setSuggestedConnectors] = useState([]);
  const [cancellingId, setCancellingId] = useState(null);
  const [selectedMapReservationId, setSelectedMapReservationId] = useState(null);

  const activeReservation = useMemo(() => {
    return reservations.find((r) => r.status === 'ACTIVE') || null;
  }, [reservations]);

  const mapReservation = useMemo(() => {
    if (selectedMapReservationId) {
      return (
        reservations.find((r) => r.id === selectedMapReservationId) ||
        activeReservation ||
        reservations[0] ||
        null
      );
    }
    return activeReservation || reservations[0] || null;
  }, [reservations, selectedMapReservationId, activeReservation]);

  // Cập nhật đồng hồ mỗi giây để hiển thị đếm ngược chính xác
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Tải danh sách đặt chỗ từ Backend
  const fetchReservations = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reservations');
      if (Array.isArray(res.data)) {
        setReservations(res.data);
      } else {
        setReservations(INITIAL_DEMO_RESERVATIONS);
      }
    } catch {
      // Fallback dữ liệu demo phục vụ kiểm thử giao diện
      setReservations(INITIAL_DEMO_RESERVATIONS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservations();
  }, []);

  // Tải danh sách trạm & đầu nối sạc phục vụ đặt chỗ
  const fetchStationsForBooking = async () => {
    try {
      setStationsLoading(true);
      const res = await api.get('/stations', { params: { status: 'ACTIVE' } });
      const data = res.data || [];
      setStationsList(data);
      if (data.length > 0 && !selectedStationId) {
        setSelectedStationId(String(data[0].id));
      }
    } catch (err) {
      console.warn('Lỗi tải trạm sạc cho đặt chỗ:', err);
    } finally {
      setStationsLoading(false);
    }
  };

  useEffect(() => {
    if (isBookingModalOpen) {
      fetchStationsForBooking();
    }
  }, [isBookingModalOpen]);

  // Tự động mở modal nếu URL có tham số book=true
  useEffect(() => {
    if (searchParams.get('book') === 'true') {
      setIsBookingModalOpen(true);
      const sId = searchParams.get('station_id');
      const cId = searchParams.get('connector_id');
      if (sId) setSelectedStationId(sId);
      if (cId) setSelectedConnectorId(cId);
    }
  }, [searchParams]);

  // Trạm sạc đang được chọn trong modal
  const selectedStation = useMemo(() => {
    if (!stationsList || stationsList.length === 0) return null;
    return (
      stationsList.find((s) => String(s.id) === String(selectedStationId)) ||
      stationsList[0]
    );
  }, [stationsList, selectedStationId]);

  // Danh sách đầu sạc của trạm được chọn
  const availableConnectors = useMemo(() => {
    if (!selectedStation) return [];
    const list = [];
    (selectedStation.charging_points || []).forEach((cp) => {
      (cp.connectors || []).forEach((conn) => {
        list.push({
          ...conn,
          charger_id: cp.id,
          charger_code: cp.code || cp.charger_code || `Trụ #${cp.id}`,
        });
      });
    });
    return list;
  }, [selectedStation]);

  // Tự động chọn đầu sạc khả dụng đầu tiên khi đổi trạm hoặc mở modal
  useEffect(() => {
    if (availableConnectors.length > 0) {
      const isCurrentSelectedValid = availableConnectors.some(
        (c) =>
          String(c.id) === String(selectedConnectorId) &&
          (c.status === 'AVAILABLE' || c.status === 'Available')
      );
      if (!isCurrentSelectedValid) {
        const firstAvail = availableConnectors.find(
          (c) => c.status === 'AVAILABLE' || c.status === 'Available'
        );
        if (firstAvail) {
          setSelectedConnectorId(String(firstAvail.id));
        } else {
          setSelectedConnectorId('');
        }
      }
    }
  }, [availableConnectors, selectedStationId]);

  // Hành động tạo đặt chỗ mới qua Backend API (S-48, S-49)
  const handleCreateReservation = async (e) => {
    if (e) e.preventDefault();
    if (!selectedConnectorId) {
      setBookingError('Vui lòng chọn một đầu nối sạc khả dụng.');
      return;
    }
    setBookingLoading(true);
    setBookingError(null);
    setSuggestedConnectors([]);
    setBookingSuccess(null);

    try {
      const payload = {
        connector_id: Number(selectedConnectorId),
        duration_minutes: Number(durationMinutes),
      };
      await api.post('/reservations', payload);
      setBookingSuccess('Đặt chỗ thành công! Trụ sạc đã được giữ riêng cho bạn trong ' + durationMinutes + ' phút.');
      setTimeout(() => {
        setIsBookingModalOpen(false);
        setBookingSuccess(null);
        setSelectedConnectorId('');
        setActiveTab('ACTIVE');
        fetchReservations();
      }, 1200);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      const suggested = err?.response?.data?.suggested_connectors || [];

      if (status === 409) {
        setBookingError(detail || 'Đầu nối vừa được người khác đặt trước hoặc đang bận.');
        setSuggestedConnectors(suggested);
      } else if (status === 400) {
        setBookingError(detail || 'Yêu cầu không hợp lệ hoặc ví chưa đủ điều kiện.');
      } else if (status === 403) {
        setBookingError(detail || 'Tài khoản không đủ quyền hoặc ví đang bị khóa nợ.');
      } else if (status === 503) {
        setBookingError(detail || 'Trụ sạc hiện đang ngoại tuyến, không thể nhận lệnh đặt chỗ.');
      } else if (status === 504) {
        setBookingError('Hết thời gian chờ phản hồi từ trụ sạc (Timeout). Vui lòng thử lại.');
      } else {
        setBookingError(detail || err?.message || 'Không thể tạo đặt chỗ. Vui lòng thử lại sau.');
      }
    } finally {
      setBookingLoading(false);
    }
  };

  // Hành động hủy giữ chỗ
  const handleCancelReservation = async (resId) => {
    const confirmCancel = window.confirm(
      'Bạn có chắc chắn muốn hủy giữ chỗ này? Đầu nối sẽ được mở lại ngay cho tài xế khác.'
    );
    if (!confirmCancel) return;

    setCancellingId(resId);
    try {
      await api.post(`/reservations/${resId}/cancel`);
      await fetchReservations();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Không thể hủy đặt chỗ.');
    } finally {
      setCancellingId(null);
    }
  };

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
                <span>Lịch sử đặt chỗ &amp; Quản lý giữ chỗ</span>
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
            onClick={() => {
              setBookingError(null);
              setSuggestedConnectors([]);
              setBookingSuccess(null);
              setIsBookingModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center space-x-1.5 shadow-sm"
            title="Tạo lượt đặt giữ chỗ trước đầu nối sạc"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Đặt chỗ mới</span>
          </button>

          <button
            type="button"
            onClick={fetchReservations}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center space-x-1.5 shadow-sm"
            title="Làm mới danh sách đặt chỗ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <Link
            to="/wallet"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center space-x-1.5 shadow-sm"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Ví cá nhân</span>
          </Link>
        </div>
      </div>

      {/* Thẻ thống kê 4 chỉ số chính */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Tổng đặt chỗ */}
        <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
              Tổng đặt chỗ
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1 block">
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
            <span className="text-xs font-medium text-sky-700 dark:text-sky-300 block">
              Đang giữ chỗ
            </span>
            <span className="text-2xl font-bold text-sky-700 dark:text-sky-300 tabular-nums mt-1 block">
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
            <span className="text-xs font-medium text-rose-700 dark:text-rose-300 block">
              Quá hạn không đến
            </span>
            <span className="text-2xl font-bold text-rose-700 dark:text-rose-300 tabular-nums mt-1 block">
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
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300 block">
              Phí phạt đã trừ ví
            </span>
            <span className="text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums mt-1 block">
              -{stats.totalPenaltyFee.toLocaleString('vi-VN')} đ
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Banner thông báo chính sách giữ chỗ */}
      <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-3 shadow-sm">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
        <div className="space-y-1">
          <strong className="block text-amber-900 dark:text-amber-300 font-semibold text-xs mb-0.5">
            Chính sách giữ chỗ &amp; Phí quá hạn:
          </strong>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-xs">
            Mỗi lượt đặt chỗ có hiệu lực trong <strong className="font-semibold">15 phút</strong>. Nếu tài xế đến cắm súng và bắt đầu sạc trước hạn: <strong className="font-semibold text-emerald-700 dark:text-emerald-400">hoàn toàn miễn phí</strong>.
            Nếu quá hạn giữ mà chưa cắm súng, hệ thống sẽ tự động chuyển trạng thái sang <span className="text-rose-700 dark:text-rose-400 font-semibold">Quá hạn</span>, mở lại cổng sạc cho xe khác và tự động trừ phí phạt không đến (<strong className="font-semibold">{DEFAULT_NO_SHOW_FEE.toLocaleString('vi-VN')} đ</strong>) vào ví cá nhân.
          </p>
        </div>
      </div>

      {/* Bản đồ dẫn đường trực tiếp từ vị trí tài xế tới trạm sạc đang đặt chỗ */}
      {mapReservation && (
        <ReservationRouteMap
          reservation={mapReservation}
          now={now}
        />
      )}

      {/* Thanh công cụ tìm kiếm và lọc theo Tab trạng thái */}
      <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-3.5 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tab chọn trạng thái */}
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {[
              { key: 'ALL', label: 'Tất cả', count: stats.total },
              { key: 'ACTIVE', label: 'Đang giữ chỗ', count: stats.active },
              {
                key: 'EXPIRED',
                label: 'Quá hạn & Tính phí',
                count: stats.expiredCount,
                highlight: true,
              },
              { key: 'COMPLETED', label: 'Đã hoàn thành', count: stats.completed },
              { key: 'CANCELLED', label: 'Đã hủy', count: reservations.filter((r) => r.status === 'CANCELLED').length },
            ].map((tab) => {
              const isSelected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabChange(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-all whitespace-nowrap ${
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
                    className={`text-xs px-1.5 py-0.5 rounded-full font-medium tabular-nums ${
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
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Danh sách các lượt đặt chỗ (Thẻ chi tiết) */}
      <div className="space-y-3">
        {filteredList.length === 0 ? (
          <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 rounded-2xl p-12 text-center text-slate-500 text-xs space-y-2 shadow-sm">
            <Clock className="w-8 h-8 mx-auto text-slate-400 opacity-60 mb-2" />
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Không có lượt đặt chỗ nào phù hợp</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
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
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100 tabular-nums">
                        #{res.reservation_code || `RES-${res.id}`}
                      </span>

                      {/* Badge trạng thái */}
                      <span
                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${meta.badgeClass}`}
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
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums ${
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
                      <p className="text-xs text-slate-600 dark:text-slate-400 pl-5">
                        {res.station_address || 'Khu đô thị VinHomes, TP. Hồ Chí Minh'}
                      </p>
                    </div>

                    {/* Trụ & Đầu súng */}
                    <div className="flex items-center space-x-3 text-xs text-slate-600 dark:text-slate-400 pl-5 pt-0.5">
                      <span className="flex items-center space-x-1 text-slate-900 dark:text-slate-100 font-semibold">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <strong>Trụ #{res.charger_code}</strong>
                      </span>
                      <span>•</span>
                      <span>Cổng #{res.connector_number} ({res.connector_type})</span>
                      <span>•</span>
                      <span>Công suất: {res.max_power_kw || 60} kW</span>
                    </div>
                  </div>

                  {/* Cột 2: Thời gian đặt & Hạn chót giữ chỗ */}
                  <div className="text-left md:text-right text-xs space-y-1 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100 dark:border-slate-800">
                    <div className="text-slate-600 dark:text-slate-400">
                      <span>Đặt lúc: </span>
                      <strong className="text-slate-900 dark:text-slate-100 font-semibold tabular-nums">{formatVNDateTime(res.created_at)}</strong>
                    </div>
                    <div className="text-slate-600 dark:text-slate-400">
                      <span>Hạn giữ chỗ: </span>
                      <strong className={`tabular-nums ${meta.isOverdue ? 'text-rose-700 dark:text-rose-400 font-bold' : 'text-sky-700 dark:text-sky-300 font-bold'}`}>
                        {formatVNDateTime(res.valid_until)}
                      </strong>
                    </div>
                  </div>

                  {/* Cột 3: Khung hiển thị KHOẢN PHÍ & THAO TÁC */}
                  <div className="flex flex-col items-start md:items-end justify-center shrink-0 min-w-[200px] border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800">
                    {/* Khoản phí phạt hoặc miễn phí */}
                    <div className="text-right w-full">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                        Phí giữ chỗ
                      </span>
                      <div className="flex items-center md:justify-end space-x-1.5 mt-0.5">
                        <span
                          className={`text-base font-bold tabular-nums ${
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
                        className={`text-xs block mt-0.5 ${
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
                          className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800/60 text-xs font-medium transition-all shadow-sm inline-flex items-center space-x-1"
                        >
                          <Wallet className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                          <span>Xem trừ ví</span>
                          <ChevronRight className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                        </Link>
                      )}

                      {meta.key === 'ACTIVE' && (
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                          <button
                            type="button"
                            onClick={() => handleCancelReservation(res.id)}
                            disabled={cancellingId === res.id}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800/60 text-xs font-medium transition-all shadow-sm inline-flex items-center space-x-1"
                            title="Hủy giữ chỗ trước hạn (Miễn phí)"
                          >
                            <X className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                            <span>{cancellingId === res.id ? 'Đang hủy...' : 'Hủy giữ chỗ'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMapReservationId(res.id);
                              const mapEl = document.getElementById('reservation-route-map-panel');
                              if (mapEl) {
                                mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:hover:bg-sky-900/50 dark:text-sky-300 border border-sky-300 dark:border-sky-800/60 text-xs font-semibold transition-all shadow-sm inline-flex items-center space-x-1"
                            title="Xem vị trí và đường đi trực tiếp trên bản đồ"
                          >
                            <NavigationIcon className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                            <span>Chỉ đường</span>
                          </button>

                          <Link
                            to={`/chargers/${res.charge_point_id || res.charger_id}?connector_id=${res.connector_id || ''}`}
                            className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-all shadow-sm inline-flex items-center space-x-1"
                            title="Đến màn hình sạc của trụ này"
                          >
                            <Zap className="w-3 h-3" />
                            <span>Đến trụ sạc</span>
                            <ChevronRight className="w-3 h-3" />
                          </Link>

                          <Link
                            to={`/simulator?station_id=${res.station_id || ''}&connector_id=${res.connector_id || ''}`}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all shadow-sm inline-flex items-center space-x-1"
                            title="Mô phỏng sạc trực tiếp trên cổng đã đặt"
                          >
                            <span>Bảng giả lập</span>
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        </div>
                      )}

                      {meta.key === 'COMPLETED' && (
                        <Link
                          to={res.session_id ? `/session/${res.session_id}` : '/sessions'}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 text-xs font-semibold transition-all shadow-sm inline-flex items-center space-x-1"
                          title="Xem chi tiết phiên sạc tương ứng với lượt đặt chỗ"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Xem phiên sạc</span>
                          <ChevronRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        </Link>
                      )}

                    </div>
                  </div>
                </div>

                {/* Dòng lý do / giải thích chi tiết */}
                {res.reason && (
                  <div
                    className={`mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 text-xs flex items-center justify-between ${
                      meta.isOverdue ? 'text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      <span>{res.reason}</span>
                    </div>
                    {res.wallet_transaction_id && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 pl-2">
                        Mã giao dịch ví: <strong className="text-slate-900 dark:text-slate-100 font-semibold tabular-nums">#{res.wallet_transaction_id}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL TẠO ĐẶT CHỖ MỚI (S-48, S-49, S-50) */}
      {isBookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div
            className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-modal-title"
          >
            {/* Header modal */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="booking-modal-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Đặt chỗ trước cổng sạc
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Giữ cổng sạc độc quyền trước khi xe di chuyển tới trạm
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBookingModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Đóng modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nội dung form đặt chỗ */}
            <form onSubmit={handleCreateReservation} className="p-5 space-y-4">
              {/* Thông báo thành công */}
              {bookingSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-800/60 dark:text-emerald-200 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{bookingSuccess}</span>
                </div>
              )}

              {/* Thông báo lỗi */}
              {bookingError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 dark:bg-rose-950/50 dark:border-rose-800/60 dark:text-rose-200 text-xs space-y-2">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>{bookingError}</span>
                  </div>

                  {/* Gợi ý trụ thay thế nếu gặp xung đột */}
                  {suggestedConnectors.length > 0 && (
                    <div className="pt-2 border-t border-rose-200 dark:border-rose-800/60 space-y-1.5">
                      <span className="block font-semibold text-xs text-rose-950 dark:text-rose-300">
                        Gợi ý đầu nối khả dụng thay thế trong cùng trạm:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {suggestedConnectors.map((sug) => (
                          <button
                            key={sug.id}
                            type="button"
                            onClick={() => {
                              setSelectedConnectorId(String(sug.id));
                              setBookingError(null);
                            }}
                            className="p-2 text-left rounded-xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 hover:border-emerald-500 hover:bg-emerald-50/20 text-slate-800 dark:text-slate-200 text-xs transition-all flex items-center justify-between"
                          >
                            <div>
                              <span className="font-semibold block text-slate-900 dark:text-white">
                                {sug.charge_point_code} • Cổng #{sug.connector_number || sug.connector_id}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {sug.connector_type || sug.type || 'CCS2'} • {sug.rated_power_kw || 60} kW
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                              Chọn cổng này
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 1. Chọn Trạm Sạc */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>1. Chọn Trạm Sạc:</span>
                </label>
                {stationsLoading ? (
                  <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 flex items-center space-x-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang tải danh sách trạm khả dụng...</span>
                  </div>
                ) : (
                  <select
                    value={selectedStationId}
                    onChange={(e) => {
                      setSelectedStationId(e.target.value);
                      setSelectedConnectorId('');
                      setBookingError(null);
                      setSuggestedConnectors([]);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  >
                    {stationsList.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} — ({st.address})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 2. Chọn Đầu Nối Sạc (Connector) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>2. Chọn Đầu Nối Sạc:</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {availableConnectors.length} cổng sạc tại trạm
                  </span>
                </label>

                {availableConnectors.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                    Trạm này hiện chưa cấu hình đầu sạc khả dụng.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {availableConnectors.map((conn) => {
                      const isAvailable =
                        conn.status === 'AVAILABLE' ||
                        conn.status === 'Available';
                      const isSelected =
                        String(conn.id) === String(selectedConnectorId);

                      return (
                        <button
                          key={conn.id}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => {
                            setSelectedConnectorId(String(conn.id));
                            setBookingError(null);
                          }}
                          className={`p-3 text-left rounded-2xl border text-xs transition-all relative ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 ring-2 ring-emerald-500/30'
                              : isAvailable
                              ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer'
                              : 'border-slate-100 dark:border-slate-800/40 bg-slate-50 dark:bg-slate-900/20 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-1">
                              <span>Trụ #{conn.charger_code}</span>
                              <span className="text-slate-400">•</span>
                              <span>Cổng #{conn.connector_number || conn.connector_id}</span>
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                isAvailable
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60'
                                  : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60'
                              }`}
                            >
                              {isAvailable ? 'Sẵn sàng' : conn.status}
                            </span>
                          </div>

                          <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
                            <span>Chuẩn: <strong>{conn.connector_type || conn.type || 'Type 2'}</strong></span>
                            <span>Công suất: <strong>{conn.max_power_kw || conn.max_kw || 22} kW</strong></span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. Thời gian giữ chỗ */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>3. Thời Hạn Giữ Chỗ:</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 45, 60].map((mins) => {
                    const isSelected = durationMinutes === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setDurationMinutes(mins)}
                        className={`py-2 px-2.5 rounded-xl text-center text-xs font-medium transition-all border ${
                          isSelected
                            ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-500 text-sky-800 dark:text-sky-300 ring-2 ring-sky-500/20'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                        }`}
                      >
                        {mins} phút
                        {mins === 15 && (
                          <span className="block text-[10px] font-normal text-sky-700 dark:text-sky-400">
                            Khuyên dùng
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Banner điều khoản chính sách & cảnh báo phí phạt */}
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="flex items-center space-x-1.5 font-semibold">
                  <Info className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                  <span>Chính sách giữ chỗ tiêu chuẩn:</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-xs">
                  Miễn phí hoàn toàn nếu bạn đến cắm sạc trước hạn. Nếu quá {durationMinutes} phút không tới nhận trụ, hệ thống sẽ mở lại trụ cho xe khác và tự động thu phí phạt không đến <strong className="font-semibold">20.000 đ</strong> trừ vào ví cá nhân.
                </p>
              </div>

              {/* Nút hành động Modal */}
              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBookingModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={bookingLoading || !selectedConnectorId}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5"
                >
                  {bookingLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang xử lý giữ chỗ...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Xác nhận giữ chỗ ({durationMinutes} phút)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

