/**
 * Cấu hình tập trung cho các lớp bản đồ (Tile Layers) trong hệ thống EV CSMS
 * Sử dụng dịch vụ Esri ArcGIS toàn cầu: 100% miễn phí, tốc độ cao, không bao giờ cần API Key,
 * không bị lỗi chặn DNS mạng nội bộ như OpenStreetMap và không có watermark như Carto.
 */
export const MAP_CONFIG = {
  // 1. Bản đồ đường phố (Street Map): Esri World Street Map - Tên đường, địa danh, tòa nhà Việt Nam cực kỳ sắc nét & chi tiết
  street: {
    name: 'Đường phố',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, TomTom',
    className: '',
  },
  light: {
    name: 'Bản đồ Sáng',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, TomTom',
    className: '',
  },

  // 2. Bản đồ đêm công nghệ cao: CartoDB Dark Matter (Độ tương phản cao, tên đường sáng rõ, không bị mờ đen)
  dark: {
    name: 'Bản đồ Tối',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    className: '',
  },

  // 3. Ảnh vệ tinh độ nét cao: Esri World Imagery
  satellite: {
    name: 'Ảnh Vệ Tinh',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS',
    className: '',
  },

  // 4. Bản đồ OpenStreetMap tiêu chuẩn cộng đồng (Dự phòng thông tin chi tiết)
  osm: {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
    className: '',
  },

  // Tọa độ tâm mặc định nhìn toàn cảnh Việt Nam
  defaultCenter: [16.0, 106.0],
  defaultZoom: 5,
};
