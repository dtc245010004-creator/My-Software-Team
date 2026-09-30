import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { Layers, Maximize2, ExternalLink, AlertTriangle, CheckCircle2, MapPin, Eye, Edit2 } from 'lucide-react';
import { MAP_CONFIG } from '../config/mapConfig';

// Kiểm tra tọa độ nghi ngờ (tọa độ fallback mặc định cũ hoặc nằm ngoài lãnh thổ Việt Nam)
export function isSuspiciousCoordinate(lat, lng) {
  if (lat == null || lng == null) return false;
  // Tọa độ mặc định cũ của form trước đây: 10.7769, 106.7009
  const isDefaultFallback = (Math.abs(lat - 10.7769) < 0.0001 && Math.abs(lng - 106.7009) < 0.0001);
  const isOutOfVN = (lat < 8.0 || lat > 24.0 || lng < 102.0 || lng > 110.0);
  return isDefaultFallback || isOutOfVN;
}

// Tạo icon SVG cho từng trạm theo trạng thái
function createStationMarkerIcon(station, isSuspicious) {
  let pinColor = '#10B981'; // ACTIVE (xanh lá)
  if (!station.is_active) {
    pinColor = '#64748B'; // INACTIVE / OFFLINE (xám)
  } else if (station.status === 'MAINTENANCE') {
    pinColor = '#F59E0B'; // MAINTENANCE (vàng cam)
  }

  // Nếu tọa độ nghi ngờ -> viền cảnh báo vàng
  const strokeColor = isSuspicious ? '#EAB308' : '#0A0F1D';
  const strokeWidth = isSuspicious ? '2' : '1';

  const html = `
    <div style="position: relative; width: 34px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <svg width="34" height="40" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 2px 8px ${isSuspicious ? 'rgba(234,179,8,0.8)' : pinColor + '88'});">
        <path d="M12 0C5.37258 0 0 5.37258 0 12C0 19.5 12 28 12 28C12 28 24 19.5 24 12C24 5.37258 18.6274 0 12 0Z" fill="${pinColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
        <circle cx="12" cy="11" r="6" fill="#0A0F1D"/>
        <path d="M12.5 6.5L9.5 11.5H12L11.5 15.5L14.5 10.5H12L12.5 6.5Z" fill="${isSuspicious ? '#EAB308' : pinColor}"/>
      </svg>
      ${
        isSuspicious
          ? `<div style="position: absolute; top: -3px; right: -2px; width: 14px; height: 14px; background: #EAB308; color: #000; border-radius: 50%; font-size: 10px; font-weight: bold; display: flex; align-items: center; justify-content: center; border: 1.5px solid #0B0F17;" title="Tọa độ nghi ngờ mặc định">!</div>`
          : ''
      }
    </div>
  `;

  return L.divIcon({
    className: `station-pin-marker ${isSuspicious ? 'suspicious' : ''}`,
    html: html,
    iconSize: [34, 40],
    iconAnchor: [17, 40],
    popupAnchor: [0, -38],
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

  const [layerMode, setLayerMode] = useState('dark');

  // Lọc danh sách trạm có và chưa có tọa độ
  const { stationsWithCoords, stationsWithoutCoords } = useMemo(() => {
    const withCoords = [];
    const withoutCoords = [];
    stations.forEach((st) => {
      if (st.latitude != null && st.longitude != null && !isNaN(st.latitude) && !isNaN(st.longitude)) {
        withCoords.push(st);
      } else {
        withoutCoords.push(st);
      }
    });
    return { stationsWithCoords: withCoords, stationsWithoutCoords: withoutCoords };
  }, [stations]);

  // Thống kê trạng thái cho Legend
  const legendStats = useMemo(() => {
    let active = 0;
    let maintenance = 0;
    let inactive = 0;
    let suspicious = 0;

    stationsWithCoords.forEach((st) => {
      if (isSuspiciousCoordinate(st.latitude, st.longitude)) {
        suspicious++;
      }
      if (!st.is_active) {
        inactive++;
      } else if (st.status === 'MAINTENANCE') {
        maintenance++;
      } else {
        active++;
      }
    });

    return { active, maintenance, inactive, suspicious, total: stationsWithCoords.length };
  }, [stationsWithCoords]);

  // Khởi tạo bản đồ Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: MAP_CONFIG.defaultCenter,
        zoom: MAP_CONFIG.defaultZoom,
        zoomControl: true,
        scrollWheelZoom: true,
        touchZoom: true,
      });

      // Lớp bản đồ tối (OpenStreetMap + CSS filter .map-tiles-dark)
      const darkLayer = L.tileLayer(MAP_CONFIG.dark.url, {
        attribution: MAP_CONFIG.dark.attribution,
        maxZoom: MAP_CONFIG.dark.maxZoom,
        className: MAP_CONFIG.dark.className,
      });

      // Lớp ảnh vệ tinh (Esri World Imagery)
      const esriSatellite = L.tileLayer(MAP_CONFIG.satellite.url, {
        attribution: MAP_CONFIG.satellite.attribution,
        maxZoom: MAP_CONFIG.satellite.maxZoom,
        className: MAP_CONFIG.satellite.className,
      });

      darkLayer.addTo(map);
      baseLayersRef.current = { dark: darkLayer, satellite: esriSatellite };
      mapInstanceRef.current = map;

      // Fix kích thước hiển thị ban đầu
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

  // Xử lý chuyển đổi lớp Bản đồ tối / Ảnh vệ tinh
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !baseLayersRef.current.dark) return;

    if (layerMode === 'dark') {
      map.removeLayer(baseLayersRef.current.satellite);
      baseLayersRef.current.dark.addTo(map);
    } else {
      map.removeLayer(baseLayersRef.current.dark);
      baseLayersRef.current.satellite.addTo(map);
    }
  }, [layerMode]);

  // Vẽ các marker trạm sạc và popup
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Xóa các marker cũ
    Object.values(markersMapRef.current).forEach((marker) => {
      map.removeLayer(marker);
    });
    markersMapRef.current = {};

    if (stationsWithCoords.length === 0) {
      map.setView(MAP_CONFIG.defaultCenter, MAP_CONFIG.defaultZoom);
      return;
    }

    // Vẽ từng trạm
    stationsWithCoords.forEach((st) => {
      const isSuspicious = isSuspiciousCoordinate(st.latitude, st.longitude);
      const icon = createStationMarkerIcon(st, isSuspicious);
      const marker = L.marker([st.latitude, st.longitude], { icon }).addTo(map);

      // Tính số trụ rảnh
      const chargers = st.charging_points || [];
      const availableChargersCount = chargers.filter((c) => c.status === 'AVAILABLE').length;

      // Xây dựng DOM cho Popup (style tối cao cấp)
      const popupContainer = document.createElement('div');
      popupContainer.className = 'font-mono text-xs text-tech-white space-y-2 p-1 min-w-[240px]';

      popupContainer.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-700/60 pb-1.5">
          <div>
            <div class="font-bold text-sm text-cyan-300 leading-tight">${st.name}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">MÃ: ST-${st.id}</div>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded font-bold ${
            st.status === 'ACTIVE'
              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
              : 'bg-amber-950/80 text-amber-400 border border-amber-500/40'
          }">
            ${st.status}
          </span>
        </div>

        ${
          isSuspicious
            ? `
          <div class="p-2 rounded bg-amber-950/50 border border-amber-500/50 text-amber-300 text-[10px] flex items-start space-x-1.5 leading-snug">
            <span class="text-xs">⚠️</span>
            <div>
              <span class="font-bold block">Tọa độ nghi ngờ mặc định!</span>
              Trạm này có thể chưa được chấm đúng vị trí thực tế trên bản đồ.
            </div>
          </div>
        `
            : ''
        }

        <div class="space-y-1 text-[11px] text-slate-300">
          <div><span class="text-slate-400">Địa chỉ:</span> ${st.address}</div>
          <div><span class="text-slate-400">Công suất lưới:</span> <span class="text-cyan-400 font-bold">${st.total_grid_capacity_kw} kW</span></div>
          <div><span class="text-slate-400">Giờ hoạt động:</span> ${st.operating_hours || '24/7'}</div>
          <div><span class="text-slate-400">Trụ sạc:</span> <span class="font-bold text-slate-200">${chargers.length} trụ</span> / <span class="text-emerald-400 font-bold">${availableChargersCount} đang rảnh</span></div>
          <div class="text-[10px] text-slate-400 font-mono">GPS: ${st.latitude.toFixed(6)}, ${st.longitude.toFixed(6)}</div>
        </div>

        <div class="flex items-center space-x-2 pt-2 border-t border-slate-700/60">
          <button type="button" class="btn-detail flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white rounded text-[11px] font-bold transition-colors flex items-center justify-center space-x-1">
            <span>XEM CHI TIẾT</span>
          </button>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${st.latitude},${st.longitude}" target="_blank" rel="noreferrer" class="py-1.5 px-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-bold transition-colors flex items-center justify-center space-x-1" title="Chỉ đường qua Google Maps">
            <span>CHỈ ĐƯỜNG</span>
          </a>
        </div>
      `;

      // Gắn sự kiện click cho nút Xem chi tiết
      const detailBtn = popupContainer.querySelector('.btn-detail');
      if (detailBtn) {
        detailBtn.addEventListener('click', () => {
          if (onSelectStationDetail) onSelectStationDetail(st);
        });
      }

      marker.bindPopup(popupContainer, { maxWidth: 300 });
      markersMapRef.current[st.id] = marker;
    });

    // FitBounds ôm hết các trạm hoặc zoom vào trạm được chỉ định
    if (focusStationId && markersMapRef.current[focusStationId]) {
      const targetStation = stationsWithCoords.find((s) => s.id === focusStationId);
      if (targetStation) {
        map.flyTo([targetStation.latitude, targetStation.longitude], 16, { duration: 1.2 });
        setTimeout(() => {
          markersMapRef.current[focusStationId]?.openPopup();
        }, 1300);
        return;
      }
    }

    // Tự động fitBounds
    if (stationsWithCoords.length === 1) {
      const single = stationsWithCoords[0];
      map.setView([single.latitude, single.longitude], 15);
    } else if (stationsWithCoords.length > 1) {
      const bounds = L.latLngBounds(stationsWithCoords.map((st) => [st.latitude, st.longitude]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [stationsWithCoords, focusStationId]);

  // Hàm fitBounds lại toàn cảnh các trạm
  const handleFitAll = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (stationsWithCoords.length === 0) {
      map.setView(MAP_CONFIG.defaultCenter, MAP_CONFIG.defaultZoom);
    } else if (stationsWithCoords.length === 1) {
      map.setView([stationsWithCoords[0].latitude, stationsWithCoords[0].longitude], 15);
    } else {
      const bounds = L.latLngBounds(stationsWithCoords.map((st) => [st.latitude, st.longitude]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  };

  return (
    <div className="space-y-3 font-mono">
      {/* Cảnh báo trạm chưa có tọa độ */}
      {stationsWithoutCoords.length > 0 && (
        <div className="p-3 rounded bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs flex flex-wrap items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span>
              Phát hiện <strong className="text-white">{stationsWithoutCoords.length} trạm sạc</strong> chưa có tọa độ vị trí GPS trên bản đồ.
            </span>
          </div>

          <div className="flex items-center space-x-1.5 flex-wrap gap-1">
            {stationsWithoutCoords.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onEditStation && onEditStation(st)}
                className="px-2 py-1 rounded bg-panel hover:bg-panel-hover border border-amber-500/50 text-[10px] text-amber-200 hover:text-white flex items-center space-x-1 transition-colors"
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
      <div className="relative rounded overflow-hidden border border-hairline bg-obsidian shadow-xl">
        {/* Thanh điều khiển nổi góc trên bên phải */}
        <div className="absolute top-3 right-3 z-10 flex items-center space-x-1.5 bg-panel/90 p-1 rounded border border-hairline shadow-2xl backdrop-blur-sm">
          <button
            type="button"
            onClick={handleFitAll}
            className="px-2.5 py-1 rounded text-[11px] font-bold bg-obsidian hover:bg-panel-hover text-tech-white border border-hairline flex items-center space-x-1 transition-colors"
            title="Thu phóng ôm trọn tất cả trạm sạc"
          >
            <Maximize2 className="w-3.5 h-3.5 text-electric-cyan" />
            <span>XEM TẤT CẢ</span>
          </button>

          <button
            type="button"
            onClick={() => setLayerMode(layerMode === 'dark' ? 'satellite' : 'dark')}
            className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-colors flex items-center space-x-1 ${
              layerMode === 'satellite'
                ? 'bg-electric-cyan text-obsidian border-electric-cyan'
                : 'bg-obsidian text-steel-gray border-hairline hover:text-tech-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{layerMode === 'satellite' ? 'ẢNH VỆ TINH' : 'BẢN ĐỒ TỐI'}</span>
          </button>
        </div>

        {/* Leaflet Map DOM Element */}
        <div
          ref={mapContainerRef}
          style={{ height: '600px', width: '100%', zIndex: 1 }}
          className="cursor-grab active:cursor-grabbing"
        />

        {/* Thanh chú giải (Legend) góc dưới bên trái (không che attribution góc phải) */}
        <div className="absolute bottom-4 left-3 z-10 bg-panel/95 border border-hairline p-2.5 rounded shadow-2xl backdrop-blur-sm text-[11px] text-steel-gray space-y-1.5 pointer-events-auto max-w-xs">
          <div className="font-bold text-tech-white flex items-center justify-between pb-1 border-b border-hairline">
            <span>CHÚ GIẢI TRẠM SẠC</span>
            <span className="text-electric-cyan">{legendStats.total} trạm hiển thị</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-grid-green flex-shrink-0" />
              <span>Đang hoạt động ({legendStats.active})</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
              <span>Bảo trì ({legendStats.maintenance})</span>
            </div>
            {legendStats.inactive > 0 && (
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 flex-shrink-0" />
                <span>Không hoạt động ({legendStats.inactive})</span>
              </div>
            )}
            {legendStats.suspicious > 0 && (
              <div className="flex items-center space-x-1.5 text-amber-400">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0 ring-1 ring-amber-300" />
                <span>Tọa độ nghi ngờ ({legendStats.suspicious})</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
