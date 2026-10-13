/**
 * Tiện ích xử lý dữ liệu trạm sạc & đầu nối phục vụ màn hình tìm trạm của Tài xế
 * SCRUM-351: [BE/FE/TESTER] Tìm trạm gần và thấy đầu nối rảnh
 * SCRUM-359: [FE] Trang danh sách trạm, xin quyền vị trí, xử lý từ chối quyền
 * SCRUM-360: [FE] Thẻ trạm: khoảng cách, số đầu nối rảnh, giá; ô tìm theo tên/địa chỉ
 */

/**
 * Tính khoảng cách Haversine giữa 2 tọa độ GPS (km)
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null ||
    !Number.isFinite(Number(lat1)) ||
    !Number.isFinite(Number(lon1)) ||
    !Number.isFinite(Number(lat2)) ||
    !Number.isFinite(Number(lon2))
  ) {
    return null;
  }

  const R = 6371.0; // Bán kính Trái Đất (km)
  const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180.0;
  const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180.0;
  const rLat1 = (Number(lat1) * Math.PI) / 180.0;
  const rLat2 = (Number(lat2) * Math.PI) / 180.0;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Tính toán số lượng đầu nối rảnh / tổng số đầu nối và danh sách loại súng của trạm
 */
export function calculateConnectorMetrics(station) {
  if (!station) {
    return {
      totalConnectors: 0,
      availableConnectors: 0,
      hasAvailableConnectors: false,
      connectorTypes: [],
      maxPowerKw: 0,
    };
  }

  const chargingPoints = (station.charging_points || []).filter(
    (cp) => cp.is_active !== false
  );

  let totalConnectors = 0;
  let availableConnectors = 0;
  const connectorTypeSet = new Set();
  let maxPowerKw = 0;

  for (const cp of chargingPoints) {
    if (cp.max_power_kw && Number(cp.max_power_kw) > maxPowerKw) {
      maxPowerKw = Number(cp.max_power_kw);
    }

    const connectors = (cp.connectors || []).filter(
      (c) => c.is_active !== false
    );

    for (const c of connectors) {
      totalConnectors += 1;
      if (c.status === 'AVAILABLE') {
        availableConnectors += 1;
      }
      if (c.connector_type) {
        connectorTypeSet.add(c.connector_type.trim());
      }
      const power = c.rated_power_kw || c.max_power_kw;
      if (power && Number(power) > maxPowerKw) {
        maxPowerKw = Number(power);
      }
    }
  }

  if (maxPowerKw === 0 && station.total_grid_capacity_kw) {
    maxPowerKw = Number(station.total_grid_capacity_kw);
  }

  return {
    totalConnectors,
    availableConnectors,
    hasAvailableConnectors: availableConnectors > 0,
    connectorTypes: Array.from(connectorTypeSet),
    maxPowerKw,
  };
}

/**
 * Lọc và sắp xếp danh sách trạm theo tiêu chí chấp nhận:
 * 1. Chỉ hiện các trạm đang hoạt động (status = ACTIVE, is_active = true)
 * 2. Ẩn trạm chưa hoạt động hoặc tạm ngừng (status != ACTIVE)
 * 3. Sắp xếp theo khoảng cách tăng dần khi có vị trí người dùng
 * 4. Tìm kiếm theo tên hoặc địa chỉ (khi không có hoặc có GPS)
 */
export function filterAndSortStations(stations = [], options = {}) {
  const {
    searchQuery = '',
    userCoords = null,
    connectorType = 'ALL',
    availableOnly = false,
  } = options;

  const normalizedQuery = (searchQuery || '').trim().toLowerCase();

  // 1. Chỉ lấy các trạm đang hoạt động (tiêu chí: trạm chưa hoạt động hoặc tạm ngừng không hiện)
  const activeStations = stations.filter((st) => {
    if (!st || st.is_active === false) return false;
    const statusUpper = (st.status || '').toUpperCase();
    return statusUpper === 'ACTIVE';
  });

  // 2. Tính toán khoảng cách & chỉ số đầu nối cho từng trạm
  const enriched = activeStations.map((st) => {
    const metrics = calculateConnectorMetrics(st);
    let distanceKm = st.distance_km;

    if (
      userCoords?.lat != null &&
      userCoords?.lon != null &&
      st.latitude != null &&
      st.longitude != null
    ) {
      distanceKm = calculateHaversineDistance(
        userCoords.lat,
        userCoords.lon,
        st.latitude,
        st.longitude
      );
    }

    return {
      ...st,
      distanceKm: distanceKm != null ? Number(distanceKm) : null,
      ...metrics,
    };
  });

  // 3. Lọc theo tìm kiếm tên/địa chỉ và các bộ lọc phụ
  const filtered = enriched.filter((st) => {
    // Tìm theo tên hoặc địa chỉ
    if (normalizedQuery) {
      const matchName = (st.name || '').toLowerCase().includes(normalizedQuery);
      const matchAddress = (st.address || '').toLowerCase().includes(normalizedQuery);
      if (!matchName && !matchAddress) {
        return false;
      }
    }

    // Lọc theo chuẩn đầu nối
    if (connectorType && connectorType !== 'ALL') {
      const hasType = (st.connectorTypes || []).some(
        (t) => t.toUpperCase() === connectorType.toUpperCase()
      );
      if (!hasType) return false;
    }

    // Lọc chỉ trạm còn đầu nối rảnh
    if (availableOnly) {
      if (st.availableConnectors <= 0) return false;
    }

    return true;
  });

  // 4. Sắp xếp theo khoảng cách tăng dần khi có GPS
  if (userCoords?.lat != null && userCoords?.lon != null) {
    filtered.sort((a, b) => {
      const distA = a.distanceKm != null ? a.distanceKm : 999999;
      const distB = b.distanceKm != null ? b.distanceKm : 999999;
      return distA - distB;
    });
  } else {
    // Nếu không có GPS, giữ nguyên thứ tự hoặc sắp theo tên trạm
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  return filtered;
}

