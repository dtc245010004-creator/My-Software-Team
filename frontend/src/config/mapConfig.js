/**
 * Cấu hình tập trung cho các lớp bản đồ (Tile Layers) trong hệ thống
 * Cho phép dễ dàng thay đổi nhà cung cấp (OpenStreetMap, MapTiler, Stadia...) tại một nơi duy nhất.
 */
export const MAP_CONFIG = {
  // 1. Bản đồ tối: Sử dụng OpenStreetMap miễn phí kết hợp CSS filter làm tối
  dark: {
    name: 'BẢN ĐỒ TỐI',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    className: 'map-tiles-dark',
  },

  // 2. Ảnh vệ tinh: Esri World Imagery (miễn phí, không áp filter tối)
  satellite: {
    name: 'ẢNH VỆ TINH',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    className: '',
  },

  // Tọa độ tâm mặc định nhìn toàn cảnh Việt Nam
  defaultCenter: [16.0, 106.0],
  defaultZoom: 5,
};
