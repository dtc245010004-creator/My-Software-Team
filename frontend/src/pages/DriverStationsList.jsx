import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  MapPinOff,
  Navigation as NavigationIcon,
  Zap,
  BatteryCharging,
  Clock,
  RotateCcw,
  ExternalLink,
  Map as MapIcon,
  X,
  AlertCircle,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import api from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { filterAndSortStations } from '../utils/stationUtils';

// Danh sách khu vực chọn nhanh khi không có GPS
const QUICK_CITIES = [
  { name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
  { name: 'Thái Nguyên', lat: 21.5928, lon: 105.8442 },
  { name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  { name: 'TP. Hồ Chí Minh', lat: 10.7769, lon: 106.7009 },
];

export default function DriverStationsList() {
  const navigate = useNavigate();

  // Trạng thái GPS: 'locating' | 'granted' | 'denied' | 'custom' | 'unsupported'
  const [gpsStatus, setGpsStatus] = useState('locating');
  const [userCoords, setUserCoords] = useState(null);
  const [locationName, setLocationName] = useState('Đang định vị...');

  // Dữ liệu trạm sạc & trạng thái tải
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Bộ lọc tìm kiếm
  const [searchQuery, setSearchQuery] = useState('');
  const [connectorFilter, setConnectorFilter] = useState('ALL');
  const [availableOnly, setAvailableOnly] = useState(false);

  // 1. Hàm xin quyền vị trí Geolocation từ trình duyệt (SCRUM-359)
  const requestLocation = useCallback(() => {
    setGpsStatus('locating');
    setLocationName('Đang định vị GPS thiết bị...');

    if (!navigator.geolocation) {
      setGpsStatus('unsupported');
      setUserCoords(null);
      setLocationName('Trình duyệt không hỗ trợ GPS');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        setUserCoords(coords);
        setGpsStatus('granted');
        setLocationName('Vị trí GPS hiện tại của bạn');
      },
      (error) => {
        console.warn('Lỗi xin quyền vị trí:', error.message);
        // Xử lý từ chối quyền (SCRUM-359)
        setGpsStatus('denied');
        setUserCoords(null);
        setLocationName('Chưa cấp quyền vị trí');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // Tự động xin quyền vị trí khi vào trang lần đầu
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // 2. Nạp danh sách trạm sạc từ Backend (chỉ lấy trạm đang hoạt động)
  const fetchStations = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const params = {
        status: 'ACTIVE', // Tiêu chí AC: trạm chưa hoạt động hoặc tạm ngừng không hiện trong danh sách
      };

      if (userCoords?.lat != null && userCoords?.lon != null) {
        params.user_lat = userCoords.lat;
        params.user_lon = userCoords.lon;
      }

      const res = await api.get('/stations', { params });
      setStations(res.data || []);
    } catch (err) {
      console.error('Lỗi nạp danh sách trạm:', err);
      setErrorMsg('Không thể tải danh sách trạm sạc. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  }, [userCoords]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  // 3. Chọn nhanh thành phố khi không có GPS hoặc người dùng muốn đổi vùng
  const handleSelectCity = (city) => {
    setUserCoords({ lat: city.lat, lon: city.lon });
    setLocationName(`Khu vực: ${city.name}`);
    setGpsStatus('custom');
  };

  // 4. Lọc và sắp xếp danh sách trạm bằng helper chuẩn kiểm thử
  const displayedStations = useMemo(() => {
    return filterAndSortStations(stations, {
      searchQuery,
      userCoords,
      connectorType: connectorFilter,
      availableOnly,
    });
  }, [stations, searchQuery, userCoords, connectorFilter, availableOnly]);

  // 5. Điều hướng sạc tại trạm
  const handleChargeAtStation = (st) => {
    const chargers = st.charging_points || [];
    const availableCharger =
      chargers.find((c) => c.status === 'AVAILABLE') || chargers[0];

    if (availableCharger) {
      navigate(`/chargers/${availableCharger.id}`);
    } else {
      navigate(`/simulator?station_id=${st.id}`);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-8">
      {/* Thanh tiêu đề trang & nút chuyển sang bản đồ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#151D2A] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <NavigationIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Tìm Trạm Sạc Còn Đầu Nối Rảnh
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tra cứu danh sách trạm sạc đang hoạt động gần bạn nhất
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={MapIcon}
            onClick={() => navigate('/map')}
            className="w-full sm:w-auto text-xs"
          >
            Xem trên bản đồ
          </Button>
        </div>
      </div>

      {/* Thông tin vị trí & Xử lý từ chối quyền vị trí (SCRUM-359) */}
      <Card padding="p-4" className="shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                gpsStatus === 'granted'
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : gpsStatus === 'denied' || gpsStatus === 'unsupported'
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  : 'bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'
              }`}
            >
              {gpsStatus === 'granted' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : gpsStatus === 'denied' || gpsStatus === 'unsupported' ? (
                <MapPinOff className="w-5 h-5" />
              ) : (
                <MapPin className="w-5 h-5 animate-pulse" />
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                  Vị trí của bạn:
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {locationName}
                </span>
                {gpsStatus === 'granted' && (
                  <Badge variant="success" dot pulse size="sm">
                    GPS Sẵn Sàng
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {gpsStatus === 'granted'
                  ? 'Danh sách trạm đang tự động sắp xếp theo khoảng cách tăng dần'
                  : 'Chưa có tọa độ GPS. Bạn có thể chọn nhanh khu vực hoặc tìm theo tên / địa chỉ'}
              </p>
            </div>
          </div>

          {/* Các nút hành động vị trí */}
          <div className="flex items-center flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              icon={RotateCcw}
              onClick={requestLocation}
              loading={gpsStatus === 'locating'}
              className="text-xs rounded-xl"
              title="Thử xin cấp lại quyền vị trí GPS"
            >
              Định vị lại
            </Button>
          </div>
        </div>

        {/* Banner cảnh báo khi người dùng từ chối quyền vị trí (SCRUM-359) */}
        {(gpsStatus === 'denied' || gpsStatus === 'unsupported') && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 space-y-2">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  Quyền truy cập vị trí chưa được cấp hoặc bị từ chối
                </p>
                <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                  Hệ thống vẫn hiển thị đầy đủ các trạm đang hoạt động. Bạn có thể nhập <strong>tên trạm</strong> hoặc <strong>địa chỉ</strong> vào ô tìm kiếm bên dưới, hoặc chọn nhanh tỉnh/thành:
                </p>
              </div>
            </div>

            {/* Các nút chọn nhanh khu vực khi bị từ chối vị trí */}
            <div className="flex items-center flex-wrap gap-1.5 pt-1">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Chọn khu vực:
              </span>
              {QUICK_CITIES.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => handleSelectCity(c)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border border-amber-300/80 dark:border-amber-700/60 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-sky-500 hover:text-sky-600 transition-colors"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Ô tìm kiếm theo tên / địa chỉ & Bộ lọc chuẩn sạc (SCRUM-360) */}
      <Card padding="p-4" className="shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h2 className="font-bold text-sm text-slate-900 dark:text-white">
              Bộ Lọc & Tìm Kiếm Trạm Sạc
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Tìm thấy: <strong className="text-sky-600 dark:text-sky-400 font-mono">{displayedStations.length}</strong> trạm
          </span>
        </div>

        {/* Ô tìm kiếm theo tên hoặc địa chỉ */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên trạm hoặc địa chỉ (Ví dụ: Hoàn Kiếm, Vincom, Cầu Giấy...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 pl-10 pr-9 py-2.5 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 placeholder:text-slate-400 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              title="Xóa nội dung tìm kiếm"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Các nút lọc chuẩn sạc & cờ chỉ hiện trạm còn đầu nối */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-xs text-slate-400 mr-1 shrink-0">Loại súng:</span>
            {['ALL', 'CCS2', 'TYPE_2', 'CHADEMO'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setConnectorFilter(type)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  connectorFilter === type
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30 font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {type === 'ALL' ? 'Tất cả loại súng' : type.replace('_', ' ')}
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
            <span>Chỉ hiện trạm còn đầu nối rảnh</span>
          </label>
        </div>
      </Card>

      {/* Thông báo lỗi nếu có */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <Button size="sm" variant="outline" onClick={fetchStations}>
            Tải lại
          </Button>
        </div>
      )}

      {/* Danh sách Thẻ Trạm Sạc (SCRUM-360) */}
      <div className="space-y-3.5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        ) : displayedStations.length === 0 ? (
          <EmptyState
            icon={MapPinOff}
            title="Không tìm thấy trạm sạc phù hợp"
            description="Hãy thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt các điều kiện lọc phía trên."
            actionLabel="Đặt lại bộ lọc"
            onAction={() => {
              setSearchQuery('');
              setConnectorFilter('ALL');
              setAvailableOnly(false);
            }}
          />
        ) : (
          displayedStations.map((st) => {
            const hasAvailable = st.availableConnectors > 0;
            const priceText =
              st.current_price_per_kwh != null
                ? `${new Intl.NumberFormat('vi-VN').format(st.current_price_per_kwh)} đ/kWh`
                : '3,200 đ/kWh';

            return (
              <Card
                key={st.id}
                padding="p-4 sm:p-5"
                className="hover:border-sky-300 dark:hover:border-sky-800/80 transition-all duration-200 shadow-sm"
              >
                {/* Hàng trên: Tên trạm, ID và Khoảng cách */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                        {st.name}
                      </h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono font-semibold">
                        ST-{st.id}
                      </span>
                    </div>

                    <p
                      className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1"
                      title={st.address}
                    >
                      {st.address || 'Địa chỉ đang cập nhật'}
                    </p>
                  </div>

                  {/* Khoảng cách (nếu có GPS) */}
                  <div className="shrink-0 text-right">
                    {st.distanceKm != null ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 font-mono tabular-nums">
                        {st.distanceKm.toFixed(1)} km
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Chưa có khoảng cách
                      </span>
                    )}
                  </div>
                </div>

                {/* Khối chỉ số: Số đầu nối rảnh trên tổng số + Loại đầu nối + Đơn giá */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 my-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                  {/* Số đầu nối rảnh trên tổng số (Tiêu chí AC 2) */}
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
                      ĐẦU NỐI RẢNH
                    </div>
                    <div className="mt-1 flex items-center space-x-1.5 font-bold">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          hasAvailable ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                      />
                      <span
                        className={
                          hasAvailable
                            ? 'text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm font-semibold'
                            : 'text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-semibold'
                        }
                      >
                        {hasAvailable
                          ? `${st.availableConnectors}/${st.totalConnectors} đầu nối rảnh`
                          : `0/${st.totalConnectors} (Hết chỗ)`}
                      </span>
                    </div>
                  </div>

                  {/* Loại đầu nối sạc có tại trạm (Tiêu chí AC 2) */}
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
                      LOẠI ĐẦU NỐI
                    </div>
                    <div className="mt-1 flex items-center flex-wrap gap-1">
                      {(st.connectorTypes || []).length > 0 ? (
                        st.connectorTypes.map((type) => (
                          <span
                            key={type}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50"
                          >
                            {type}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">
                          Chưa cấu hình
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Đơn giá hiện tại (Tiêu chí AC 2) */}
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
                      ĐƠN GIÁ HIỆN TẠI
                    </div>
                    <div className="mt-1 font-bold text-amber-600 dark:text-amber-400 text-xs sm:text-sm font-mono">
                      ~{priceText}
                    </div>
                  </div>
                </div>

                {/* Hàng thông tin phụ: Công suất tối đa & Giờ hoạt động */}
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3 px-0.5">
                  <div className="flex items-center space-x-1.5">
                    <Zap className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span>
                      Công suất: <strong className="text-slate-800 dark:text-slate-200 font-mono">{st.maxPowerKw || 60} kW</strong>
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{st.operating_hours || '24/7'}</span>
                  </div>
                </div>

                {/* Các nút hành động (Responsive 360px) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  {/* Nút chỉ đường Google Maps */}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${st.latitude},${st.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span className="truncate">Chỉ đường</span>
                  </a>

                  {/* Nút xem vị trí trên bản đồ */}
                  <Button
                    variant="outline"
                    size="sm"
                    icon={MapIcon}
                    onClick={() => navigate(`/map?station_id=${st.id}`)}
                    className="py-2 text-xs truncate"
                  >
                    Xem bản đồ
                  </Button>

                  {/* Nút sạc tại trạm này */}
                  <Button
                    variant="primary"
                    size="sm"
                    icon={BatteryCharging}
                    onClick={() => handleChargeAtStation(st)}
                    className="col-span-2 sm:col-span-1 py-2 text-xs font-bold"
                  >
                    Sạc tại trạm
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

