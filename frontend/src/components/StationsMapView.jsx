import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { Layers, Maximize2, AlertTriangle, MapPin, Zap, ExternalLink, Edit2, Compass } from 'lucide-react';
import { MAP_CONFIG } from '../config/mapConfig';

/**
 * Trích xuất và kiểm tra tọa độ GPS hợp lệ từ một station.
 * Xử lý an toàn: null, undefined, chuỗi string số, NaN, hoặc ngoài biên độ toàn cầu.
 */
export function parseCoordinates(station) {
  if (!station) return null;
  const rawLat = station.latitude;
  const rawLng = station.longitude;
  if (rawLat == null || rawLng == null) return null;

  const lat = typeof rawLat === 'string' ? parseFloat(rawLat.trim()) : Number(rawLat);
  const lng = typeof rawLng === 'string' ? parseFloat(rawLng.trim()) : Number(rawLng);

  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

/**
 * Kiểm tra tọa độ nghi ngờ (tọa độ fallback mặc định cũ hoặc nằm ngoài lãnh thổ Việt Nam).
 */
export function isSuspiciousCoordinate(lat, lng) {
  if (lat == null || lng == null) return false;
  // Tọa độ mặc định cũ của form trước đây: 10.7769, 106.7009
  const isDefaultFallback = (Math.abs(lat - 10.7769) < 0.0001 && Math.abs(lng - 106.7009) < 0.0001);
  const isOutOfVN = (lat < 8.0 || lat > 24.0 || lng < 102.0 || lng > 110.0);
  return isDefaultFallback || isOutOfVN;
}

/**
 * Tạo icon SVG chuyên nghiệp cho từng trạm sạc theo trạng thái:
 * - ACTIVE / ONLINE: Xanh lá (#10B981)
 * - WARNING / MAINTENANCE: Vàng cam (#F59E0B)
 * - OFFLINE / INACTIVE: Đỏ (#EF4444)
 */
function createStationMarkerIcon(station, isSuspicious) {
  let pinColor = '#10B981'; // Xanh lá mặc định: Hoạt động tốt
  let statusText = 'HOẠT ĐỘNG';

  if (!station.is_active || station.status === 'INACTIVE' || station.status === 'OFFLINE') {
    pinColor = '#EF4444'; // Đỏ: Ngoại tuyến / Tạm dừng
    statusText = 'NGOẠI TUYẾN';
  } else if (station.status === 'MAINTENANCE') {
    pinColor = '#F59E0B'; // Vàng cam: Bảo trì / Cảnh báo
    statusText = 'BẢO TRÌ';
  }

  const strokeColor = isSuspicious ? '#EAB308' : '#FFFFFF';
  const strokeWidth = isSuspicious ? '2' : '1.5';

  const html = `
    <div style="position: relative; width: 38px; height: 46px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease;">
      <svg width="38" height="46" viewBox="0 0 26 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 4px 10px ${pinColor}88);">
        <path d="M13 0C5.82 0 0 5.82 0 13C0 21.5 13 32 13 32C13 32 26 21.5 26 13C26 5.82 20.18 0 13 0Z" fill="${pinColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
        <circle cx="13" cy="12.5" r="7" fill="#0B132B"/>
        <!-- Biểu tượng tia sét sạc xe điện EV -->
        <path d="M13.5 7.5L10 13H13L12.5 17.5L16 12H13L13.5 7.5Z" fill="${pinColor}"/>
      </svg>
      ${
        isSuspicious
          ? `<div style="position: absolute; top: -3px; right: 0px; width: 15px; height: 15px; background: #EAB308; color: #000; border-radius: 50%; font-size: 10px; font-weight: 900; display: flex; align-items: center; justify-content: center; border: 1.5px solid #0B132B;" title="Tọa độ nghi ngờ mặc định">!</div>`
          : ''
      }
    </div>
  `;

  return L.divIcon({
    className: `station-ev-marker ${isSuspicious ? 'suspicious' : ''}`,
    html: html,
    iconSize: [38, 46],
    iconAnchor: [19, 46],
    popupAnchor: [0, -42],
  });
}

export default function StationsMapView({
  stations = [],
  onSelectStationDetail,
  onEditStation,
  focusStationId = null,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const baseLayersRef = useRef({});
  const markersMapRef = useRef({});
  const lastFittedKeyRef = useRef('');

  // Nền bản đồ mặc định: 'street' (Esri World Street Map - rõ đường phố, tên đường, địa danh)
  const [layerMode, setLayerMode] = useState('street');

  // Lọc và chuẩn hóa danh sách trạm có và chưa có tọa độ GPS hợp lệ
  const { stationsWithCoords, stationsWithoutCoords } = useMemo(() => {
    const withCoords = [];
    const withoutCoords = [];

    stations.forEach((st) => {
      const coords = parseCoordinates(st);
      if (coords) {
        withCoords.push({
          ...st,
          parsedLat: coords.lat,
          parsedLng: coords.lng,
        });
      } else {
        withoutCoords.push(st);
      }
    });

    return { stationsWithCoords: withCoords, stationsWithoutCoords: withoutCoords };
  }, [stations]);

  // Thống kê trạng thái thực tế phục vụ Chú giải (Legend)
  const legendStats = useMemo(() => {
    let active = 0;
    let maintenance = 0;
    let inactive = 0;
    let suspicious = 0;

    stationsWithCoords.forEach((st) => {
      if (isSuspiciousCoordinate(st.parsedLat, st.parsedLng)) {
        suspicious++;
      }
      if (!st.is_active || st.status === 'INACTIVE' || st.status === 'OFFLINE') {
        inactive++;
      } else if (st.status === 'MAINTENANCE') {
        maintenance++;
      } else {
        active++;
      }
    });

    return {
      active,
      maintenance,
      inactive,
      suspicious,
      total: stationsWithCoords.length,
    };
  }, [stationsWithCoords]);

  // Khởi tạo bản đồ Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Tính toán tâm khởi tạo: nếu có trạm thì center vào trạm đầu tiên hoặc bounds
      let initialCenter = MAP_CONFIG.defaultCenter;
      let initialZoom = MAP_CONFIG.defaultZoom;

      if (stationsWithCoords.length === 1) {
        initialCenter = [stationsWithCoords[0].parsedLat, stationsWithCoords[0].parsedLng];
        initialZoom = 15;
      } else if (stationsWithCoords.length > 1) {
        const bounds = L.latLngBounds(stationsWithCoords.map((st) => [st.parsedLat, st.parsedLng]));
        initialCenter = bounds.getCenter();
        initialZoom = 13;
      }

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: true,
        scrollWheelZoom: true,
        touchZoom: true,
      });

      // Lớp 1: Bản đồ đường phố (Street Map / Light) - MẶC ĐỊNH
      const streetLayer = L.tileLayer(MAP_CONFIG.street?.url || MAP_CONFIG.light.url, {
        attribution: MAP_CONFIG.street?.attribution || MAP_CONFIG.light.attribution,
        maxZoom: 19,
        className: '',
      });

      // Lớp 2: Bản đồ nền tối công nghệ (Dark Gray Canvas)
      const darkLayer = L.tileLayer(MAP_CONFIG.dark.url, {
        attribution: MAP_CONFIG.dark.attribution,
        maxZoom: 16,
        className: '',
      });

      // Lớp 3: Ảnh vệ tinh độ nét cao (World Imagery)
      const satelliteLayer = L.tileLayer(MAP_CONFIG.satellite.url, {
        attribution: MAP_CONFIG.satellite.attribution,
        maxZoom: 19,
        className: '',
      });

      // Kích hoạt Street Layer mặc định
      streetLayer.addTo(map);

      baseLayersRef.current = {
        street: streetLayer,
        dark: darkLayer,
        satellite: satelliteLayer,
      };

      mapInstanceRef.current = map;

      // Đảm bảo Leaflet tính toán đúng kích thước khung hiển thị
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Xử lý chuyển đổi lớp bản đồ (Đường phố / Bản đồ tối / Ảnh vệ tinh)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !baseLayersRef.current.street) return;

    // Gỡ tất cả lớp base cũ
    Object.values(baseLayersRef.current).forEach((layer) => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    // Thêm lớp được chọn
    const activeLayer = baseLayersRef.current[layerMode] || baseLayersRef.current.street;
    activeLayer.addTo(map);
  }, [layerMode]);

  // Vẽ các Marker trạm sạc và Popup thông tin
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Xóa sạch các marker cũ trước khi vẽ lại
    Object.values(markersMapRef.current).forEach((marker) => {
      map.removeLayer(marker);
    });
    markersMapRef.current = {};

    // Trường hợp không có trạm sạc nào có GPS hợp lệ
    if (stationsWithCoords.length === 0) {
      map.setView(MAP_CONFIG.defaultCenter, MAP_CONFIG.defaultZoom);
      return;
    }

    // Vẽ từng trạm sạc
    stationsWithCoords.forEach((st) => {
      const isSuspicious = isSuspiciousCoordinate(st.parsedLat, st.parsedLng);
      const icon = createStationMarkerIcon(st, isSuspicious);
      const marker = L.marker([st.parsedLat, st.parsedLng], { icon }).addTo(map);

      // Thống kê số lượng trụ và cổng sạc thực tế (nếu có từ API)
      const chargers = st.charging_points || [];
      const totalChargers = chargers.length;
      let totalConnectors = 0;
      let availableConnectors = 0;

      chargers.forEach((cp) => {
        const cons = cp.connectors || [];
        totalConnectors += cons.length;
        cons.forEach((c) => {
          if (c.status === 'AVAILABLE') {
            availableConnectors++;
          }
        });
      });

      // Xác định nhãn trạng thái hiển thị
      let statusBadgeClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      let statusLabel = '● ĐANG HOẠT ĐỘNG';
      if (!st.is_active || st.status === 'INACTIVE' || st.status === 'OFFLINE') {
        statusBadgeClass = 'bg-red-500/15 text-red-400 border-red-500/30';
        statusLabel = '● NGOẠI TUYẾN';
      } else if (st.status === 'MAINTENANCE') {
        statusBadgeClass = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
        statusLabel = '● BẢO TRÌ';
      }

      // Xây dựng nội dung Popup card chuẩn yêu cầu (hiển thị dữ liệu thực tế, không fake field)
      const popupContainer = document.createElement('div');
      popupContainer.className = 'font-sans text-xs p-1 space-y-2.5 min-w-[260px] text-slate-800 dark:text-slate-100';

      popupContainer.innerHTML = `
        <div class="border-b border-slate-200 dark:border-slate-700/80 pb-2">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="font-bold text-sm text-cyan-600 dark:text-cyan-400 leading-tight flex items-center gap-1">
                <span>⚡</span>
                <span>${st.name}</span>
              </div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">ST-${st.id}</div>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded font-bold border whitespace-nowrap ${statusBadgeClass}">
              ${statusLabel}
            </span>
          </div>
        </div>

        ${
          isSuspicious
            ? `
          <div class="p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 text-[10px] flex items-start gap-1.5 leading-snug">
            <span class="text-xs">⚠️</span>
            <div>
              <span class="font-bold block">Tọa độ nghi ngờ mặc định</span>
              Vui lòng kiểm tra và chấm lại vị trí thực tế của trạm trên bản đồ.
            </div>
          </div>
        `
            : ''
        }

        <div class="space-y-1 text-[11px]">
          ${
            st.total_grid_capacity_kw != null
              ? `<div><span class="text-slate-500 dark:text-slate-400">Công suất:</span> <strong class="text-cyan-600 dark:text-cyan-400 font-mono font-bold">${st.total_grid_capacity_kw} kW</strong></div>`
              : ''
          }
          ${
            totalChargers > 0
              ? `<div><span class="text-slate-500 dark:text-slate-400">Trụ sạc:</span> <strong class="text-slate-700 dark:text-slate-200">${totalChargers} trụ</strong>${
                  totalConnectors > 0
                    ? ` • <span class="text-slate-500 dark:text-slate-400">Cổng:</span> <strong class="text-slate-700 dark:text-slate-200">${totalConnectors} cổng</strong> <span class="text-emerald-600 dark:text-emerald-400 font-semibold">(${availableConnectors} sẵn sàng)</span>`
                    : ''
                }</div>`
              : ''
          }
          ${
            st.address
              ? `<div class="leading-relaxed"><span class="text-slate-500 dark:text-slate-400">Địa chỉ:</span> <span class="text-slate-700 dark:text-slate-200">${st.address}</span></div>`
              : ''
          }
          ${
            st.operating_hours
              ? `<div><span class="text-slate-500 dark:text-slate-400">Giờ hoạt động:</span> <span class="text-slate-700 dark:text-slate-300">${st.operating_hours}</span></div>`
              : ''
          }
          <div class="text-[10px] text-slate-400 font-mono pt-0.5">GPS: ${st.parsedLat.toFixed(5)}, ${st.parsedLng.toFixed(5)}</div>
        </div>

        <div class="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/80">
          <button type="button" class="btn-detail flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-cyan-700 dark:text-cyan-300 hover:text-cyan-800 dark:hover:text-white rounded text-[11px] font-semibold transition-colors text-center">
            Xem chi tiết
          </button>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${st.parsedLat},${st.parsedLng}" target="_blank" rel="noreferrer" class="py-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 shadow-sm" title="Mở chỉ đường trên Google Maps">
            <span>Chỉ đường</span>
          </a>
        </div>
      `;

      // Gắn sự kiện click xem chi tiết
      const detailBtn = popupContainer.querySelector('.btn-detail');
      if (detailBtn) {
        detailBtn.addEventListener('click', () => {
          if (onSelectStationDetail) onSelectStationDetail(st);
        });
      }

      marker.bindPopup(popupContainer, { maxWidth: 300, minWidth: 240 });
      markersMapRef.current[st.id] = marker;
    });

    // Xử lý Focus vào trạm được chỉ định (từ danh sách bấm sang)
    if (focusStationId && markersMapRef.current[focusStationId]) {
      const targetStation = stationsWithCoords.find((s) => s.id === focusStationId);
      if (targetStation) {
        map.flyTo([targetStation.parsedLat, targetStation.parsedLng], 16, { duration: 0.8 });
        setTimeout(() => {
          markersMapRef.current[focusStationId]?.openPopup();
        }, 850);
        return;
      }
    }

    // Tự động fitBounds thông minh khi dữ liệu trạm thay đổi (tránh zoom loop bằng fingerprint)
    const currentDataFingerprint = stationsWithCoords
      .map((s) => `${s.id}:${s.parsedLat.toFixed(4)},${s.parsedLng.toFixed(4)}`)
      .join('|');

    if (currentDataFingerprint !== lastFittedKeyRef.current) {
      lastFittedKeyRef.current = currentDataFingerprint;

      if (stationsWithCoords.length === 1) {
        const single = stationsWithCoords[0];
        map.setView([single.parsedLat, single.parsedLng], 15);
      } else if (stationsWithCoords.length > 1) {
        const bounds = L.latLngBounds(stationsWithCoords.map((st) => [st.parsedLat, st.parsedLng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }
  }, [stationsWithCoords, focusStationId, onSelectStationDetail]);

  // Hàm xử lý nút "XEM TẤT CẢ": tự động fit bao trọn tất cả trạm có animation mượt, không reload trang
  const handleFitAll = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (stationsWithCoords.length === 0) {
      map.flyTo(MAP_CONFIG.defaultCenter, MAP_CONFIG.defaultZoom, { duration: 0.8 });
    } else if (stationsWithCoords.length === 1) {
      const single = stationsWithCoords[0];
      map.flyTo([single.parsedLat, single.parsedLng], 15, { duration: 0.8 });
      setTimeout(() => {
        markersMapRef.current[single.id]?.openPopup();
      }, 850);
    } else {
      const bounds = L.latLngBounds(stationsWithCoords.map((st) => [st.parsedLat, st.parsedLng]));
      map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 15, duration: 0.8 });
    }
  }, [stationsWithCoords]);

  return (
    <div className="space-y-3 font-sans">
      {/* Thông báo nếu có trạm chưa có tọa độ GPS hợp lệ */}
      {stationsWithoutCoords.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-wrap items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span>
              Phát hiện <strong className="text-white">{stationsWithoutCoords.length} trạm sạc</strong> chưa có tọa độ vị trí GPS hợp lệ trên bản đồ.
            </span>
          </div>

          <div className="flex items-center space-x-1.5 flex-wrap gap-1">
            {stationsWithoutCoords.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onEditStation && onEditStation(st)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-[11px] text-amber-200 hover:text-white flex items-center space-x-1 transition-colors"
                title={`Định vị cho trạm ${st.name}`}
              >
                <Edit2 className="w-3 h-3" />
                <span>Định vị ST-{st.id} ({st.name})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Khung bản đồ toàn cảnh */}
      <div className="relative rounded-xl overflow-hidden border border-slate-700/60 bg-slate-900 shadow-xl">
        {/* Thanh điều khiển nổi góc trên bên phải (không che nút Zoom Leaflet ở góc trên bên trái) */}
        <div className="absolute top-3 right-3 z-[1000] flex items-center space-x-2 bg-slate-900/90 dark:bg-slate-900/95 p-1 rounded-lg border border-slate-700/80 shadow-2xl backdrop-blur-md">
          {/* Nút Xem tất cả */}
          <button
            type="button"
            onClick={handleFitAll}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center space-x-1.5 transition-colors shadow-sm"
            title="Tự động thu phóng ôm trọn tất cả các trạm sạc"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>XEM TẤT CẢ</span>
          </button>

          {/* Nhóm nút chọn nền bản đồ (Ưu tiên Đường phố / Street map theo yêu cầu) */}
          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-md border border-slate-700/50">
            <button
              type="button"
              onClick={() => setLayerMode('street')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                layerMode === 'street'
                  ? 'bg-slate-700 text-cyan-300 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Bản đồ đường phố rõ nét, dễ đọc tên phố"
            >
              Đường phố
            </button>
            <button
              type="button"
              onClick={() => setLayerMode('dark')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                layerMode === 'dark'
                  ? 'bg-slate-700 text-cyan-300 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Bản đồ nền tối công nghệ hiện đại"
            >
              Bản đồ tối
            </button>
            <button
              type="button"
              onClick={() => setLayerMode('satellite')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                layerMode === 'satellite'
                  ? 'bg-slate-700 text-cyan-300 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Ảnh vệ tinh mặt đất độ phân giải cao"
            >
              Vệ tinh
            </button>
          </div>
        </div>

        {/* Thông báo trường hợp không có trạm nào có GPS */}
        {stationsWithCoords.length === 0 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000] bg-slate-900/90 border border-slate-700 p-4 rounded-xl shadow-2xl backdrop-blur-md text-center">
            <MapPin className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <div className="font-semibold text-slate-200 text-sm">Chưa có vị trí trạm</div>
            <div className="text-xs text-slate-400 mt-1 max-w-xs">
              Các trạm sạc hiện chưa được thiết lập tọa độ GPS hợp lệ. Hãy bấm &quot;Định vị&quot; để ghim trạm lên bản đồ.
            </div>
          </div>
        )}

        {/* Leaflet Map DOM Element Container */}
        <div
          ref={mapContainerRef}
          style={{ height: '620px', width: '100%', zIndex: 1 }}
          className="cursor-grab active:cursor-grabbing"
        />

        {/* Thanh chú giải (Legend) góc dưới bên trái (không che attribution bản quyền ở góc dưới bên phải) */}
        <div className="absolute bottom-4 left-3 z-[1000] bg-slate-900/90 border border-slate-700/80 p-3 rounded-lg shadow-2xl backdrop-blur-md text-xs text-slate-300 space-y-2 pointer-events-auto max-w-xs">
          <div className="font-bold text-white flex items-center justify-between pb-1.5 border-b border-slate-700/80">
            <span>CHÚ GIẢI TRẠM SẠC</span>
            <span className="text-cyan-400 font-mono">{legendStats.total} trạm hiển thị</span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                <span>Đang hoạt động</span>
              </div>
              <span className="font-mono font-bold text-emerald-400">{legendStats.active}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm" />
                <span>Bảo trì / Cảnh báo</span>
              </div>
              <span className="font-mono font-bold text-amber-400">{legendStats.maintenance}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm" />
                <span>Ngoại tuyến / Tạm dừng</span>
              </div>
              <span className="font-mono font-bold text-red-400">{legendStats.inactive}</span>
            </div>

            {legendStats.suspicious > 0 && (
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-700/50 text-amber-400">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-300/40" />
                  <span>Tọa độ nghi ngờ</span>
                </div>
                <span className="font-mono font-bold">{legendStats.suspicious}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
