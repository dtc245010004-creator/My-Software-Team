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
  CalendarClock,
} from 'lucide-react';
import api from '../services/api';
import { MAP_CONFIG } from '../config/mapConfig';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ReservationModal from '../components/ReservationModal';

// Danh s├ích th├ánh phß╗æ chß╗ìn nhanh khi kh├┤ng c├│ GPS
const QUICK_CITIES = [
  { name: 'H├á Nß╗Öi', lat: 21.0285, lon: 105.8542 },
  { name: 'Th├íi Nguy├¬n', lat: 21.5928, lon: 105.8442 },
  { name: '─É├á Nß║╡ng', lat: 16.0544, lon: 108.2022 },
  { name: 'TP. Hß╗ô Ch├¡ Minh', lat: 10.7769, lon: 106.7009 },
];

// Tß║ío marker vß╗ï tr├¡ ng╞░ß╗¥i d├╣ng vß╗¢i hiß╗çu ß╗⌐ng s├│ng radar 3D
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

// Tß║ío marker trß║ím sß║íc ─æa th├┤ng tin (Interactive Rich Pin with Station Info Pill)
function createStationMarkerIcon(st, isSelected) {
  const chargers = st.charging_points || [];
  const hasAvailable = chargers.some(
    (cp) => cp.status === 'AVAILABLE' && (cp.connectors || []).some((c) => c.status === 'AVAILABLE')
  );
  const isMaintenance = st.status === 'MAINTENANCE';

  let color = '#10B981'; // Xanh ngß╗ìc: c├│ trß╗Ñ sß║╡n s├áng
  let statusBadgeBg = 'rgba(16, 185, 129, 0.25)';
  let statusDot = '#10B981';

  if (isMaintenance) {
    color = '#F59E0B'; // V├áng hß╗ò ph├ích: bß║úo tr├¼
    statusBadgeBg = 'rgba(245, 158, 11, 0.25)';
    statusDot = '#F59E0B';
  } else if (!hasAvailable) {
    color = '#0284C7'; // Xanh d╞░╞íng: k├¡n tß║úi
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
      <!-- Ghim Pin trß║ím sß║íc EV -->
      <div style="position: relative; width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: ${color}; display: flex; align-items: center; justify-content: center; ${ringGlow} border: 2.5px solid #FFFFFF;">
        <div style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
      </div>

      <!-- Thß║╗ nh├ún t├¬n trß║ím & th├┤ng sß╗æ trß╗▒c tiß║┐p tr├¬n mß║╖t bß║ún ─æß╗ô -->
      <div style="margin-top: 5px; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(8px); border: 1.5px solid ${borderStroke}; padding: 3px 8px; border-radius: 9999px; display: flex; align-items: center; gap: 5px; white-space: nowrap; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); pointer-events: none;">
        <span style="font-size: 11px; font-weight: 700; color: #FFFFFF; font-family: system-ui, -apple-system, sans-serif; letter-spacing: -0.01em;">${st.name}</span>
        <span style="font-size: 10px; font-weight: 700; color: ${statusDot}; background: ${statusBadgeBg}; padding: 1px 6px; border-radius: 9999px; font-family: monospace;">
          ${availableCount}/${totalCount} trß╗Ñ ΓÇó ${maxKw}kW
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
  const { role: userRole } = useAuth();

  // Tß╗ìa ─æß╗Ö ng╞░ß╗¥i d├╣ng v├á trß║íng th├íi ─æß╗ïnh vß╗ï
  const [userCoords, setUserCoords] = useState(null);
  const [locationName, setLocationName] = useState('─Éang ─æß╗ïnh vß╗ï...');
  const [gpsStatus, setGpsStatus] = useState('locating'); // 'locating' | 'granted' | 'denied' | 'custom'

  // Dß╗» liß╗çu trß║ím sß║íc & bß╗Ö lß╗ìc
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStationId, setSelectedStationId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectorFilter, setConnectorFilter] = useState('ALL');
  const [powerFilter, setPowerFilter] = useState('ALL'); // 'ALL' | 'FAST' (>=60kW) | 'ULTRA' (>=120kW)
  const [availableOnly, setAvailableOnly] = useState(false);

  // ─── Đặt chỗ trạm sạc (S-48 / S-49) ─────────────────────────
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);

  // Load số dư ví khi CUSTOMER mở modal
  useEffect(() => {
    if (showReservationModal && userRole === 'CUSTOMER') {
      api.get('/wallet/me')
        .then((r) => setWalletBalance(r.data?.balance ?? null))
        .catch(() => setWalletBalance(null));
    }
    if (!showReservationModal) setSelectedConnector(null);
  }, [showReservationModal, userRole]);

  // Chß║┐ ─æß╗Ö lß╗¢p bß║ún ─æß╗ô: 'street' (─É╞░ß╗¥ng phß╗æ r├╡ n├⌐t mß║╖c ─æß╗ïnh) | 'dark' (Bß║ún ─æß╗ô tß╗æi) | 'satellite' (Vß╗ç tinh)
  const [layerMode, setLayerMode] = useState('street');

  // Tham chiß║┐u Leaflet Map
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const baseLayersRef = useRef({});
  const markersRef = useRef({});
  const userMarkerRef = useRef(null);
  const userRadiusRef = useRef(null);
  const routeLineRef = useRef(null);
  const lastFittedKeyRef = useRef('');

  // Khß╗ƒi tß║ío ─æß╗ïnh vß╗ï vß╗ï tr├¡ ng╞░ß╗¥i d├╣ng
  const detectUserLocation = useCallback(() => {
    setGpsStatus('locating');
    setLocationName('─Éang ─æß╗ïnh vß╗ï GPS thiß║┐t bß╗ï...');

    if (!navigator.geolocation) {
      setGpsStatus('denied');
      const fallback = QUICK_CITIES[1]; // Th├íi Nguy├¬n (khu vß╗▒c trß║ím test)
      setUserCoords({ lat: fallback.lat, lon: fallback.lon });
      setLocationName(fallback.name + ' (Mß║╖c ─æß╗ïnh)');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        setUserCoords(coords);
        setLocationName('Vß╗ï tr├¡ GPS hiß╗çn tß║íi cß╗ºa bß║ín');
        setGpsStatus('granted');
      },
      (error) => {
        console.warn('Lß╗ùi ─æß╗ïnh vß╗ï GPS:', error.message);
        setGpsStatus('denied');
        const fallback = QUICK_CITIES[1]; // Th├íi Nguy├¬n
        setUserCoords({ lat: fallback.lat, lon: fallback.lon });
        setLocationName(fallback.name + ' (Vß╗ï tr├¡ tß║ím)');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    detectUserLocation();
  }, [detectUserLocation]);

  // Nß║íp danh s├ích trß║ím sß║íc tß╗½ backend (c├│ t├¡nh khoß║úng c├ích Haversine khi c├│ userCoords)
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
      console.error('Lß╗ùi nß║íp danh s├ích trß║ím cho t├ái xß║┐:', err);
    } finally {
      setLoading(false);
    }
  }, [userCoords, connectorFilter]);

  useEffect(() => {
    if (userCoords) {
      fetchStations();
    }
  }, [userCoords, fetchStations]);

  // Khß╗ƒi tß║ío bß║ún ─æß╗ô Leaflet
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

      // 1. Lß╗¢p ─É╞░ß╗¥ng phß╗æ ti├¬u chuß║⌐n (Sß║»c n├⌐t, r├╡ t├¬n ─æ╞░ß╗¥ng tiß║┐ng Viß╗çt, m├áu ─æ╞░ß╗¥ng cao tß╗æc / nß╗Öi ─æ├┤ ph├ón biß╗çt)
      const streetLayer = L.tileLayer(MAP_CONFIG.street.url, {
        maxZoom: MAP_CONFIG.street.maxZoom,
        attribution: MAP_CONFIG.street.attribution,
      });

      // 2. Lß╗¢p Bß║ún ─æß╗ô tß╗æi c├┤ng nghß╗ç cao (T╞░╞íng phß║ún cao, t├¬n ─æ╞░ß╗¥ng s├íng r├╡)
      const darkLayer = L.tileLayer(MAP_CONFIG.dark.url, {
        maxZoom: MAP_CONFIG.dark.maxZoom,
        attribution: MAP_CONFIG.dark.attribution,
        className: MAP_CONFIG.dark.className,
      });

      // 3. Lß╗¢p ß║ónh vß╗ç tinh ─æß╗Ö n├⌐t cao
      const satelliteLayer = L.tileLayer(MAP_CONFIG.satellite.url, {
        maxZoom: MAP_CONFIG.satellite.maxZoom,
        attribution: MAP_CONFIG.satellite.attribution,
      });

      // Mß║╖c ─æß╗ïnh nß║íp lß╗¢p ─É╞░ß╗¥ng phß╗æ ─æß╗â t├ái xß║┐ quan s├ít dß╗à nhß║Ñt
      streetLayer.addTo(map);

      baseLayersRef.current = {
        street: streetLayer,
        dark: darkLayer,
        satellite: satelliteLayer,
      };

      mapInstanceRef.current = map;

      // Invalidate size ─æß╗â tr├ính lß╗ùi vß╗í khung
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

  // ─Éß╗òi Tile Layer khi chuyß╗ân chß║┐ ─æß╗Ö (─É╞░ß╗¥ng phß╗æ / Bß║ún ─æß╗ô tß╗æi / Vß╗ç tinh)
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

  // Cß║¡p nhß║¡t marker vß╗ï tr├¡ ng╞░ß╗¥i d├╣ng & v├▓ng tr├▓n s├│ng radar
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userCoords) return;

    // Marker GPS ng╞░ß╗¥i d├╣ng
    if (!userMarkerRef.current) {
      const marker = L.marker([userCoords.lat, userCoords.lon], {
        icon: createUserLocationIcon(),
        zIndexOffset: 1000,
      }).addTo(map);
      marker.bindPopup(`<div style="font-size: 13px; font-weight: 700; padding: 4px; font-family: system-ui;">≡ƒôì ${locationName}</div>`);
      userMarkerRef.current = marker;
    } else {
      userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lon]);
      userMarkerRef.current.setPopupContent(`<div style="font-size: 13px; font-weight: 700; padding: 4px; font-family: system-ui;">≡ƒôì ${locationName}</div>`);
    }

    // V├▓ng tr├▓n b├ín k├¡nh t├¼m kiß║┐m quanh vß╗ï tr├¡ t├ái xß║┐ (1.5 km)
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

    // Bay bß║ún ─æß╗ô ─æß║┐n vß╗ï tr├¡ ng╞░ß╗¥i d├╣ng
    map.flyTo([userCoords.lat, userCoords.lon], 13, { duration: 1.2 });
  }, [userCoords, locationName]);

  // Cß║¡p nhß║¡t markers trß║ím sß║íc tr├¬n bß║ún ─æß╗ô
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // X├│a markers c┼⌐
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

      // Nß╗Öi dung popup trß║ím chi tiß║┐t, sß║»c n├⌐t
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
            ${st.address || 'Kh├┤ng c├│ ─æß╗ïa chß╗ë chi tiß║┐t'}
          </div>

          <div style="background: ${isDark ? '#0F172A' : '#F8FAFC'}; border: 1px solid ${isDark ? '#334155' : '#E2E8F0'}; border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px;">
            <div>
              <span style="color: #64748B; font-size: 11px; display: block;">Khoß║úng c├ích</span>
              <strong style="color: #0284C7; font-size: 13px; font-family: monospace;">${distText || 'N/A'}</strong>
            </div>
            <div>
              <span style="color: #64748B; font-size: 11px; display: block;">C├┤ng suß║Ñt tß╗æi ─æa</span>
              <strong style="color: ${isDark ? '#F1F5F9' : '#0F172A'}; font-size: 13px; font-family: monospace;">${maxKw} kW</strong>
            </div>
            <div>
              <span style="color: #64748B; font-size: 11px; display: block;">Trß╗Ñ sß║╡n s├áng</span>
              <strong style="color: ${availableChargers > 0 ? '#10B981' : '#F59E0B'}; font-size: 13px;">${availableChargers}/${totalChargers} trß╗Ñ</strong>
            </div>
            <div>
              <span style="color: #64748B; font-size: 11px; display: block;">─É╞ín gi├í sß║íc</span>
              <strong style="color: #D97706; font-size: 12px; font-family: monospace;">~3.858 ─æ</strong>
            </div>
          </div>

          <div style="display: flex; gap: 6px;">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${parsedLat},${parsedLng}" target="_blank" rel="noreferrer"
               style="flex: 1; text-align: center; background: #FFFFFF; border: 1px solid #CBD5E1; color: #334155; padding: 7px 10px; border-radius: 8px; text-decoration: none; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
              <span>Chß╗ë ─æ╞░ß╗¥ng</span>
            </a>
            <button id="popup-charge-btn-${st.id}" type="button"
               style="flex: 1.2; text-align: center; background: #0284C7; color: #FFFFFF; padding: 7px 10px; border-radius: 8px; border: none; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.4);">
              <span>ΓÜí Sß║íc ngay</span>
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

  // Cß║¡p nhß║¡t ─æ╞░ß╗¥ng nß╗æi trß╗▒c quan (Direction route line) giß╗»a GPS t├ái xß║┐ v├á trß║ím ─æang chß╗ìn
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
          line.bindTooltip(`≡ƒÜù ${selectedStation.distance_km.toFixed(1)} km`, {
            permanent: true,
            direction: 'center',
            className: 'route-distance-tooltip',
          });
        }

        routeLineRef.current = line;
      }
    }
  }, [selectedStationId, userCoords, stations]);

  // Chß╗ìn th├ánh phß╗æ thß╗º c├┤ng khi GPS tß╗½ chß╗æi hoß║╖c ng╞░ß╗¥i d├╣ng muß╗æn ─æß╗òi khu vß╗▒c
  const handleSelectCity = (city) => {
    setUserCoords({ lat: city.lat, lon: city.lon });
    setLocationName(`Khu vß╗▒c: ${city.name}`);
    setGpsStatus('custom');
    setSelectedStationId(null);
  };

  // Chß╗ìn trß║ím tß╗½ danh s├ích hoß║╖c tß╗½ click marker
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

  // N├║t bay vß╗ü vß╗ï tr├¡ GPS ng╞░ß╗¥i d├╣ng
  const handleFlyToUser = () => {
    const map = mapInstanceRef.current;
    if (map && userCoords) {
      map.flyTo([userCoords.lat, userCoords.lon], 15, { duration: 1.0 });
      if (userMarkerRef.current) {
        userMarkerRef.current.openPopup();
      }
    }
  };

  // N├║t xem bao trß╗ìn tß║Ñt cß║ú trß║ím (Fit All Bounds)
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

  // ─Éiß╗üu h╞░ß╗¢ng sang m├án h├¼nh trß╗Ñ sß║íc cß╗ºa trß║ím n├áy (S-24 / T-52)
  const handleChargeAtStation = (st) => {
    const chargers = st.charging_points || [];
    const availableCharger = chargers.find((c) => c.status === 'AVAILABLE') || chargers[0];
    if (availableCharger) {
      navigate(`/chargers/${availableCharger.id}`);
    } else {
      navigate(`/simulator?station_id=${st.id}`);
    }
  };

  // Mở modal đặt chỗ với connector đã chọn (S-48 / S-49)
  const handleReserveConnector = useCallback((connector, station) => {
    if (userRole !== 'CUSTOMER') return;
    setSelectedConnector({
      id: connector.id,
      connector_number: connector.connector_number,
      max_power_kw: connector.max_power_kw,
      status: connector.status,
      charge_point_code: connector.charge_point_code || station.code || `ST-${station.id}`,
      charge_point_id: connector.charge_point_id || connector.id,
      charge_point_name: connector.name || '',
      station_name: station.name || 'Trạm sạc',
      station_id: station.id,
    });
    setShowReservationModal(true);
  }, [userRole]);

  // Callback khi đặt chỗ thành công
  const handleReservationSuccess = useCallback(() => {
    setShowReservationModal(false);
  }, []);

  // Lß╗ìc danh s├ích trß║ím theo t├¼m kiß║┐m, chuß║⌐n sß║íc, c├┤ng suß║Ñt & trß║íng th├íi
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

  // Trß║ím sß║íc ─æang ─æ╞░ß╗úc chß╗ìn
  const selectedStation = useMemo(() => {
    return stations.find((s) => s.id === selectedStationId) || null;
  }, [stations, selectedStationId]);

  return (
    <div className="space-y-4">
      
      {/* Top Banner: ─Éß╗ïnh vß╗ï & Chß╗ìn th├ánh phß╗æ */}
      <Card padding="p-4" className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 shadow-inner">
            <Compass className={`w-5 h-5 ${gpsStatus === 'locating' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Vß╗ï tr├¡ t├¼m kiß║┐m:
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
              Tß╗▒ ─æß╗Öng sß║»p xß║┐p c├íc trß║ím sß║íc c├┤ng cß╗Öng theo khoß║úng c├ích thß╗▒c tß║┐ gß║ºn bß║ín nhß║Ñt
            </p>
          </div>
        </div>

        {/* N├║t chß╗ìn nhanh khu vß╗▒c & ─æß╗ïnh vß╗ï lß║íi */}
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Khu vß╗▒c:</span>
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
            title="─Éß╗ïnh vß╗ï lß║íi GPS cß╗ºa bß║ín"
            className="rounded-full"
          >
            ─Éß╗ïnh vß╗ï lß║íi
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={Search}
            onClick={() => navigate('/driver/stations')}
            title="Xem danh sách trạm sạc dạng thẻ"
            className="rounded-full"
          >
            Xem dạng danh sách
          </Button>
        </div>
      </Card>

      {/* Cß║únh b├ío khi GPS bß╗ï tß╗½ chß╗æi */}
      {gpsStatus === 'denied' && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3 rounded-2xl text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Tr├¼nh duyß╗çt ch╞░a cß║Ñp quyß╗ün GPS. ─Éang hiß╗ân thß╗ï trß║ím sß║íc khu vß╗▒c Th├íi Nguy├¬n mß║╖c ─æß╗ïnh. Bß║ín c├│ thß╗â chß╗ìn nhanh th├ánh phß╗æ ph├¡a tr├¬n hoß║╖c bß║Ñm "─Éß╗ïnh vß╗ï lß║íi".
            </span>
          </div>
        </div>
      )}

      {/* Layout Split: Tr├íi l├á Bß║ún ─æß╗ô, Phß║úi l├á Danh s├ích trß║ím gß║ºn nhß║Ñt */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-220px)] min-h-[620px]">
        
        {/* Khß╗æi Bß║ún ─æß╗ô t╞░╞íng t├íc ─æa lß╗¢p th├┤ng tin */}
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-soft dark:shadow-soft-dark flex flex-col relative bg-slate-100 dark:bg-slate-900">
          
          {/* Thanh c├┤ng cß╗Ñ ─æiß╗üu khiß╗ân bß║ún ─æß╗ô nß╗òi g├│c tr├¬n (Layer Switcher + Zoom + Center) */}
          <div className="absolute top-3 right-3 z-[400] flex items-center gap-2">
            
            {/* Bß╗Ö chß╗ìn 3 lß╗¢p bß║ún ─æß╗ô: ─É╞░ß╗¥ng phß╗æ (r├╡ n├⌐t) / Tß╗æi / Vß╗ç tinh */}
            <div className="flex items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-md">
              <button
                type="button"
                onClick={() => setLayerMode('street')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 ${
                  layerMode === 'street'
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Bß║ún ─æß╗ô ─æ╞░ß╗¥ng phß╗æ: T├¬n ─æ╞░ß╗¥ng, ─æß╗ïa danh tiß║┐ng Viß╗çt cß╗▒c kß╗│ r├╡ n├⌐t & chi tiß║┐t"
              >
                <span>≡ƒù║∩╕Å ─É╞░ß╗¥ng phß╗æ</span>
              </button>

              <button
                type="button"
                onClick={() => setLayerMode('dark')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 ${
                  layerMode === 'dark'
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Bß║ún ─æß╗ô ─æ├¬m c├┤ng nghß╗ç cao: ─Éß╗Ö t╞░╞íng phß║ún cao, t├¬n ─æ╞░ß╗¥ng s├íng r├╡"
              >
                <span>≡ƒîÖ Bß║ún ─æß╗ô tß╗æi</span>
              </button>

              <button
                type="button"
                onClick={() => setLayerMode('satellite')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 ${
                  layerMode === 'satellite'
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="ß║ónh vß╗ç tinh mß║╖t ─æß║Ñt ─æß╗Ö ph├ón giß║úi cao"
              >
                <span>≡ƒ¢░∩╕Å Vß╗ç tinh</span>
              </button>
            </div>

            {/* N├║t h├ánh ─æß╗Öng nhanh: GPS t├ái xß║┐ & Xem to├án cß║únh */}
            <div className="flex items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-md gap-1">
              <button
                type="button"
                onClick={handleFlyToUser}
                className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                title="Bay vß╗ü vß╗ï tr├¡ GPS cß╗ºa bß║ín"
                aria-label="Vß╗ï tr├¡ cß╗ºa t├┤i"
              >
                <LocateFixed className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleFitAllStations}
                className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                title="Thu ph├│ng bao trß╗ìn tß║Ñt cß║ú trß║ím sß║íc"
                aria-label="Xem tß║Ñt cß║ú"
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

          {/* Thß║╗ nß╗òi th├┤ng tin trß║ím ─æang chß╗ìn (Quick Floating Station Card) */}
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
                    {selectedStation.address || '─Éß╗ïa chß╗ë ─æang cß║¡p nhß║¡t'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStationId(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="─É├│ng thß║╗ th├┤ng tin"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Th├┤ng sß╗æ nhanh cß╗ºa trß║ím ─æang chß╗ìn */}
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 text-xs text-center">
                <div>
                  <span className="text-[10px] text-slate-400 block">KHOß║óNG C├üCH</span>
                  <strong className="text-sky-600 dark:text-sky-400 font-mono font-bold text-xs">
                    {selectedStation.distance_km != null ? `${selectedStation.distance_km.toFixed(1)} km` : 'N/A'}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">TRß╗ñ Sß║┤N S├ÇNG</span>
                  <strong className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                    {(selectedStation.charging_points || []).filter((c) => c.status === 'AVAILABLE').length}/
                    {(selectedStation.charging_points || []).length} trß╗Ñ
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">C├öNG SUß║ñT Tß╗ÉI ─ÉA</span>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono font-bold text-xs">
                    {(selectedStation.charging_points || []).reduce((m, c) => Math.max(m, c.max_power_kw || 0), 0) || selectedStation.total_grid_capacity_kw || 60} kW
                  </strong>
                </div>
              </div>

              {/* N├║t h├ánh ─æß╗Öng trß╗▒c tiß║┐p */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStation.latitude},${selectedStation.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-500" />
                  <span>Chß╗ë ─æ╞░ß╗¥ng</span>
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

                {/* Nút Đặt chỗ — chỉ khi có connector rảnh + role = CUSTOMER */}
                {(selectedStation.charging_points || []).some((c) => c.status === 'AVAILABLE') && userRole === 'CUSTOMER' && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={CalendarClock}
                    onClick={() => {
                      const avail = (selectedStation.charging_points || []).find((c) => c.status === 'AVAILABLE');
                      if (avail) handleReserveConnector(avail, selectedStation);
                    }}
                    className="py-2 text-xs"
                  >
                    Đặt chỗ
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Map floating legend (Glassmorphism) g├│c d╞░ß╗¢i b├¬n tr├íi */}
          <div className="absolute bottom-4 left-4 z-[400] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 p-3 rounded-2xl text-xs text-slate-700 dark:text-slate-300 space-y-1.5 shadow-lg pointer-events-auto">
            <div className="font-semibold text-xs text-slate-900 dark:text-white mb-1">
              Trß║íng th├íi trß║ím sß║íc
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm"></span>
              <span>C├│ trß╗Ñ sß║╡n s├áng</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block shadow-sm"></span>
              <span>─Éang phß╗Ñc vß╗Ñ sß║íc</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-sm"></span>
              <span>Bß║úo tr├¼ kß╗╣ thuß║¡t</span>
            </div>
          </div>
        </div>

        {/* Danh s├ích trß║ím sß║íc gß║ºn nhß║Ñt b├¬n phß║úi */}
        <div className="lg:col-span-5 xl:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151D2A] shadow-soft dark:shadow-soft-dark flex flex-col overflow-hidden">
          
          {/* Header & Bß╗Ö lß╗ìc t├¼m kiß║┐m */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <NavigationIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                  Trß║ím Sß║íc Gß║ºn Bß║ín ({filteredStations.length})
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Sß║»p xß║┐p theo khoß║úng c├ích
              </span>
            </div>

            {/* Input t├¼m kiß║┐m */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="T├¼m theo t├¬n trß║ím hoß║╖c ─æß╗ïa chß╗ë..."
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

            {/* Bß╗Ö lß╗ìc chuß║⌐n sß║íc dß║íng Chips & Trß║íng th├íi */}
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
                    {type === 'ALL' ? 'Tß║Ñt cß║ú chuß║⌐n' : type.replace('_', ' ')}
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
                <span>C├▓n trß╗Ñ</span>
              </label>
            </div>

            {/* Bß╗Ö lß╗ìc c├┤ng suß║Ñt nhanh (>=60kW, >=120kW) */}
            <div className="flex items-center gap-1.5 pt-0.5 text-xs">
              <span className="text-slate-400 text-[11px] font-medium shrink-0">C├┤ng suß║Ñt:</span>
              <button
                type="button"
                onClick={() => setPowerFilter('ALL')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  powerFilter === 'ALL'
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Mß╗ìi c├┤ng suß║Ñt
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
                ΓÜí Nhanh (ΓëÑ60 kW)
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
                ΓÜí Si├¬u nhanh (ΓëÑ120 kW)
              </button>
            </div>
          </div>

          {/* Danh s├ích cuß╗Ön trß║ím sß║íc */}
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
                title="Kh├┤ng t├¼m thß║Ñy trß║ím sß║íc ph├╣ hß╗úp"
                description="H├úy thß╗¡ ─æß╗òi tß╗½ kh├│a t├¼m kiß║┐m hoß║╖c bß╗Å chß╗ìn c├íc ─æiß╗üu kiß╗çn lß╗ìc ─æß╗â xem th├¬m trß║ím sß║íc kh├íc."
                actionLabel="─Éß║╖t lß║íi bß╗Ö lß╗ìc"
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
                    {/* Header trß║ím: T├¬n & Khoß║úng c├ích */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                          <span>{st.name}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                            ST-{st.id}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1" title={st.address}>
                          {st.address || '─Éß╗ïa chß╗ë ─æang cß║¡p nhß║¡t'}
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

                    {/* Th├┤ng sß╗æ kß╗╣ thuß║¡t: Trß╗Ñ khß║ú dß╗Ñng & C├┤ng suß║Ñt */}
                    <div className="grid grid-cols-2 gap-2.5 my-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">TRß╗ñ KHß║ó Dß╗ñNG</div>
                        <div className="font-semibold flex items-center space-x-1.5 mt-0.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              availableCount > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <span className={availableCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                            {availableCount}/{totalCount} trß╗Ñ sß║╡n s├áng
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">C├öNG SUß║ñT Tß╗ÉI ─ÉA</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center space-x-1 font-mono">
                          <Zap className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          <span>{maxKw} kW</span>
                        </div>
                      </div>
                    </div>

                    {/* ─É╞ín gi├í & Giß╗¥ hoß║ít ─æß╗Öng */}
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3.5">
                      <span className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{st.operating_hours || '24/7'}</span>
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        ─É╞ín gi├í: <strong className="text-amber-600 dark:text-amber-400 font-mono">~3.858 ─æ/kWh</strong>
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
                        <span>Chß╗ë ─æ╞░ß╗¥ng</span>
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
                        Sß║íc tß║íi trß║ím n├áy
                      </Button>
                    </div>

                    {/* Nut Dat cho */}
                    {(() => {
                      const chargers = st.charging_points || [];
                      const avail = chargers.find((c) => c.status === 'AVAILABLE');
                      if (avail && userRole === 'CUSTOMER') {
                        return (
                          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                            <Button
                              variant="outline"
                              size="sm"
                              icon={CalendarClock}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReserveConnector(avail, st);
                              }}
                              className="w-full py-2 text-xs"
                            >
                              Dat cho
                            </Button>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      {/* Modal Đặt chỗ */}
      <ReservationModal
        isOpen={showReservationModal}
        onClose={() => setShowReservationModal(false)}
        connector={selectedConnector}
        walletBalance={walletBalance}
        onSuccess={handleReservationSuccess}
      />
    </div>
  );
}