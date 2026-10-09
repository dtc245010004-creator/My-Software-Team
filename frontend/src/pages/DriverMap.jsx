import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import {
  Navigation as NavigationIcon,
  Zap,
  BatteryCharging,
  Compass,
  Search,
  ExternalLink,
  RotateCcw,
  Clock,
  Layers,
  X,
  MapPinOff,
  LocateFixed,
  Eye,
  Info,
} from 'lucide-react';
import api from '../services/api';
import { MAP_CONFIG } from '../config/mapConfig';
import { useTheme } from '../context/ThemeContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

// Danh sách thành phố chọn nhanh khi không có GPS
const QUICK_CITIES = [
  { name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
  { name: 'Thái Nguyên', lat: 21.5928, lon: 105.8442 },
  { name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  { name: 'TP. Hồ Chí Minh', lat: 10.7769, lon: 106.7009 },
];

// Tạo marker vị trí người dùng với hiệu ứng sóng radar 3D
function createUserLocationIcon() {
  const html = `
    <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background: rgba(2, 132, 199, 0.3); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: rgba(2, 132, 199, 0.5);"></div>
      <div style="width: 16px; height: 16px; border-radius: 50%; background: #0284C7; border: 3px solid #FFFFFF; box-shadow: 0 2px 10px rgba(2, 132, 199, 0.9);"></div>
    </div>
  `;
  return L.divIcon({
    className: 'user-gps-marker',
    html: html,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

// Tạo marker trạm sạc đa thông tin (Interactive Rich Pin with Station Info Pill)
function createStationMarkerIcon(st, isSelected) {
  const chargers = st.charging_points || [];
  const hasAvailable = chargers.some(
    (cp) => cp.status === 'AVAILABLE' && (cp.connectors || []).some((c) => c.status === 'AVAILABLE')
  );
  const isMaintenance = st.status === 'MAINTENANCE';

  let color = '#10B981'; // Xanh ngọc: có trụ sẵn sàng
  let statusBadgeBg = 'rgba(16, 185, 129, 0.25)';
  let statusDot = '#10B981';

  if (isMaintenance) {
    color = '#F59E0B'; // Vàng hổ phách: bảo trì
    statusBadgeBg = 'rgba(245, 158, 11, 0.25)';
    statusDot = '#F59E0B';
  } else if (!hasAvailable) {
    color = '#0284C7'; // Xanh dương: kín tải
    statusBadgeBg = 'rgba(2, 132, 199, 0.25)';
    statusDot = '#0284C7';
  }

  const availableCount = chargers.filter((cp) => cp.status === 'AVAILABLE').length;
  const totalCount = chargers.length;
  const maxKw = chargers.reduce((m, c) => Math.max(m, c.max_power_kw || 0), 0) || st.total_grid_capacity_kw || 60;

  const pinScale = isSelected ? 1.15 : 1.0;
  const ringGlow = isSelected
    ? `box-shadow: 0 0 0 3px #0284C7, 0 8px 24px rgba(2, 132, 199, 0.65);`
    : `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);`;

  const borderStroke = isSelected ? '#38BDF8' : 'rgba(255, 255, 255, 0.25)';

  const html = `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: scale(${pinScale}); transition: transform 0.2s cubic-bezier(0.2,0,0,1); cursor: pointer;">
      <!-- Ghim Pin trạm sạc EV -->
      <div style="position: relative; width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: ${color}; display: flex; align-items: center; justify-content: center; ${ringGlow} border: 2.5px solid #FFFFFF;">
        <div style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
      </div>

      <!-- Thẻ nhãn tên trạm & thông số trực tiếp trên mặt bản đồ -->
      <div style="margin-top: 5px; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(8px); border: 1.5px solid ${borderStroke}; padding: 3px 8px; border-radius: 9999px; display: flex; align-items: center; gap: 5px; white-space: nowrap; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); pointer-events: none;">
        <span style="font-size: 11px; font-weight: 700; color: #FFFFFF; font-family: system-ui, -apple-system, sans-serif; letter-spacing: -0.01em;">${st.name}</span>
        <span style="font-size: 10px; font-weight: 700; color: ${statusDot}; background: ${statusBadgeBg}; padding: 1px 6px; border-radius: 9999px; font-family: monospace;">
          ${availableCount}/${totalCount} trụ • ${maxKw}kW
        </span>
      </div>
    </div>
  `;

  return L.divIcon({
    className: `station-marker ${isSelected ? 'selected' : ''}`,
    html: html,
    iconSize: [180, 76],
    iconAnchor: [90, 18],
    popupAnchor: [0, -24],
  });
}

export default function DriverMap() {
  const navigate = useNavigate();
  const { isDark } = useTheme();

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
  const [powerFilter, setPowerFilter] = useState('ALL'); // 'ALL' | 'FAST' (>=60kW) | 'ULTRA' (>=120kW)
  const [availableOnly, setAvailableOnly] = useState(false);

  // Chế độ lớp bản đồ: 'street' (Đường phố rõ nét mặc định) | 'dark' (Bản đồ tối) | 'satellite' (Vệ tinh)
  const [layerMode, setLayerMode] = useState('street');

  // Tham chiếu Leaflet Map
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const baseLayersRef = useRef({});
  const markersRef = useRef({});
  const userMarkerRef = useRef(null);
  const userRadiusRef = useRef(null);
  const routeLineRef = useRef(null);
  const lastFittedKeyRef = useRef('');

  // Khởi tạo định vị vị trí người dùng
  const detectUserLocation = useCallback(() => {
    setGpsStatus('locating');
    setLocationName('Đang định vị GPS thiết bị...');

    if (!navigator.geolocation) {
      setGpsStatus('denied');
      const fallback = QUICK_CITIES[1]; // Thái Nguyên (khu vực trạm test)
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
        const fallback = QUICK_CITIES[1]; // Thái Nguyên
        setUserCoords({ lat: fallback.lat, lon: fallback.lon });
        setLocationName(fallback.name + ' (Vị trí tạm)');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
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

      // 1. Lớp Đường phố tiêu chuẩn (Sắc nét, rõ tên đường tiếng Việt, màu đường cao tốc / nội đô phân biệt)
      const streetLayer = L.tileLayer(MAP_CONFIG.street.url, {
        maxZoom: MAP_CONFIG.street.maxZoom,
        attribution: MAP_CONFIG.street.attribution,
      });

      // 2. Lớp Bản đồ tối công nghệ cao (Tương phản cao, tên đường sáng rõ)
      const darkLayer = L.tileLayer(MAP_CONFIG.dark.url, {
        subdomains: MAP_CONFIG.dark.subdomains || 'abcd',
        maxZoom: MAP_CONFIG.dark.maxZoom,
        attribution: MAP_CONFIG.dark.attribution,
      });

      // 3. Lớp Ảnh vệ tinh độ nét cao
      const satelliteLayer = L.tileLayer(MAP_CONFIG.satellite.url, {
        maxZoom: MAP_CONFIG.satellite.maxZoom,
        attribution: MAP_CONFIG.satellite.attribution,
      });

      // Mặc định nạp lớp Đường phố để tài xế quan sát dễ nhất
      streetLayer.addTo(map);

      baseLayersRef.current = {
        street: streetLayer,
        dark: darkLayer,
        satellite: satelliteLayer,
      };

      mapInstanceRef.current = map;

      // Invalidate size để tránh lỗi vỡ khung
      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Đổi Tile Layer khi chuyển chế độ (Đường phố / Bản đồ tối / Vệ tinh)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !baseLayersRef.current.street) return;

    Object.values(baseLayersRef.current).forEach((layer) => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    const activeLayer = baseLayersRef.current[layerMode] || baseLayersRef.current.street;
    activeLayer.addTo(map);
  }, [layerMode]);

  // Cập nhật marker vị trí người dùng & vòng tròn sóng radar
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userCoords) return;

    // Marker GPS người dùng
    if (!userMarkerRef.current) {
      const marker = L.marker([userCoords.lat, userCoords.lon], {
        icon: createUserLocationIcon(),
        zIndexOffset: 1000,
      }).addTo(map);
      marker.bindPopup(`<div style="font-size: 13px; font-weight: 700; padding: 4px; font-family: system-ui;">📍 ${locationName}</div>`);
      userMarkerRef.current = marker;
    } else {
      userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lon]);
      userMarkerRef.current.setPopupContent(`<div style="font-size: 13px; font-weight: 700; padding: 4px; font-family: system-ui;">📍 ${locationName}</div>`);
    }

    // Vòng tròn bán kính tìm kiếm quanh vị trí tài xế (1.5 km)
    if (!userRadiusRef.current) {
      const circle = L.circle([userCoords.lat, userCoords.lon], {
        radius: 1500,
        color: '#0284C7',
        fillColor: '#0284C7',
        fillOpacity: 0.06,
        weight: 1.5,
        dashArray: '5, 5',
      }).addTo(map);
      userRadiusRef.current = circle;
    } else {
      userRadiusRef.current.setLatLng([userCoords.lat, userCoords.lon]);
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

    const validStations = [];
    stations.forEach((st) => {
      if (st.latitude == null || st.longitude == null) return;

      const parsedLat = typeof st.latitude === 'string' ? parseFloat(st.latitude) : Number(st.latitude);
      const parsedLng = typeof st.longitude === 'string' ? parseFloat(st.longitude) : Number(st.longitude);
      if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) return;
      validStations.push({ ...st, parsedLat, parsedLng });

      const isSelected = selectedStationId === st.id;
      const icon = createStationMarkerIcon(st, isSelected);

      const marker = L.marker([parsedLat, parsedLng], {
        icon: icon,
        zIndexOffset: isSelected ? 800 : 200,
      }).addTo(map);

      // Nội dung popup trạm chi tiết, sắc nét
      const availableChargers = (st.charging_points || []).filter(
        (cp) => cp.status === 'AVAILABLE'
      ).length;
      const totalChargers = (st.charging_points || []).length;
      const distText = st.distance_km != null ? `${st.distance_km.toFixed(1)} km` : '';
      const maxKw = (st.charging_points || []).reduce((m, c) => Math.max(m, c.max_power_kw || 0), 0) || st.total_grid_capacity_kw || 60;

      const popupContent = `
        <div style="min-width: 250px; font-family: system-ui, -apple-system, sans-serif; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
            <div style="font-weight: 800; font-size: 15px; color: ${isDark ? '#F1F5F9' : '#0F172A'}; letter-spacing: -0.01em;">
              ${st.name}
            </div>
            <span style="font-size: 10px; font-weight: 700; background: ${isDark ? '#082F49' : '#E0F2FE'}; color: ${isDark ? '#7DD3FC' : '#0369A1'}; padding: 2px 6px; border-radius: 9999px; font-family: monospace;">
              ST-${st.id}
            </span>
          </div>

          <div style="color: ${isDark ? '#94A3B8' : '#64748B'}; font-size: 12px; margin-bottom: 10px; line-height: 1.4;">
            ${st.address || 'Không có địa chỉ chi tiết'}
          </div>

          <div style="background: ${isDark ? '#0F172A' : '#F8FAFC'}; border: 1px solid ${isDark ? '#334155' : '#E2E8F0'}; border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px;">
            <div>
              <span style="color: #64748B; font-size: 11px; display: block;">Khoảng cách</span>
              <strong style="color: #0284C7; font-size: 13px; font-family: monospace;">${distText || 'N/A'}</strong>
            </div>
            <div>
              <span style="color: #64748B; font-size: 11px; display: block;">Công suất tối đa</span>
              <strong style="color: ${isDark ? '#F1F5F9' : '#0F172A'}; font-size: 13px; font-family: monospace;">${maxKw} kW</strong>
            </div>
            <div>
              <span style="color: #64748B; font-size: 11px; display: block;">Trụ sẵn sàng</span>
              <strong style="color: ${availableChargers > 0 ? '#10B981' : '#F59E0B'}; font-size: 13px;">${availableChargers}/${totalChargers} trụ</strong>
            </div>
            <div>
              <span style="color: #64748B; font-size: 11px; display: block;">Đơn giá sạc</span>
              <strong style="color: #D97706; font-size: 12px; font-family: monospace;">~3.858 đ</strong>
            </div>
          </div>

          <div style="display: flex; gap: 6px;">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${parsedLat},${parsedLng}" target="_blank" rel="noreferrer"
               style="flex: 1; text-align: center; background: #FFFFFF; border: 1px solid #CBD5E1; color: #334155; padding: 7px 10px; border-radius: 8px; text-decoration: none; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
              <span>Chỉ đường</span>
            </a>
            <button id="popup-charge-btn-${st.id}" type="button"
               style="flex: 1.2; text-align: center; background: #0284C7; color: #FFFFFF; padding: 7px 10px; border-radius: 8px; border: none; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.4);">
              <span>⚡ Sạc ngay</span>
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { minWidth: 260, maxWidth: 300 });

      marker.on('popupopen', () => {
        const btn = document.getElementById(`popup-charge-btn-${st.id}`);
        if (btn) {
          btn.onclick = () => handleChargeAtStation(st);
        }
      });

      marker.on('click', () => {
        handleSelectStation(st);
      });

      markersRef.current[st.id] = marker;
    });

    // Fit bounds once per distinct station set; rerendering selected markers must not reset the driver's map view.
    const currentFingerprint = validStations
      .map((station) => `${station.id}:${station.parsedLat.toFixed(4)},${station.parsedLng.toFixed(4)}`)
      .join('|');
    if (validStations.length > 0 && currentFingerprint !== lastFittedKeyRef.current) {
      lastFittedKeyRef.current = currentFingerprint;
      if (validStations.length === 1) {
        map.setView([validStations[0].parsedLat, validStations[0].parsedLng], 15);
      } else {
        const bounds = L.latLngBounds(validStations.map((station) => [station.parsedLat, station.parsedLng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }
  }, [stations, selectedStationId, isDark]);

  // Cập nhật đường nối trực quan (Direction route line) giữa GPS tài xế và trạm đang chọn
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    if (selectedStationId && userCoords) {
      const selectedStation = stations.find((s) => s.id === selectedStationId);
      if (selectedStation?.latitude && selectedStation?.longitude) {
        const line = L.polyline(
          [
            [userCoords.lat, userCoords.lon],
            [selectedStation.latitude, selectedStation.longitude],
          ],
          {
            color: '#0284C7',
            weight: 3.5,
            dashArray: '8, 8',
            opacity: 0.85,
          }
        ).addTo(map);

        if (selectedStation.distance_km != null) {
          line.bindTooltip(`🚗 ${selectedStation.distance_km.toFixed(1)} km`, {
            permanent: true,
            direction: 'center',
            className: 'route-distance-tooltip',
          });
        }

        routeLineRef.current = line;
      }
    }
  }, [selectedStationId, userCoords, stations]);

  // Chọn thành phố thủ công khi GPS từ chối hoặc người dùng muốn đổi khu vực
  const handleSelectCity = (city) => {
    setUserCoords({ lat: city.lat, lon: city.lon });
    setLocationName(`Khu vực: ${city.name}`);
    setGpsStatus('custom');
    setSelectedStationId(null);
  };

  // Chọn trạm từ danh sách hoặc từ click marker
  const handleSelectStation = (st) => {
    setSelectedStationId(st.id);
    const map = mapInstanceRef.current;
    if (map && st.latitude != null && st.longitude != null) {
      map.flyTo([st.latitude, st.longitude], 15, { duration: 0.9 });
      const marker = markersRef.current[st.id];
      if (marker) {
        marker.openPopup();
      }
    }
    const cardEl = document.getElementById(`driver-station-${st.id}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Nút bay về vị trí GPS người dùng
  const handleFlyToUser = () => {
    const map = mapInstanceRef.current;
    if (map && userCoords) {
      map.flyTo([userCoords.lat, userCoords.lon], 15, { duration: 1.0 });
      if (userMarkerRef.current) {
        userMarkerRef.current.openPopup();
      }
    }
  };

  // Nút xem bao trọn tất cả trạm (Fit All Bounds)
  const handleFitAllStations = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const validCoords = stations
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => [s.latitude, s.longitude]);

    if (userCoords) {
      validCoords.push([userCoords.lat, userCoords.lon]);
    }

    if (validCoords.length > 0) {
      const bounds = L.latLngBounds(validCoords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  };

  // Điều hướng sang màn hình trụ sạc của trạm này (S-24 / T-52)
  const handleChargeAtStation = (st) => {
    const chargers = st.charging_points || [];
    const availableCharger = chargers.find((c) => c.status === 'AVAILABLE') || chargers[0];
    if (availableCharger) {
      navigate(`/chargers/${availableCharger.id}`);
    } else {
      navigate(`/simulator?station_id=${st.id}`);
    }
  };

  // Lọc danh sách trạm theo tìm kiếm, chuẩn sạc, công suất & trạng thái
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

      if (powerFilter !== 'ALL') {
        const maxKw = (st.charging_points || []).reduce((m, c) => Math.max(m, c.max_power_kw || 0), 0) || st.total_grid_capacity_kw || 0;
        if (powerFilter === 'FAST' && maxKw < 60) return false;
        if (powerFilter === 'ULTRA' && maxKw < 120) return false;
      }

      return true;
    });
  }, [stations, searchQuery, availableOnly, powerFilter]);

  // Trạm sạc đang được chọn
  const selectedStation = useMemo(() => {
    return stations.find((s) => s.id === selectedStationId) || null;
  }, [stations, selectedStationId]);

  return (
    <div className="space-y-4">
      
      {/* Top Banner: Định vị & Chọn thành phố */}
      <Card padding="p-4" className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 shadow-inner">
            <Compass className={`w-5 h-5 ${gpsStatus === 'locating' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Vị trí tìm kiếm:
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {locationName}
              </span>
              {gpsStatus === 'granted' && (
                <Badge variant="success" dot pulse size="sm">
                  GPS LIVE
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tự động sắp xếp các trạm sạc công cộng theo khoảng cách thực tế gần bạn nhất
            </p>
          </div>
        </div>

        {/* Nút chọn nhanh khu vực & định vị lại */}
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Khu vực:</span>
          {QUICK_CITIES.map((city) => (
            <button
              key={city.name}
              type="button"
              onClick={() => handleSelectCity(city)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-sky-500 dark:hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-all duration-150 shadow-sm"
            >
              {city.name}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            icon={RotateCcw}
            onClick={detectUserLocation}
            title="Định vị lại GPS của bạn"
            className="rounded-full"
          >
            Định vị lại
          </Button>
        </div>
      </Card>

      {/* Cảnh báo khi GPS bị từ chối */}
      {gpsStatus === 'denied' && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3 rounded-2xl text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Trình duyệt chưa cấp quyền GPS. Đang hiển thị trạm sạc khu vực Thái Nguyên mặc định. Bạn có thể chọn nhanh thành phố phía trên hoặc bấm "Định vị lại".
            </span>
          </div>
        </div>
      )}

      {/* Layout Split: Trái là Bản đồ, Phải là Danh sách trạm gần nhất */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-220px)] min-h-[620px]">
        
        {/* Khối Bản đồ tương tác đa lớp thông tin */}
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-soft dark:shadow-soft-dark flex flex-col relative bg-slate-100 dark:bg-slate-900">
          
          {/* Thanh công cụ điều khiển bản đồ nổi góc trên (Layer Switcher + Zoom + Center) */}
          <div className="absolute top-3 right-3 z-[400] flex items-center gap-2">
            
            {/* Bộ chọn 3 lớp bản đồ: Đường phố (rõ nét) / Tối / Vệ tinh */}
            <div className="flex items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-md">
              <button
                type="button"
                onClick={() => setLayerMode('street')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 ${
                  layerMode === 'street'
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Bản đồ đường phố: Tên đường, địa danh tiếng Việt cực kỳ rõ nét & chi tiết"
              >
                <span>🗺️ Đường phố</span>
              </button>

              <button
                type="button"
                onClick={() => setLayerMode('dark')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 ${
                  layerMode === 'dark'
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Bản đồ đêm công nghệ cao: Độ tương phản cao, tên đường sáng rõ"
              >
                <span>🌙 Bản đồ tối</span>
              </button>

              <button
                type="button"
                onClick={() => setLayerMode('satellite')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 ${
                  layerMode === 'satellite'
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Ảnh vệ tinh mặt đất độ phân giải cao"
              >
                <span>🛰️ Vệ tinh</span>
              </button>
            </div>

            {/* Nút hành động nhanh: GPS tài xế & Xem toàn cảnh */}
            <div className="flex items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-md gap-1">
              <button
                type="button"
                onClick={handleFlyToUser}
                className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                title="Bay về vị trí GPS của bạn"
                aria-label="Vị trí của tôi"
              >
                <LocateFixed className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleFitAllStations}
                className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                title="Thu phóng bao trọn tất cả trạm sạc"
                aria-label="Xem tất cả"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Leaflet Map DOM Element */}
          <div
            ref={mapContainerRef}
            className="w-full h-full relative z-0"
          />

          {/* Thẻ nổi thông tin trạm đang chọn (Quick Floating Station Card) */}
          {selectedStation && (
            <div className="absolute top-16 left-4 right-4 sm:right-auto sm:max-w-md z-[400] bg-white/95 dark:bg-[#151D2A]/95 backdrop-blur-md border border-sky-500/50 p-4 rounded-2xl shadow-xl space-y-3 transition-all animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {selectedStation.name}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-mono font-semibold">
                      ST-{selectedStation.id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1" title={selectedStation.address}>
                    {selectedStation.address || 'Địa chỉ đang cập nhật'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStationId(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Đóng thẻ thông tin"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Thông số nhanh của trạm đang chọn */}
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 text-xs text-center">
                <div>
                  <span className="text-[10px] text-slate-400 block">KHOẢNG CÁCH</span>
                  <strong className="text-sky-600 dark:text-sky-400 font-mono font-bold text-xs">
                    {selectedStation.distance_km != null ? `${selectedStation.distance_km.toFixed(1)} km` : 'N/A'}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">TRỤ SẴN SÀNG</span>
                  <strong className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                    {(selectedStation.charging_points || []).filter((c) => c.status === 'AVAILABLE').length}/
                    {(selectedStation.charging_points || []).length} trụ
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">CÔNG SUẤT TỐI ĐA</span>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono font-bold text-xs">
                    {(selectedStation.charging_points || []).reduce((m, c) => Math.max(m, c.max_power_kw || 0), 0) || selectedStation.total_grid_capacity_kw || 60} kW
                  </strong>
                </div>
              </div>

              {/* Nút hành động trực tiếp */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStation.latitude},${selectedStation.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-500" />
                  <span>Chỉ đường</span>
                </a>

                <Button
                  variant="primary"
                  size="sm"
                  icon={BatteryCharging}
                  onClick={() => handleChargeAtStation(selectedStation)}
                  className="py-2 text-xs font-bold"
                >
                  Sạc tại trạm này
                </Button>
              </div>
            </div>
          )}

          {/* Map floating legend (Glassmorphism) góc dưới bên trái */}
          <div className="absolute bottom-4 left-4 z-[400] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 p-3 rounded-2xl text-xs text-slate-700 dark:text-slate-300 space-y-1.5 shadow-lg pointer-events-auto">
            <div className="font-semibold text-xs text-slate-900 dark:text-white mb-1">
              Trạng thái trạm sạc
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm"></span>
              <span>Có trụ sẵn sàng</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block shadow-sm"></span>
              <span>Đang phục vụ sạc</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-sm"></span>
              <span>Bảo trì kỹ thuật</span>
            </div>
          </div>
        </div>

        {/* Danh sách trạm sạc gần nhất bên phải */}
        <div className="lg:col-span-5 xl:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151D2A] shadow-soft dark:shadow-soft-dark flex flex-col overflow-hidden">
          
          {/* Header & Bộ lọc tìm kiếm */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <NavigationIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                  Trạm Sạc Gần Bạn ({filteredStations.length})
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Sắp xếp theo khoảng cách
              </span>
            </div>

            {/* Input tìm kiếm */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm theo tên trạm hoặc địa chỉ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 pl-9 pr-9 py-2 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 placeholder:text-slate-400 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Bộ lọc chuẩn sạc dạng Chips & Trạng thái */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
                {['ALL', 'CCS2', 'TYPE_2', 'CHADEMO'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setConnectorFilter(type)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      connectorFilter === type
                        ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30 font-semibold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {type === 'ALL' ? 'Tất cả chuẩn' : type.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <label className="flex items-center space-x-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none shrink-0">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4 border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                />
                <span>Còn trụ</span>
              </label>
            </div>

            {/* Bộ lọc công suất nhanh (>=60kW, >=120kW) */}
            <div className="flex items-center gap-1.5 pt-0.5 text-xs">
              <span className="text-slate-400 text-[11px] font-medium shrink-0">Công suất:</span>
              <button
                type="button"
                onClick={() => setPowerFilter('ALL')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  powerFilter === 'ALL'
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Mọi công suất
              </button>
              <button
                type="button"
                onClick={() => setPowerFilter('FAST')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  powerFilter === 'FAST'
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-bold border border-amber-300 dark:border-amber-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                ⚡ Nhanh (≥60 kW)
              </button>
              <button
                type="button"
                onClick={() => setPowerFilter('ULTRA')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  powerFilter === 'ULTRA'
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-bold border border-rose-300 dark:border-rose-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                ⚡ Siêu nhanh (≥120 kW)
              </button>
            </div>
          </div>

          {/* Danh sách cuộn trạm sạc */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {loading ? (
              <div className="space-y-3">
                <Skeleton variant="card" />
                <Skeleton variant="card" />
                <Skeleton variant="card" />
              </div>
            ) : filteredStations.length === 0 ? (
              <EmptyState
                icon={MapPinOff}
                title="Không tìm thấy trạm sạc phù hợp"
                description="Hãy thử đổi từ khóa tìm kiếm hoặc bỏ chọn các điều kiện lọc để xem thêm trạm sạc khác."
                actionLabel="Đặt lại bộ lọc"
                onAction={() => {
                  setSearchQuery('');
                  setConnectorFilter('ALL');
                  setPowerFilter('ALL');
                  setAvailableOnly(false);
                }}
              />
            ) : (
              filteredStations.map((st) => {
                const isSelected = selectedStationId === st.id;
                const chargers = st.charging_points || [];
                const availableCount = chargers.filter((c) => c.status === 'AVAILABLE').length;
                const totalCount = chargers.length;
                const maxKw = chargers.reduce((m, c) => Math.max(m, c.max_power_kw || 0), 0) || st.total_grid_capacity_kw || 60;

                return (
                  <div
                    key={st.id}
                    id={`driver-station-${st.id}`}
                    onClick={() => handleSelectStation(st)}
                    className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50/70 dark:bg-sky-950/30 border-sky-500 shadow-md ring-1 ring-sky-500/50'
                        : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm'
                    }`}
                  >
                    {/* Header trạm: Tên & Khoảng cách */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                          <span>{st.name}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                            ST-{st.id}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1" title={st.address}>
                          {st.address || 'Địa chỉ đang cập nhật'}
                        </div>
                      </div>

                      {st.distance_km != null && (
                        <div className="shrink-0 text-right">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 font-mono tabular-nums">
                            {st.distance_km.toFixed(1)} km
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Thông số kỹ thuật: Trụ khả dụng & Công suất */}
                    <div className="grid grid-cols-2 gap-2.5 my-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">TRỤ KHẢ DỤNG</div>
                        <div className="font-semibold flex items-center space-x-1.5 mt-0.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              availableCount > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <span className={availableCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                            {availableCount}/{totalCount} trụ sẵn sàng
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">CÔNG SUẤT TỐI ĐA</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center space-x-1 font-mono">
                          <Zap className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          <span>{maxKw} kW</span>
                        </div>
                      </div>
                    </div>

                    {/* Đơn giá & Giờ hoạt động */}
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3.5">
                      <span className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{st.operating_hours || '24/7'}</span>
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        Đơn giá: <strong className="text-amber-600 dark:text-amber-400 font-mono">~3.858 đ/kWh</strong>
                      </span>
                    </div>

                    {/* Nút hành động: Chỉ đường & Sạc tại trạm này */}
                    <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${st.latitude},${st.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all shadow-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-sky-500" />
                        <span>Chỉ đường</span>
                      </a>

                      <Button
                        variant="primary"
                        size="sm"
                        icon={BatteryCharging}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChargeAtStation(st);
                        }}
                        className="py-2 text-xs"
                      >
                        Sạc tại trạm này
                      </Button>
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
