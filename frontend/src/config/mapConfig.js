/**
 * Cấu hình tập trung cho các lớp bản đồ (Tile Layers) trong hệ thống EV CSMS
 * Sử dụng dịch vụ Esri ArcGIS toàn cầu: 100% miễn phí, tốc độ cao, không bao giờ cần API Key,
 * không bị lỗi chặn DNS mạng nội bộ như OpenStreetMap và không có watermark như Carto.
 */
export const MAP_CONFIG = {
  // 1. Bản đồ đường phố (Street Map / Light): Esri World Street Map - Tên đường, địa danh Việt Nam cực kỳ sắc nét & chi tiết
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

  // 2. Bản đồ tối: Esri Dark Gray Canvas - Bản đồ nền tối công nghệ chính thức của ArcGIS
  dark: {
    name: 'Bản đồ Tối',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 16,
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    className: '',
  },

  // 3. Ảnh vệ tinh: Esri World Imagery (độ phân giải cao)
  satellite: {
    name: 'Ảnh Vệ Tinh',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    className: '',
  },

  // Tọa độ tâm mặc định nhìn toàn cảnh Việt Nam
  defaultCenter: [16.0, 106.0],
  defaultZoom: 5,
};
