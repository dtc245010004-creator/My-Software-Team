import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './StationManagement.css';

// SVG Icons chuẩn hệ thống thiết kế Enterprise
const Icons = {
  Bolt: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Bell: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Moon: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  Sun: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  Refresh: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Eye: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Edit: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Sliders: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  History: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 14 14" />
    </svg>
  ),
  Close: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
};

const VIETNAM_CITIES = [
  'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Quảng Ninh',
  'Bà Rịa - Vũng Tàu', 'Bình Dương', 'Đồng Nai', 'Khánh Hòa', 'Lâm Đồng'
];

const POWER_TYPES = [
  'DC Supercharge 180kW',
  'DC Fast 60kW',
  'AC Standard 22kW',
  'Hybrid Ultra (DC + AC)'
];

const initialStations = [
  {
    id: 1,
    code: 'VN-HCM-001',
    name: 'Trung tâm Vận hành Q1 - Diamond Plaza',
    address: '34 Lê Duẩn, Phường Bến Nghé, Quận 1',
    city: 'TP. Hồ Chí Minh',
    status: 'Active',
    powerType: 'DC Supercharge 180kW',
    lat: 10.7769,
    lng: 106.7009,
    piles: [
      { id: 'P01', name: 'Trụ sạc A1 (CCS2)', status: 'charging', powerDraw: '148.5 kW', vehicleSoc: 72 },
      { id: 'P02', name: 'Trụ sạc A2 (CCS2)', status: 'charging', powerDraw: '122.0 kW', vehicleSoc: 84 },
      { id: 'P03', name: 'Trụ sạc B1 (CCS2)', status: 'available', powerDraw: '0.0 kW', vehicleSoc: 0 },
      { id: 'P04', name: 'Trụ sạc B2 (CCS2)', status: 'available', powerDraw: '0.0 kW', vehicleSoc: 0 },
      { id: 'P05', name: 'Trụ sạc C1 (GB/T)', status: 'maintenance', powerDraw: '0.0 kW', vehicleSoc: 0 },
      { id: 'P06', name: 'Trụ sạc C2 (GB/T)', status: 'available', powerDraw: '0.0 kW', vehicleSoc: 0 }
    ]
  },
  {
    id: 2,
    code: 'VN-HAN-002',
    name: 'Trạm Sạc Cầu Giấy Tech Hub',
    address: '45 Cầu Giấy, Phường Dịch Vọng',
    city: 'Hà Nội',
    status: 'Maintenance',
    powerType: 'DC Fast 60kW',
    lat: 21.0285,
    lng: 105.8542,
    piles: [
      { id: 'P01', name: 'Trụ sạc A1 (CCS2)', status: 'maintenance', powerDraw: '0.0 kW', vehicleSoc: 0 },
      { id: 'P02', name: 'Trụ sạc A2 (CCS2)', status: 'maintenance', powerDraw: '0.0 kW', vehicleSoc: 0 }
    ]
  },
  {
    id: 3,
    code: 'VN-DAD-003',
    name: 'Trạm Cao tốc Đà Nẵng Central',
    address: '02 Lê Duẩn, Phường Hải Châu 1',
    city: 'Đà Nẵng',
    status: 'Active',
    powerType: 'Hybrid Ultra (DC + AC)',
    lat: 16.0544,
    lng: 108.2022,
    piles: [
      { id: 'P01', name: 'Trụ sạc A1 (DC 180kW)', status: 'charging', powerDraw: '162.4 kW', vehicleSoc: 55 },
      { id: 'P02', name: 'Trụ sạc A2 (DC 60kW)', status: 'available', powerDraw: '0.0 kW', vehicleSoc: 0 },
      { id: 'P03', name: 'Trụ sạc B1 (AC 22kW)', status: 'available', powerDraw: '0.0 kW', vehicleSoc: 0 }
    ]
  },
  {
    id: 4,
    code: 'VN-QNH-004',
    name: 'Trạm Bãi Cháy Marina Express',
    address: 'Đường Hạ Long, Bãi Cháy',
    city: 'Quảng Ninh',
    status: 'Active',
    powerType: 'DC Supercharge 180kW',
    lat: 20.9505,
    lng: 107.0733,
    piles: [
      { id: 'P01', name: 'Trụ sạc A1 (CCS2)', status: 'charging', powerDraw: '178.0 kW', vehicleSoc: 91 },
      { id: 'P02', name: 'Trụ sạc A2 (CCS2)', status: 'charging', powerDraw: '174.2 kW', vehicleSoc: 94 }
    ]
  }
];

const initialAlerts = [
  { id: 1, stationCode: 'VN-HAN-002', title: 'Cảnh báo nhiệt độ đầu súng CCS2', detail: 'Cảm biến đo nhiệt độ vượt ngưỡng an toàn (>82°C)', severity: 'critical', time: '8 phút trước', read: false },
  { id: 2, stationCode: 'VN-HCM-001', title: 'Mất tín hiệu truyền thông OCPP', detail: 'Bộ điều khiển Gateway chuyển sang mạng dự phòng LTE', severity: 'warning', time: '22 phút trước', read: false },
  { id: 3, stationCode: 'VN-QNH-004', title: 'Cân bằng pha tải lưới điện', detail: 'Điện áp pha dao động nhẹ định mức tiêu chuẩn', severity: 'info', time: '1 giờ trước', read: true }
];

const initialMaintenanceLogs = [
  { id: 1, stationCode: 'VN-HAN-002', techName: 'Nguyễn Văn Hùng', start: '2026-03-20 08:30', end: '2026-03-20 11:45', reason: 'Thay thế Contactor cao áp 250A', status: 'Hoàn thành' },
  { id: 2, stationCode: 'VN-HCM-001', techName: 'Trần Minh Tuấn', start: '2026-03-22 14:00', end: '2026-03-22 15:30', reason: 'Bảo dưỡng màng lọc làm mát cưỡng bức', status: 'Hoàn thành' },
  { id: 3, stationCode: 'VN-HAN-002', techName: 'Lê Hoàng Nam', start: '2026-03-25 09:00', end: 'Chưa nghiệm thu', reason: 'Kiểm tra module chỉnh lưu AC/DC', status: 'Đang xử lý' }
];

const createCustomMarkerIcon = (station) => {
  const availPiles = station.piles.filter(p => p.status === 'available').length;
  let pinClass = 'marker-active';
  let badgeText = `${availPiles} rảnh`;

  if (station.status === 'Maintenance') {
    pinClass = 'marker-maint';
    badgeText = 'Bảo trì';
  } else if (availPiles === 0) {
    pinClass = 'marker-busy';
    badgeText = 'Kín chỗ';
  }

  const customIconHtml = `
    <div class="custom-map-pin ${pinClass}">
      <span class="pin-dot"></span>
      <span class="pin-badge">${badgeText}</span>
    </div>
  `;

  return L.divIcon({
    html: customIconHtml,
    className: 'custom-leaflet-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });
};

export default function StationManagement() {
  const [stations, setStations] = useState(initialStations);
  const [viewMode, setViewMode] = useState('table');
  const [isDarkMode, setIsDarkMode] = useState(true); // Mặc định Dark Mode chuẩn phòng NOC
  const [currentUserRole, setCurrentUserRole] = useState('Admin');

  // Modals & Panels
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStation, setEditingStation] = useState(null);
  const [detailStation, setDetailStation] = useState(null);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // Notifications & Logs
  const [alerts, setAlerts] = useState(initialAlerts);
  const [maintenanceLogs, setMaintenanceLogs] = useState(initialMaintenanceLogs);
  const [newLog, setNewLog] = useState({ stationCode: 'VN-HCM-001', techName: '', reason: '' });

  // Pricing Config
  const [pricingConfig, setPricingConfig] = useState({
    standardPrice: 3858,
    peakPrice: 4890,
    offPeakPrice: 2950,
    overstayFee: 1000,
    currency: 'VNĐ/kWh'
  });

  // Filter & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterCity, setFilterCity] = useState('All');
  const [filterPowerType, setFilterPowerType] = useState('All');

  // Sorting & Pagination
  const [sortField, setSortField] = useState('code');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    address: '',
    city: 'TP. Hồ Chí Minh',
    status: 'Active',
    powerType: 'DC Supercharge 180kW',
    totalPilesCount: 4,
    lat: 10.7769,
    lng: 106.7009
  });

  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const unreadAlertsCount = alerts.filter(a => !a.read).length;

  const markAllAlertsRead = () => {
    setAlerts(alerts.map(a => ({ ...a, read: true })));
    showToast('Đã đánh dấu đã đọc toàn bộ cảnh báo', 'info');
  };

  // KPIs
  const totalStations = stations.length;
  const activeStations = stations.filter(s => s.status === 'Active').length;
  const maintenanceStations = stations.filter(s => s.status === 'Maintenance').length;

  let totalPilesCount = 0;
  let availablePilesCount = 0;
  stations.forEach(st => {
    totalPilesCount += st.piles.length;
    availablePilesCount += st.piles.filter(p => p.status === 'available').length;
  });

  // Filter & Sắp xếp dữ liệu
  const processedStations = useMemo(() => {
    let result = stations.filter(st => {
      const matchesSearch =
        st.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        st.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        st.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'All' || st.status === filterStatus;
      const matchesCity = filterCity === 'All' || st.city === filterCity;
      const matchesPower = filterPowerType === 'All' || st.powerType === filterPowerType;
      return matchesSearch && matchesStatus && matchesCity && matchesPower;
    });

    result.sort((a, b) => {
      let valA, valB;
      if (sortField === 'code') {
        valA = a.code.toLowerCase();
        valB = b.code.toLowerCase();
      } else if (sortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === 'availablePiles') {
        valA = a.piles.filter(p => p.status === 'available').length;
        valB = b.piles.filter(p => p.status === 'available').length;
      } else {
        valA = a.id;
        valB = b.id;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [stations, searchTerm, filterStatus, filterCity, filterPowerType, sortField, sortOrder]);

  const totalPages = Math.ceil(processedStations.length / itemsPerPage) || 1;
  const paginatedStations = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedStations.slice(start, start + itemsPerPage);
  }, [processedStations, currentPage, itemsPerPage]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleToggleStationStatus = (id) => {
    if (currentUserRole === 'Accountant') {
      showToast('Kế toán viên không có quyền điều chỉnh trạng thái trạm.', 'error');
      return;
    }
    setStations(stations.map(st => {
      if (st.id === id) {
        const nextStatus = st.status === 'Active' ? 'Maintenance' : 'Active';
        const updatedPiles = st.piles.map(p => ({
          ...p,
          status: nextStatus === 'Maintenance' ? 'maintenance' : 'available',
          powerDraw: '0.0 kW',
          vehicleSoc: 0
        }));
        showToast(`Trạm [${st.code}] chuyển chế độ: ${nextStatus === 'Active' ? 'Vận hành' : 'Bảo trì'}`, 'info');
        return { ...st, status: nextStatus, piles: updatedPiles };
      }
      return st;
    }));
  };

  const handleDeleteStation = (station) => {
    if (currentUserRole !== 'Admin') {
      showToast('Chỉ Quản trị viên (Admin) mới có quyền xóa dữ liệu.', 'error');
      return;
    }
    if (window.confirm(`Xác nhận xóa bỏ điểm sạc: ${station.name} (${station.code})? Dữ liệu không thể khôi phục.`)) {
      setStations(prev => prev.filter(s => s.id !== station.id));
      if (detailStation && detailStation.id === station.id) {
        setDetailStation(null);
      }
      showToast(`Đã xóa thành công trạm ${station.code}`, 'info');
    }
  };

  const handleUpdatePileStatus = (stationId, pileId, newStatus) => {
    if (currentUserRole === 'Accountant') {
      showToast('Tài khoản kế toán chỉ có quyền xem dữ liệu báo cáo.', 'error');
      return;
    }
    setStations(prev =>
      prev.map(st => {
        if (st.id === stationId) {
          const updatedPiles = st.piles.map(p => {
            if (p.id === pileId) {
              return {
                ...p,
                status: newStatus,
                powerDraw: newStatus === 'charging' ? '125.0 kW' : '0.0 kW',
                vehicleSoc: newStatus === 'charging' ? 45 : 0
              };
            }
            return p;
          });
          const updatedStation = { ...st, piles: updatedPiles };
          if (detailStation && detailStation.id === stationId) {
            setDetailStation(updatedStation);
          }
          return updatedStation;
        }
        return st;
      })
    );
    showToast(`Đã điều chỉnh trạng thái cổng ${pileId}`, 'success');
  };

  const handleCreateMaintenanceLog = (e) => {
    e.preventDefault();
    if (!newLog.techName || !newLog.reason) {
      showToast('Vui lòng điền đủ kỹ thuật viên và nội dung can thiệp.', 'error');
      return;
    }
    const logItem = {
      id: Date.now(),
      stationCode: newLog.stationCode,
      techName: newLog.techName,
      start: new Date().toISOString().replace('T', ' ').slice(0, 16),
      end: 'Đang xử lý',
      reason: newLog.reason,
      status: 'Đang xử lý'
    };
    setMaintenanceLogs([logItem, ...maintenanceLogs]);
    setNewLog({ stationCode: 'VN-HCM-001', techName: '', reason: '' });
    showToast('Đã ghi nhận biên bản bảo trì mới', 'success');
  };

  const handleExportCSV = () => {
    const headers = ['Mã Trạm', 'Tên Trạm', 'Địa Chỉ', 'Tỉnh Thành', 'Công Nghệ', 'Trạng Thái', 'Trụ Trống', 'Tổng Trụ'];
    const rows = processedStations.map(s => {
      const avail = s.piles.filter(p => p.status === 'available').length;
      return [
        `"${s.code}"`,
        `"${s.name}"`,
        `"${s.address}"`,
        `"${s.city}"`,
        `"${s.powerType}"`,
        `"${s.status === 'Active' ? 'Vận hành' : 'Bảo trì'}"`,
        avail,
        s.piles.length
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `EV_Network_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Xuất tệp báo cáo CSV thành công', 'success');
  };

  const handleOpenModal = (station = null) => {
    if (currentUserRole === 'Accountant') {
      showToast('Tài khoản kế toán không có thẩm quyền sửa đổi cấu hình trạm.', 'error');
      return;
    }
    if (station) {
      setEditingStation(station);
      setFormData({
        code: station.code,
        name: station.name,
        address: station.address,
        city: station.city,
        status: station.status,
        powerType: station.powerType,
        totalPilesCount: station.piles.length,
        lat: station.lat || 10.7769,
        lng: station.lng || 106.7009
      });
    } else {
      setEditingStation(null);
      setFormData({
        code: `VN-NODE-00${stations.length + 1}`,
        name: '',
        address: '',
        city: 'TP. Hồ Chí Minh',
        status: 'Active',
        powerType: 'DC Supercharge 180kW',
        totalPilesCount: 4,
        lat: 10.7769,
        lng: 106.7009
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.address) {
      showToast('Vui lòng hoàn thiện Tên và Địa chỉ trạm.', 'error');
      return;
    }

    if (editingStation) {
      setStations(stations.map(st =>
        st.id === editingStation.id
          ? { ...st, ...formData, lat: Number(formData.lat), lng: Number(formData.lng) }
          : st
      ));
      showToast('Cập nhật thông số trạm thành công');
    } else {
      const generatedPiles = Array.from({ length: Number(formData.totalPilesCount) }, (_, idx) => ({
        id: `P${idx + 1 < 10 ? '0' + (idx + 1) : idx + 1}`,
        name: `Trụ sạc ${String.fromCharCode(65 + Math.floor(idx / 2))}${(idx % 2) + 1} (CCS2)`,
        status: formData.status === 'Maintenance' ? 'maintenance' : 'available',
        powerDraw: '0.0 kW',
        vehicleSoc: 0
      }));

      const newStation = {
        id: Date.now(),
        ...formData,
        lat: Number(formData.lat),
        lng: Number(formData.lng),
        piles: generatedPiles
      };
      setStations([...stations, newStation]);
      showToast('Khởi tạo trạm sạc mới thành công');
    }
    setIsModalOpen(false);
  };

  return (
    <div className={`station-container ${isDarkMode ? 'dark-theme' : ''}`}>
      {toast && (
        <div className={`toast toast-${toast.type} animate-toast`}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* TOPBAR / APP HEADER */}
      <header className="dashboard-header">
        <div className="header-title-box">
          <div className="brand-badge">
            <Icons.Bolt />
          </div>
          <div>
            <div className="title-row">
              <h1 className="title">EV Central Command</h1>
              <span className="live-telemetry-badge">
                <span className="live-dot"></span> LIVE TELEMETRY
              </span>
            </div>
            <p className="subtitle">Hệ thống Điều hành & Giám sát Phân phối Năng lượng Mạng lưới</p>
          </div>
        </div>

        <div className="header-actions">
          {/* RBAC Selector */}
          <div className="role-selector-wrap">
            <span className="role-label">Phân quyền:</span>
            <select
              className="styled-select-sm role-select"
              value={currentUserRole}
              onChange={(e) => {
                setCurrentUserRole(e.target.value);
                showToast(`Chuyển sang vai trò: ${e.target.value}`, 'info');
              }}
            >
              <option value="Admin">System Administrator</option>
              <option value="Technician">Field Engineer</option>
              <option value="Accountant">Billing Auditor</option>
            </select>
          </div>

          <button
            className="btn btn-secondary btn-icon-only"
            title="Chuyển chế độ Sáng / Tối"
            onClick={() => setIsDarkMode(!isDarkMode)}
          >
            {isDarkMode ? <Icons.Sun /> : <Icons.Moon />}
          </button>

          {/* Alert Center */}
          <div className="notification-bell-container">
            <button
              className="btn btn-secondary btn-icon-only bell-btn"
              onClick={() => setShowNotificationPanel(!showNotificationPanel)}
            >
              <Icons.Bell />
              {unreadAlertsCount > 0 && <span className="notification-badge">{unreadAlertsCount}</span>}
            </button>

            {showNotificationPanel && (
              <div className="notification-dropdown animate-slide-up">
                <div className="notif-header">
                  <h4>Cảnh báo mạng lưới ({alerts.length})</h4>
                  <button className="text-btn-xs" onClick={markAllAlertsRead}>Đánh dấu đã đọc</button>
                </div>
                <div className="notif-list">
                  {alerts.map(alert => (
                    <div key={alert.id} className={`notif-item ${alert.severity} ${!alert.read ? 'unread' : ''}`}>
                      <div className="notif-title-row">
                        <span className="notif-tag">{alert.stationCode}</span>
                        <strong>{alert.title}</strong>
                      </div>
                      <p className="notif-desc">{alert.detail}</p>
                      <span className="notif-time">{alert.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button className="btn btn-secondary" onClick={() => setShowPricingModal(true)}>
            <Icons.Sliders /> Cấu hình giá
          </button>

          <button className="btn btn-secondary" onClick={() => setShowLogsModal(true)}>
            <Icons.History /> Nhật ký kỹ thuật
          </button>

          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <Icons.Download /> Xuất báo cáo
          </button>

          {currentUserRole !== 'Accountant' && (
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              <Icons.Plus /> Thêm điểm sạc
            </button>
          )}
        </div>
      </header>

      {/* METRICS OVERVIEW (Đã căn chỉnh chuẩn flexbox, không bị xô lệch) */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">TỔNG TRẠM SẠC</span>
            <span className="metric-badge neutral">100% Phủ sóng</span>
          </div>
          <div className="stat-main">
            <span className="stat-value">{totalStations}</span>
          </div>
          <span className="stat-footer-text">Toàn bộ địa bàn kết nối</span>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">ĐANG VẬN HÀNH</span>
            <span className="metric-badge success">Sẵn sàng phục vụ</span>
          </div>
          <div className="stat-main">
            <span className="stat-value text-green">{activeStations}</span>
          </div>
          <span className="stat-footer-text">100% Khả dụng mạng</span>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">BẢO TRÌ & SỰ CỐ</span>
            <span className="metric-badge warning">Đang can thiệp</span>
          </div>
          <div className="stat-main">
            <span className="stat-value text-orange">{maintenanceStations}</span>
          </div>
          <span className="stat-footer-text">Cần xử lý kỹ thuật</span>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">CỔNG SẠC KHẢ DỤNG</span>
            <span className="metric-badge purple">Trực tuyến</span>
          </div>
          <div className="stat-main">
            <span className="stat-value text-purple">{availablePilesCount} <span className="stat-denom">/ {totalPilesCount}</span></span>
          </div>
          <span className="stat-footer-text">Đầu súng đang mở kết nối</span>
        </div>
      </section>

      {/* FILTERS & VIEW MODE SWITCHER */}
      <section className="filter-bar">
        <div className="search-box">
          <span className="search-icon"><Icons.Search /></span>
          <input
            type="text"
            placeholder="Tìm theo mã định danh, địa chỉ, cụm dân cư..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="select-filter-wrap">
          <label className="select-label">Khu vực:</label>
          <select
            className="styled-select"
            value={filterCity}
            onChange={(e) => {
              setFilterCity(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="All">Toàn bộ khu vực ({VIETNAM_CITIES.length})</option>
            {VIETNAM_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="select-filter-wrap">
          <label className="select-label">Công nghệ:</label>
          <select
            className="styled-select"
            value={filterPowerType}
            onChange={(e) => {
              setFilterPowerType(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="All">Tất cả chuẩn công suất</option>
            {POWER_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
          </select>
        </div>

        <div className="filter-tabs">
          <button
            className={`tab-btn ${filterStatus === 'All' ? 'active' : ''}`}
            onClick={() => { setFilterStatus('All'); setCurrentPage(1); }}
          >
            Tất cả
          </button>
          <button
            className={`tab-btn ${filterStatus === 'Active' ? 'active' : ''}`}
            onClick={() => { setFilterStatus('Active'); setCurrentPage(1); }}
          >
            Vận hành
          </button>
          <button
            className={`tab-btn ${filterStatus === 'Maintenance' ? 'active' : ''}`}
            onClick={() => { setFilterStatus('Maintenance'); setCurrentPage(1); }}
          >
            Bảo trì
          </button>
        </div>

        <div className="view-mode-toggle">
          <button
            className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            Bảng biểu
          </button>
          <button
            className={`toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
            onClick={() => setViewMode('map')}
          >
            Bản đồ GIS
          </button>
        </div>
      </section>

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <section className="table-card animate-fade-in">
          <table className="station-table">
            <thead>
              <tr>
                <th className="sortable-th" onClick={() => handleSort('code')}>
                  MÃ ĐỊNH DANH {sortField === 'code' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="sortable-th" onClick={() => handleSort('name')}>
                  TÊN ĐIỂM SẠC & CÔNG NGHỆ {sortField === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>ĐỊA ĐIỂM HOẠT ĐỘNG</th>
                <th className="sortable-th" onClick={() => handleSort('availablePiles')}>
                  TẢI ĐẦU SÚNG {sortField === 'availablePiles' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>TRẠNG THÁI</th>
                <th style={{ textAlign: 'center' }}>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStations.length > 0 ? (
                paginatedStations.map((station) => {
                  const availP = station.piles.filter(p => p.status === 'available').length;
                  const totalP = station.piles.length;
                  const ratio = totalP > 0 ? (availP / totalP) * 100 : 0;

                  return (
                    <tr key={station.id}>
                      <td><span className="code-badge">{station.code}</span></td>
                      <td>
                        <strong className="station-row-title">{station.name}</strong>
                        <span className="power-type-tag">{station.powerType}</span>
                      </td>
                      <td>
                        <div className="location-main">{station.address}</div>
                        <div className="city-subtext">{station.city} • GPS: {station.lat.toFixed(4)}, {station.lng.toFixed(4)}</div>
                      </td>
                      <td>
                        <div className="piles-progress-wrap">
                          <span className="piles-count-text">
                            <strong>{availP}</strong> / {totalP} cổng rảnh
                          </span>
                          <div className="progress-bar-bg">
                            <div
                              className="progress-bar-fill"
                              style={{
                                width: `${ratio}%`,
                                backgroundColor: ratio > 40 ? '#10b981' : ratio > 0 ? '#f59e0b' : '#ef4444'
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <button
                          className={`status-badge ${station.status === 'Active' ? 'ready' : 'maintenance'}`}
                          onClick={() => handleToggleStationStatus(station.id)}
                          title="Bấm để chuyển đổi trạng thái"
                        >
                          <span className="status-dot"></span>
                          {station.status === 'Active' ? 'Vận hành' : 'Bảo trì'}
                        </button>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn-action btn-view"
                            title="Kiểm soát cổng sạc"
                            onClick={() => setDetailStation(station)}
                          >
                            <Icons.Eye /> Chi tiết
                          </button>
                          {currentUserRole !== 'Accountant' && (
                            <button
                              className="btn-action btn-edit"
                              title="Hiệu chỉnh thông số"
                              onClick={() => handleOpenModal(station)}
                            >
                              <Icons.Edit />
                            </button>
                          )}
                          {currentUserRole === 'Admin' && (
                            <button
                              className="btn-action btn-delete"
                              title="Xóa bỏ trạm sạc"
                              onClick={() => handleDeleteStation(station)}
                            >
                              <Icons.Trash />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="empty-cell">Không ghi nhận trạm sạc phù hợp tiêu chí lọc.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="pagination-bar">
            <div className="pagination-info">
              Hiển thị <strong>{paginatedStations.length}</strong> trên tổng số <strong>{processedStations.length}</strong> điểm sạc
            </div>

            <div className="pagination-controls">
              <span className="page-size-label">Bản ghi/trang:</span>
              <select
                className="styled-select-sm"
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>

              <button
                className="page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                Trước
              </button>
              <span className="page-current">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                className="page-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                Sau
              </button>
            </div>
          </div>
        </section>
      )}

      {/* MAP VIEW */}
      {viewMode === 'map' && (
        <section className="map-wrapper-card animate-fade-in">
          <div className="map-legend-bar">
            <span className="legend-title">Trạng thái hạ tầng:</span>
            <span className="legend-item"><span className="legend-dot green"></span> Có trụ rảnh</span>
            <span className="legend-item"><span className="legend-dot yellow"></span> Đang quá tải/Hết cổng</span>
            <span className="legend-item"><span className="legend-dot red"></span> Đang bảo trì</span>
          </div>

          <MapContainer
            center={[16.047079, 108.206230]}
            zoom={6}
            scrollWheelZoom={true}
            style={{ height: '600px', width: '100%', borderRadius: '12px' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {processedStations.map((station) => {
              if (!station.lat || !station.lng) return null;
              const availP = station.piles.filter(p => p.status === 'available').length;
              const chargP = station.piles.filter(p => p.status === 'charging').length;

              return (
                <Marker
                  key={station.id}
                  position={[station.lat, station.lng]}
                  icon={createCustomMarkerIcon(station)}
                >
                  <Popup>
                    <div className="map-popup-card">
                      <div className="popup-top">
                        <span className="code-badge">{station.code}</span>
                        <span className={`status-pill ${station.status.toLowerCase()}`}>
                          {station.status === 'Active' ? 'Vận hành' : 'Bảo trì'}
                        </span>
                      </div>
                      <h4 className="popup-title">{station.name}</h4>
                      <p className="popup-address">{station.address}, {station.city}</p>
                      <div className="popup-status-box">
                        <div>Hạ tầng: <strong>{station.powerType}</strong></div>
                        <div>Tải thời gian thực: <strong className="text-green">{availP} rảnh</strong> / <strong>{chargP} đang sạc</strong></div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm-popup"
                        onClick={() => setDetailStation(station)}
                      >
                        Bảng điều khiển cổng sạc
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </section>
      )}

      {/* DETAIL MODAL */}
      {detailStation && (
        <div className="modal-overlay animate-fade-in" onClick={() => setDetailStation(null)}>
          <div className="modal-content modal-large animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="code-badge">{detailStation.code}</span>
                <h3 style={{ margin: 0 }}>{detailStation.name}</h3>
              </div>
              <button className="close-btn" onClick={() => setDetailStation(null)}><Icons.Close /></button>
            </div>

            <div className="detail-modal-body">
              <div className="detail-meta-banner">
                <div>Địa điểm: <strong>{detailStation.address}, {detailStation.city}</strong></div>
                <div>Kiến trúc trạm: <strong>{detailStation.powerType}</strong></div>
                <div>Biểu phí áp dụng: <strong>{pricingConfig.standardPrice.toLocaleString()} {pricingConfig.currency}</strong></div>
              </div>

              <h4 style={{ margin: '20px 0 12px 0' }}>Trạng thái cổng sạc vật lý & Điều khiển:</h4>

              <div className="piles-grid">
                {detailStation.piles.map(pile => (
                  <div key={pile.id} className={`pile-card ${pile.status}`}>
                    <div className="pile-header">
                      <div className="pile-name-box">
                        <span className={`status-indicator ${pile.status}`}></span>
                        <strong>{pile.name}</strong>
                      </div>
                      <span className={`pile-status-tag ${pile.status}`}>
                        {pile.status === 'available' ? 'Sẵn sàng' : pile.status === 'charging' ? 'Đang cấp điện' : 'Lỗi/Bảo trì'}
                      </span>
                    </div>

                    {pile.status === 'charging' && (
                      <div className="pile-battery-wrap">
                        <div className="battery-bar-bg">
                          <div className="battery-bar-fill" style={{ width: `${pile.vehicleSoc}%` }} />
                        </div>
                        <div className="pile-draw-stats">
                          <span>Mức pin: <strong>{pile.vehicleSoc}%</strong></span>
                          <span>Công suất tức thời: <strong>{pile.powerDraw}</strong></span>
                        </div>
                      </div>
                    )}

                    {currentUserRole !== 'Accountant' && (
                      <div className="pile-actions">
                        {pile.status !== 'charging' && pile.status !== 'maintenance' && (
                          <button
                            className="btn-pile-action action-charge"
                            onClick={() => handleUpdatePileStatus(detailStation.id, pile.id, 'charging')}
                          >
                            Kích hoạt sạc
                          </button>
                        )}
                        {pile.status === 'charging' && (
                          <button
                            className="btn-pile-action action-stop"
                            onClick={() => handleUpdatePileStatus(detailStation.id, pile.id, 'available')}
                          >
                            Ngắt tải khẩn cấp
                          </button>
                        )}
                        {pile.status !== 'maintenance' ? (
                          <button
                            className="btn-pile-action action-maint"
                            onClick={() => handleUpdatePileStatus(detailStation.id, pile.id, 'maintenance')}
                          >
                            Khóa bảo trì
                          </button>
                        ) : (
                          <button
                            className="btn-pile-action action-restore"
                            onClick={() => handleUpdatePileStatus(detailStation.id, pile.id, 'available')}
                          >
                            Mở hoạt động
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDetailStation(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* PRICING CONFIG MODAL */}
      {showPricingModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowPricingModal(false)}>
          <div className="modal-content animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cấu hình Biểu phí Năng lượng</h3>
              <button className="close-btn" onClick={() => setShowPricingModal(false)}><Icons.Close /></button>
            </div>
            <div className="pricing-form">
              <div className="form-group">
                <label>Khung giờ Tiêu chuẩn (04:00 - 09:30 & 20:00 - 22:00)</label>
                <input
                  type="number"
                  value={pricingConfig.standardPrice}
                  disabled={currentUserRole === 'Technician'}
                  onChange={(e) => setPricingConfig({ ...pricingConfig, standardPrice: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label>Khung giờ Cao điểm (09:30 - 11:30 & 17:00 - 20:00)</label>
                <input
                  type="number"
                  value={pricingConfig.peakPrice}
                  disabled={currentUserRole === 'Technician'}
                  onChange={(e) => setPricingConfig({ ...pricingConfig, peakPrice: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label>Khung giờ Thấp điểm (22:00 - 04:00)</label>
                <input
                  type="number"
                  value={pricingConfig.offPeakPrice}
                  disabled={currentUserRole === 'Technician'}
                  onChange={(e) => setPricingConfig({ ...pricingConfig, offPeakPrice: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label>Phụ phí đỗ chiếm cổng sau khi sạc đầy (VNĐ/phút)</label>
                <input
                  type="number"
                  value={pricingConfig.overstayFee}
                  disabled={currentUserRole === 'Technician'}
                  onChange={(e) => setPricingConfig({ ...pricingConfig, overstayFee: Number(e.target.value) })}
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowPricingModal(false)}>Hủy</button>
                {currentUserRole !== 'Technician' && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      showToast('Đã lưu cấu hình biểu giá thành công');
                      setShowPricingModal(false);
                    }}
                  >
                    Lưu thay đổi
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAINTENANCE LOGS MODAL */}
      {showLogsModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowLogsModal(false)}>
          <div className="modal-content modal-large animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nhật ký Kỹ thuật & Sự cố Vận hành</h3>
              <button className="close-btn" onClick={() => setShowLogsModal(false)}><Icons.Close /></button>
            </div>

            {currentUserRole !== 'Accountant' && (
              <form onSubmit={handleCreateMaintenanceLog} className="log-form-box">
                <h4>Biên bản can thiệp kỹ thuật mới:</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label>Mã trạm</label>
                    <select
                      value={newLog.stationCode}
                      onChange={(e) => setNewLog({ ...newLog, stationCode: e.target.value })}
                    >
                      {stations.map(st => <option key={st.code} value={st.code}>{st.code} - {st.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Kỹ thuật viên can thiệp</label>
                    <input
                      type="text"
                      placeholder="Họ và tên kỹ thuật viên"
                      value={newLog.techName}
                      onChange={(e) => setNewLog({ ...newLog, techName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Nội dung công việc & Linh kiện thay thế</label>
                  <input
                    type="text"
                    placeholder="VD: Kiểm tra mạch cách điện, thay contactor áp cao..."
                    value={newLog.reason}
                    onChange={(e) => setNewLog({ ...newLog, reason: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                  Ghi biên bản
                </button>
              </form>
            )}

            <div className="table-responsive" style={{ marginTop: '16px' }}>
              <table className="station-table">
                <thead>
                  <tr>
                    <th>MÃ TRẠM</th>
                    <th>KỸ THUẬT VIÊN</th>
                    <th>BẮT ĐẦU</th>
                    <th>KẾT THÚC</th>
                    <th>NỘI DUNG XỬ LÝ</th>
                    <th>TIẾN ĐỘ</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceLogs.map(log => (
                    <tr key={log.id}>
                      <td><span className="code-badge">{log.stationCode}</span></td>
                      <td><strong>{log.techName}</strong></td>
                      <td>{log.start}</td>
                      <td>{log.end}</td>
                      <td>{log.reason}</td>
                      <td>
                        <span className={`pill-badge ${log.status === 'Hoàn thành' ? 'avail' : 'maint'}`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setShowLogsModal(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="modal-overlay animate-fade-in" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingStation ? 'Cập nhật Thông số Trạm Sạc' : 'Thêm Điểm Sạc Mới'}</h3>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}><Icons.Close /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Tên định danh điểm sạc</label>
                <input
                  type="text"
                  placeholder="VD: Trạm Sạc TTTM Landmark 81"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Địa chỉ hoạt động</label>
                <input
                  type="text"
                  placeholder="Địa chỉ số nhà, đường, quận/huyện"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Khu vực quản lý</label>
                  <select
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  >
                    {VIETNAM_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Công nghệ hạ tầng sạc</label>
                  <select
                    value={formData.powerType}
                    onChange={(e) => setFormData({ ...formData, powerType: e.target.value })}
                  >
                    {POWER_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Số lượng cổng sạc cấu hình</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={formData.totalPilesCount}
                    onChange={(e) => setFormData({ ...formData, totalPilesCount: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Trạng thái khởi tạo</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="Active">Vận hành bình thường</option>
                    <option value="Maintenance">Chế độ kiểm thử/Bảo trì</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Tọa độ Vĩ độ (Latitude)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.lat}
                    onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Tọa độ Kinh độ (Longitude)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.lng}
                    onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu cấu hình</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}