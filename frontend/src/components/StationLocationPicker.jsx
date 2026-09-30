import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { MapPin, Navigation, Layers, Search, AlertCircle, CheckCircle2, Crosshair } from 'lucide-react';
import provincesData from '../data/provinces.json';
import { geocode, reverseGeocode } from '../services/geocoding';
import { MAP_CONFIG } from '../config/mapConfig';

// Custom SVG Pin Icon cho trạm sạc điện
const customPinIcon = L.divIcon({
  className: 'custom-ev-pin',
  html: `
    <div style="position: relative; width: 32px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: grab;">
      <svg width="32" height="38" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 2px 8px rgba(0, 242, 254, 0.7));">
        <path d="M12 0C5.37258 0 0 5.37258 0 12C0 19.5 12 28 12 28C12 28 24 19.5 24 12C24 5.37258 18.6274 0 12 0Z" fill="#00F2FE"/>
        <circle cx="12" cy="11" r="6" fill="#0A0F1D"/>
        <path d="M12.5 6.5L9.5 11.5H12L11.5 15.5L14.5 10.5H12L12.5 6.5Z" fill="#00F2FE"/>
      </svg>
    </div>
  `,
  iconSize: [32, 38],
  iconAnchor: [16, 38],
  popupAnchor: [0, -38],
});

// Giới hạn tọa độ lãnh thổ Việt Nam
const VN_BOUNDS = {
  minLat: 8.0,
  maxLat: 24.0,
  minLng: 102.0,
  maxLng: 110.0,
};

export default function StationLocationPicker({
  initialLat = null,
  initialLng = null,
  initialAddress = '',
  onChangeLocation,
  validationError = null,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const baseLayersRef = useRef({});

  // Trạng thái tọa độ & ghim
  const [lat, setLat] = useState(initialLat != null ? parseFloat(initialLat) : null);
  const [lng, setLng] = useState(initialLng != null ? parseFloat(initialLng) : null);
  const [hasPin, setHasPin] = useState(initialLat != null && initialLng != null);

  // Lớp bản đồ: 'dark' (OpenStreetMap tối) | 'satellite' (Esri World Imagery)
  const [layerMode, setLayerMode] = useState('dark');

  // Các trường địa chỉ phân cấp
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [commune, setCommune] = useState('');
  const [detailAddress, setDetailAddress] = useState('');

  // Tìm kiếm tỉnh/thành
  const [provinceSearch, setProvinceSearch] = useState('');
  const [isProvinceDropdownOpen, setIsProvinceDropdownOpen] = useState(false);

  // Trạng thái phản hồi & định vị
  const [geocodingLoading, setGeocodingLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // Debounce ref
  const debounceTimerRef = useRef(null);

  // Khởi tạo địa chỉ từ initialAddress nếu có
  useEffect(() => {
    if (initialAddress && !province && !district && !commune && !detailAddress) {
      setDetailAddress(initialAddress);
    }
  }, [initialAddress]);

  // Khởi tạo bản đồ Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter = (lat != null && lng != null) ? [lat, lng] : MAP_CONFIG.defaultCenter;
      const defaultZoom = (lat != null && lng != null) ? 16 : MAP_CONFIG.defaultZoom;

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: true,
        scrollWheelZoom: true,
        touchZoom: true,
      });

      // Lớp bản đồ tối: OpenStreetMap kết hợp CSS filter .map-tiles-dark
      const darkLayer = L.tileLayer(MAP_CONFIG.dark.url, {
        attribution: MAP_CONFIG.dark.attribution,
        maxZoom: MAP_CONFIG.dark.maxZoom,
        className: MAP_CONFIG.dark.className,
      });

      // Lớp ảnh vệ tinh: Esri World Imagery (không filter tối)
      const esriSatellite = L.tileLayer(MAP_CONFIG.satellite.url, {
        attribution: MAP_CONFIG.satellite.attribution,
        maxZoom: MAP_CONFIG.satellite.maxZoom,
        className: MAP_CONFIG.satellite.className,
      });

      darkLayer.addTo(map);
      baseLayersRef.current = { dark: darkLayer, satellite: esriSatellite };
      mapInstanceRef.current = map;

      // Nếu đã có tọa độ ban đầu -> cắm ghim ngay
      if (lat != null && lng != null) {
        addOrMoveMarker(lat, lng, map);
      } else if (initialAddress) {
        // Trạm cũ chưa có tọa độ -> cố gắng geocode từ địa chỉ văn bản có sẵn
        attemptGeocodeFromInitialAddress(initialAddress, map);
      }

      // Xử lý sự kiện click lên bản đồ để chấm ghim
      map.on('click', (e) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        handlePinPlaced(clickLat, clickLng, true);
      });

      // Sửa lỗi vỡ ô gạch (invalidateSize)
      setTimeout(() => {
        map.invalidateSize();
      }, 300);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Xử lý đổi lớp nền bản đồ
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

  // Cố gắng geocode từ initialAddress khi mở trạm cũ chưa có tọa độ
  const attemptGeocodeFromInitialAddress = async (addr, map) => {
    if (!addr || !addr.trim()) return;
    setGeocodingLoading(true);
    try {
      const result = await geocode(`${addr.trim()}, Việt Nam`, [addr.trim()]);
      if (result && map) {
        map.flyTo([result.lat, result.lon], 16, { duration: 1.2 });
        addOrMoveMarker(result.lat, result.lon, map);
        setLat(result.lat);
        setLng(result.lon);
        setHasPin(true);
        notifyParent(result.lat, result.lon, addr);
        setInfoMessage('Đã tự động xác định vị trí sơ bộ từ địa chỉ cũ. Vui lòng kéo ghim đến đúng vị trí.');
      }
    } catch (err) {
      console.warn('Không thể geocode địa chỉ ban đầu:', err);
    } finally {
      setGeocodingLoading(false);
    }
  };

  // Cắm hoặc di chuyển ghim trên bản đồ
  const addOrMoveMarker = (markerLat, markerLng, mapInstance = mapInstanceRef.current) => {
    if (!mapInstance) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([markerLat, markerLng]);
    } else {
      const marker = L.marker([markerLat, markerLng], {
        icon: customPinIcon,
        draggable: true,
      }).addTo(mapInstance);

      marker.on('dragend', (event) => {
        const position = event.target.getLatLng();
        handlePinPlaced(position.lat, position.lng, false);
      });

      markerRef.current = marker;
    }
  };

  // Thông báo dữ liệu mới lên component cha
  const notifyParent = useCallback((newLat, newLng, currentAddr) => {
    if (onChangeLocation) {
      onChangeLocation({
        latitude: newLat != null ? parseFloat(newLat.toFixed(6)) : null,
        longitude: newLng != null ? parseFloat(newLng.toFixed(6)) : null,
        address: currentAddr,
        province,
        district,
        commune,
        detailAddress,
      });
    }
  }, [onChangeLocation, province, district, commune, detailAddress]);

  // Xử lý khi ghim được đặt hoặc kéo
  const handlePinPlaced = async (newLat, newLng, shouldFly = false) => {
    const roundedLat = parseFloat(newLat.toFixed(6));
    const roundedLng = parseFloat(newLng.toFixed(6));

    setLat(roundedLat);
    setLng(roundedLng);
    setHasPin(true);
    setLocationError(null);
    setInfoMessage(null);

    // Kiểm tra phạm vi biên giới Việt Nam
    if (
      roundedLat < VN_BOUNDS.minLat ||
      roundedLat > VN_BOUNDS.maxLat ||
      roundedLng < VN_BOUNDS.minLng ||
      roundedLng > VN_BOUNDS.maxLng
    ) {
      setLocationError('Vị trí ghim nằm ngoài lãnh thổ Việt Nam (Vĩ độ: 8 - 24, Kinh độ: 102 - 110).');
    }

    if (mapInstanceRef.current) {
      addOrMoveMarker(roundedLat, roundedLng, mapInstanceRef.current);
      if (shouldFly) {
        mapInstanceRef.current.panTo([roundedLat, roundedLng]);
      }
    }

    // Ghép địa chỉ hiện tại
    const assembledAddr = assembleFullAddress();

    // Reverse geocode gợi ý địa chỉ nếu địa chỉ đang để trống
    if (!detailAddress && !province && !district && !commune) {
      try {
        const suggested = await reverseGeocode(roundedLat, roundedLng);
        if (suggested) {
          setDetailAddress(suggested);
          notifyParent(roundedLat, roundedLng, suggested);
          return;
        }
      } catch (err) {
        console.warn('Lỗi reverse geocode:', err);
      }
    }

    notifyParent(roundedLat, roundedLng, assembledAddr);
  };

  // Ghép chuỗi địa chỉ từ chi tiết đến tổng quát
  const assembleFullAddress = () => {
    const parts = [
      detailAddress?.trim(),
      commune?.trim(),
      district?.trim(),
      province?.trim(),
    ].filter(Boolean);
    return parts.join(', ');
  };

  // Xử lý tìm kiếm & bay tới vị trí theo địa chỉ nhập
  const performGeocoding = async (customParts = null) => {
    const p = customParts?.province ?? province;
    const d = customParts?.district ?? district;
    const c = customParts?.commune ?? commune;
    const dt = customParts?.detailAddress ?? detailAddress;

    if (!p && !d && !c && !dt) return;

    setGeocodingLoading(true);
    setInfoMessage(null);

    // Xây dựng danh sách fallback từ cụ thể đến tổng quát
    const queries = [];
    if (dt && c && d && p) queries.push(`${dt}, ${c}, ${d}, ${p}, Việt Nam`);
    if (dt && d && p) queries.push(`${dt}, ${d}, ${p}, Việt Nam`);
    if (c && d && p) queries.push(`${c}, ${d}, ${p}, Việt Nam`);
    if (d && p) queries.push(`${d}, ${p}, Việt Nam`);
    if (p) queries.push(`${p}, Việt Nam`);

    const primaryQuery = queries[0] || `${p}, Việt Nam`;
    const fallbackList = queries.slice(1);

    try {
      const result = await geocode(primaryQuery, fallbackList);

      if (result && mapInstanceRef.current) {
        let zoomLevel = 9;
        if (dt) zoomLevel = 17;
        else if (c) zoomLevel = 14;
        else if (d) zoomLevel = 12;
        else if (p) zoomLevel = 9;

        mapInstanceRef.current.flyTo([result.lat, result.lon], zoomLevel, {
          duration: 1.2,
        });

        setInfoMessage(`Đã tìm thấy: ${result.displayName}. Hãy chấm lên bản đồ để chốt tọa độ chính xác.`);
      } else {
        setInfoMessage('Không tìm thấy vị trí tự động, hãy tự chấm trực tiếp lên bản đồ.');
      }
    } catch (err) {
      setInfoMessage('Không thể kết nối dịch vụ định danh. Vui lòng tự chấm vị trí trên bản đồ.');
    } finally {
      setGeocodingLoading(false);
      notifyParent(lat, lng, assembleFullAddress());
    }
  };

  // Lên lịch debounced geocoding (>= 500ms)
  const scheduleDebouncedGeocode = (newParts) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      performGeocoding(newParts);
    }, 600);
  };

  // Chọn tỉnh/thành từ danh sách
  const handleSelectProvince = (prov) => {
    setProvince(prov.name);
    setIsProvinceDropdownOpen(false);
    setProvinceSearch('');

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([prov.lat, prov.lon], 9, { duration: 1.0 });
    }

    const newParts = { province: prov.name, district, commune, detailAddress };
    notifyParent(lat, lng, [detailAddress, commune, district, prov.name].filter(Boolean).join(', '));
  };

  // Nhập tay tọa độ
  const handleManualCoordChange = (newLatStr, newLngStr) => {
    const parsedLat = parseFloat(newLatStr);
    const parsedLng = parseFloat(newLngStr);

    setLat(isNaN(parsedLat) ? null : parsedLat);
    setLng(isNaN(parsedLng) ? null : parsedLng);

    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      setHasPin(true);
      if (mapInstanceRef.current) {
        addOrMoveMarker(parsedLat, parsedLng, mapInstanceRef.current);
        mapInstanceRef.current.panTo([parsedLat, parsedLng]);
      }
      notifyParent(parsedLat, parsedLng, assembleFullAddress());
    }
  };

  // Dùng vị trí hiện tại (navigator.geolocation)
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Trình duyệt của bạn không hỗ trợ định vị GPS.');
      return;
    }

    setGeocodingLoading(true);
    setLocationError(null);
    setInfoMessage('Đang lấy vị trí GPS từ thiết bị...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeocodingLoading(false);
        const curLat = pos.coords.latitude;
        const curLng = pos.coords.longitude;

        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([curLat, curLng], 17, { duration: 1.2 });
        }
        handlePinPlaced(curLat, curLng, true);
        setInfoMessage('Đã định vị thành công vị trí hiện tại của bạn.');
      },
      (err) => {
        setGeocodingLoading(false);
        let msg = 'Không thể lấy vị trí hiện tại.';
        if (err.code === 1) {
          msg = 'Bạn đã từ chối cấp quyền truy cập vị trí. Vui lòng cho phép quyền trong trình duyệt hoặc tự chấm trên bản đồ.';
        } else if (err.code === 2) {
          msg = 'Vị trí hiện tại không khả dụng hoặc tín hiệu GPS yếu.';
        } else if (err.code === 3) {
          msg = 'Hết thời gian chờ định vị GPS.';
        }
        setLocationError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Lọc danh sách tỉnh/thành
  const filteredProvinces = useMemo(() => {
    if (!provinceSearch.trim()) return provincesData;
    return provincesData.filter((p) =>
      p.name.toLowerCase().includes(provinceSearch.toLowerCase().trim())
    );
  }, [provinceSearch]);

  return (
    <div className="space-y-3 font-mono text-xs text-tech-white">
      {/* Bước 1: Dòng hướng dẫn & Điều khiển lớp */}
      <div className="bg-obsidian border border-hairline p-2.5 rounded flex items-center justify-between">
        <div className="flex items-center space-x-2 text-steel-gray">
          <MapPin className="w-4 h-4 text-electric-cyan flex-shrink-0" />
          <span className="text-[11px] leading-tight">
            Chọn tỉnh/thành, nhập xã/làng để thu hẹp, rồi chấm lên bản đồ để chốt vị trí chính xác
          </span>
        </div>

        {/* Nút đổi lớp bản đồ */}
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          <button
            type="button"
            onClick={() => setLayerMode(layerMode === 'dark' ? 'satellite' : 'dark')}
            className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors flex items-center space-x-1 ${
              layerMode === 'satellite'
                ? 'bg-electric-cyan text-obsidian border-electric-cyan'
                : 'bg-panel text-steel-gray border-hairline hover:text-tech-white'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{layerMode === 'satellite' ? 'ẢNH VỆ TINH' : 'BẢN ĐỒ TỐI'}</span>
          </button>
        </div>
      </div>

      {/* Bước 2: Các trường mô tả địa chỉ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-panel/40 p-2.5 rounded border border-hairline">
        {/* Tỉnh / Thành phố */}
        <div className="relative">
          <label className="text-[10px] text-steel-gray block mb-1 uppercase font-bold">
            1. TỈNH / THÀNH PHỐ
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Chọn hoặc tìm tỉnh/thành..."
              value={provinceSearch || province}
              onChange={(e) => {
                setProvinceSearch(e.target.value);
                setIsProvinceDropdownOpen(true);
              }}
              onFocus={() => setIsProvinceDropdownOpen(true)}
              className="w-full bg-obsidian border border-hairline p-1.5 rounded text-tech-white text-xs focus:outline-none focus:border-electric-cyan"
            />
            <Search className="w-3.5 h-3.5 absolute right-2 top-2 text-steel-gray pointer-events-none" />
          </div>

          {isProvinceDropdownOpen && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto bg-panel border border-hairline rounded shadow-2xl">
              {filteredProvinces.length === 0 ? (
                <div className="p-2 text-steel-gray text-[11px]">Không tìm thấy tỉnh/thành</div>
              ) : (
                filteredProvinces.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProvince(p)}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-obsidian transition-colors text-xs text-tech-white flex items-center justify-between"
                  >
                    <span>{p.name}</span>
                    <span className="text-[10px] text-steel-gray font-mono">{p.lat.toFixed(2)}, {p.lon.toFixed(2)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Quận / Huyện / Thị xã */}
        <div>
          <label className="text-[10px] text-steel-gray block mb-1 uppercase font-bold">
            2. QUẬN / HUYỆN / THỊ XÃ
          </label>
          <input
            type="text"
            placeholder="Ví dụ: Bình Thạnh, Hải Hậu..."
            value={district}
            onChange={(e) => {
              const val = e.target.value;
              setDistrict(val);
              scheduleDebouncedGeocode({ province, district: val, commune, detailAddress });
            }}
            className="w-full bg-obsidian border border-hairline p-1.5 rounded text-tech-white text-xs focus:outline-none focus:border-electric-cyan"
          />
        </div>

        {/* Phường / Xã / Thôn / Làng */}
        <div>
          <label className="text-[10px] text-steel-gray block mb-1 uppercase font-bold">
            3. PHƯỜNG / XÃ / THÔN / LÀNG
          </label>
          <input
            type="text"
            placeholder="Ví dụ: Phường 22, Xã An Bình..."
            value={commune}
            onChange={(e) => {
              const val = e.target.value;
              setCommune(val);
              scheduleDebouncedGeocode({ province, district, commune: val, detailAddress });
            }}
            className="w-full bg-obsidian border border-hairline p-1.5 rounded text-tech-white text-xs focus:outline-none focus:border-electric-cyan"
          />
        </div>

        {/* Địa chỉ chi tiết (số nhà, đường) */}
        <div>
          <label className="text-[10px] text-steel-gray block mb-1 uppercase font-bold">
            4. ĐỊA CHỈ CHI TIẾT (SỐ NHÀ, ĐƯỜNG)
          </label>
          <div className="flex space-x-1">
            <input
              type="text"
              placeholder="Ví dụ: 720A Điện Biên Phủ"
              value={detailAddress}
              onChange={(e) => {
                const val = e.target.value;
                setDetailAddress(val);
                scheduleDebouncedGeocode({ province, district, commune, detailAddress: val });
              }}
              className="flex-1 bg-obsidian border border-hairline p-1.5 rounded text-tech-white text-xs focus:outline-none focus:border-electric-cyan"
            />
            <button
              type="button"
              disabled={geocodingLoading}
              onClick={() => performGeocoding()}
              className="px-2.5 py-1.5 bg-panel border border-electric-cyan/40 hover:border-electric-cyan text-electric-cyan rounded text-[11px] font-bold flex items-center space-x-1 transition-colors"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{geocodingLoading ? '...' : 'ĐỊNH VỊ'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Thông báo thông tin / gợi ý */}
      {infoMessage && (
        <div className="p-2 rounded bg-electric-cyan/10 border border-electric-cyan/30 text-electric-cyan text-[11px] flex items-center space-x-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{infoMessage}</span>
        </div>
      )}

      {/* Bước 1 & 3: Bản đồ Leaflet Container */}
      <div className="relative rounded overflow-hidden border border-hairline bg-obsidian">
        <div
          ref={mapContainerRef}
          style={{ height: '340px', width: '100%', zIndex: 1 }}
          className="cursor-crosshair"
        />

        {/* Nút Dùng vị trí hiện tại nổi trên bản đồ */}
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          title="Dùng vị trí hiện tại của tôi"
          className="absolute bottom-3 right-3 z-10 bg-panel/90 hover:bg-panel border border-electric-cyan/60 hover:border-electric-cyan text-electric-cyan px-2.5 py-1.5 rounded text-[11px] font-bold flex items-center space-x-1.5 shadow-xl transition-all"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>VỊ TRÍ HIỆN TẠI</span>
        </button>
      </div>

      {/* Bước 3: Tọa độ & Trạng thái chốt ghim */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-obsidian rounded border border-hairline">
        <div className="flex items-center space-x-3">
          <div>
            <span className="text-[10px] text-steel-gray block">VĨ ĐỘ (LAT):</span>
            <input
              type="number"
              step="0.000001"
              placeholder="Chưa ghim"
              value={lat != null ? lat : ''}
              onChange={(e) => handleManualCoordChange(e.target.value, lng != null ? lng : '')}
              className="w-28 bg-panel border border-hairline px-2 py-0.5 rounded text-tech-white text-xs font-bold font-mono focus:border-electric-cyan"
            />
          </div>
          <div>
            <span className="text-[10px] text-steel-gray block">KINH ĐỘ (LNG):</span>
            <input
              type="number"
              step="0.000001"
              placeholder="Chưa ghim"
              value={lng != null ? lng : ''}
              onChange={(e) => handleManualCoordChange(lat != null ? lat : '', e.target.value)}
              className="w-28 bg-panel border border-hairline px-2 py-0.5 rounded text-tech-white text-xs font-bold font-mono focus:border-electric-cyan"
            />
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-steel-gray block">TRẠNG THÁI GHIM:</span>
          {hasPin && lat != null && lng != null ? (
            <span className="text-grid-green text-[11px] font-bold flex items-center justify-end space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>ĐÃ CHẤM TỌA ĐỘ</span>
            </span>
          ) : (
            <span className="text-critical-red text-[11px] font-bold flex items-center justify-end space-x-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>CHƯA CÓ GHIM</span>
            </span>
          )}
        </div>
      </div>

      {/* Lỗi vị trí hoặc ràng buộc tọa độ */}
      {(locationError || validationError) && (
        <div className="p-2 rounded bg-critical-red/10 border border-critical-red/40 text-critical-red text-[11px] flex items-center space-x-1.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{locationError || validationError}</span>
        </div>
      )}
    </div>
  );
}
