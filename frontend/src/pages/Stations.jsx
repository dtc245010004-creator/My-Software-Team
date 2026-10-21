import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Zap,
  Cpu,
  MapPin,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  X,
  Edit2,
  Map as MapIcon,
  List as ListIcon,
  Search,
  Filter,
  RefreshCw,
  Play,
  Clock,
  Trash2,
  Save,
  Coins,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useRestartChargePoint } from '../hooks/useRestartChargePoint';
import StationLocationPicker from '../components/StationLocationPicker';
import StationsMapView from '../components/StationsMapView';
import TariffForm from '../components/TariffForm';
import StatusBadge from '../components/ui/StatusBadge';
import { validatePowerLimitSlots } from '../utils/tariffValidation';

export default function Stations() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { loading: restartLoading, result: restartResult, restart, resetResult } = useRestartChargePoint();
  const [restartingCharger, setRestartingCharger] = useState(null); // { id, status, mockState }
  
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedStationId, setExpandedStationId] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('view') === 'map' ? 'map' : 'list';
    } catch (e) {
      return 'list';
    }
  });
  const [focusStationId, setFocusStationId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStation, setEditingStation] = useState(null);
  const [stationValidationError, setStationValidationError] = useState(null);
  const [showAddChargerModal, setShowAddChargerModal] = useState(false);
  const [selectedStationForCharger, setSelectedStationForCharger] = useState(null);
  const [chargerSubmitting, setChargerSubmitting] = useState(false);
  const [chargerError, setChargerError] = useState(null);
  // Lỗi hiển thị trực tiếp tại ô nhập "Mã trụ" (trùng mã / sai định dạng)
  const [chargerCodeError, setChargerCodeError] = useState(null);

  // State cho màn hình Cấu hình hạn mức công suất theo khung giờ (SCRUM-294 / SCRUM-314)
  const [powerLimitStation, setPowerLimitStation] = useState(null);
  const [powerLimitSlots, setPowerLimitSlots] = useState([]);
  const [powerLimitLoading, setPowerLimitLoading] = useState(false);
  const [powerLimitSaving, setPowerLimitSaving] = useState(false);
  const [powerLimitServerError, setPowerLimitServerError] = useState('');
  const [powerLimitSubmitted, setPowerLimitSubmitted] = useState(false);

  // State cho màn hình Cấu hình biểu giá linh hoạt theo từng trạm (Tariff)
  const [tariffStation, setTariffStation] = useState(null);

  // Form thêm đầu nối (connector) vào trụ sạc đã có
  const [showAddConnectorModal, setShowAddConnectorModal] = useState(false);
  const [selectedChargerForConnector, setSelectedChargerForConnector] = useState(null);
  const [connectorFormData, setConnectorFormData] = useState({
    connector_number: 1,
    connector_type: 'CCS2',
    max_power_kw: 60.0,
  });
  const [connectorSubmitting, setConnectorSubmitting] = useState(false);
  const [connectorError, setConnectorError] = useState(null);
  const [connectorNumberError, setConnectorNumberError] = useState(null);

  const canManageChargers = role === 'ADMIN' || role === 'OPERATOR';

  // Bộ lọc & Tìm kiếm danh sách trạm sạc
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Trạng thái lưu & Kiểm tra dữ liệu biểu mẫu (Client-Side Validation)
  const [submittingStation, setSubmittingStation] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [editFormErrors, setEditFormErrors] = useState({});

  // Hệ thống thông báo nổi (Toast Notification)
  const [toast, setToast] = useState(null);

  // Tự động tắt Toast sau 4 giây
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
  };

  // Hàm kiểm tra tính hợp lệ biểu mẫu trạm sạc (Client-Side Validation)
  const validateStationForm = (data) => {
    const errors = {};
    const nameTrim = (data.name || '').trim();
    if (!nameTrim) {
      errors.name = 'Vui lòng nhập tên trạm sạc.';
    } else if (nameTrim.length < 2) {
      errors.name = 'Tên trạm sạc phải có ít nhất 2 ký tự.';
    } else if (nameTrim.length > 150) {
      errors.name = 'Tên trạm sạc không được vượt quá 150 ký tự.';
    }

    const capacity = parseFloat(data.total_grid_capacity_kw);
    if (isNaN(capacity) || capacity <= 0) {
      errors.total_grid_capacity_kw = 'Công suất nguồn lưới phải là số dương lớn hơn 0 kW.';
    } else if (capacity > 50000) {
      errors.total_grid_capacity_kw = 'Công suất nguồn lưới tối đa cho phép là 50,000 kW.';
    }

    if (data.latitude == null || data.longitude == null) {
      errors.location = 'Bắt buộc phải ghim vị trí trạm sạc trên bản đồ trước khi lưu.';
    } else if (
      data.latitude < 8.0 ||
      data.latitude > 24.0 ||
      data.longitude < 102.0 ||
      data.longitude > 110.0
    ) {
      errors.location = 'Tọa độ ghim phải nằm trong phạm vi lãnh thổ Việt Nam (Vĩ độ: 8.0 - 24.0, Kinh độ: 102.0 - 110.0).';
    }

    const addrTrim = (data.address || '').trim();
    if (!addrTrim) {
      errors.address = 'Vui lòng nhập địa chỉ chi tiết hoặc chọn vị trí trên bản đồ.';
    } else if (addrTrim.length < 5) {
      errors.address = 'Địa chỉ chi tiết phải có ít nhất 5 ký tự.';
    }

    const hoursTrim = (data.operating_hours || '').trim();
    if (!hoursTrim) {
      errors.operating_hours = 'Vui lòng nhập giờ hoạt động (Ví dụ: 24/7).';
    }

    return errors;
  };

  // Form tạo trụ sạc mới
  const [chargerFormData, setChargerFormData] = useState({
    code: '',
    vendor: 'VinFast',
    model: 'DC Fast 60kW',
    max_power_kw: 60.0,
    firmware_version: '1.0.0',
    power_sharing_enabled: true,
    connector_type: 'CCS2',
    num_connectors: 2,
  });

  const [owners, setOwners] = useState([]);
  const [accountants, setAccountants] = useState([]);

  // Form tạo trạm mới (mặc định chưa có ghim, tọa độ null để nhìn toàn Việt Nam)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    latitude: null,
    longitude: null,
    total_grid_capacity_kw: 150.0,
    operating_hours: '24/7',
    status: 'ACTIVE',
    operator_id: null,
    accountant_id: null,
  });

  // Form sửa trạm
  const [editFormData, setEditFormData] = useState({
    name: '',
    address: '',
    latitude: null,
    longitude: null,
    total_grid_capacity_kw: 150.0,
    operating_hours: '24/7',
    status: 'ACTIVE',
    operator_id: null,
    accountant_id: null,
  });

  useEffect(() => {
    fetchStations();
    if (role === 'ADMIN') {
      api.get('/stations/owners')
        .then((res) => setOwners(res.data || []))
        .catch((err) => console.error('Lỗi tải danh sách chủ trạm:', err));
      api.get('/stations/accountants')
        .then((res) => setAccountants(res.data || []))
        .catch((err) => console.error('Lỗi tải danh sách kế toán:', err));
    }
  }, [role]);

  const fetchStations = async () => {
    try {
      setLoading(true);
      const res = await api.get('/stations');
      setStations(res.data || []);
      if (res.data?.length > 0 && !expandedStationId) {
        setExpandedStationId(res.data[0].id);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách trạm sạc:', err);
      showToast('error', 'LỖI KẾT NỐI MÁY CHỦ', 'Không thể tải danh sách trạm sạc. Vui lòng kiểm tra kết nối mạng.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddStation = () => {
    setFormData({
      name: '',
      address: '',
      latitude: null,
      longitude: null,
      total_grid_capacity_kw: 150.0,
      operating_hours: '24/7',
      status: 'ACTIVE',
      operator_id: null,
      accountant_id: null,
    });
    setFormErrors({});
    setStationValidationError(null);
    setShowAddModal(true);
  };

  const handleCreateStation = async (e) => {
    e.preventDefault();
    const errors = validateStationForm(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setStationValidationError(errors.location || null);
      showToast('error', 'LỖI XÁC THỰC BIỂU MẪU', 'Vui lòng kiểm tra và hoàn thiện các trường được đánh dấu đỏ trước khi lưu.');
      return;
    }

    try {
      setSubmittingStation(true);
      const payload = {
        ...formData,
        name: formData.name.trim(),
        address: formData.address.trim(),
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        total_grid_capacity_kw: parseFloat(formData.total_grid_capacity_kw) || 150.0,
        operating_hours: formData.operating_hours || '24/7',
        status: formData.status || 'ACTIVE',
        operator_id: formData.operator_id ? parseInt(formData.operator_id, 10) : null,
        accountant_id: formData.accountant_id ? parseInt(formData.accountant_id, 10) : null,
      };
      const res = await api.post('/stations', payload);
      setShowAddModal(false);
      setFormData({
        name: '',
        address: '',
        latitude: null,
        longitude: null,
        total_grid_capacity_kw: 150.0,
        operating_hours: '24/7',
        status: 'ACTIVE',
        operator_id: null,
        accountant_id: null,
      });
      setFormErrors({});
      setStationValidationError(null);
      await fetchStations();
      showToast('success', 'THÀNH CÔNG', `Đã thêm mới trạm sạc "${res.data?.name || formData.name}" vào hệ thống.`);
    } catch (err) {
      console.error('Lỗi tạo trạm sạc:', err);
      const detail = err.response?.data?.detail;
      const errorMsg = typeof detail === 'string'
        ? detail
        : (Array.isArray(detail)
          ? detail.map((d) => d.msg || `${d.loc?.join('.')}: ${d.type}`).join(', ')
          : (detail ? JSON.stringify(detail) : err.message));
      showToast('error', 'LỖI TẠO TRẠM SẠC', errorMsg || 'Không thể lưu thông tin trạm sạc.');
    } finally {
      setSubmittingStation(false);
    }
  };

  const handleOpenEditStation = (st) => {
    setEditingStation(st);
    setEditFormData({
      name: st.name,
      address: st.address,
      latitude: st.latitude,
      longitude: st.longitude,
      total_grid_capacity_kw: st.total_grid_capacity_kw,
      operating_hours: st.operating_hours || '24/7',
      status: st.status || 'ACTIVE',
      operator_id: st.operator_id || null,
      accountant_id: st.accountant_id || null,
    });
    setEditFormErrors({});
    setStationValidationError(null);
    setShowEditModal(true);
  };

  const handleUpdateStation = async (e) => {
    e.preventDefault();
    if (!editingStation) return;

    const errors = validateStationForm(editFormData);
    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      setStationValidationError(errors.location || null);
      showToast('error', 'LỖI XÁC THỰC BIỂU MẪU', 'Vui lòng kiểm tra và sửa các trường được đánh dấu đỏ trước khi lưu.');
      return;
    }

    try {
      setSubmittingStation(true);
      const payload = {
        name: editFormData.name.trim(),
        address: editFormData.address.trim(),
        latitude: parseFloat(editFormData.latitude),
        longitude: parseFloat(editFormData.longitude),
        operating_hours: editFormData.operating_hours || '24/7',
        status: editFormData.status || 'ACTIVE',
      };
      if (role === 'ADMIN') {
        payload.total_grid_capacity_kw = parseFloat(editFormData.total_grid_capacity_kw) || editingStation.total_grid_capacity_kw;
        payload.operator_id = editFormData.operator_id ? parseInt(editFormData.operator_id, 10) : null;
        payload.accountant_id = editFormData.accountant_id ? parseInt(editFormData.accountant_id, 10) : null;
      } else {
        payload.total_grid_capacity_kw = editingStation.total_grid_capacity_kw;
        payload.operator_id = editingStation.operator_id;
        payload.accountant_id = editingStation.accountant_id;
      }
      const res = await api.put(`/stations/${editingStation.id}`, payload);
      setShowEditModal(false);
      setEditingStation(null);
      setEditFormErrors({});
      setStationValidationError(null);
      await fetchStations();
      showToast('success', 'THÀNH CÔNG', `Đã cập nhật cấu hình trạm sạc "${res.data?.name || editFormData.name}".`);
    } catch (err) {
      console.error('Lỗi cập nhật trạm sạc:', err);
      const detail = err.response?.data?.detail;
      const errorMsg = typeof detail === 'string'
        ? detail
        : (Array.isArray(detail)
          ? detail.map((d) => d.msg || `${d.loc?.join('.')}: ${d.type}`).join(', ')
          : (detail ? JSON.stringify(detail) : err.message));
      showToast('error', 'LỖI CẬP NHẬT TRẠM SẠC', errorMsg || 'Không thể cập nhật trạm sạc.');
    } finally {
      setSubmittingStation(false);
    }
  };

  const handleToggleChargerStatus = async (chargerId, currentStatus) => {
    try {
      const nextStatus = currentStatus === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
      await api.patch(`/chargers/${chargerId}/status`, { status: nextStatus });
      await fetchStations();
      showToast('success', 'CẬP NHẬT TRỤ SẠC', `Đã chuyển trạng thái trụ sang ${nextStatus}`);
    } catch (err) {
      console.error('Lỗi cập nhật trạng thái trụ sạc:', err);
      showToast('error', 'LỖI TRỤ SẠC', err.response?.data?.detail || err.message);
    }
  };

  const handleToggleViewMode = (mode) => {
    setViewMode(mode);
    setFocusStationId(null);
    try {
      const url = new URL(window.location);
      if (mode === 'map') {
        url.searchParams.set('view', 'map');
      } else {
        url.searchParams.delete('view');
      }
      window.history.replaceState({}, '', url);
    } catch (e) {
      console.warn('Không thể cập nhật URL:', e);
    }
  };

  const handleViewStationOnMap = (st) => {
    setFocusStationId(st.id);
    if (viewMode === 'map') return;
    setTimeout(() => {
      const el = document.getElementById('stations-overview-map');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  // Trích thông báo lỗi dạng chuỗi từ phản hồi API (detail string hoặc mảng lỗi Pydantic 422)
  const extractErrorMessage = (err) => {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join(', ');
    return err.message;
  };

  // Kiểm tra trùng mã trụ phía client dựa trên danh sách trụ đã tải về.
  // Lưu ý: OPERATOR chỉ tải được trạm của mình nên trùng mã ở trạm khác chỉ bị phát hiện khi backend trả lỗi.
  const findDuplicateChargerCode = (rawCode) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return null;
    for (const st of stations) {
      const match = (st.charging_points || []).find((ch) => (ch.code || '').toUpperCase() === code);
      if (match) return { code, stationName: st.name };
    }
    return null;
  };

  const validateChargerCode = (rawCode) => {
    const code = rawCode.trim();
    if (code.length > 0 && code.length < 3) {
      return 'Mã trụ phải có tối thiểu 3 ký tự.';
    }
    const dup = findDuplicateChargerCode(code);
    if (dup) {
      return `Mã trụ '${dup.code}' đã tồn tại (thuộc trạm ${dup.stationName}). Vui lòng nhập mã khác.`;
    }
    return null;
  };

  const handleOpenAddCharger = (station) => {
    setSelectedStationForCharger(station);
    setChargerError(null);
    setChargerCodeError(null);
    setChargerFormData({
      code: '',
      vendor: 'VinFast',
      model: 'DC Fast 60kW',
      max_power_kw: 60.0,
      firmware_version: '1.0.0',
      power_sharing_enabled: true,
      connector_type: 'CCS2',
      num_connectors: 2,
    });
    setShowAddChargerModal(true);
  };

  const handleCreateCharger = async (e) => {
    e.preventDefault();
    if (!selectedStationForCharger) return;

    const codeValidation = validateChargerCode(chargerFormData.code);
    if (codeValidation) {
      setChargerCodeError(codeValidation);
      return;
    }

    setChargerSubmitting(true);
    setChargerError(null);
    setChargerCodeError(null);

    try {
      const numConn = parseInt(chargerFormData.num_connectors, 10) || 1;
      const powerKw = parseFloat(chargerFormData.max_power_kw) || 60.0;
      const connectors = [];
      for (let i = 1; i <= numConn; i++) {
        connectors.push({
          connector_number: i,
          connector_type: chargerFormData.connector_type,
          max_power_kw: powerKw,
        });
      }

      const payload = {
        code: chargerFormData.code.trim().toUpperCase(),
        vendor: chargerFormData.vendor.trim() || 'VinFast',
        model: chargerFormData.model.trim() || null,
        max_power_kw: powerKw,
        firmware_version: chargerFormData.firmware_version.trim() || '1.0.0',
        power_sharing_enabled: Boolean(chargerFormData.power_sharing_enabled),
        connectors: connectors,
      };

      await api.post(`/stations/${selectedStationForCharger.id}/chargers`, payload);
      setShowAddChargerModal(false);
      await fetchStations();
    } catch (err) {
      console.error('Lỗi thêm trụ sạc:', err);
      const msg = extractErrorMessage(err) || 'Lỗi không xác định khi tạo trụ sạc.';
      const detail = err.response?.data?.detail;
      const isCodeFieldError =
        (err.response?.status === 400 && typeof detail === 'string' && detail.includes('Mã trụ')) ||
        (Array.isArray(detail) && detail.some((d) => Array.isArray(d.loc) && d.loc.includes('code')));
      if (isCodeFieldError) {
        // Backend trả 400 khi trùng mã trụ -> hiển thị ngay tại ô "Mã trụ"
        setChargerCodeError(msg);
      } else {
        setChargerError(msg);
      }
    } finally {
      setChargerSubmitting(false);
    }
  };

  // Lọc danh sách trạm sạc theo từ khóa tìm kiếm và trạng thái
  const filteredStations = useMemo(() => {
    return stations.filter((st) => {
      if (statusFilter !== 'ALL' && st.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (st.name || '').toLowerCase().includes(q);
        const matchAddr = (st.address || '').toLowerCase().includes(q);
        const matchId = `st-${st.id}`.toLowerCase().includes(q);
        if (!matchName && !matchAddr && !matchId) return false;
      }
      return true;
    });
  }, [stations, statusFilter, searchQuery]);

  // Thống kê nhanh mạng lưới trạm sạc
  const stationStats = useMemo(() => {
    const total = stations.length;
    let active = 0;
    let maintenance = 0;
    let totalKw = 0;
    stations.forEach((s) => {
      if (s.status === 'ACTIVE') active++;
      else if (s.status === 'MAINTENANCE') maintenance++;
      totalKw += s.total_grid_capacity_kw || 0;
    });
    return { total, active, maintenance, totalKw: Math.round(totalKw) };
  }, [stations]);
  const handleOpenAddConnector = (charger) => {
    const usedNumbers = (charger.connectors || []).map((c) => c.connector_number);
    const nextNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
    setSelectedChargerForConnector(charger);
    setConnectorError(null);
    setConnectorNumberError(null);
    setConnectorFormData({
      connector_number: nextNumber,
      connector_type: 'CCS2',
      max_power_kw: charger.max_power_kw || 60.0,
    });
    setShowAddConnectorModal(true);
  };

  const validateConnectorNumber = (num) => {
    if (!Number.isInteger(num) || num < 1) {
      return 'Số thứ tự đầu nối phải là số nguyên lớn hơn hoặc bằng 1.';
    }
    const exists = (selectedChargerForConnector?.connectors || []).some((c) => c.connector_number === num);
    if (exists) {
      return `Đầu nối #${num} đã tồn tại trên trụ ${selectedChargerForConnector.code}.`;
    }
    return null;
  };

  const handleCreateConnector = async (e) => {
    e.preventDefault();
    if (!selectedChargerForConnector) return;

    const num = parseInt(connectorFormData.connector_number, 10);
    const numValidation = validateConnectorNumber(num);
    if (numValidation) {
      setConnectorNumberError(numValidation);
      return;
    }

    setConnectorSubmitting(true);
    setConnectorError(null);
    setConnectorNumberError(null);

    try {
      await api.post(`/chargers/${selectedChargerForConnector.id}/connectors`, {
        connector_number: num,
        connector_type: connectorFormData.connector_type,
        max_power_kw: parseFloat(connectorFormData.max_power_kw) || 0,
      });
      setShowAddConnectorModal(false);
      await fetchStations();
    } catch (err) {
      console.error('Lỗi thêm đầu nối:', err);
      const msg = extractErrorMessage(err) || 'Lỗi không xác định khi thêm đầu nối.';
      const detail = err.response?.data?.detail;
      if (err.response?.status === 400 && typeof detail === 'string' && detail.includes('đã tồn tại')) {
        setConnectorNumberError(msg);
      } else {
        setConnectorError(msg);
      }
    } finally {
      setConnectorSubmitting(false);
    }
  };

  // ============================================================================
  // LOGIC MÀN HÌNH CẤU HÌNH HẠN MỨC CÔNG SUẤT THEO KHUNG GIỜ (SCRUM-294 / SCRUM-314)
  // ============================================================================
  const powerLimitValidation = useMemo(
    () => validatePowerLimitSlots(powerLimitSlots),
    [powerLimitSlots]
  );

  const handleOpenPowerLimitModal = async (station) => {
    setPowerLimitStation(station);
    setPowerLimitServerError('');
    setPowerLimitSubmitted(false);
    setPowerLimitLoading(true);

    const baseKw = Number(station.total_grid_capacity_kw) || 150;
    const defaultSlots = [
      { startTime: '00:00', endTime: '08:00', maxPowerKw: baseKw },
      { startTime: '08:00', endTime: '17:00', maxPowerKw: baseKw },
      { startTime: '17:00', endTime: '22:00', maxPowerKw: Math.max(20, Math.round(baseKw * 0.7)) },
      { startTime: '22:00', endTime: '24:00', maxPowerKw: baseKw },
    ];

    try {
      const res = await api.get(`/stations/${station.id}/power-limits`);
      if (Array.isArray(res.data) && res.data.length > 0) {
        setPowerLimitSlots(
          res.data.map((item) => ({
            startTime: item.start_time,
            endTime: item.end_time,
            maxPowerKw: Number(item.power_limit_kw),
          }))
        );
      } else {
        setPowerLimitSlots(defaultSlots);
      }
    } catch {
      setPowerLimitSlots(defaultSlots);
    } finally {
      setPowerLimitLoading(false);
    }
  };

  const handleAddPowerLimitSlot = () => {
    const last = powerLimitSlots[powerLimitSlots.length - 1];
    const nextStart =
      last && last.endTime && last.endTime !== '24:00' ? last.endTime : '08:00';
    setPowerLimitSlots((prev) => [
      ...prev,
      {
        startTime: nextStart,
        endTime: '24:00',
        maxPowerKw: Number(powerLimitStation?.total_grid_capacity_kw) || 100,
      },
    ]);
    setPowerLimitServerError('');
  };

  const handleUpdatePowerLimitSlot = (index, field, value) => {
    setPowerLimitSlots((prev) =>
      prev.map((slot, idx) => {
        if (idx !== index) return slot;
        if (field === 'maxPowerKw') {
          return { ...slot, maxPowerKw: value === '' ? '' : Number(value) };
        }
        return { ...slot, [field]: value };
      })
    );
    setPowerLimitServerError('');
  };

  const handleRemovePowerLimitSlot = (index) => {
    setPowerLimitSlots((prev) => prev.filter((_, idx) => idx !== index));
    setPowerLimitServerError('');
  };

  const handleSavePowerLimits = async (e) => {
    if (e) e.preventDefault();
    setPowerLimitSubmitted(true);
    setPowerLimitServerError('');

    const check = validatePowerLimitSlots(powerLimitSlots);
    if (!check.isValid || !powerLimitStation) {
      return;
    }

    try {
      setPowerLimitSaving(true);
      const limitsPayload = powerLimitSlots.map((slot, idx) => ({
        start_time: slot.startTime.trim(),
        end_time: slot.endTime.trim(),
        power_limit_kw: Number(slot.maxPowerKw),
        sort_order: idx,
      }));

      await api.put(`/stations/${powerLimitStation.id}/power-limits`, {
        limits: limitsPayload,
      });

      showToast(
        'success',
        'ĐÃ LƯU HẠN MỨC KHUNG GIỜ',
        `Cập nhật thành công ${limitsPayload.length} khung giờ hạn mức công suất cho trạm "${powerLimitStation.name}".`
      );
      setPowerLimitStation(null);
      await fetchStations();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const errText = Array.isArray(detail)
        ? detail.map((d) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d))).join(' | ')
        : detail || err.message || 'Lỗi khi lưu hạn mức công suất theo khung giờ.';
      setPowerLimitServerError(errText);
    } finally {
      setPowerLimitSaving(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification Banner */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[999] max-w-md p-4 rounded-xl shadow-2xl border backdrop-blur-md flex items-start space-x-3 transition-all animate-fadeIn ${
          toast.type === 'success'
            ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-300'
            : 'bg-rose-950/95 border-rose-500/60 text-rose-300'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 pr-2">
            <h4 className="font-bold text-xs font-mono uppercase tracking-wide">{toast.title}</h4>
            <p className="text-xs text-tech-white/90 mt-0.5 font-sans leading-relaxed">{toast.message}</p>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-steel-gray hover:text-tech-white p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Hạ Tầng Trạm Sạc &amp; Điểm Cấp Nguồn</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Quản lý máy biến áp, công suất định mức &amp; các cổng sạc vật lý
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {/* Bộ chuyển đổi chế độ xem: DANH SÁCH | BẢN ĐỒ */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => handleToggleViewMode('list')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>Danh sách</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleViewMode('map')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                viewMode === 'map'
                  ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Bản đồ</span>
            </button>
          </div>

          {role === 'ADMIN' && (
            <button
              onClick={handleOpenAddStation}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm trạm sạc</span>
            </button>
          )}
        </div>
      </div>

      {/* Station List or Map View */}
      {viewMode === 'map' ? (
        <StationsMapView
          stations={stations}
          focusStationId={focusStationId}
          onSelectStationDetail={(st) => {
            setExpandedStationId(st.id);
            handleToggleViewMode('list');
            setTimeout(() => {
              const el = document.getElementById(`station-card-${st.id}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }}
          onEditStation={handleOpenEditStation}
        />
      ) : (
        <div className="space-y-6">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Tổng trạm sạc</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">
                {stationStats.total} <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">trạm</span>
              </span>
            </div>
            <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 block">Đang hoạt động</span>
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1 block">
                {stationStats.active}
              </span>
            </div>
            <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400 block">Bảo trì</span>
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1 block">
                {stationStats.maintenance}
              </span>
            </div>
            <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm">
              <span className="text-xs font-medium text-sky-700 dark:text-sky-400 block">Tổng công suất nguồn</span>
              <span className="text-2xl font-bold text-sky-700 dark:text-sky-300 mt-1 block">
                {stationStats.totalKw} <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">kW</span>
              </span>
            </div>
          </div>

          {/* Search & Status Filter Bar */}
          <div className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm theo tên trạm hoặc địa chỉ..."
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <span className="text-xs text-slate-500 dark:text-slate-400 mr-1 hidden md:inline font-medium">Lọc trạng thái:</span>
              {[
                { id: 'ALL', label: 'Tất cả', count: stationStats.total },
                { id: 'ACTIVE', label: 'Hoạt động', count: stationStats.active, color: 'text-emerald-700 dark:text-emerald-300' },
                { id: 'MAINTENANCE', label: 'Bảo trì', count: stationStats.maintenance, color: 'text-amber-700 dark:text-amber-300' },
              ].map((item) => {
                const active = statusFilter === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setStatusFilter(item.id)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      active
                        ? 'bg-sky-600 text-white font-semibold shadow-sm'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-xs font-semibold ${active ? 'bg-black/25 text-white' : item.color || 'text-slate-500'}`}>
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Station List */}
          {filteredStations.length === 0 ? (
            <div className="py-12 text-center bg-panel/40 border border-dashed border-hairline rounded-xl">
              <AlertCircle className="w-8 h-8 text-steel-gray mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium text-steel-gray">
                Không tìm thấy trạm sạc nào phù hợp với bộ lọc hiện tại.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
                className="mt-2.5 px-3 py-1.5 rounded-lg text-xs bg-panel hover:bg-panel-hover text-electric-cyan border border-electric-cyan/30 font-mono"
              >
                Đặt lại bộ lọc
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredStations.map((st) => {
          const isExpanded = expandedStationId === st.id;
          const chargers = st.charging_points || [];

          return (
            <div
              key={st.id}
              id={`station-card-${st.id}`}
              className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 rounded-2xl overflow-hidden scroll-mt-24 shadow-sm hover:shadow-md transition-all duration-200"
            >
              {/* Station Header Bar */}
              <div
                onClick={() => setExpandedStationId(isExpanded ? null : st.id)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 p-2.5 rounded-xl text-sky-600 dark:text-sky-400">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">{st.name}</h2>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 font-medium">
                        Mã: ST-{st.id}
                      </span>
                      <StatusBadge
                        variant={st.status === 'ACTIVE' ? 'success' : st.status === 'MAINTENANCE' ? 'warning' : 'neutral'}
                        size="sm"
                        dot
                      >
                        {st.status === 'ACTIVE' ? 'Hoạt động' : st.status}
                      </StatusBadge>
                      {role === 'ADMIN' ? (
                        <>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                            st.operator_id
                              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50'
                              : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/60'
                          }`}>
                            {st.operator_id ? `Chủ trạm: ${st.operator_name || `ID #${st.operator_id}`}` : 'Chưa gán chủ'}
                          </span>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                            st.accountant_id
                              ? 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/50'
                              : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/60'
                          }`}>
                            {st.accountant_id ? `Kế toán: ${st.accountant_name || `ID #${st.accountant_id}`}` : 'Chưa gán kế toán'}
                          </span>
                        </>
                      ) : (
                        <>
                          {st.operator_name && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full border font-medium bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50">
                              Chủ trạm: {st.operator_name}
                            </span>
                          )}
                          {st.accountant_name && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full border font-medium bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/50">
                              Kế toán: {st.accountant_name}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-slate-600 dark:text-slate-400 mt-1">
                      <span className="flex items-center">
                        <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400 dark:text-slate-500" />
                        {st.address}
                      </span>
                      {st.latitude != null && st.longitude != null && (
                        <>
                          <span>•</span>
                          <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                            GPS: {st.latitude.toFixed(4)}, {st.longitude.toFixed(4)}
                          </span>
                        </>
                      )}
                      <span>•</span>
                      <span>Giờ hoạt động: {st.operating_hours}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Công suất nguồn lưới</div>
                    <div className="text-base font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                      {st.total_grid_capacity_kw} kW
                    </div>
                  </div>
                  <button
                    type="button"
                    title={st.latitude != null && st.longitude != null ? "Xem vị trí trạm trên bản đồ" : "Trạm chưa có tọa độ, bấm để định vị"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (st.latitude != null && st.longitude != null) {
                        handleViewStationOnMap(st);
                      } else {
                        handleOpenEditStation(st);
                      }
                    }}
                    className={`p-1.5 rounded-xl border transition-colors ${
                      st.latitude != null && st.longitude != null
                        ? 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-sky-600'
                        : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50'
                    }`}
                  >
                    <MapIcon className="w-4 h-4" />
                  </button>
                  {(role === 'ADMIN' || role === 'OPERATOR') && (
                    <>
                      <button
                        type="button"
                        data-testid={`btn-tariff-station-${st.id}`}
                        title="Cấu hình biểu giá điện linh hoạt (Tariff) cho trạm này"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTariffStation(st);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800/50 text-xs font-medium transition-colors shadow-sm"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Biểu giá trạm</span>
                      </button>
                      <button
                        type="button"
                        data-testid={`btn-power-limits-station-${st.id}`}
                        title="Cấu hình hạn mức công suất theo khung giờ"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPowerLimitModal(st);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 dark:bg-sky-950/50 dark:hover:bg-sky-900/50 dark:text-sky-300 dark:border-sky-800/50 text-xs font-medium transition-colors shadow-sm"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Hạn mức khung giờ</span>
                      </button>
                      <button
                        type="button"
                        title="Sửa cấu hình & vị trí trạm sạc"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditStation(st);
                        }}
                        className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700/60 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-500" /> : <ChevronRight className="w-5 h-5 text-slate-500" />}
                </div>
              </div>

              {/* Station Expanded Chargers View */}
              {isExpanded && (
                <div className="border-t border-slate-200 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Danh sách trụ sạc ({chargers.length} trụ)
                    </span>
                    {canManageChargers && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddCharger(st);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-xs font-medium transition-all shadow-sm hover:shadow"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm trụ sạc</span>
                      </button>
                    )}
                  </div>

                  {chargers.length === 0 ? (
                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-8 font-mono border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl bg-white/50 dark:bg-slate-900/20">
                      <p>Chưa có trụ sạc nào được gắn vào trạm này.</p>
                      {canManageChargers && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAddCharger(st);
                          }}
                          className="mt-2.5 inline-flex items-center space-x-1 text-sky-600 dark:text-sky-400 hover:underline text-xs font-semibold"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Gắn trụ sạc đầu tiên cho trạm</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {chargers.map((ch) => (
                        <div
                          key={ch.id}
                          className="bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200"
                        >
                          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{ch.code}</span>
                            <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                              <StatusBadge
                                variant={
                                  ch.status === 'CHARGING'
                                    ? 'info'
                                    : ch.status === 'AVAILABLE'
                                    ? 'success'
                                    : ch.status === 'FAULTED'
                                    ? 'danger'
                                    : 'warning'
                                }
                                size="sm"
                                dot
                                pulse={ch.status === 'CHARGING'}
                              >
                                {ch.status === 'UNAVAILABLE' ? 'Bảo trì' : ch.status === 'CHARGING' ? 'Đang sạc' : ch.status === 'AVAILABLE' ? 'Sẵn sàng' : ch.status}
                              </StatusBadge>
                              {(role === 'ADMIN' || role === 'OPERATOR') && (
                                <button
                                  type="button"
                                  disabled={ch.status === 'CHARGING'}
                                  title={
                                    ch.status === 'CHARGING'
                                      ? 'Trụ đang phục vụ sạc xe, không thể đổi trạng thái'
                                      : ch.status === 'AVAILABLE'
                                      ? 'Bấm để chuyển sang trạng thái Bảo trì (MAINTENANCE)'
                                      : 'Bấm để kích hoạt trạng thái Sẵn sàng (AVAILABLE)'
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleChargerStatus(ch.id, ch.status);
                                  }}
                                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                                    ch.status === 'CHARGING'
                                      ? 'opacity-40 cursor-not-allowed border-slate-200 text-slate-400'
                                      : ch.status === 'AVAILABLE'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60 hover:bg-amber-100'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 hover:bg-emerald-100'
                                  }`}
                                >
                                  {ch.status === 'AVAILABLE' ? 'Bảo trì' : 'Mở lại'}
                                </button>
                              )}
                              {canManageChargers && (
                                <button
                                  type="button"
                                  title="Khởi động lại trụ sạc (Restart)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRestartingCharger({ id: ch.id, code: ch.code, status: ch.status });
                                    resetResult();
                                  }}
                                  className="text-xs flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800/60 text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 transition-colors font-medium"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Khởi động lại</span>
                                </button>
                              )}
                              <button
                                type="button"
                                title="Màn hình trụ & điều khiển bắt đầu sạc"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/chargers/${ch.id}`);
                                }}
                                className="text-xs flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 transition-colors font-medium"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Màn hình trụ</span>
                              </button>
                            </div>
                          </div>

                          {/* Khu vực thông báo trạng thái restart */}
                          {(restartLoading || restartResult?.chargerId === ch.id) && (
                            <div 
                              className={`mb-3 text-xs p-2 rounded border ${
                                restartLoading 
                                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' 
                                  : restartResult?.type === 'success'
                                  ? 'bg-grid-green/10 border-grid-green/30 text-grid-green'
                                  : restartResult?.type === 'offline'
                                  ? 'bg-caution-amber/10 border-caution-amber/30 text-caution-amber'
                                  : 'bg-critical-red/10 border-critical-red/30 text-critical-red'
                              }`}
                              aria-live="polite"
                            >
                              {restartLoading ? (
                                <span className="flex items-center space-x-2">
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Đang gửi lệnh khởi động lại...</span>
                                </span>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="flex items-center space-x-2">
                                    {restartResult.type === 'success' ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                    <span>{restartResult.message}</span>
                                  </span>
                                  {/* Hiển thị nút "Thử lại" nếu bị lỗi offline hoặc timeout */}
                                  {(restartResult.type === 'offline' || restartResult.type === 'timeout') && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        restart(ch.id, restartResult.type); // Giữ nguyên mock status nếu đang test, hoặc mặc định
                                      }}
                                      className="mt-1 self-start text-xs underline hover:text-white"
                                    >
                                      Thử lại
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="text-xs text-slate-600 dark:text-slate-400 mb-2 font-normal">
                            Thiết bị: {ch.vendor} • Định mức: <span className="text-slate-900 dark:text-slate-100 font-bold">{ch.max_power_kw} kW</span>
                          </div>

                          {/* Connectors list */}
                          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Cổng sạc:</span>
                              {canManageChargers && (
                                <button
                                  type="button"
                                  title={`Thêm cổng sạc mới vào trụ ${ch.code}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenAddConnector(ch);
                                  }}
                                  className="flex items-center space-x-0.5 text-xs px-2.5 py-0.5 rounded-lg border border-sky-300 dark:border-sky-800/60 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 transition-colors font-medium"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Thêm cổng</span>
                                </button>
                              )}
                            </div>
                            {(ch.connectors || []).length === 0 && (
                              <div className="text-xs text-slate-500 italic">Trụ chưa có cổng sạc nào.</div>
                            )}
                            {(ch.connectors || []).map((conn) => (
                              <div
                                key={conn.id}
                                className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/60 px-3 py-2 rounded-xl flex items-center justify-between text-xs text-slate-800 dark:text-slate-200"
                              >
                                <span>Cổng #{conn.connector_number} ({conn.connector_type}) • {conn.max_power_kw} kW</span>
                                <StatusBadge
                                  variant={
                                    conn.status === 'CHARGING'
                                      ? 'info'
                                      : conn.status === 'AVAILABLE'
                                      ? 'success'
                                      : conn.status === 'FAULTED'
                                      ? 'danger'
                                      : 'neutral'
                                  }
                                  size="sm"
                                  dot
                                >
                                  {conn.status === 'AVAILABLE' ? 'Sẵn sàng' : conn.status === 'CHARGING' ? 'Đang sạc' : conn.status === 'FAULTED' ? 'Lỗi' : conn.status}
                                </StatusBadge>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
            </div>
          )}

          {/* Bản đồ tổng quát mạng lưới trạm sạc */}
          <div id="stations-overview-map" className="pt-6 border-t border-slate-200 dark:border-slate-800/60 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                  <MapIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>Bản đồ tổng quát mạng lưới trạm sạc</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Vị trí GPS và trạng thái hoạt động thời gian thực của toàn bộ {stations.length} trạm sạc
                </p>
              </div>
            </div>

            <StationsMapView
              stations={stations}
              focusStationId={focusStationId}
              onSelectStationDetail={(st) => {
                setExpandedStationId(st.id);
                setTimeout(() => {
                  const el = document.getElementById(`station-card-${st.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
              }}
              onEditStation={handleOpenEditStation}
            />
          </div>
        </div>
      )}

      {/* Modal Add Station */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-panel border border-hairline p-6 rounded-sm max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-hairline">
              <div>
                <h2 className="text-base font-bold text-tech-white">CẤU HÌNH THÊM TRẠM SẠC MỚI</h2>
                <p className="text-xs text-steel-gray font-mono mt-0.5">
                  ĐỊNH VỊ VỊ TRÍ BẰNG BẢN ĐỒ & THIẾT LẬP THÔNG SỐ NGUỒN LƯỚI
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-steel-gray hover:text-tech-white p-1 rounded hover:bg-obsidian transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStation} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-steel-gray block mb-1">
                    TÊN TRẠM SẠC <span className="text-critical-red">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Trạm Sạc VinFast Landmark 81"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    className={`w-full bg-obsidian border p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan ${
                      formErrors.name ? 'border-critical-red bg-rose-950/20' : 'border-hairline'
                    }`}
                  />
                  {formErrors.name && (
                    <p className="text-critical-red text-[11px] mt-1 font-mono flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{formErrors.name}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">
                    CÔNG SUẤT LƯỚI ĐỊNH MỨC (KW) <span className="text-critical-red">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.total_grid_capacity_kw}
                    onChange={(e) => {
                      setFormData({ ...formData, total_grid_capacity_kw: parseFloat(e.target.value) || 0 });
                      if (formErrors.total_grid_capacity_kw) setFormErrors((prev) => ({ ...prev, total_grid_capacity_kw: undefined }));
                    }}
                    className={`w-full bg-obsidian border p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan ${
                      formErrors.total_grid_capacity_kw ? 'border-critical-red bg-rose-950/20' : 'border-hairline'
                    }`}
                  />
                  {formErrors.total_grid_capacity_kw && (
                    <p className="text-critical-red text-[11px] mt-1 font-mono flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{formErrors.total_grid_capacity_kw}</span>
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-steel-gray block mb-1 font-bold">
                  VỊ TRÍ & ĐỊA CHỈ TRẠM SẠC <span className="text-critical-red">*</span>
                </label>
                <StationLocationPicker
                  key="add-station-picker"
                  initialLat={formData.latitude}
                  initialLng={formData.longitude}
                  initialAddress={formData.address}
                  validationError={formErrors.location || formErrors.address || stationValidationError}
                  onChangeLocation={({ latitude, longitude, address }) => {
                    setFormData((prev) => ({
                      ...prev,
                      latitude,
                      longitude,
                      address,
                    }));
                    if (formErrors.location || formErrors.address) {
                      setFormErrors((prev) => ({ ...prev, location: undefined, address: undefined }));
                    }
                    if (latitude != null && longitude != null) {
                      setStationValidationError(null);
                    }
                  }}
                />
                {(formErrors.location || formErrors.address) && (
                  <p className="text-critical-red text-[11px] mt-1.5 font-mono flex items-center space-x-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{formErrors.location || formErrors.address}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-steel-gray block mb-1">GIỜ HOẠT ĐỘNG</label>
                  <input
                    type="text"
                    placeholder="24/7"
                    value={formData.operating_hours}
                    onChange={(e) => {
                      setFormData({ ...formData, operating_hours: e.target.value });
                      if (formErrors.operating_hours) setFormErrors((prev) => ({ ...prev, operating_hours: undefined }));
                    }}
                    className={`w-full bg-obsidian border p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan ${
                      formErrors.operating_hours ? 'border-critical-red bg-rose-950/20' : 'border-hairline'
                    }`}
                  />
                  {formErrors.operating_hours && (
                    <p className="text-critical-red text-[11px] mt-1 font-mono flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{formErrors.operating_hours}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">TRẠNG THÁI HOẠT ĐỘNG</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  >
                    <option value="ACTIVE">ACTIVE (Đang hoạt động)</option>
                    <option value="MAINTENANCE">MAINTENANCE (Bảo trì)</option>
                  </select>
                </div>
              </div>

              {role === 'ADMIN' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-steel-gray block mb-1 font-bold">GÁN CHỦ TRẠM SẠC (CHỈ DÀNH CHO ADMIN)</label>
                    <select
                      value={formData.operator_id || ''}
                      onChange={(e) => setFormData({ ...formData, operator_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                      className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono"
                    >
                      <option value="">Chưa gán chủ (Admin quản lý)</option>
                      {owners.map((ow) => (
                        <option key={ow.id} value={ow.id}>
                          [ID #{ow.id}] {ow.full_name || ow.username} ({ow.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-steel-gray block mb-1 font-bold">GÁN KẾ TOÁN PHỤ TRÁCH (CHỈ DÀNH CHO ADMIN)</label>
                    <select
                      value={formData.accountant_id || ''}
                      onChange={(e) => setFormData({ ...formData, accountant_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                      className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono"
                    >
                      <option value="">Chưa gán kế toán (Không có phụ trách riêng)</option>
                      {accountants.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          [ID #{acc.id}] {acc.full_name || acc.username} ({acc.email})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-hairline">
                <button
                  type="button"
                  disabled={submittingStation}
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded bg-hairline text-steel-gray hover:text-tech-white transition-colors disabled:opacity-50"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  disabled={submittingStation}
                  className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white font-bold transition-all disabled:opacity-50"
                >
                  {submittingStation ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>ĐANG LƯU...</span>
                    </>
                  ) : (
                    <span>LƯU CẤU HÌNH</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Station */}
      {showEditModal && editingStation && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-panel border border-hairline p-6 rounded-sm max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-hairline">
              <div>
                <h2 className="text-base font-bold text-tech-white">CẬP NHẬT CẤU HÌNH TRẠM SẠC</h2>
                <p className="text-xs text-steel-gray font-mono mt-0.5">
                  MÃ: <span className="text-electric-cyan font-bold">ST-{editingStation.id}</span> • {editingStation.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingStation(null);
                }}
                className="text-steel-gray hover:text-tech-white p-1 rounded hover:bg-obsidian transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStation} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-steel-gray block mb-1">
                    TÊN TRẠM SẠC <span className="text-critical-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => {
                      setEditFormData({ ...editFormData, name: e.target.value });
                      if (editFormErrors.name) setEditFormErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    className={`w-full bg-obsidian border p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan ${
                      editFormErrors.name ? 'border-critical-red bg-rose-950/20' : 'border-hairline'
                    }`}
                  />
                  {editFormErrors.name && (
                    <p className="text-critical-red text-[11px] mt-1 font-mono flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{editFormErrors.name}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">
                    CÔNG SUẤT LƯỚI ĐỊNH MỨC (KW) <span className="text-critical-red">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    disabled={role !== 'ADMIN'}
                    value={editFormData.total_grid_capacity_kw}
                    onChange={(e) => {
                      setEditFormData({ ...editFormData, total_grid_capacity_kw: parseFloat(e.target.value) || 0 });
                      if (editFormErrors.total_grid_capacity_kw) setEditFormErrors((prev) => ({ ...prev, total_grid_capacity_kw: undefined }));
                    }}
                    className={`w-full bg-obsidian border p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan ${
                      editFormErrors.total_grid_capacity_kw ? 'border-critical-red bg-rose-950/20' : 'border-hairline'
                    } ${role !== 'ADMIN' ? 'opacity-60 cursor-not-allowed bg-obsidian/50' : ''}`}
                  />
                  {editFormErrors.total_grid_capacity_kw && (
                    <p className="text-critical-red text-[11px] mt-1 font-mono flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{editFormErrors.total_grid_capacity_kw}</span>
                    </p>
                  )}
                  {role !== 'ADMIN' && (
                    <span className="text-[10px] text-caution-amber mt-1 block">
                      (Chỉ Quản trị viên hệ thống có quyền sửa công suất lưới định mức)
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-steel-gray block mb-1 font-bold">
                  VỊ TRÍ & ĐỊA CHỈ TRẠM SẠC <span className="text-critical-red">*</span>
                </label>
                <StationLocationPicker
                  key={`edit-${editingStation.id}`}
                  initialLat={editFormData.latitude}
                  initialLng={editFormData.longitude}
                  initialAddress={editFormData.address}
                  validationError={editFormErrors.location || editFormErrors.address || stationValidationError}
                  onChangeLocation={({ latitude, longitude, address }) => {
                    setEditFormData((prev) => ({
                      ...prev,
                      latitude,
                      longitude,
                      address,
                    }));
                    if (editFormErrors.location || editFormErrors.address) {
                      setEditFormErrors((prev) => ({ ...prev, location: undefined, address: undefined }));
                    }
                    if (latitude != null && longitude != null) {
                      setStationValidationError(null);
                    }
                  }}
                />
                {(editFormErrors.location || editFormErrors.address) && (
                  <p className="text-critical-red text-[11px] mt-1.5 font-mono flex items-center space-x-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{editFormErrors.location || editFormErrors.address}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-steel-gray block mb-1">GIỜ HOẠT ĐỘNG</label>
                  <input
                    type="text"
                    value={editFormData.operating_hours}
                    onChange={(e) => {
                      setEditFormData({ ...editFormData, operating_hours: e.target.value });
                      if (editFormErrors.operating_hours) setEditFormErrors((prev) => ({ ...prev, operating_hours: undefined }));
                    }}
                    className={`w-full bg-obsidian border p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan ${
                      editFormErrors.operating_hours ? 'border-critical-red bg-rose-950/20' : 'border-hairline'
                    }`}
                  />
                  {editFormErrors.operating_hours && (
                    <p className="text-critical-red text-[11px] mt-1 font-mono flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{editFormErrors.operating_hours}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">TRẠNG THÁI HOẠT ĐỘNG</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  >
                    <option value="ACTIVE">ACTIVE (Đang hoạt động)</option>
                    <option value="MAINTENANCE">MAINTENANCE (Bảo trì)</option>
                  </select>
                </div>
              </div>

              {role === 'ADMIN' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-steel-gray block mb-1 font-bold">GÁN / ĐỔI CHỦ TRẠM SẠC (CHỈ DÀNH CHO ADMIN)</label>
                    <select
                      value={editFormData.operator_id || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, operator_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                      className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono"
                    >
                      <option value="">Chưa gán chủ (Admin quản lý)</option>
                      {owners.map((ow) => (
                        <option key={ow.id} value={ow.id}>
                          [ID #{ow.id}] {ow.full_name || ow.username} ({ow.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-steel-gray block mb-1 font-bold">GÁN / ĐỔI KẾ TOÁN PHỤ TRÁCH (CHỈ DÀNH CHO ADMIN)</label>
                    <select
                      value={editFormData.accountant_id || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, accountant_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                      className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono"
                    >
                      <option value="">Chưa gán kế toán (Không có phụ trách riêng)</option>
                      {accountants.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          [ID #{acc.id}] {acc.full_name || acc.username} ({acc.email})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-hairline">
                <button
                  type="button"
                  disabled={submittingStation}
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingStation(null);
                  }}
                  className="px-3 py-1.5 rounded bg-hairline text-steel-gray hover:text-tech-white transition-colors disabled:opacity-50"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  disabled={submittingStation}
                  className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white font-bold transition-all disabled:opacity-50"
                >
                  {submittingStation ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>ĐANG LƯU...</span>
                    </>
                  ) : (
                    <span>LƯU THAY ĐỔI</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Charger */}
      {showAddChargerModal && selectedStationForCharger && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-hairline p-6 rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-hairline">
              <div>
                <h2 className="text-base font-bold text-tech-white">CẤU HÌNH THÊM TRỤ SẠC MỚI</h2>
                <p className="text-xs text-steel-gray font-mono mt-0.5">
                  TRẠM: <span className="text-electric-cyan font-bold">{selectedStationForCharger.name}</span> (MÃ: ST-{selectedStationForCharger.id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddChargerModal(false)}
                className="text-steel-gray hover:text-tech-white p-1 rounded hover:bg-obsidian transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {chargerError && (
              <div className="mb-4 p-3 rounded bg-critical-red/10 border border-critical-red/30 flex items-start space-x-2 text-xs font-mono text-critical-red">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{chargerError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCharger} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-steel-gray block mb-1">
                  MÃ ĐỊNH DANH TRỤ (EVSE CODE) <span className="text-critical-red">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: VIN-Q1-03 hoặc ABB-TF54-01"
                  value={chargerFormData.code}
                  onChange={(e) => {
                    const nextCode = e.target.value.toUpperCase();
                    setChargerFormData({ ...chargerFormData, code: nextCode });
                    setChargerCodeError(validateChargerCode(nextCode));
                  }}
                  aria-invalid={Boolean(chargerCodeError)}
                  aria-describedby={chargerCodeError ? 'charger-code-error' : undefined}
                  className={`w-full bg-obsidian border p-2 rounded text-tech-white focus:outline-none uppercase ${
                    chargerCodeError
                      ? 'border-critical-red focus:border-critical-red'
                      : 'border-hairline focus:border-electric-cyan'
                  }`}
                />
                {chargerCodeError && (
                  <p id="charger-code-error" className="mt-1 flex items-start space-x-1 text-[11px] text-critical-red">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{chargerCodeError}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-steel-gray block mb-1">HÃNG SẢN XUẤT</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: VinFast, ABB"
                    value={chargerFormData.vendor}
                    onChange={(e) => setChargerFormData({ ...chargerFormData, vendor: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">MODEL TRỤ</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: DC Fast 60kW"
                    value={chargerFormData.model}
                    onChange={(e) => setChargerFormData({ ...chargerFormData, model: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-steel-gray block mb-1">
                    CÔNG SUẤT ĐỊNH MỨC (KW) <span className="text-critical-red">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.5"
                    value={chargerFormData.max_power_kw}
                    onChange={(e) => setChargerFormData({ ...chargerFormData, max_power_kw: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">FIRMWARE VERSION</label>
                  <input
                    type="text"
                    placeholder="1.0.0"
                    value={chargerFormData.firmware_version}
                    onChange={(e) => setChargerFormData({ ...chargerFormData, firmware_version: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
                </div>
              </div>

              <div className="border-t border-hairline pt-3 mt-3">
                <span className="text-steel-gray font-bold block mb-2 text-[11px] uppercase tracking-wider">
                  CẤU HÌNH CỔNG SẠC (CONNECTORS)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-steel-gray block mb-1">SỐ LƯỢNG SÚNG SẠC</label>
                    <select
                      value={chargerFormData.num_connectors}
                      onChange={(e) => setChargerFormData({ ...chargerFormData, num_connectors: parseInt(e.target.value, 10) })}
                      className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                    >
                      <option value={1}>1 súng sạc</option>
                      <option value={2}>2 súng sạc</option>
                      <option value={3}>3 súng sạc</option>
                      <option value={4}>4 súng sạc</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-steel-gray block mb-1">CHUẨN SÚNG SẠC</label>
                    <select
                      value={chargerFormData.connector_type}
                      onChange={(e) => setChargerFormData({ ...chargerFormData, connector_type: e.target.value })}
                      className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                    >
                      <option value="CCS2">CCS2 (DC sạc nhanh)</option>
                      <option value="TYPE_2">TYPE_2 (AC sạc tiêu chuẩn)</option>
                      <option value="CHADEMO">CHADEMO (DC tiêu chuẩn Nhật)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="power_sharing_enabled"
                  checked={chargerFormData.power_sharing_enabled}
                  onChange={(e) => setChargerFormData({ ...chargerFormData, power_sharing_enabled: e.target.checked })}
                  className="rounded bg-obsidian border-hairline text-electric-cyan focus:ring-0"
                />
                <label htmlFor="power_sharing_enabled" className="text-steel-gray text-xs cursor-pointer select-none">
                  Kích hoạt chia tải thông minh (Smart Dynamic Power Sharing)
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-hairline">
                <button
                  type="button"
                  disabled={chargerSubmitting}
                  onClick={() => setShowAddChargerModal(false)}
                  className="px-3 py-1.5 rounded bg-hairline text-steel-gray hover:text-tech-white disabled:opacity-50"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  disabled={chargerSubmitting || Boolean(chargerCodeError)}
                  className="px-4 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white font-bold disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {chargerSubmitting ? (
                    <span>ĐANG LƯU...</span>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>XÁC NHẬN GẮN TRỤ</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Connector */}
      {showAddConnectorModal && selectedChargerForConnector && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-hairline p-6 rounded-sm max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-hairline">
              <div>
                <h2 className="text-base font-bold text-tech-white">THÊM ĐẦU NỐI VÀO TRỤ SẠC</h2>
                <p className="text-xs text-steel-gray font-mono mt-0.5">
                  TRỤ: <span className="text-electric-cyan font-bold">{selectedChargerForConnector.code}</span>
                  {' '}• Hiện có {(selectedChargerForConnector.connectors || []).length} đầu nối
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddConnectorModal(false)}
                className="text-steel-gray hover:text-tech-white p-1 rounded hover:bg-obsidian transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {connectorError && (
              <div className="mb-4 p-3 rounded bg-critical-red/10 border border-critical-red/30 flex items-start space-x-2 text-xs font-mono text-critical-red">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{connectorError}</span>
              </div>
            )}

            <form onSubmit={handleCreateConnector} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-steel-gray block mb-1">
                  SỐ THỨ TỰ ĐẦU NỐI <span className="text-critical-red">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={connectorFormData.connector_number}
                  onChange={(e) => {
                    const next = e.target.value;
                    setConnectorFormData({ ...connectorFormData, connector_number: next });
                    setConnectorNumberError(validateConnectorNumber(parseInt(next, 10)));
                  }}
                  aria-invalid={Boolean(connectorNumberError)}
                  aria-describedby={connectorNumberError ? 'connector-number-error' : undefined}
                  className={`w-full bg-obsidian border p-2 rounded text-tech-white focus:outline-none ${
                    connectorNumberError
                      ? 'border-critical-red focus:border-critical-red'
                      : 'border-hairline focus:border-electric-cyan'
                  }`}
                />
                {connectorNumberError ? (
                  <p id="connector-number-error" className="mt-1 flex items-start space-x-1 text-[11px] text-critical-red">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{connectorNumberError}</span>
                  </p>
                ) : (
                  <span className="text-[10px] text-steel-gray mt-1 block">
                    Đã dùng: {(selectedChargerForConnector.connectors || []).map((c) => `#${c.connector_number}`).join(', ') || 'chưa có'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-steel-gray block mb-1">CHUẨN ĐẦU NỐI</label>
                  <select
                    value={connectorFormData.connector_type}
                    onChange={(e) => setConnectorFormData({ ...connectorFormData, connector_type: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  >
                    <option value="CCS2">CCS2 (DC sạc nhanh)</option>
                    <option value="TYPE_2">TYPE_2 (AC sạc tiêu chuẩn)</option>
                    <option value="CHADEMO">CHADEMO (DC tiêu chuẩn Nhật)</option>
                  </select>
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">
                    CÔNG SUẤT TỐI ĐA (KW) <span className="text-critical-red">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0.5"
                    step="0.5"
                    value={connectorFormData.max_power_kw}
                    onChange={(e) => setConnectorFormData({ ...connectorFormData, max_power_kw: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-hairline">
                <button
                  type="button"
                  disabled={connectorSubmitting}
                  onClick={() => setShowAddConnectorModal(false)}
                  className="px-3 py-1.5 rounded bg-hairline text-steel-gray hover:text-tech-white disabled:opacity-50"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  disabled={connectorSubmitting || Boolean(connectorNumberError)}
                  className="px-4 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white font-bold disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {connectorSubmitting ? (
                    <span>ĐANG LƯU...</span>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>XÁC NHẬN THÊM ĐẦU NỐI</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác nhận Khởi động lại */}
      {restartingCharger && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-hairline p-6 rounded-sm max-w-sm w-full shadow-2xl">
            <h2 className="text-lg font-bold text-tech-white mb-2 flex items-center">
              <RefreshCw className="w-5 h-5 mr-2 text-blue-500" />
              Xác nhận khởi động lại
            </h2>
            
            <p className="text-sm text-steel-gray mb-4">
              Bạn có chắc chắn muốn gửi lệnh khởi động lại tới trụ sạc <strong className="text-white">{restartingCharger.code}</strong> không?
            </p>

            {restartingCharger.status === 'CHARGING' && (
              <div className="mb-4 p-3 bg-critical-red/10 border border-critical-red/40 rounded text-critical-red text-xs">
                <p className="font-bold flex items-center mb-1">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  CẢNH BÁO NGUY HIỂM:
                </p>
                <p>Trụ sạc này hiện đang trong quá trình sạc (CHARGING). Việc khởi động lại có thể gây ngắt điện đột ngột và ảnh hưởng tới phiên sạc đang diễn ra.</p>
              </div>
            )}

            <div className="flex items-center justify-between text-xs mb-4 p-2 bg-obsidian rounded border border-hairline">
              <span className="text-steel-gray">Chế độ Test (Mock):</span>
              <select 
                value={restartingCharger.mockState || 'success'} 
                onChange={(e) => setRestartingCharger({ ...restartingCharger, mockState: e.target.value })}
                className="bg-panel border-hairline rounded px-1 py-0.5 text-tech-white outline-none"
              >
                <option value="success">Thành công (200)</option>
                <option value="offline">Offline (409)</option>
                <option value="timeout">Timeout (504)</option>
                <option value="401">Lỗi quyền (403)</option>
                <option value="500">Lỗi Server (500)</option>
              </select>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setRestartingCharger(null)}
                className="px-4 py-2 rounded bg-hairline text-steel-gray hover:text-tech-white text-sm font-bold"
              >
                HỦY
              </button>
              <button
                onClick={() => {
                  restart(restartingCharger.id, restartingCharger.mockState || 'success');
                  setRestartingCharger(null);
                }}
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                ĐỒNG Ý
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================
          MODAL MÀN HÌNH CẤU HÌNH HẠN MỨC CÔNG SUẤT THEO KHUNG GIỜ (SCRUM-294 / SCRUM-314)
         ============================================================================ */}
      {powerLimitStation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-electric-cyan/50 max-w-3xl w-full rounded-sm p-6 space-y-5 font-mono text-xs shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded bg-electric-cyan/20 border border-electric-cyan/40 text-electric-cyan">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-tech-white font-sans">
                    Cấu hình hạn mức công suất theo khung giờ
                  </h2>
                  <p className="text-[11px] text-steel-gray mt-0.5">
                    Trạm áp dụng:{' '}
                    <span className="text-electric-cyan font-bold">
                      {powerLimitStation.name} (ST-{powerLimitStation.id})
                    </span>{' '}
                    • Công suất nguồn hiện tại: {powerLimitStation.total_grid_capacity_kw} kW
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPowerLimitStation(null)}
                className="p-1.5 rounded text-steel-gray hover:text-tech-white hover:bg-hairline transition-colors"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {powerLimitLoading ? (
              <div className="py-12 flex items-center justify-center text-steel-gray space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang tải cấu hình khung giờ hạn mức...</span>
              </div>
            ) : (
              <form onSubmit={handleSavePowerLimits} className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-steel-gray">
                    Quy tắc: <strong className="text-tech-white">startTime &lt; endTime</strong>,{' '}
                    <strong className="text-tech-white">maxPowerKw &gt; 0</strong>, không đè/trùng
                    khung giờ (Overlap).
                  </span>
                  <button
                    type="button"
                    data-testid="btn-add-power-limit-slot"
                    onClick={handleAddPowerLimitSlot}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white font-bold text-xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm khung giờ</span>
                  </button>
                </div>

                {powerLimitSubmitted &&
                  !powerLimitValidation.isValid &&
                  powerLimitValidation.globalError && (
                    <div className="p-3 rounded bg-critical-red/10 border border-critical-red/40 text-critical-red flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{powerLimitValidation.globalError}</span>
                    </div>
                  )}

                {powerLimitServerError && (
                  <div className="p-3 rounded bg-critical-red/10 border border-critical-red/40 text-critical-red flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{powerLimitServerError}</span>
                  </div>
                )}

                {/* Danh sách khung giờ (Dynamic Form Array) */}
                <div className="space-y-3">
                  {powerLimitSlots.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-hairline rounded text-steel-gray">
                      Chưa có khung giờ nào. Bấm &ldquo;Thêm khung giờ&rdquo; để bắt đầu.
                    </div>
                  ) : (
                    powerLimitSlots.map((slot, idx) => {
                      const rowErr = powerLimitValidation.errorsByIndex[idx];
                      const hasError = Boolean(rowErr);

                      return (
                        <div
                          key={idx}
                          data-testid={`power-limit-slot-row-${idx}`}
                          className={`p-3.5 rounded border transition-colors ${
                            hasError
                              ? 'bg-critical-red/5 border-critical-red/50'
                              : 'bg-obsidian border-hairline'
                          }`}
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                            <div className="sm:col-span-1 flex items-center sm:pt-6">
                              <span className="px-2 py-0.5 rounded bg-panel border border-hairline text-steel-gray font-bold">
                                #{idx + 1}
                              </span>
                            </div>

                            {/* startTime */}
                            <div className="sm:col-span-3">
                              <label className="block text-[10px] text-steel-gray mb-1">
                                GIỜ BẮT ĐẦU (startTime)
                              </label>
                              <input
                                type="time"
                                data-testid={`input-start-time-${idx}`}
                                value={slot.startTime}
                                onChange={(e) =>
                                  handleUpdatePowerLimitSlot(idx, 'startTime', e.target.value)
                                }
                                className={`w-full p-2 rounded bg-panel border text-tech-white focus:outline-none ${
                                  rowErr?.startTime || rowErr?.timeRange || rowErr?.overlap
                                    ? 'border-critical-red'
                                    : 'border-hairline focus:border-electric-cyan'
                                }`}
                              />
                              {rowErr?.startTime && (
                                <p className="text-[10px] text-critical-red mt-1">
                                  {rowErr.startTime}
                                </p>
                              )}
                            </div>

                            {/* endTime */}
                            <div className="sm:col-span-4">
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-[10px] text-steel-gray">
                                  GIỜ KẾT THÚC (endTime)
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdatePowerLimitSlot(idx, 'endTime', '24:00')
                                  }
                                  className="text-[10px] text-electric-cyan hover:underline"
                                >
                                  Đặt 24:00
                                </button>
                              </div>
                              {slot.endTime === '24:00' ? (
                                <div className="flex items-center space-x-1.5">
                                  <input
                                    type="text"
                                    readOnly
                                    data-testid={`input-end-time-${idx}`}
                                    value="24:00"
                                    className="w-full p-2 rounded bg-panel border border-electric-cyan/50 text-electric-cyan font-bold"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdatePowerLimitSlot(idx, 'endTime', '22:00')
                                    }
                                    className="px-2 py-2 rounded bg-panel border border-hairline text-steel-gray hover:text-tech-white text-[10px]"
                                  >
                                    Đổi
                                  </button>
                                </div>
                              ) : (
                                <input
                                  type="time"
                                  data-testid={`input-end-time-${idx}`}
                                  value={slot.endTime}
                                  onChange={(e) =>
                                    handleUpdatePowerLimitSlot(idx, 'endTime', e.target.value)
                                  }
                                  className={`w-full p-2 rounded bg-panel border text-tech-white focus:outline-none ${
                                    rowErr?.endTime || rowErr?.timeRange || rowErr?.overlap
                                      ? 'border-critical-red'
                                      : 'border-hairline focus:border-electric-cyan'
                                  }`}
                                />
                              )}
                              {rowErr?.endTime && (
                                <p className="text-[10px] text-critical-red mt-1">
                                  {rowErr.endTime}
                                </p>
                              )}
                            </div>

                            {/* maxPowerKw */}
                            <div className="sm:col-span-3">
                              <label className="block text-[10px] text-steel-gray mb-1">
                                HẠN MỨC CÔNG SUẤT (kW)
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                data-testid={`input-max-power-${idx}`}
                                value={slot.maxPowerKw}
                                onChange={(e) =>
                                  handleUpdatePowerLimitSlot(idx, 'maxPowerKw', e.target.value)
                                }
                                placeholder="VD: 120"
                                className={`w-full p-2 rounded bg-panel border text-tech-white tabular-nums focus:outline-none ${
                                  rowErr?.maxPowerKw
                                    ? 'border-critical-red'
                                    : 'border-hairline focus:border-electric-cyan'
                                }`}
                              />
                              {rowErr?.maxPowerKw && (
                                <p className="text-[10px] text-critical-red mt-1">
                                  {rowErr.maxPowerKw}
                                </p>
                              )}
                            </div>

                            {/* Xóa dòng */}
                            <div className="sm:col-span-1 flex items-center justify-end sm:pt-5">
                              <button
                                type="button"
                                data-testid={`btn-remove-slot-${idx}`}
                                onClick={() => handleRemovePowerLimitSlot(idx)}
                                className="p-2 rounded text-steel-gray hover:text-critical-red hover:bg-critical-red/10 transition-colors"
                                title="Xóa dòng này"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Lỗi khoảng thời gian & chồng lấp (Overlap) */}
                          {(rowErr?.timeRange || rowErr?.overlap) && (
                            <div className="mt-2 pt-2 border-t border-critical-red/20 space-y-1 text-[11px] text-critical-red">
                              {rowErr.timeRange && (
                                <div className="flex items-center space-x-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{rowErr.timeRange}</span>
                                </div>
                              )}
                              {rowErr.overlap && (
                                <div className="flex items-center space-x-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{rowErr.overlap}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Nút Hủy & Lưu cấu hình */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-hairline">
                  <button
                    type="button"
                    data-testid="btn-cancel-power-limits"
                    disabled={powerLimitSaving}
                    onClick={() => setPowerLimitStation(null)}
                    className="px-4 py-2 rounded bg-obsidian hover:bg-hairline border border-hairline text-steel-gray hover:text-tech-white font-bold transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    data-testid="btn-save-power-limits"
                    disabled={powerLimitSaving || !powerLimitValidation.isValid}
                    className="inline-flex items-center space-x-1.5 px-5 py-2 rounded bg-grid-green hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-colors shadow-md"
                  >
                    {powerLimitSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Lưu cấu hình</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ============================================================================
          MODAL CẤU HÌNH BIỂU GIÁ LINH HOẠT CHO TỪNG TRẠM (TARIFF)
         ============================================================================ */}
      {tariffStation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl my-8">
            <TariffForm
              stationId={tariffStation.id}
              stationName={tariffStation.name}
              isModal={true}
              onClose={() => setTariffStation(null)}
              onSaved={() => {
                showToast(
                  'success',
                  'ĐÃ LƯU BIỂU GIÁ TRẠM',
                  `Cập nhật biểu giá điện thành công cho trạm "${tariffStation.name}".`
                );
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
