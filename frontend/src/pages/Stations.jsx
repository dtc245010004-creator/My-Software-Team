import React, { useState, useEffect, useRef } from 'react';
import { Plus, Zap, MapPin, ChevronRight, ChevronDown, Pencil, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Stations() {
  const { role } = useAuth();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedStationId, setExpandedStationId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStationId, setEditingStationId] = useState(null);
  const [stationFieldErrors, setStationFieldErrors] = useState({});
  const [stationSaving, setStationSaving] = useState(false);
  const stationSubmitLock = useRef(false);
  const [chargerStationId, setChargerStationId] = useState(null);
  const [chargerSaving, setChargerSaving] = useState(false);
  const chargerSubmitLock = useRef(false);
  const [codeCheck, setCodeCheck] = useState(null);
  const [chargerError, setChargerError] = useState('');

  // Form tạo trạm mới
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    latitude: 10.7769,
    longitude: 106.7009,
    total_grid_capacity_kw: 150.0,
    operating_hours: '24/7',
    status: 'ACTIVE',
  });
  const [chargerForm, setChargerForm] = useState({
    code: '', vendor: 'ABB', model: '', max_power_kw: 120,
    connector_count: 1, connector_type: 'CCS2', connector_power_kw: 60,
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

  const openStationForm = (station = null) => {
    setEditingStationId(station?.id ?? null);
    setStationFieldErrors({});
    setFormData(station ? {
      name: station.name,
      address: station.address,
      latitude: station.latitude,
      longitude: station.longitude,
      total_grid_capacity_kw: station.total_grid_capacity_kw,
      operating_hours: station.operating_hours || '24/7',
    } : {
      name: '', address: '', latitude: 10.7769, longitude: 106.7009,
      total_grid_capacity_kw: 150, operating_hours: '24/7',
    });
    setShowAddModal(true);
  };

  const handleSaveStation = async (e) => {
    e.preventDefault();
    if (stationSubmitLock.current) return;
    const latitude = Number(formData.latitude);
    const longitude = Number(formData.longitude);
    const fieldErrors = {};
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      fieldErrors.latitude = 'Vĩ độ phải nằm trong khoảng từ -90 đến 90.';
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      fieldErrors.longitude = 'Kinh độ phải nằm trong khoảng từ -180 đến 180.';
    }
    if (Object.keys(fieldErrors).length > 0) {
      setStationFieldErrors(fieldErrors);
      return;
    }
    setStationFieldErrors({});
    stationSubmitLock.current = true;
    setStationSaving(true);
    try {
      const payload = {
        ...formData,
        latitude: Number(formData.latitude),
        longitude: Number(formData.longitude),
        total_grid_capacity_kw: Number(formData.total_grid_capacity_kw),
      };
      if (editingStationId) {
        await api.put(`/stations/${editingStationId}`, payload);
      } else {
        await api.post('/stations', payload);
      }
      setShowAddModal(false);
      fetchStations();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const apiFieldErrors = {};
      if (Array.isArray(detail)) {
        detail.forEach((issue) => {
          const field = issue.loc?.at(-1);
          if (field === 'latitude' || field === 'longitude') {
            apiFieldErrors[field] = issue.msg;
          }
        });
      }
      if (Object.keys(apiFieldErrors).length > 0) {
        setStationFieldErrors(apiFieldErrors);
      } else {
        alert('Không thể lưu trạm: ' + (typeof detail === 'string' ? detail : err.message));
      }
    } finally {
      stationSubmitLock.current = false;
      setStationSaving(false);
    }
  };

  const handleCheckChargerCode = async () => {
    const code = chargerForm.code.trim().toUpperCase();
    if (!code) {
      setCodeCheck(null);
      return;
    }
    try {
      const res = await api.get('/chargers/check-code', { params: { code } });
      setCodeCheck(res.data.available);
    } catch {
      setCodeCheck(null);
    }
  };

  const handleCreateCharger = async (e) => {
    e.preventDefault();
    if (chargerSubmitLock.current) return;
    chargerSubmitLock.current = true;
    setChargerSaving(true);
    setChargerError('');
    const count = Number(chargerForm.connector_count);
    try {
      await api.post(`/stations/${chargerStationId}/chargers`, {
        code: chargerForm.code.trim().toUpperCase(),
        vendor: chargerForm.vendor,
        model: chargerForm.model || null,
        max_power_kw: Number(chargerForm.max_power_kw),
        power_sharing_enabled: true,
        connectors: Array.from({ length: count }, (_, index) => ({
          connector_number: index + 1,
          connector_type: chargerForm.connector_type,
          max_power_kw: Number(chargerForm.connector_power_kw),
        })),
      });
      setChargerStationId(null);
      setChargerForm({ code: '', vendor: 'ABB', model: '', max_power_kw: 120, connector_count: 1, connector_type: 'CCS2', connector_power_kw: 60 });
      setCodeCheck(null);
      fetchStations();
    } catch (err) {
      setChargerError(err.response?.data?.detail || 'Không thể thêm trụ sạc. Vui lòng kiểm tra lại thông tin.');
    } finally {
      chargerSubmitLock.current = false;
      setChargerSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-tech-white">Hạ Tầng Trạm Sạc & Điểm Cấp Nguồn</h1>
          <p className="text-xs text-steel-gray mt-0.5 font-mono">
            QUẢN LÝ MÁY BIẾN ÁP, CÔNG SUẤT ĐỊNH MỨC & CÁC CỔNG SẠC VẬT LÝ
          </p>
        </div>
        {(role === 'ADMIN' || role === 'OPERATOR' || role === 'STATION_OWNER') && (
          <button
            onClick={() => openStationForm()}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>THÊM TRẠM SẠC</span>
          </button>
        )}
      </div>

      {/* Station List */}
      <div className="space-y-4">
        {stations.map((st) => {
          const isExpanded = expandedStationId === st.id;
          const chargers = st.charging_points || [];

          return (
            <div key={st.id} className="bg-panel border border-hairline rounded-sm overflow-hidden">
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
                      <span>•</span>
                      <span>Giờ hoạt động: {st.operating_hours}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  {(role === 'ADMIN' || role === 'OPERATOR' || role === 'STATION_OWNER') && (
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openStationForm(st); }}
                      className="flex items-center gap-1 rounded border border-hairline px-2 py-1 text-[10px] text-steel-gray hover:text-tech-white"
                    >
                      <Pencil className="h-3 w-3" /> SỬA
                    </button>
                  )}
                  <div className="text-right font-mono">
                    <div className="text-xs text-steel-gray">CÔNG SUẤT LƯỚI ĐỊNH MỨC</div>
                    <div className="text-base font-bold text-electric-cyan tabular-nums">
                      {st.total_grid_capacity_kw} kW
                    </div>
                  </div>
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
                    {(role === 'ADMIN' || role === 'OPERATOR' || role === 'STATION_OWNER') && (
                      <button
                        type="button"
                        onClick={() => { setChargerStationId(st.id); setChargerError(''); setCodeCheck(null); }}
                        className="flex items-center gap-1 rounded bg-electric-cyan px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-electric-cyan-hover"
                      >
                        <Plus className="h-3 w-3" /> THÊM TRỤ SẠC
                      </button>
                    )}
                  </div>

                  {chargers.length === 0 ? (
                    <div className="text-xs text-steel-gray text-center py-6 font-mono">
                      Chưa có trụ sạc nào được gắn vào trạm này.
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
                                <span className={conn.status === 'CHARGING' ? 'text-electric-cyan font-bold' : conn.status === 'UNKNOWN' ? 'text-steel-gray' : 'text-grid-green'}>
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

      {/* Modal Add Station */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-hairline p-6 rounded-sm max-w-md w-full">
            <h2 className="text-base font-bold text-tech-white mb-4">{editingStationId ? 'CẬP NHẬT TRẠM SẠC' : 'KHAI BÁO TRẠM SẠC MỚI'}</h2>
            <form onSubmit={handleSaveStation} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-steel-gray block mb-1">TÊN TRẠM SẠC</label>
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
                <label className="text-steel-gray block mb-1">ĐỊA CHỈ TRẠM</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: 720A Điện Biên Phủ, Q. Bình Thạnh, TP.HCM"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                />
              </div>
              <div>
                <label className="text-steel-gray block mb-1">CÔNG SUẤT LƯỚI ĐỊNH MỨC (KW)</label>
                <input
                  type="number"
                  required
                  min="10"
                  step="1"
                  value={formData.total_grid_capacity_kw}
                  onChange={(e) => setFormData({ ...formData, total_grid_capacity_kw: parseFloat(e.target.value) })}
                  className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-steel-gray block mb-1">VĨ ĐỘ (LAT)</label>
                  <input
                    type="number"
                    min="-90"
                    max="90"
                    required
                    aria-invalid={Boolean(stationFieldErrors.latitude)}
                    aria-describedby={stationFieldErrors.latitude ? 'station-latitude-error' : undefined}
                    step="0.0001"
                    value={formData.latitude}
                    onChange={(e) => { setFormData({ ...formData, latitude: parseFloat(e.target.value) }); setStationFieldErrors((current) => ({ ...current, latitude: undefined })); }}
                    className={`w-full bg-obsidian border p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan ${stationFieldErrors.latitude ? 'border-critical-red' : 'border-hairline'}`}
                  />
                  {stationFieldErrors.latitude && <p id="station-latitude-error" role="alert" className="mt-1 text-critical-red">{stationFieldErrors.latitude}</p>}
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">KINH ĐỘ (LON)</label>
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    required
                    aria-invalid={Boolean(stationFieldErrors.longitude)}
                    aria-describedby={stationFieldErrors.longitude ? 'station-longitude-error' : undefined}
                    step="0.0001"
                    value={formData.longitude}
                    onChange={(e) => { setFormData({ ...formData, longitude: parseFloat(e.target.value) }); setStationFieldErrors((current) => ({ ...current, longitude: undefined })); }}
                    className={`w-full bg-obsidian border p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan ${stationFieldErrors.longitude ? 'border-critical-red' : 'border-hairline'}`}
                  />
                  {stationFieldErrors.longitude && <p id="station-longitude-error" role="alert" className="mt-1 text-critical-red">{stationFieldErrors.longitude}</p>}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={stationSaving}
                  className="px-3 py-1.5 rounded bg-hairline text-steel-gray hover:text-tech-white"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  disabled={stationSaving}
                  className="px-4 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white font-bold"
                >
                  {stationSaving ? 'ĐANG LƯU...' : 'LƯU CẤU HÌNH'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {chargerStationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-sm border border-hairline bg-panel p-6">
            <h2 className="mb-4 text-base font-bold text-tech-white">KHAI BÁO TRỤ SẠC & ĐẦU NỐI</h2>
            {chargerError && <div role="alert" className="mb-3 rounded border border-critical-red/40 bg-critical-red/10 p-2 text-xs text-critical-red">{chargerError}</div>}
            <form onSubmit={handleCreateCharger} className="space-y-3 font-mono text-xs">
              <div>
                <label className="mb-1 block text-steel-gray">MÃ TRỤ EVSE</label>
                <input
                  required minLength="3" maxLength="50" value={chargerForm.code}
                  onChange={(event) => { setChargerForm({ ...chargerForm, code: event.target.value.toUpperCase() }); setCodeCheck(null); }}
                  onBlur={handleCheckChargerCode}
                  className="w-full rounded border border-hairline bg-obsidian p-2 text-tech-white focus:border-electric-cyan focus:outline-none"
                  placeholder="VN-HN-001"
                />
                {codeCheck === false && <p className="mt-1 text-critical-red">Mã này đã được sử dụng.</p>}
                {codeCheck === true && <p className="mt-1 text-grid-green">Mã trụ còn khả dụng.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-steel-gray">HÃNG
                  <input required value={chargerForm.vendor} onChange={(event) => setChargerForm({ ...chargerForm, vendor: event.target.value })} className="mt-1 w-full rounded border border-hairline bg-obsidian p-2 text-tech-white" />
                </label>
                <label className="text-steel-gray">MODEL
                  <input value={chargerForm.model} onChange={(event) => setChargerForm({ ...chargerForm, model: event.target.value })} className="mt-1 w-full rounded border border-hairline bg-obsidian p-2 text-tech-white" />
                </label>
                <label className="text-steel-gray">CÔNG SUẤT TRỤ (kW)
                  <input required type="number" min="1" step="0.1" value={chargerForm.max_power_kw} onChange={(event) => setChargerForm({ ...chargerForm, max_power_kw: event.target.value })} className="mt-1 w-full rounded border border-hairline bg-obsidian p-2 text-tech-white" />
                </label>
                <label className="text-steel-gray">SỐ ĐẦU NỐI (1–4)
                  <input required type="number" min="1" max="4" step="1" value={chargerForm.connector_count} onChange={(event) => setChargerForm({ ...chargerForm, connector_count: event.target.value })} className="mt-1 w-full rounded border border-hairline bg-obsidian p-2 text-tech-white" />
                </label>
                <label className="text-steel-gray">CHUẨN ĐẦU NỐI
                  <select value={chargerForm.connector_type} onChange={(event) => setChargerForm({ ...chargerForm, connector_type: event.target.value })} className="mt-1 w-full rounded border border-hairline bg-obsidian p-2 text-tech-white">
                    <option value="CCS2">CCS2</option><option value="TYPE_2">TYPE 2</option><option value="CHADEMO">CHAdeMO</option>
                  </select>
                </label>
                <label className="text-steel-gray">CÔNG SUẤT MỖI ĐẦU (kW)
                  <input required type="number" min="1" step="0.1" value={chargerForm.connector_power_kw} onChange={(event) => setChargerForm({ ...chargerForm, connector_power_kw: event.target.value })} className="mt-1 w-full rounded border border-hairline bg-obsidian p-2 text-tech-white" />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={chargerSaving} onClick={() => setChargerStationId(null)} className="rounded bg-hairline px-3 py-2 text-steel-gray disabled:opacity-50">HỦY</button>
                <button type="submit" disabled={chargerSaving || codeCheck === false || Number(chargerForm.connector_count) < 1 || Number(chargerForm.connector_count) > 4} className="flex items-center gap-2 rounded bg-electric-cyan px-3 py-2 font-bold text-white disabled:opacity-50">
                  {chargerSaving && <Loader2 className="h-3 w-3 animate-spin" />}{chargerSaving ? 'ĐANG LƯU...' : 'LƯU TRỤ SẠC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
