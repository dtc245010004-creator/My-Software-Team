import React, { useState, useEffect } from 'react';
import { Plus, Zap, Cpu, MapPin, ChevronRight, ChevronDown, CheckCircle, AlertCircle, X, Edit2, Map as MapIcon, List as ListIcon, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useRestartChargePoint } from '../hooks/useRestartChargePoint';
import StationLocationPicker from '../components/StationLocationPicker';
import StationsMapView from '../components/StationsMapView';

export default function Stations() {
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
  });

  useEffect(() => {
    fetchStations();
    if (role === 'ADMIN') {
      api.get('/stations/owners')
        .then((res) => setOwners(res.data || []))
        .catch((err) => console.error('Lỗi tải danh sách chủ trạm:', err));
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
    });
    setStationValidationError(null);
    setShowAddModal(true);
  };

  const handleCreateStation = async (e) => {
    e.preventDefault();
    if (!formData.name || formData.name.trim().length < 2) {
      setStationValidationError('Tên trạm sạc phải có ít nhất 2 ký tự.');
      return;
    }
    if (!formData.address || formData.address.trim().length < 5) {
      setStationValidationError('Địa chỉ trạm sạc phải có ít nhất 5 ký tự.');
      return;
    }
    if (formData.latitude == null || formData.longitude == null) {
      setStationValidationError('Bắt buộc phải có ghim vị trí trạm sạc trên bản đồ trước khi lưu.');
      return;
    }
    if (
      formData.latitude < 8.0 ||
      formData.latitude > 24.0 ||
      formData.longitude < 102.0 ||
      formData.longitude > 110.0
    ) {
      setStationValidationError('Tọa độ ghim phải nằm trong phạm vi lãnh thổ Việt Nam (Vĩ độ: 8 - 24, Kinh độ: 102 - 110).');
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        total_grid_capacity_kw: parseFloat(formData.total_grid_capacity_kw) || 150.0,
        operating_hours: formData.operating_hours || '24/7',
        status: formData.status || 'ACTIVE',
        operator_id: formData.operator_id ? parseInt(formData.operator_id, 10) : null,
      };

      await api.post('/stations', payload);
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
      });
      setStationValidationError(null);
      fetchStations();
    } catch (err) {
      let errorMsg = err.message;
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          errorMsg = detail.map((d) => d.msg || `${d.loc?.join('.')}: ${d.type}`).join(', ');
        } else if (typeof detail === 'string') {
          errorMsg = detail;
        } else {
          errorMsg = JSON.stringify(detail);
        }
      }
      alert('Lỗi tạo trạm sạc: ' + errorMsg);
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
    });
    setStationValidationError(null);
    setShowEditModal(true);
  };

  const handleUpdateStation = async (e) => {
    e.preventDefault();
    if (!editingStation) return;

    if (!editFormData.name || editFormData.name.trim().length < 2) {
      setStationValidationError('Tên trạm sạc phải có ít nhất 2 ký tự.');
      return;
    }
    if (!editFormData.address || editFormData.address.trim().length < 5) {
      setStationValidationError('Địa chỉ trạm sạc phải có ít nhất 5 ký tự.');
      return;
    }
    if (editFormData.latitude == null || editFormData.longitude == null) {
      setStationValidationError('Bắt buộc phải có ghim vị trí trạm sạc trên bản đồ trước khi lưu.');
      return;
    }
    if (
      editFormData.latitude < 8.0 ||
      editFormData.latitude > 24.0 ||
      editFormData.longitude < 102.0 ||
      editFormData.longitude > 110.0
    ) {
      setStationValidationError('Tọa độ ghim phải nằm trong phạm vi lãnh thổ Việt Nam (Vĩ độ: 8 - 24, Kinh độ: 102 - 110).');
      return;
    }

    try {
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
      }
      await api.put(`/stations/${editingStation.id}`, payload);
      setShowEditModal(false);
      setEditingStation(null);
      setStationValidationError(null);
      fetchStations();
    } catch (err) {
      let errorMsg = err.message;
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          errorMsg = detail.map((d) => d.msg || `${d.loc?.join('.')}: ${d.type}`).join(', ');
        } else if (typeof detail === 'string') {
          errorMsg = detail;
        } else {
          errorMsg = JSON.stringify(detail);
        }
      }
      alert('Lỗi cập nhật trạm sạc: ' + errorMsg);
    }
  };

  const handleToggleChargerStatus = async (chargerId, currentStatus) => {
    try {
      const nextStatus = currentStatus === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
      await api.patch(`/chargers/${chargerId}/status`, { status: nextStatus });
      await fetchStations();
    } catch (err) {
      alert('Lỗi cập nhật trạng thái trụ sạc: ' + (err.response?.data?.detail || err.message));
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-tech-white">Hạ Tầng Trạm Sạc & Điểm Cấp Nguồn</h1>
          <p className="text-xs text-steel-gray mt-0.5 font-mono">
            QUẢN LÝ MÁY BIẾN ÁP, CÔNG SUẤT ĐỊNH MỨC & CÁC CỔNG SẠC VẬT LÝ
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {/* Bộ chuyển đổi chế độ xem: DANH SÁCH | BẢN ĐỒ */}
          <div className="flex items-center bg-obsidian border border-hairline rounded p-0.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => handleToggleViewMode('list')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-panel text-tech-white font-bold shadow-sm'
                  : 'text-steel-gray hover:text-tech-white'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>DANH SÁCH</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleViewMode('map')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded transition-colors ${
                viewMode === 'map'
                  ? 'bg-panel text-electric-cyan font-bold shadow-sm'
                  : 'text-steel-gray hover:text-tech-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>BẢN ĐỒ</span>
            </button>
          </div>

          {role === 'ADMIN' && (
            <button
              onClick={handleOpenAddStation}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>THÊM TRẠM SẠC</span>
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
          <div className="space-y-4">
        {stations.map((st) => {
          const isExpanded = expandedStationId === st.id;
          const chargers = st.charging_points || [];

          return (
            <div
              key={st.id}
              id={`station-card-${st.id}`}
              className="bg-panel border border-hairline rounded-sm overflow-hidden scroll-mt-24"
            >
              {/* Station Header Bar */}
              <div
                onClick={() => setExpandedStationId(isExpanded ? null : st.id)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-panel-hover transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="bg-obsidian border border-hairline p-2 rounded">
                    <Zap className="w-5 h-5 text-electric-cyan" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-sm font-bold text-tech-white">{st.name}</h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-obsidian text-steel-gray border border-hairline">
                        MÃ: ST-{st.id}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-grid-green/20 text-grid-green font-semibold">
                        {st.status}
                      </span>
                      {role === 'ADMIN' && (
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                          st.operator_id
                            ? 'bg-caution-amber/15 text-caution-amber border-caution-amber/30'
                            : 'bg-obsidian text-steel-gray border-hairline'
                        }`}>
                          {st.operator_id ? `Chủ trạm: ${st.operator_name || `ID #${st.operator_id}`}` : 'Chưa gán chủ'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-steel-gray mt-1 font-mono">
                      <span className="flex items-center">
                        <MapPin className="w-3.5 h-3.5 mr-1" />
                        {st.address}
                      </span>
                      {st.latitude != null && st.longitude != null && (
                        <>
                          <span>•</span>
                          <span className="text-[11px] text-electric-cyan">
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
                  <div className="text-right font-mono">
                    <div className="text-xs text-steel-gray">CÔNG SUẤT LƯỚI ĐỊNH MỨC</div>
                    <div className="text-base font-bold text-electric-cyan tabular-nums">
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
                    className={`p-1.5 rounded border border-hairline transition-colors ${
                      st.latitude != null && st.longitude != null
                        ? 'hover:bg-obsidian text-steel-gray hover:text-electric-cyan'
                        : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                    }`}
                  >
                    <MapIcon className="w-4 h-4" />
                  </button>
                  {(role === 'ADMIN' || role === 'OPERATOR') && (
                    <button
                      type="button"
                      title="Sửa cấu hình & vị trí trạm sạc"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditStation(st);
                      }}
                      className="p-1.5 rounded hover:bg-obsidian text-steel-gray hover:text-electric-cyan border border-hairline transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  {isExpanded ? <ChevronDown className="w-5 h-5 text-steel-gray" /> : <ChevronRight className="w-5 h-5 text-steel-gray" />}
                </div>
              </div>

              {/* Station Expanded Chargers View */}
              {isExpanded && (
                <div className="border-t border-hairline bg-obsidian p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-steel-gray font-mono">
                      DANH SÁCH TRỤ SẠC (EVSE BAYS) — {chargers.length} TRỤ VẬT LÝ
                    </span>
                    {canManageChargers && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddCharger(st);
                        }}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded bg-panel hover:bg-panel-hover border border-electric-cyan/40 hover:border-electric-cyan text-electric-cyan text-xs font-mono font-semibold transition-colors shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>GẮN TRỤ SẠC</span>
                      </button>
                    )}
                  </div>

                  {chargers.length === 0 ? (
                    <div className="text-xs text-steel-gray text-center py-6 font-mono border border-dashed border-hairline rounded bg-panel/30">
                      <p>Chưa có trụ sạc nào được gắn vào trạm này.</p>
                      {canManageChargers && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAddCharger(st);
                          }}
                          className="mt-2 inline-flex items-center space-x-1 text-electric-cyan hover:underline text-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Gắn trụ sạc đầu tiên cho trạm</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {chargers.map((ch) => (
                        <div key={ch.id} className="bg-panel border border-hairline p-3 rounded-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-xs font-bold text-tech-white">{ch.code}</span>
                            <div className="flex items-center space-x-1.5">
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                  ch.status === 'CHARGING'
                                    ? 'bg-electric-cyan/20 text-electric-cyan'
                                    : ch.status === 'AVAILABLE'
                                    ? 'bg-grid-green/20 text-grid-green'
                                    : 'bg-critical-red/20 text-critical-red'
                                }`}
                              >
                                {ch.status === 'UNAVAILABLE' ? 'MAINTENANCE' : ch.status}
                              </span>
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
                                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                                    ch.status === 'CHARGING'
                                      ? 'opacity-40 cursor-not-allowed border-hairline text-steel-gray'
                                      : ch.status === 'AVAILABLE'
                                      ? 'border-caution-amber/40 text-caution-amber hover:bg-caution-amber/20'
                                      : 'border-grid-green/40 text-grid-green hover:bg-grid-green/20'
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
                                  className="text-[10px] font-mono flex items-center space-x-1 px-1.5 py-0.5 rounded border border-blue-500/40 text-blue-500 hover:bg-blue-500/20 transition-colors"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Khởi động lại</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Khu vực thông báo trạng thái restart */}
                          {(restartLoading || restartResult?.chargerId === ch.id) && (
                            <div 
                              className={`mb-3 text-xs p-2 rounded border font-mono ${
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
                                      className="mt-1 self-start text-[10px] underline hover:text-white"
                                    >
                                      Thử lại
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="text-xs text-steel-gray font-mono mb-2">
                            Hãng: {ch.vendor} • Định mức: <span className="text-tech-white font-bold">{ch.max_power_kw} kW</span>
                          </div>

                          {/* Connectors list */}
                          <div className="space-y-1.5 pt-2 border-t border-hairline">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-steel-gray font-mono block">CỔNG SẠC (CONNECTORS):</span>
                              {canManageChargers && (
                                <button
                                  type="button"
                                  title={`Thêm đầu nối mới vào trụ ${ch.code}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenAddConnector(ch);
                                  }}
                                  className="flex items-center space-x-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded border border-electric-cyan/40 text-electric-cyan hover:bg-electric-cyan/10 transition-colors"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>ĐẦU NỐI</span>
                                </button>
                              )}
                            </div>
                            {(ch.connectors || []).length === 0 && (
                              <div className="text-[11px] text-steel-gray font-mono italic">Trụ chưa có đầu nối nào.</div>
                            )}
                            {(ch.connectors || []).map((conn) => (
                              <div
                                key={conn.id}
                                className="bg-obsidian border border-hairline px-2 py-1 rounded flex items-center justify-between text-xs font-mono"
                              >
                                <span>Súng #{conn.connector_number} ({conn.connector_type}) • {conn.max_power_kw} kW</span>
                                <span className={conn.status === 'CHARGING' ? 'text-electric-cyan font-bold' : 'text-grid-green'}>
                                  {conn.status}
                                </span>
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

          {/* Bản đồ tổng quát mạng lưới trạm sạc */}
          <div id="stations-overview-map" className="pt-6 border-t border-hairline space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-tech-white uppercase font-mono flex items-center space-x-2">
                  <MapIcon className="w-4 h-4 text-electric-cyan" />
                  <span>BẢN ĐỒ TỔNG QUÁT MẠNG LƯỚI TRẠM SẠC</span>
                </h2>
                <p className="text-xs text-steel-gray font-mono mt-0.5">
                  VỊ TRÍ GPS VÀ TRẠNG THÁI HOẠT ĐỘNG THỜI GIAN THỰC CỦA TOÀN BỘ {stations.length} TRẠM SẠC
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
                    required
                    placeholder="Ví dụ: Trạm Sạc VinFast Landmark 81"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">
                    CÔNG SUẤT LƯỚI ĐỊNH MỨC (KW) <span className="text-critical-red">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="10"
                    step="1"
                    value={formData.total_grid_capacity_kw}
                    onChange={(e) => setFormData({ ...formData, total_grid_capacity_kw: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
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
                  validationError={stationValidationError}
                  onChangeLocation={({ latitude, longitude, address }) => {
                    setFormData((prev) => ({
                      ...prev,
                      latitude,
                      longitude,
                      address,
                    }));
                    if (latitude != null && longitude != null) {
                      setStationValidationError(null);
                    }
                  }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-steel-gray block mb-1">GIỜ HOẠT ĐỘNG</label>
                  <input
                    type="text"
                    placeholder="24/7"
                    value={formData.operating_hours}
                    onChange={(e) => setFormData({ ...formData, operating_hours: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
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
                <div>
                  <label className="text-steel-gray block mb-1 font-bold">GÁN CHỦ TRẠM SẠC (CHỈ DÀNH CHO ADMIN)</label>
                  <select
                    value={formData.operator_id || ''}
                    onChange={(e) => setFormData({ ...formData, operator_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono"
                  >
                    <option value="">Chưa gán chủ (Trạm tự do / Admin quản lý)</option>
                    {owners.map((ow) => (
                      <option key={ow.id} value={ow.id}>
                        [ID #{ow.id}] {ow.full_name || ow.username} ({ow.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded bg-hairline text-steel-gray hover:text-tech-white"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white font-bold"
                >
                  LƯU CẤU HÌNH
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
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">
                    CÔNG SUẤT LƯỚI ĐỊNH MỨC (KW) <span className="text-critical-red">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="10"
                    step="1"
                    disabled={role !== 'ADMIN'}
                    value={editFormData.total_grid_capacity_kw}
                    onChange={(e) => setEditFormData({ ...editFormData, total_grid_capacity_kw: parseFloat(e.target.value) || 0 })}
                    className={`w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan ${
                      role !== 'ADMIN' ? 'opacity-60 cursor-not-allowed bg-obsidian/50' : ''
                    }`}
                  />
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
                  validationError={stationValidationError}
                  onChangeLocation={({ latitude, longitude, address }) => {
                    setEditFormData((prev) => ({
                      ...prev,
                      latitude,
                      longitude,
                      address,
                    }));
                    if (latitude != null && longitude != null) {
                      setStationValidationError(null);
                    }
                  }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-steel-gray block mb-1">GIỜ HOẠT ĐỘNG</label>
                  <input
                    type="text"
                    value={editFormData.operating_hours}
                    onChange={(e) => setEditFormData({ ...editFormData, operating_hours: e.target.value })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
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
                <div>
                  <label className="text-steel-gray block mb-1 font-bold">GÁN / ĐỔI CHỦ TRẠM SẠC (CHỈ DÀNH CHO ADMIN)</label>
                  <select
                    value={editFormData.operator_id || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, operator_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono"
                  >
                    <option value="">Chưa gán chủ (Trạm tự do / Admin quản lý)</option>
                    {owners.map((ow) => (
                      <option key={ow.id} value={ow.id}>
                        [ID #{ow.id}] {ow.full_name || ow.username} ({ow.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingStation(null);
                  }}
                  className="px-3 py-1.5 rounded bg-hairline text-steel-gray hover:text-tech-white"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white font-bold"
                >
                  LƯU THAY ĐỔI
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
    </div>
  );
}
