import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import {
  Navigation as NavigationIcon,
  Zap,
  Clock,
  MapPin,
  ExternalLink,
  LocateFixed,
  ChevronDown,
  ChevronUp,
  Compass,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { MAP_CONFIG } from '../../config/mapConfig';
import { useTheme } from '../../context/ThemeContext';
import { calculateRemainingHoldTime } from '../../utils/reservationUtils';

// Danh sách vị trí mẫu cho tài xế kiểm thử khi GPS không bật
const SAMPLE_DRIVER_LOCATIONS = [
  { name: 'Trung tâm TP. Thái Nguyên', lat: 21.5928, lon: 105.8442 },
  { name: 'Khu công nghiệp Sông Công', lat: 21.4925, lon: 105.8192 },
  { name: 'Đại học Thái Nguyên', lat: 21.5835, lon: 105.8155 },
  { name: 'Hà Nội (Khu vực Cầu Giấy)', lat: 21.0333, lon: 105.7833 },
];

// Tạo marker vị trí tài xế với hiệu ứng radar 3D
function createDriverMarkerIcon() {
  const html = `
    <div style="position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background: rgba(2, 132, 199, 0.3); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: rgba(2, 132, 199, 0.5);"></div>
      <div style="width: 16px; height: 16px; border-radius: 50%; background: #0284C7; border: 3px solid #FFFFFF; box-shadow: 0 2px 10px rgba(2, 132, 199, 0.9);"></div>
    </div>
  `;
  return L.divIcon({
    className: 'driver-gps-marker',
    html: html,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

// Tạo marker trạm sạc đang giữ chỗ
function createReservedStationIcon(isCompleted = false) {
  const color = isCompleted ? '#10B981' : '#0284C7';
  const html = `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
      <div style="position: relative; width: 40px; height: 40px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: ${color}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); border: 2.5px solid #FFFFFF;">
        <div style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
      </div>
    </div>
  `;
  return L.divIcon({
    className: 'station-reserved-marker',
    html: html,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -38],
  });
}

// Tính khoảng cách Haversine giữa 2 tọa độ (km)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function ReservationRouteMap({
  reservation,
  now = new Date(),
  onClose,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const stationMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const tileLayerRef = useRef(null);

  const { isDark } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [driverCoords, setDriverCoords] = useState(() => ({
    lat: 21.5928,
    lon: 105.8442,
    source: 'default',
  }));
  const [gpsStatus, setGpsStatus] = useState('requesting'); // 'ready', 'denied', 'custom'

  // Lấy tọa độ trạm sạc từ reservation
  const stationCoords = useMemo(() => {
    if (!reservation) return null;
    const lat =
      reservation.station_latitude ??
      reservation.latitude ??
      (reservation.station_name?.includes('THAI NGUYEN') ? 21.5335 : 21.5335);
    const lon =
      reservation.station_longitude ??
      reservation.longitude ??
      (reservation.station_name?.includes('THAI NGUYEN') ? 105.8755 : 105.8755);
    return { lat: Number(lat), lon: Number(lon) };
  }, [reservation]);

  // Cố gắng lấy GPS thực tế của tài xế
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('denied');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDriverCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          source: 'gps',
        });
        setGpsStatus('ready');
      },
      (err) => {
        console.warn('Không thể lấy GPS tài xế, sử dụng vị trí mặc định:', err.message);
        setGpsStatus('denied');
        // Nếu trạm ở Thái Nguyên thì vị trí tài xế mặc định ở trung tâm Thái Nguyên
        setDriverCoords({
          lat: 21.5928,
          lon: 105.8442,
          source: 'sample',
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Tính khoảng cách và thời gian di chuyển ước tính
  const distanceInfo = useMemo(() => {
    if (!driverCoords || !stationCoords) return null;
    const distKm = calculateHaversineDistance(
      driverCoords.lat,
      driverCoords.lon,
      stationCoords.lat,
      stationCoords.lon
    );
    // Vận tốc nội đô trung bình xe điện ~ 32 km/h
    const minutes = Math.max(2, Math.round((distKm / 32) * 60));
    return {
      km: distKm,
      formattedKm: distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`,
      minutes,
      formattedTime: minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}p` : `${minutes} phút`,
    };
  }, [driverCoords, stationCoords]);

  // Khởi tạo và cập nhật bản đồ Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || isCollapsed) return;

    if (!mapInstanceRef.current) {
      const initialCenter = stationCoords
        ? [stationCoords.lat, stationCoords.lon]
        : [21.5335, 105.8755];

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 14,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const tileConfig = isDark ? MAP_CONFIG.dark : MAP_CONFIG.street;
      const layer = L.tileLayer(tileConfig.url, {
        maxZoom: tileConfig.maxZoom || 19,
        attribution: tileConfig.attribution,
        className: tileConfig.className,
      }).addTo(map);

      tileLayerRef.current = layer;
      mapInstanceRef.current = map;
    } else {
      // Cập nhật tile khi đổi theme sáng/tối
      const map = mapInstanceRef.current;
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }
      const tileConfig = isDark ? MAP_CONFIG.dark : MAP_CONFIG.street;
      tileLayerRef.current = L.tileLayer(tileConfig.url, {
        maxZoom: tileConfig.maxZoom || 19,
        attribution: tileConfig.attribution,
        className: tileConfig.className,
      }).addTo(map);
    }

    const map = mapInstanceRef.current;

    // 1. Cập nhật marker tài xế
    if (driverCoords) {
      if (driverMarkerRef.current) {
        map.removeLayer(driverMarkerRef.current);
      }
      const marker = L.marker([driverCoords.lat, driverCoords.lon], {
        icon: createDriverMarkerIcon(),
      }).addTo(map);
      marker.bindPopup(
        `<div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
          <strong style="color: #0284C7; display: block; margin-bottom: 2px;">📍 Vị trí của bạn (Tài xế)</strong>
          <span>Đang cách trạm sạc: <b>${distanceInfo?.formattedKm || '...'}</b></span>
        </div>`
      );
      driverMarkerRef.current = marker;
    }

    // 2. Cập nhật marker trạm sạc
    if (stationCoords && reservation) {
      if (stationMarkerRef.current) {
        map.removeLayer(stationMarkerRef.current);
      }
      const isComp = reservation.status === 'COMPLETED';
      const marker = L.marker([stationCoords.lat, stationCoords.lon], {
        icon: createReservedStationIcon(isComp),
      }).addTo(map);
      marker.bindPopup(
        `<div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
          <strong style="color: ${isComp ? '#10B981' : '#0284C7'}; display: block; margin-bottom: 4px;">⚡ ${
          reservation.station_name || 'Trạm sạc đã đặt'
        }</strong>
          <span style="display: block; font-size: 11px; opacity: 0.85;">Trụ #${reservation.charger_code || '1'} • Cổng #${
          reservation.connector_number || '1'
        } (${reservation.connector_type || 'CCS2'})</span>
          <span style="display: block; font-size: 11px; margin-top: 2px;">Địa chỉ: ${
            reservation.station_address || 'Khu CNC Thái Nguyên'
          }</span>
        </div>`
      );
      stationMarkerRef.current = marker;
    }

    // 3. Vẽ đường nối trực quan (Direction route line) giữa tài xế và trạm sạc
    if (driverCoords && stationCoords) {
      if (routeLineRef.current) {
        map.removeLayer(routeLineRef.current);
      }
      const line = L.polyline(
        [
          [driverCoords.lat, driverCoords.lon],
          [stationCoords.lat, stationCoords.lon],
        ],
        {
          color: reservation?.status === 'COMPLETED' ? '#10B981' : '#0284C7',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.9,
        }
      ).addTo(map);

      if (distanceInfo) {
        line.bindTooltip(
          `🚗 ${distanceInfo.formattedKm} (~${distanceInfo.formattedTime})`,
          {
            permanent: true,
            direction: 'center',
            className: 'route-distance-tooltip font-bold text-xs',
          }
        );
      }
      routeLineRef.current = line;

      // Fit bounds để hiển thị cân đối cả tài xế và trạm sạc
      try {
        const bounds = L.latLngBounds([
          [driverCoords.lat, driverCoords.lon],
          [stationCoords.lat, stationCoords.lon],
        ]);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      } catch (e) {
        console.warn('Lỗi fitBounds map:', e);
      }
    }
  }, [driverCoords, stationCoords, reservation, isDark, isCollapsed, distanceInfo]);

  // Clean up
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  if (!reservation) return null;

  const remaining = calculateRemainingHoldTime(reservation.valid_until, now);
  const isCompleted = reservation.status === 'COMPLETED';
  const isActive = reservation.status === 'ACTIVE';

  // Link mở Google Maps dẫn đường thực tế trên điện thoại/máy tính
  const googleMapsUrl =
    driverCoords && stationCoords
      ? `https://www.google.com/maps/dir/?api=1&origin=${driverCoords.lat},${driverCoords.lon}&destination=${stationCoords.lat},${stationCoords.lon}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${stationCoords?.lat || 21.5335},${stationCoords?.lon || 105.8755}`;

  return (
    <div
      id="reservation-route-map-panel"
      className="bg-white dark:bg-[#151D2A] border-2 border-sky-300 dark:border-sky-800/80 rounded-2xl shadow-md overflow-hidden transition-all mb-4"
    >
      {/* Thanh tiêu đề & Thông tin dẫn đường nhanh */}
      <div className="p-4 bg-gradient-to-r from-sky-50 via-white to-blue-50/40 dark:from-sky-950/40 dark:via-[#151D2A] dark:to-blue-950/20 border-b border-sky-200 dark:border-sky-900/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 flex-wrap">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
              BẢN ĐỒ DẪN ĐƯỜNG TỚI TRẠM SẠC ĐÃ ĐẶT CHỖ
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200">
              #{reservation.reservation_code || `RES-${reservation.id}`}
            </span>
            {isActive && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 animate-pulse flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>Giữ chỗ còn lại: {remaining.text}</span>
              </span>
            )}
            {isCompleted && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Đã đến cắm súng thành công</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <strong className="font-bold text-slate-900 dark:text-slate-100">
              {reservation.station_name}
            </strong>
            <span>•</span>
            <span>Trụ #{reservation.charger_code}</span>
            <span>•</span>
            <span>Cổng #{reservation.connector_number} ({reservation.connector_type})</span>
          </div>
        </div>

        {/* Khung tóm tắt khoảng cách + Nút thao tác */}
        <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-1.5">
          {distanceInfo && (
            <div className="px-3 py-1.5 rounded-xl bg-sky-100/80 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800/80 text-xs font-bold text-sky-900 dark:text-sky-200 flex items-center space-x-2 shadow-sm">
              <NavigationIcon className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>{distanceInfo.formattedKm}</span>
              <span className="text-slate-400 dark:text-slate-600">|</span>
              <span>~{distanceInfo.formattedTime}</span>
            </div>
          )}

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm flex items-center space-x-1"
            title="Mở ứng dụng Google Maps để bắt đầu dẫn đường theo thời gian thực"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Mở Google Maps</span>
            <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
          </a>

          <Link
            to={`/chargers/${reservation.charge_point_id || reservation.charger_id}?connector_id=${reservation.connector_id || ''}`}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-all shadow-sm flex items-center space-x-1"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Đến trụ sạc</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
            title={isCollapsed ? 'Mở rộng bản đồ' : 'Thu gọn bản đồ'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Thân bản đồ Leaflet */}
      {!isCollapsed && (
        <div className="relative">
          <div
            ref={mapContainerRef}
            className="w-full h-72 sm:h-80 z-0 bg-slate-100 dark:bg-slate-900"
            style={{ minHeight: '300px' }}
          />

          {/* Thanh công cụ nổi chọn nhanh vị trí tài xế (Mô phỏng di chuyển) */}
          <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 dark:bg-[#151D2A]/95 backdrop-blur-md border border-slate-200 dark:border-slate-800/80 rounded-xl p-2 shadow-lg text-xs space-y-1.5 max-w-xs">
            <div className="flex items-center justify-between font-semibold text-[11px] text-slate-700 dark:text-slate-300">
              <span className="flex items-center space-x-1">
                <LocateFixed className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                <span>Vị trí tài xế:</span>
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  gpsStatus === 'ready'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
              >
                {gpsStatus === 'ready' ? 'GPS Trực tiếp' : 'Vị trí mẫu'}
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              {SAMPLE_DRIVER_LOCATIONS.map((loc) => {
                const isSelected =
                  Math.abs(driverCoords.lat - loc.lat) < 0.001 &&
                  Math.abs(driverCoords.lon - loc.lon) < 0.001;
                return (
                  <button
                    key={loc.name}
                    type="button"
                    onClick={() => {
                      setDriverCoords({ lat: loc.lat, lon: loc.lon, source: 'sample' });
                      setGpsStatus('custom');
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      isSelected
                        ? 'bg-sky-600 text-white font-bold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {loc.name.split('(')[0].trim()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

