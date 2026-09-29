import React, { useState, useEffect } from 'react';
import { Plus, Zap, Cpu, MapPin, ChevronRight, ChevronDown, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Stations() {
  const { role } = useAuth();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedStationId, setExpandedStationId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

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

  const handleCreateStation = async (e) => {
    e.preventDefault();
    try {
      await api.post('/stations', formData);
      setShowAddModal(false);
      setFormData({
        name: '',
        address: '',
        latitude: 10.7769,
        longitude: 106.7009,
        total_grid_capacity_kw: 150.0,
        operating_hours: '24/7',
        status: 'ACTIVE',
      });
      fetchStations();
    } catch (err) {
      alert('Lỗi tạo trạm sạc: ' + (err.response?.data?.detail || err.message));
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
        {(role === 'ADMIN' || role === 'OPERATOR') && (
          <button
            onClick={() => setShowAddModal(true)}
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

      {/* Modal Add Station */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-hairline p-6 rounded-sm max-w-md w-full">
            <h2 className="text-base font-bold text-tech-white mb-4">CẤU HÌNH THÊM TRẠM SẠC MỚI</h2>
            <form onSubmit={handleCreateStation} className="space-y-3 font-mono text-xs">
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
                    step="0.0001"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
                </div>
                <div>
                  <label className="text-steel-gray block mb-1">KINH ĐỘ (LON)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                    className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4">
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
    </div>
  );
}
