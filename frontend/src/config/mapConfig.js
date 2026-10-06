/**
 * Cấu hình tập trung cho các lớp bản đồ (Tile Layers) trong hệ thống EV CSMS
 * Sử dụng OpenStreetMap chuẩn cộng đồng 100% miễn phí, không bao giờ yêu cầu API Key.
 */
export const MAP_CONFIG = {
  // 1. Bản đồ sáng: OpenStreetMap tiêu chuẩn - sắc nét, miễn phí, không cần API Key
  light: {
    name: 'Bản đồ Sáng',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    className: '',
  },

  // 2. Bản đồ tối: OpenStreetMap kết hợp bộ lọc Dark CSS Filter - đồng bộ với dark theme
  dark: {
    name: 'Bản đồ Tối',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    className: 'map-tiles-dark',
  },

  // 3. Ảnh vệ tinh: Esri World Imagery (miễn phí)
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
