import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import {
  MapPin,
  Navigation as NavigationIcon,
  Zap,
  BatteryCharging,
  Compass,
  Search,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
} from 'lucide-react';
import api from '../services/api';
import { MAP_CONFIG } from '../config/mapConfig';

// Danh sách thành phố chọn nhanh khi không có GPS
const QUICK_CITIES = [
  { name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
  { name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  { name: 'TP. Hồ Chí Minh', lat: 10.7769, lon: 106.7009 },
];

// Tạo marker vị trí người dùng
function createUserLocationIcon() {
  const html = `
    <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: rgba(14, 165, 233, 0.3); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 14px; height: 14px; border-radius: 50%; background: #0EA5E9; border: 2.5px solid #FFFFFF; box-shadow: 0 0 10px #0EA5E9;"></div>
    </div>
  `;
  return L.divIcon({
    className: 'user-gps-marker',
    html: html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Tạo marker trạm sạc
function createStationMarkerIcon(st, isSelected) {
  const hasAvailable = (st.charging_points || []).some(
    (cp) => cp.status === 'AVAILABLE' && (cp.connectors || []).some((c) => c.status === 'AVAILABLE')
  );
  const isMaintenance = st.status === 'MAINTENANCE';

  let color = '#10B981'; // Xanh lá: có trụ sẵn sàng
  if (isMaintenance) {
    color = '#F59E0B'; // Vàng: đang bảo trì
  } else if (!hasAvailable) {
    color = '#0EA5E9'; // Xanh dương / đang bận
  }

  const borderStroke = isSelected ? '#FFFFFF' : '#0B0F17';
  const size = isSelected ? 42 : 34;

  const html = `
    <div style="position: relative; width: ${size}px; height: ${size + 6}px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s;">
      <svg width="${size}" height="${size + 6}" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 6px ${color}88);">
        <path d="M12 0C5.37258 0 0 5.37258 0 12C0 19.5 12 28 12 28C12 28 24 19.5 24 12C24 5.37258 18.6274 0 12 0Z" fill="${color}" stroke="${borderStroke}" stroke-width="${isSelected ? '2.5' : '1.2'}"/>
        <circle cx="12" cy="11" r="5.5" fill="#0B0F17"/>
        <path d="M12.5 6.5L9.5 11.5H12L11.5 15.5L14.5 10.5H12L12.5 6.5Z" fill="${color}"/>
      </svg>
      ${isSelected ? `<div style="position: absolute; bottom: -4px; width: 6px; height: 6px; border-radius: 50%; background: #0EA5E9; box-shadow: 0 0 6px #0EA5E9;"></div>` : ''}
    </div>
  `;

  return L.divIcon({
    className: `station-marker ${isSelected ? 'selected' : ''}`,
    html: html,
    iconSize: [size, size + 6],
    iconAnchor: [size / 2, size + 6],
    popupAnchor: [0, -(size + 4)],
  });
}

export default function DriverMap() {
  const navigate = useNavigate();

  // Tọa độ người dùng và trạng thái định vị
  const [userCoords, setUserCoords] = useState(null);
  const [locationName, setLocationName] = useState('Đang định vị...');
  const [gpsStatus, setGpsStatus] = useState('locating'); // 'locating' | 'granted' | 'denied' | 'custom'

  // Dữ liệu trạm sạc & bộ lọc
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStationId, setSelectedStationId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectorFilter, setConnectorFilter] = useState('ALL');
  const [availableOnly, setAvailableOnly] = useState(false);

  // Tham chiếu Leaflet Map
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const userMarkerRef = useRef(null);

  // Khởi tạo định vị vị trí người dùng
  const detectUserLocation = useCallback(() => {
    setGpsStatus('locating');
    setLocationName('Đang định vị GPS thiết bị...');

    if (!navigator.geolocation) {
      setGpsStatus('denied');
      const fallback = QUICK_CITIES[2]; // TP.HCM
      setUserCoords({ lat: fallback.lat, lon: fallback.lon });
      setLocationName(fallback.name + ' (Mặc định)');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        setUserCoords(coords);
        setLocationName('Vị trí GPS hiện tại của bạn');
        setGpsStatus('granted');
      },
      (error) => {
        console.warn('Lỗi định vị GPS:', error.message);
        setGpsStatus('denied');
        // Fallback về TP. Hồ Chí Minh
        const fallback = QUICK_CITIES[2];
        setUserCoords({ lat: fallback.lat, lon: fallback.lon });
        setLocationName(fallback.name + ' (Vị trí tạm)');
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    detectUserLocation();
  }, [detectUserLocation]);

  // Nạp danh sách trạm sạc từ backend (có tính khoảng cách Haversine khi có userCoords)
  const fetchStations = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (userCoords?.lat != null && userCoords?.lon != null) {
        params.user_lat = userCoords.lat;
        params.user_lon = userCoords.lon;
      }
      if (connectorFilter !== 'ALL') {
        params.connector_type = connectorFilter;
      }

      const res = await api.get('/stations', { params });
      setStations(res.data || []);
    } catch (err) {
      console.error('Lỗi nạp danh sách trạm cho tài xế:', err);
    } finally {
      setLoading(false);
    }
  }, [userCoords, connectorFilter]);

  useEffect(() => {
    if (userCoords) {
      fetchStations();
    }
  }, [userCoords, fetchStations]);

  // Khởi tạo bản đồ Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialCenter = userCoords ? [userCoords.lat, userCoords.lon] : MAP_CONFIG.defaultCenter;
      const initialZoom = userCoords ? 13 : MAP_CONFIG.defaultZoom;

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: false,
        attributionControl: true,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Thêm TileLayer từ config
      L.tileLayer(MAP_CONFIG.dark.url, {
        maxZoom: MAP_CONFIG.dark.maxZoom,
        attribution: MAP_CONFIG.dark.attribution,
        className: MAP_CONFIG.dark.className,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      // Giữ nguyên instance
    };
  }, []);

  // Cập nhật marker vị trí người dùng trên bản đồ
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userCoords) return;

    if (!userMarkerRef.current) {
      const marker = L.marker([userCoords.lat, userCoords.lon], {
        icon: createUserLocationIcon(),
        zIndexOffset: 1000,
      }).addTo(map);
      marker.bindPopup(`<div style="font-family: monospace; font-size: 11px;"><b>${locationName}</b></div>`);
      userMarkerRef.current = marker;
    } else {
      userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lon]);
      userMarkerRef.current.setPopupContent(`<div style="font-family: monospace; font-size: 11px;"><b>${locationName}</b></div>`);
    }

    // Bay bản đồ đến vị trí người dùng
    map.flyTo([userCoords.lat, userCoords.lon], 13, { duration: 1.2 });
  }, [userCoords, locationName]);

  // Cập nhật markers trạm sạc trên bản đồ
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Xóa markers cũ
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    stations.forEach((st) => {
      if (st.latitude == null || st.longitude == null) return;

      const isSelected = selectedStationId === st.id;
      const icon = createStationMarkerIcon(st, isSelected);

      const marker = L.marker([st.latitude, st.longitude], {
        icon: icon,
        zIndexOffset: isSelected ? 500 : 100,
      }).addTo(map);

      // Nội dung popup trạm
      const availableChargers = (st.charging_points || []).filter(
        (cp) => cp.status === 'AVAILABLE'
      ).length;
      const totalChargers = (st.charging_points || []).length;
      const distText = st.distance_km != null ? `${st.distance_km.toFixed(1)} km` : '';

      const popupContent = `
        <div style="font-family: monospace; font-size: 11px; min-width: 180px; color: #0B0F17;">
          <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px;">${st.name}</div>
          <div style="color: #475569; font-size: 10px; margin-bottom: 6px;">${st.address}</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>Khoảng cách:</span>
            <span style="font-weight: bold; color: #0EA5E9;">${distText || 'N/A'}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>Trụ khả dụng:</span>
            <span style="font-weight: bold; color: ${availableChargers > 0 ? '#10B981' : '#F59E0B'};">${availableChargers}/${totalChargers} trụ</span>
          </div>
          <div style="display: flex; gap: 4px;">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${st.latitude},${st.longitude}" target="_blank" rel="noreferrer"
               style="flex: 1; text-align: center; background: #0EA5E9; color: white; padding: 4px 6px; border-radius: 3px; text-decoration: none; font-weight: bold;">
              Chỉ đường
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('click', () => {
        setSelectedStationId(st.id);
        const cardEl = document.getElementById(`driver-station-${st.id}`);
        if (cardEl) {
          cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      markersRef.current[st.id] = marker;
    });
  }, [stations, selectedStationId]);

  // Chọn thành phố thủ công khi GPS từ chối
  const handleSelectCity = (city) => {
    setUserCoords({ lat: city.lat, lon: city.lon });
    setLocationName(`Khu vực: ${city.name}`);
    setGpsStatus('custom');
  };

  // Chọn trạm từ danh sách
  const handleSelectStation = (st) => {
    setSelectedStationId(st.id);
    const map = mapInstanceRef.current;
    if (map && st.latitude != null && st.longitude != null) {
      map.flyTo([st.latitude, st.longitude], 15, { duration: 1.0 });
      const marker = markersRef.current[st.id];
      if (marker) {
        marker.openPopup();
      }
    }
  };

  // Điều hướng sang trang Giả lập sạc cho trạm này
  const handleChargeAtStation = (st) => {
    navigate(`/simulator?station_id=${st.id}`);
  };

  // Lọc danh sách trạm theo tìm kiếm & trạng thái
  const filteredStations = useMemo(() => {
    return stations.filter((st) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = st.name?.toLowerCase().includes(q);
        const matchAddr = st.address?.toLowerCase().includes(q);
        if (!matchName && !matchAddr) return false;
      }
      if (availableOnly) {
        const hasAvail = (st.charging_points || []).some((cp) => cp.status === 'AVAILABLE');
        if (!hasAvail) return false;
      }
      return true;
    });
  }, [stations, searchQuery, availableOnly]);

  return (
    <div className="space-y-4">
      {/* Top Banner: Định vị & Chọn thành phố */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-panel border border-hairline p-3.5 rounded-sm font-mono text-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-electric-cyan/10 border border-electric-cyan/30 text-electric-cyan">
            <Compass className={`w-5 h-5 ${gpsStatus === 'locating' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-tech-white">VỊ TRÍ TÌM KIẾM:</span>
              <span className="text-electric-cyan font-semibold">{locationName}</span>
              {gpsStatus === 'granted' && (
                <span className="px-1.5 py-0.2 rounded bg-grid-green/20 text-grid-green text-[10px] font-bold">
                  GPS LIVE
                </span>
              )}
            </div>
            <div className="text-[11px] text-steel-gray mt-0.5">
              Hệ thống tự động sắp xếp các trạm sạc công cộng theo khoảng cách thực tế gần nhất
            </div>
          </div>
        </div>

        {/* Nút chọn nhanh thành phố khi GPS bị chặn hoặc muốn đổi vị trí */}
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="text-steel-gray text-[11px]">Khu vực:</span>
          {QUICK_CITIES.map((city) => (
            <button
              key={city.name}
              type="button"
              onClick={() => handleSelectCity(city)}
              className="px-2.5 py-1 rounded bg-obsidian border border-hairline hover:border-electric-cyan text-steel-gray hover:text-tech-white text-xs transition-colors"
            >
              {city.name}
            </button>
          ))}
          <button
            type="button"
            onClick={detectUserLocation}
            title="Định vị lại GPS của bạn"
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-electric-cyan/10 border border-electric-cyan/30 hover:bg-electric-cyan/20 text-electric-cyan text-xs transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Định vị lại</span>
          </button>
        </div>
      </div>

      {/* Cảnh báo khi GPS bị từ chối */}
      {gpsStatus === 'denied' && (
        <div className="bg-caution-amber/10 border border-caution-amber/30 p-2.5 rounded text-xs font-mono text-caution-amber flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Trình duyệt chưa cho phép truy cập vị trí GPS. Đang hiển thị trạm sạc khu vực TP. Hồ Chí Minh mặc định. Hãy chọn nhanh thành phố phía trên hoặc bấm "Định vị lại".
            </span>
          </div>
        </div>
      )}

      {/* Layout Split: Trái là Bản đồ, Phải là Danh sách trạm gần nhất */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[580px]">
        {/* Bản đồ Leaflet tương tác */}
        <div className="lg:col-span-7 xl:col-span-8 bg-panel border border-hairline rounded-sm overflow-hidden flex flex-col relative">
          <div
            ref={mapContainerRef}
            className="w-full h-full relative z-0"
            style={{ background: '#0B0F17' }}
          />

          {/* Map floating legend */}
          <div className="absolute bottom-3 left-3 z-[400] bg-obsidian/90 backdrop-blur-sm border border-hairline p-2 rounded text-[11px] font-mono text-steel-gray space-y-1 shadow-lg">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-grid-green inline-block"></span>
              <span className="text-tech-white">Có trụ sẵn sàng</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-electric-cyan inline-block"></span>
              <span className="text-tech-white">Đang phục vụ sạc</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-caution-amber inline-block"></span>
              <span className="text-tech-white">Bảo trì</span>
            </div>
          </div>
        </div>

        {/* Danh sách trạm sạc gần nhất */}
        <div className="lg:col-span-5 xl:col-span-4 bg-panel border border-hairline rounded-sm flex flex-col overflow-hidden">
          {/* Header & Bộ lọc tìm kiếm */}
          <div className="p-3 border-b border-hairline bg-obsidian space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <NavigationIcon className="w-4 h-4 text-electric-cyan" />
                <span className="font-bold text-xs font-mono text-tech-white uppercase">
                  TRẠM SẠC GẦN BẠN ({filteredStations.length})
                </span>
              </div>
              <span className="text-[10px] font-mono text-steel-gray">
                SẮP XẾP THEO KHOẢNG CÁCH
              </span>
            </div>

            {/* Input tìm kiếm */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-steel-gray" />
              <input
                type="text"
                placeholder="Tìm theo tên trạm hoặc địa chỉ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-panel border border-hairline pl-8 pr-3 py-1.5 rounded text-xs text-tech-white focus:outline-none focus:border-electric-cyan font-mono placeholder:text-steel-gray"
              />
            </div>

            {/* Bộ lọc chuẩn sạc & trạng thái */}
            <div className="flex items-center justify-between gap-1 pt-1 text-[11px] font-mono">
              <div className="flex items-center space-x-1">
                <span className="text-steel-gray">Cổng:</span>
                <select
                  value={connectorFilter}
                  onChange={(e) => setConnectorFilter(e.target.value)}
                  className="bg-panel border border-hairline text-tech-white rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-electric-cyan font-mono"
                >
                  <option value="ALL">Tất cả</option>
                  <option value="CCS2">CCS2</option>
                  <option value="TYPE_2">Type 2</option>
                  <option value="CHADEMO">CHAdeMO</option>
                </select>
              </div>

              <label className="flex items-center space-x-1.5 cursor-pointer text-steel-gray hover:text-tech-white select-none">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                  className="rounded bg-obsidian border-hairline text-electric-cyan focus:ring-0 w-3 h-3"
                />
                <span>Còn trụ trống</span>
              </label>
            </div>
          </div>

          {/* Danh sách cuộn trạm sạc */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono">
            {loading ? (
              <div className="text-xs text-steel-gray text-center py-12">
                Đang tìm các trạm sạc gần vị trí của bạn...
              </div>
            ) : filteredStations.length === 0 ? (
              <div className="text-xs text-steel-gray text-center py-12">
                Không tìm thấy trạm sạc nào phù hợp với bộ lọc hiện tại.
              </div>
            ) : (
              filteredStations.map((st) => {
                const isSelected = selectedStationId === st.id;
                const chargers = st.charging_points || [];
                const availableCount = chargers.filter((c) => c.status === 'AVAILABLE').length;
                const totalCount = chargers.length;
                const maxKw = chargers.reduce((m, c) => Math.max(m, c.max_power_kw || 0), 0);

                return (
                  <div
                    key={st.id}
                    id={`driver-station-${st.id}`}
                    onClick={() => handleSelectStation(st)}
                    className={`p-3 rounded border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-electric-cyan/5 border-electric-cyan shadow-md'
                        : 'bg-obsidian border-hairline hover:border-steel-gray'
                    }`}
                  >
                    {/* Header trạm: Tên & Khoảng cách */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <div className="font-bold text-xs text-tech-white flex items-center space-x-1.5">
                          <span>{st.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-panel text-steel-gray border border-hairline">
                            ST-{st.id}
                          </span>
                        </div>
                        <div className="text-[11px] text-steel-gray mt-0.5 line-clamp-1" title={st.address}>
                          {st.address}
                        </div>
                      </div>

                      {st.distance_km != null && (
                        <div className="shrink-0 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-electric-cyan/15 text-electric-cyan border border-electric-cyan/30 tabular-nums">
                            {st.distance_km.toFixed(1)} km
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Thông số kỹ thuật: Trụ khả dụng & Công suất */}
                    <div className="grid grid-cols-2 gap-2 my-2.5 p-2 rounded bg-panel/70 border border-hairline/60 text-[11px]">
                      <div>
                        <div className="text-steel-gray text-[10px]">TRỤ KHẢ DỤNG</div>
                        <div className="font-bold flex items-center space-x-1 mt-0.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              availableCount > 0 ? 'bg-grid-green' : 'bg-critical-red'
                            }`}
                          ></span>
                          <span className={availableCount > 0 ? 'text-grid-green' : 'text-critical-red'}>
                            {availableCount}/{totalCount} trụ sẵn sàng
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="text-steel-gray text-[10px]">CÔNG SUẤT TỐI ĐA</div>
                        <div className="font-bold text-tech-white mt-0.5 flex items-center space-x-1">
                          <Zap className="w-3 h-3 text-electric-cyan" />
                          <span>{maxKw || st.total_grid_capacity_kw} kW</span>
                        </div>
                      </div>
                    </div>

                    {/* Đơn giá & Giờ hoạt động */}
                    <div className="flex items-center justify-between text-[11px] text-steel-gray mb-3">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{st.operating_hours || '24/7'}</span>
                      </span>
                      <span className="text-tech-white">
                        Đơn giá: <span className="text-caution-amber font-semibold">~3.858 đ/kWh</span>
                      </span>
                    </div>

                    {/* Nút hành động: Chỉ đường & Sạc tại trạm này */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-hairline/60">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${st.latitude},${st.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-center space-x-1.5 py-1.5 rounded bg-panel hover:bg-hairline border border-hairline text-steel-gray hover:text-tech-white text-xs transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-electric-cyan" />
                        <span>Chỉ đường</span>
                      </a>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChargeAtStation(st);
                        }}
                        className="flex items-center justify-center space-x-1.5 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white text-xs font-bold transition-colors shadow-sm"
                      >
                        <BatteryCharging className="w-3.5 h-3.5" />
                        <span>Sạc tại trạm này</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
