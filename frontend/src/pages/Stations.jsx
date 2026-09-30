import React, { useState, useEffect } from 'react';
import { Plus, Zap, Cpu, MapPin, ChevronRight, ChevronDown, CheckCircle, AlertCircle, X, Edit2, Map as MapIcon, List as ListIcon } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import StationLocationPicker from '../components/StationLocationPicker';
import StationsMapView from '../components/StationsMapView';

export default function Stations() {
  const { role } = useAuth();
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

  // Form tạo trạm mới (mặc định chưa có ghim, tọa độ null để nhìn toàn Việt Nam)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    latitude: null,
    longitude: null,
    total_grid_capacity_kw: 150.0,
    operating_hours: '24/7',
    status: 'ACTIVE',
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
  });

  useEffect(() => {
    fetchStations();
  }, []);

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
    });
    setStationValidationError(null);
    setShowAddModal(true);
  };

  const handleCreateStation = async (e) => {
    e.preventDefault();
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
      await api.post('/stations', formData);
      setShowAddModal(false);
      setFormData({
        name: '',
        address: '',
        latitude: null,
        longitude: null,
        total_grid_capacity_kw: 150.0,
        operating_hours: '24/7',
        status: 'ACTIVE',
      });
      setStationValidationError(null);
      fetchStations();
    } catch (err) {
      alert('Lỗi tạo trạm sạc: ' + (err.response?.data?.detail || err.message));
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
    });
    setStationValidationError(null);
    setShowEditModal(true);
  };

  const handleUpdateStation = async (e) => {
    e.preventDefault();
    if (!editingStation) return;

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
      await api.put(`/stations/${editingStation.id}`, editFormData);
      setShowEditModal(false);
      setEditingStation(null);
      setStationValidationError(null);
      fetchStations();
    } catch (err) {
      alert('Lỗi cập nhật trạm sạc: ' + (err.response?.data?.detail || err.message));
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

  const handleOpenAddCharger = (station) => {
    setSelectedStationForCharger(station);
    setChargerError(null);
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

    setChargerSubmitting(true);
    setChargerError(null);

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
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : err.message);
      setChargerError(msg || 'Lỗi không xác định khi tạo trụ sạc.');
    } finally {
      setChargerSubmitting(false);
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

          {(role === 'ADMIN' || role === 'OPERATOR') && (
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
                    {(role === 'ADMIN' || role === 'OPERATOR') && (
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
                      {(role === 'ADMIN' || role === 'OPERATOR') && (
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
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                ch.status === 'CHARGING'
                                  ? 'bg-electric-cyan/20 text-electric-cyan'
                                  : ch.status === 'AVAILABLE'
                                  ? 'bg-grid-green/20 text-grid-green'
                                  : 'bg-critical-red/20 text-critical-red'
                              }`}
                            >
                              {ch.status}
                            </span>
                          </div>

                          <div className="text-xs text-steel-gray font-mono mb-2">
                            Hãng: {ch.vendor} • Định mức: <span className="text-tech-white font-bold">{ch.max_power_kw} kW</span>
                          </div>

                          {/* Connectors list */}
                          <div className="space-y-1.5 pt-2 border-t border-hairline">
                            <span className="text-[10px] text-steel-gray font-mono block">CỔNG SẠC (CONNECTORS):</span>
                            {(ch.connectors || []).map((conn) => (
                              <div
                                key={conn.id}
                                className="bg-obsidian border border-hairline px-2 py-1 rounded flex items-center justify-between text-xs font-mono"
                              >
                                <span>Súng #{conn.connector_number} ({conn.connector_type})</span>
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
                    value={editFormData.total_grid_capacity_kw}
                    onChange={(e) => setEditFormData({ ...editFormData, total_grid_capacity_kw: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
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
                  onChange={(e) => setChargerFormData({ ...chargerFormData, code: e.target.value.toUpperCase() })}
                  className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan uppercase"
                />
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
                  disabled={chargerSubmitting}
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
    </div>
  );
}
