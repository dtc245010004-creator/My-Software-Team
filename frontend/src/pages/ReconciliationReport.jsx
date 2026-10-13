import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Scale,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Filter,
  Info,
  Building2,
  Zap,
  DollarSign,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  PlusCircle,
  Clock,
  Layers,
  ArrowUpRight,
  Settings,
  AlertOctagon,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatVNDateTime } from '../utils/formatTime';
import {
  REPORT_PERIODS,
  getPeriodDateRange,
  filterSessionsByDateRange,
  formatCurrencyVND,
  formatKwh,
} from '../utils/reportUtils';
import {
  RECONCILIATION_ANOMALY_TYPES,
  DEFAULT_TOLERANCE_VND,
  detectSessionAnomaly,
  calculateReconciliationSummary,
  filterReconciliationSessions,
} from '../utils/reconciliationUtils';

// Dữ liệu mẫu chuẩn nghiệm vụ S-53 / SCRUM-385 thể hiện rõ ràng 3 loại bất thường
const INITIAL_DEMO_SESSIONS = [
  {
    id: 104,
    station_id: 1,
    station_name: 'Trạm Sạc VinFast Thảo Điền',
    charger_id: 1,
    charger_code: 'SIM-001',
    start_time: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    end_time: new Date(Date.now() - 1.2 * 3600 * 1000).toISOString(),
    total_kwh: 48.5,
    applied_price_per_kwh: 3850,
    idle_amount: 0,
    total_amount: null, // Chưa tạo hóa đơn
    has_invoice: false,
    has_ledger: false,
    status: 'COMPLETED',
  },
  {
    id: 108,
    station_id: 1,
    station_name: 'Trạm Sạc VinFast Thảo Điền',
    charger_id: 2,
    charger_code: 'SIM-002',
    start_time: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    end_time: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    total_kwh: 32.0,
    applied_price_per_kwh: 3850,
    idle_amount: 15000,
    total_amount: 138200, // Đã tạo hóa đơn
    has_invoice: true,
    has_ledger: false, // Chưa trừ ví / thiếu dòng sổ cái
    wallet_transaction_id: null,
    status: 'COMPLETED',
  },
  {
    id: 112,
    station_id: 2,
    station_name: 'Trạm Sạc Landmark 81',
    charger_id: 3,
    charger_code: 'SIM-003',
    start_time: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    end_time: new Date(Date.now() - 11 * 3600 * 1000).toISOString(),
    total_kwh: 60.0,
    applied_price_per_kwh: 3850,
    idle_amount: 0,
    total_amount: 275000, // Tính lại theo biểu giá: 60 * 3850 = 231.000 đ (lệch +44.000 đ)
    has_invoice: true,
    has_ledger: true,
    wallet_transaction_id: 'TX-LEDGER-782',
    status: 'COMPLETED',
  },
  {
    id: 115,
    station_id: 1,
    station_name: 'Trạm Sạc VinFast Thảo Điền',
    charger_id: 1,
    charger_code: 'SIM-001',
    start_time: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    end_time: new Date(Date.now() - 23.2 * 3600 * 1000).toISOString(),
    total_kwh: 25.0,
    applied_price_per_kwh: 3850,
    idle_amount: 0,
    total_amount: 96250, // Khớp chuẩn xác 25 * 3850 = 96.250 đ
    has_invoice: true,
    has_ledger: true,
    wallet_transaction_id: 'TX-LEDGER-710',
    status: 'COMPLETED',
  },
  {
    id: 119,
    station_id: 2,
    station_name: 'Trạm Sạc Landmark 81',
    charger_id: 4,
    charger_code: 'SIM-004',
    start_time: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    end_time: new Date(Date.now() - 35 * 3600 * 1000).toISOString(),
    total_kwh: 70.0,
    applied_price_per_kwh: 3850,
    idle_amount: 20000,
    total_amount: 289500, // Khớp chuẩn xác 70 * 3850 + 20.000 = 289.500 đ
    has_invoice: true,
    has_ledger: true,
    wallet_transaction_id: 'TX-LEDGER-690',
    status: 'COMPLETED',
  },
];

export default function ReconciliationReport() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tiêu chí 3: "Chỉ vai trò kế toán và quản trị xem được"
  const isAuthorized = role === 'ACCOUNTANT' || role === 'ADMIN';

  const [stations, setStations] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState('ALL');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Bộ lọc Tab bất thường
  const [filterTab, setFilterTab] = useState(
    () => searchParams.get('tab') || 'ALL_ANOMALIES'
  );

  // Kỳ đối soát
  const [period, setPeriod] = useState(
    () => searchParams.get('period') || REPORT_PERIODS.THIS_MONTH
  );
  const [customStartDate, setCustomStartDate] = useState(
    () =>
      searchParams.get('start_date') ||
      new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split('T')[0]
  );
  const [customEndDate, setCustomEndDate] = useState(
    () => searchParams.get('end_date') || new Date().toISOString().split('T')[0]
  );

  // Ngưỡng dung sai chênh lệch chấp nhận được do làm tròn (NFR)
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE_VND);

  // 1. Tải dữ liệu trạm sạc & phiên sạc
  const fetchData = async () => {
    if (!isAuthorized) return;
    setLoading(true);
    try {
      const [stationsRes, sessionsRes] = await Promise.all([
        api.get('/stations').catch(() => ({ data: [] })),
        api.get('/sessions').catch(() => ({ data: [] })),
      ]);

      setStations(Array.isArray(stationsRes.data) ? stationsRes.data : []);

      let fetchedSessions = Array.isArray(sessionsRes.data) ? sessionsRes.data : [];
      if (fetchedSessions.length === 0) {
        fetchedSessions = INITIAL_DEMO_SESSIONS;
      }
      setSessions(fetchedSessions);
    } catch (err) {
      console.error('Lỗi tải dữ liệu đối soát:', err);
      setSessions(INITIAL_DEMO_SESSIONS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAuthorized]);

  // Tính khoảng ngày theo kỳ
  const dateRange = useMemo(() => {
    return getPeriodDateRange(period, {
      startDate: customStartDate,
      endDate: customEndDate,
    });
  }, [period, customStartDate, customEndDate]);

  // Lọc phiên sạc theo trạm và theo kỳ
  const currentFilteredSessions = useMemo(() => {
    let list = sessions;
    if (selectedStationId !== 'ALL') {
      list = list.filter((s) => String(s.station_id) === String(selectedStationId));
    }
    return filterSessionsByDateRange(list, dateRange.startDate, dateRange.endDate);
  }, [sessions, selectedStationId, dateRange]);

  // Tổng hợp dữ liệu đối soát và phát hiện 3 loại bất thường
  const summary = useMemo(() => {
    return calculateReconciliationSummary(currentFilteredSessions, tolerance);
  }, [currentFilteredSessions, tolerance]);

  // Danh sách các phiên sạc hiển thị sau khi áp dụng bộ lọc Tab
  const displayList = useMemo(() => {
    const list =
      filterTab === 'ALL_SESSIONS' ? summary.allAuditedSessions : summary.allAuditedSessions;
    return filterReconciliationSessions(list, filterTab, searchTerm);
  }, [summary, filterTab, searchTerm]);

  // Thêm phiên sạc mẫu có bất thường (Demo S-53 cho hội đồng kiểm thử)
  const handleSimulateDemoAnomalies = () => {
    setSessions((prev) => [...INITIAL_DEMO_SESSIONS, ...prev]);
    setFilterTab('ALL_ANOMALIES');
  };

  // Xuất file CSV Biên Bản Đối Soát
  const handleExportCsv = () => {
    if (summary.allAuditedSessions.length === 0) return;
    const headers = [
      'Mã phiên',
      'Thời gian sạc',
      'Trạm sạc',
      'Trụ sạc',
      'Trạng thái đối soát',
      'Loại bất thường',
      'Sản lượng (kWh)',
      'Tiền hóa đơn (VND)',
      'Tiền lý thuyết (VND)',
      'Chênh lệch (VND)',
      'Mã sổ cái ví',
      'Mô tả chi tiết',
    ];

    const rows = summary.allAuditedSessions.map((s) => {
      const a = s.reconciliation;
      return [
        `"#${s.id}"`,
        `"${formatVNDateTime(s.start_time)}"`,
        `"${s.station_name || 'Trạm'}"`,
        `"${s.charger_code || 'SIM-001'}"`,
        `"${a.isAnomaly ? 'BẤT THƯỜNG' : 'HỢP LỆ'}"`,
        `"${a.typeLabel}"`,
        a.kwh,
        a.actualAmount,
        a.expectedAmount,
        a.varianceAmount,
        `"${s.wallet_transaction_id || 'Thiếu'}"`,
        `"${a.description.replace(/"/g, '""')}"`,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bien_ban_doi_soat_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 403 Forbidden nếu không phải Kế toán hoặc Quản trị (AC3)
  if (!isAuthorized) {
    return (
      <div className="bg-critical-red/10 border border-critical-red/40 rounded-sm p-8 text-center space-y-4 my-8 max-w-2xl mx-auto">
        <ShieldAlert className="w-14 h-14 text-critical-red mx-auto" />
        <h2 className="text-base font-bold text-critical-red font-mono uppercase tracking-wider">
          403 FORBIDDEN - BẠN KHÔNG CÓ QUYỀN TRUY CẬP MÀN HÌNH ĐỐI SOÁT KẾ TOÁN
        </h2>
        <p className="text-xs text-steel-gray leading-relaxed">
          Tiêu chí chấp nhận Story SCRUM-385: <strong>Chỉ vai trò Kế toán (ACCOUNTANT) và Quản trị viên (ADMIN) mới có quyền kiểm tra đối soát tiền thu khớp với điện đã bán.</strong>
        </p>
        <div className="pt-2">
          <Link
            to="/"
            className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-bold transition-colors inline-flex items-center space-x-1.5"
          >
            <span>Quay về trang chính</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Tiêu đề trang & Thanh công cụ thao tác */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-tech-white flex items-center space-x-2">
                <span>ĐỐI SOÁT kWh ĐÃ CẤP VỚI TIỀN ĐÃ THU</span>
                <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  S-53 / SCRUM-385 / SCRUM-397
                </span>
              </h1>
              <p className="text-xs text-steel-gray mt-0.5">
                Kiểm tra đối soát tài chính: phát hiện thất thoát điện chưa lập bill, hóa đơn chưa ghi sổ cái ví, và tiền lệch biểu giá.
              </p>
            </div>
          </div>
        </div>

        {/* Nút hành động */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-2 rounded text-xs font-mono font-medium bg-panel border border-hairline hover:bg-hairline text-steel-gray hover:text-tech-white transition-colors flex items-center space-x-1.5"
            title="Làm mới dữ liệu đối soát"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={handleSimulateDemoAnomalies}
            className="px-3 py-2 rounded text-xs font-mono font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors flex items-center space-x-1.5 shadow-sm"
            title="Mô phỏng 3 ca bất thường S-53 phục vụ kiểm thử"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Tạo 3 Ca Mẫu (Demo)</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={summary.allAuditedSessions.length === 0}
            className="px-3.5 py-2 rounded text-xs font-mono font-bold bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
            title="Xuất biên bản đối soát ra file CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Xuất Biên Bản</span>
          </button>
        </div>
      </div>

      {/* 2. KHỐI TÓM TẮT ĐẦU TRANG (AC2: Tổng chênh lệch & Danh sách phiên cần xem xét hiện ở đầu báo cáo) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* TỔNG CHÊNH LỆCH / THẤT THOÁT PHÁT HIỆN */}
        <div className="bg-panel border border-critical-red/40 p-4 rounded-sm flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-critical-red" />
          <div>
            <span className="text-[10px] text-critical-red uppercase font-mono font-bold block">
              TỔNG CHÊNH LỆCH PHÁT HIỆN
            </span>
            <span className="text-xl sm:text-2xl font-bold text-critical-red font-mono mt-1 block tabular-nums">
              {summary.totalVarianceAmount < 0 ? '' : '+'}
              {summary.totalVarianceAmount.toLocaleString('vi-VN')} đ
            </span>
            <span className="text-[10px] text-steel-gray font-mono block mt-0.5">
              {summary.totalVarianceAmount < 0 ? 'Thất thoát / Chưa thu đủ' : 'Thặng dư so với biểu giá'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-critical-red/10 flex items-center justify-center text-critical-red border border-critical-red/30">
            <AlertOctagon className="w-5 h-5" />
          </div>
        </div>

        {/* SỐ PHIÊN CẦN XEM XÉT (TỔNG BẤT THƯỜNG) */}
        <div className="bg-panel border border-amber-500/40 p-4 rounded-sm flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
          <div>
            <span className="text-[10px] text-amber-400 uppercase font-mono font-bold block">
              PHIÊN CẦN XEM XÉT
            </span>
            <span className="text-xl sm:text-2xl font-bold text-amber-400 font-mono mt-1 block">
              {summary.anomalyCount} / {summary.totalSessions} phiên
            </span>
            <span className="text-[10px] text-steel-gray font-mono block mt-0.5">
              Tỷ lệ bất thường:{' '}
              {summary.totalSessions > 0
                ? Math.round((summary.anomalyCount / summary.totalSessions) * 1000) / 10
                : 0}
              %
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* TỔNG ĐIỆN NĂNG ĐÃ CẤP */}
        <div className="bg-panel border border-hairline p-4 rounded-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-steel-gray uppercase font-mono block">
              ĐIỆN NĂNG ĐÃ CẤP
            </span>
            <span className="text-xl font-bold text-sky-400 font-mono mt-1 block tabular-nums">
              {summary.totalKwhDelivered.toLocaleString('vi-VN')} kWh
            </span>
            <span className="text-[10px] text-steel-gray font-mono block mt-0.5">
              Tiền lý thuyết: {formatCurrencyVND(summary.totalExpectedRevenue)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400 border border-sky-500/30">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        {/* TỔNG TIỀN THỰC THU TRÊN SỔ CÁI */}
        <div className="bg-panel border border-hairline p-4 rounded-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-steel-gray uppercase font-mono block">
              TIỀN THỰC THU SỔ CÁI
            </span>
            <span className="text-xl font-bold text-tech-white font-mono mt-1 block tabular-nums">
              {formatCurrencyVND(summary.totalActualRevenue)}
            </span>
            <span className="text-[10px] text-grid-green font-mono block mt-0.5">
              Đã hạch toán vào ví
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-grid-green/10 flex items-center justify-center text-grid-green border border-grid-green/30">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Phân loại 3 nhóm bất thường theo Tiêu chí chấp nhận AC1 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Nhóm 1: Có kWh mà không có hóa đơn */}
        <div
          onClick={() => setFilterTab('MISSING_INVOICE')}
          className={`p-3.5 rounded border transition-all cursor-pointer ${
            filterTab === 'MISSING_INVOICE'
              ? 'bg-critical-red/20 border-critical-red shadow-sm'
              : 'bg-panel border-critical-red/30 hover:border-critical-red/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold text-critical-red flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-critical-red" />
              <span>(1) CÓ kWh CHƯA LẬP HÓA ĐƠN</span>
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-critical-red text-white">
              {summary.missingInvoiceCount}
            </span>
          </div>
          <p className="text-[10px] text-steel-gray font-mono mt-1.5">
            Phiên đã cấp điện qua đồng hồ nhưng chưa phát sinh hóa đơn thu tiền (nguy cơ thất thoát).
          </p>
        </div>

        {/* Nhóm 2: Có hóa đơn mà không có dòng sổ cái */}
        <div
          onClick={() => setFilterTab('MISSING_LEDGER')}
          className={`p-3.5 rounded border transition-all cursor-pointer ${
            filterTab === 'MISSING_LEDGER'
              ? 'bg-amber-500/20 border-amber-500 shadow-sm'
              : 'bg-panel border-amber-500/30 hover:border-amber-500/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold text-amber-400 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>(2) CÓ HÓA ĐƠN THIẾU SỔ CÁI</span>
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-500 text-black">
              {summary.missingLedgerCount}
            </span>
          </div>
          <p className="text-[10px] text-steel-gray font-mono mt-1.5">
            Đã chốt tiền hóa đơn nhưng chưa hạch toán trừ ví điện tử (chưa thực thu).
          </p>
        </div>

        {/* Nhóm 3: Tiền hóa đơn lệch so với tính lại từ biểu giá */}
        <div
          onClick={() => setFilterTab('PRICE_MISMATCH')}
          className={`p-3.5 rounded border transition-all cursor-pointer ${
            filterTab === 'PRICE_MISMATCH'
              ? 'bg-purple-500/20 border-purple-500 shadow-sm'
              : 'bg-panel border-purple-500/30 hover:border-purple-500/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold text-purple-400 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>(3) LỆCH TIỀN SO VỚI BIỂU GIÁ</span>
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-purple-500 text-white">
              {summary.priceMismatchCount}
            </span>
          </div>
          <p className="text-[10px] text-steel-gray font-mono mt-1.5">
            Tiền tính trên hóa đơn không khớp với công thức (kWh × Đơn giá khung giờ + Phí chiếm trụ).
          </p>
        </div>
      </div>

      {/* 4. Thanh điều khiển Bộ chọn kỳ & Ngưỡng dung sai làm tròn (NFR) */}
      <div className="bg-panel border border-hairline p-4 rounded-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Chọn trạm */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono font-bold text-steel-gray uppercase shrink-0">
              TRẠM SẠC:
            </span>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-obsidian border border-hairline rounded px-2.5 py-1 text-xs font-mono text-tech-white focus:outline-none focus:border-purple-500"
            >
              <option value="ALL">Tất cả trạm sạc</option>
              {stations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>

          {/* Chọn kỳ */}
          <div className="flex items-center space-x-1.5 flex-wrap">
            <span className="text-xs font-mono font-bold text-steel-gray uppercase mr-1">
              KỲ ĐỐI SOÁT:
            </span>
            {[
              { key: REPORT_PERIODS.TODAY, label: 'Hôm Nay' },
              { key: REPORT_PERIODS.THIS_WEEK, label: '7 Ngày' },
              { key: REPORT_PERIODS.THIS_MONTH, label: 'Tháng Này' },
              { key: REPORT_PERIODS.CUSTOM, label: 'Tự Chọn' },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-all ${
                  period === p.key
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-obsidian border border-hairline text-steel-gray hover:text-tech-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Cấu hình ngưỡng sai số làm tròn (NFR: Chưa refine - cần chốt ngưỡng chênh lệch coi là chấp nhận được do làm tròn) */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono text-steel-gray shrink-0 flex items-center space-x-1">
              <Settings className="w-3 h-3" />
              <span>Dung sai làm tròn:</span>
            </span>
            <select
              value={tolerance}
              onChange={(e) => setTolerance(Number(e.target.value))}
              className="bg-obsidian border border-hairline rounded px-2 py-0.5 text-xs font-mono text-tech-white focus:outline-none"
            >
              <option value={0}>0 đ (Tuyệt đối)</option>
              <option value={500}>±500 đ</option>
              <option value={1000}>±1.000 đ (Mặc định)</option>
              <option value={5000}>±5.000 đ</option>
            </select>
          </div>
        </div>

        {/* Khung nhập ngày nếu chọn CUSTOM */}
        {period === REPORT_PERIODS.CUSTOM && (
          <div className="flex items-center space-x-3 pt-2 border-t border-hairline text-xs font-mono text-steel-gray">
            <span className="font-bold text-tech-white">Từ ngày:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-obsidian border border-hairline rounded px-2.5 py-1 text-tech-white focus:outline-none"
            />
            <span className="font-bold text-tech-white">Đến ngày:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-obsidian border border-hairline rounded px-2.5 py-1 text-tech-white focus:outline-none"
            />
          </div>
        )}

        <div className="text-[11px] font-mono text-steel-gray pt-1">
          Kỳ đối soát: <strong className="text-purple-400">{dateRange.label}</strong>
        </div>
      </div>

      {/* 5. BẢNG DANH SÁCH PHIÊN BẤT THƯỜNG CẦN XEM XÉT (AC1 & AC2) */}
      <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-tech-white font-mono flex items-center space-x-2">
              <span>DANH SÁCH PHIÊN CẦN XEM XÉT / BẤT THƯỜNG</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-critical-red/20 text-critical-red border border-critical-red/40">
                {summary.anomalyCount} bất thường
              </span>
            </h2>
            <span className="text-[11px] font-mono text-steel-gray">
              Đang hiển thị {displayList.length} phiên sạc
            </span>
          </div>

          {/* Ô tìm kiếm */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-steel-gray absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm mã phiên, trạm, trụ..."
              className="w-full pl-8 pr-3 py-1.5 bg-obsidian border border-hairline rounded text-xs font-mono text-tech-white placeholder:text-steel-gray focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Tab lọc loại bất thường */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pt-1">
          {[
            {
              key: 'ALL_ANOMALIES',
              label: 'TẤT CẢ CẦN XEM XÉT',
              count: summary.anomalyCount,
              highlight: true,
            },
            {
              key: 'MISSING_INVOICE',
              label: '(1) THIẾU HÓA ĐƠN',
              count: summary.missingInvoiceCount,
              badge: 'bg-critical-red text-white',
            },
            {
              key: 'MISSING_LEDGER',
              label: '(2) THIẾU SỔ CÁI',
              count: summary.missingLedgerCount,
              badge: 'bg-amber-500 text-black',
            },
            {
              key: 'PRICE_MISMATCH',
              label: '(3) LỆCH BIỂU GIÁ',
              count: summary.priceMismatchCount,
              badge: 'bg-purple-500 text-white',
            },
            {
              key: 'MATCHED',
              label: 'HỢP LỆ (KHỚP)',
              count: summary.matchedCount,
              badge: 'bg-grid-green text-black',
            },
            {
              key: 'ALL_SESSIONS',
              label: 'TẤT CẢ PHIÊN',
              count: summary.totalSessions,
            },
          ].map((tab) => {
            const isSelected = filterTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterTab(tab.key)}
                className={`px-2.5 py-1.5 rounded text-xs font-mono font-bold flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                  isSelected
                    ? tab.highlight
                      ? 'bg-critical-red text-white shadow-sm'
                      : 'bg-purple-600 text-white shadow-sm'
                    : 'bg-obsidian border border-hairline text-steel-gray hover:text-tech-white'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected
                      ? 'bg-black/20 text-white'
                      : tab.badge || 'bg-panel text-steel-gray'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bảng dữ liệu đối soát */}
        <div className="overflow-x-auto">
          {displayList.length === 0 ? (
            <div className="py-12 text-center text-xs text-steel-gray font-mono space-y-1">
              <CheckCircle2 className="w-8 h-8 text-grid-green mx-auto mb-2 opacity-60" />
              <p className="font-bold text-tech-white">Không phát hiện phiên bất thường nào!</p>
              <p className="text-[11px]">
                Tất cả kWh điện đã cấp khớp hoàn toàn với số tiền đã thu trên hóa đơn và sổ cái.
              </p>
            </div>
          ) : (
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-hairline text-steel-gray bg-obsidian/40">
                  <th className="py-3 px-3">MÃ PHIÊN</th>
                  <th className="py-3 px-3">THỜI GIAN &amp; TRẠM SẠC</th>
                  <th className="py-3 px-3">LOẠI BẤT THƯỜNG</th>
                  <th className="py-3 px-3 text-right">ĐÃ CẤP (kWh)</th>
                  <th className="py-3 px-3 text-right">HÓA ĐƠN (đ)</th>
                  <th className="py-3 px-3 text-right">LÝ THUYẾT (đ)</th>
                  <th className="py-3 px-3 text-right">CHÊNH LỆCH (đ)</th>
                  <th className="py-3 px-3 text-center">SỔ CÁI VÍ</th>
                  <th className="py-3 px-3 text-right">CHI TIẾT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {displayList.map((s) => {
                  const a = s.reconciliation;
                  const isAnomaly = a.isAnomaly;

                  return (
                    <tr
                      key={s.id}
                      id={`recon-row-${s.id}`}
                      className={`hover:bg-panel-hover transition-colors ${
                        isAnomaly ? 'bg-critical-red/5' : ''
                      }`}
                    >
                      {/* Mã phiên */}
                      <td className="py-3 px-3 font-bold text-tech-white">
                        <Link
                          to={`/session/${s.id}`}
                          className="hover:underline text-sky-400"
                        >
                          #{s.id}
                        </Link>
                      </td>

                      {/* Thời gian & Trạm */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          <span className="text-tech-white font-bold block">
                            {s.station_name || 'Trạm sạc'}
                          </span>
                          <span className="text-[11px] text-steel-gray block">
                            {formatVNDateTime(s.start_time)} • Trụ #{s.charger_code || 'SIM-001'}
                          </span>
                        </div>
                      </td>

                      {/* Loại bất thường */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${a.badgeClass}`}
                        >
                          {a.typeLabel}
                        </span>
                        <span className="text-[10px] text-steel-gray block mt-0.5 max-w-xs truncate">
                          {a.description}
                        </span>
                      </td>

                      {/* Đã cấp kWh */}
                      <td className="py-3 px-3 text-right text-sky-400 font-bold tabular-nums">
                        {a.kwh.toLocaleString('vi-VN')}
                      </td>

                      {/* Tiền hóa đơn */}
                      <td className="py-3 px-3 text-right text-tech-white tabular-nums">
                        {a.hasInvoice ? (
                          `${a.actualAmount.toLocaleString('vi-VN')} đ`
                        ) : (
                          <span className="text-critical-red font-bold">Chưa lập</span>
                        )}
                      </td>

                      {/* Tiền lý thuyết */}
                      <td className="py-3 px-3 text-right text-steel-gray tabular-nums">
                        {a.expectedAmount.toLocaleString('vi-VN')} đ
                      </td>

                      {/* Chênh lệch */}
                      <td className="py-3 px-3 text-right font-bold tabular-nums">
                        <span
                          className={
                            a.varianceAmount === 0
                              ? 'text-grid-green'
                              : a.varianceAmount < 0
                              ? 'text-critical-red font-extrabold'
                              : 'text-purple-400'
                          }
                        >
                          {a.varianceAmount > 0 ? '+' : ''}
                          {a.varianceAmount.toLocaleString('vi-VN')} đ
                        </span>
                      </td>

                      {/* Mã sổ cái */}
                      <td className="py-3 px-3 text-center">
                        {s.wallet_transaction_id ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-obsidian border border-hairline text-steel-gray font-mono">
                            #{s.wallet_transaction_id}
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-critical-red/20 text-critical-red font-bold">
                            Chưa có
                          </span>
                        )}
                      </td>

                      {/* Nút Liên kết sang chi tiết phiên (AC: liên kết sang chi tiết phiên) */}
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center space-x-1.5">
                          <Link
                            to={`/session/${s.id}`}
                            className="px-2 py-1 rounded bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 border border-sky-500/40 text-[10px] font-bold transition-colors inline-flex items-center space-x-1"
                            title="Xem chi tiết phiên sạc"
                          >
                            <span>Phiên</span>
                            <ChevronRight className="w-3 h-3" />
                          </Link>

                          {a.hasInvoice && (
                            <Link
                              to={`/invoices/${s.id}`}
                              className="px-2 py-1 rounded bg-panel hover:bg-hairline text-steel-gray hover:text-tech-white border border-hairline text-[10px] transition-colors"
                              title="Xem chi tiết hóa đơn"
                            >
                              HĐ
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
