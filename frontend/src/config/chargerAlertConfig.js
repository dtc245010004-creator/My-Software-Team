/**
 * Cấu hình ngưỡng cảnh báo & thông điệp cho SCRUM-320 (SCRUM-295)
 * Tập trung các hằng số, thông điệp tiếng Việt và Mock Data theo yêu cầu PO.
 */

// 1. Ngưỡng quy định cảnh báo
export const ALERT_THRESHOLDS = {
  // Trụ ngoại tuyến quá lâu (phút)
  OFFLINE_MINUTES: 30,
  // Số lần lỗi FAULTED liên tiếp
  CONSECUTIVE_FAULTS: 3,
};

// 2. Mức độ ưu tiên cảnh báo (sử dụng đúng token màu của dự án)
export const ALERT_SEVERITY = {
  CRITICAL: 'critical-red', // Mức Đỏ: Lỗi liên tục
  WARNING: 'caution-amber',  // Mức Vàng Cam: Ngoại tuyến quá lâu
};

// 3. Chuỗi thông điệp tập trung (Constants / i18n)
export const ALERT_MESSAGES = {
  FAULTED_TITLE: (count) => `Phát hiện ${count} trụ sạc báo lỗi liên tục.`,
  OFFLINE_TITLE: (count) => `Phát hiện ${count} trụ sạc ngoại tuyến quá lâu.`,
  FAULTED_DESCRIPTION:
    'Hệ thống ghi nhận trụ sạc báo lỗi phần cứng hoặc cảm biến liên tiếp. Cần kiểm tra kỹ thuật hoặc ngắt nguồn an toàn.',
  OFFLINE_DESCRIPTION:
    'Hệ thống không nhận được tín hiệu kết nối WebSocket hoặc nhịp tim Heartbeat vượt quá ngưỡng quy định. Đang tự động dò tìm kết nối lại.',
  ACTION_VIEW_DETAILS: 'Xem chi tiết',
  ACTION_COLLAPSE: 'Thu gọn',
  TIME_LABEL_OFFLINE: 'Mất kết nối lúc:',
  TIME_LABEL_FAULTED: 'Báo lỗi lúc:',
};

// 4. Dữ liệu mẫu (Mock Data) chuẩn bị sẵn cho Frontend theo interface thỏa thuận với Backend
export const MOCK_CHARGER_ALERTS = {
  // Danh sách trụ báo lỗi liên tục (>= 3 lần liên tiếp)
  faulted: [
    {
      id: 2,
      code: 'CP-VF-02',
      station_name: 'Vincom Smart City',
      consecutive_faults: 4,
      last_event_time: '14:25:10 12/10/2026',
      reason: 'Quá tải cảm biến nhiệt / Lỗi ngắt rơ-le',
    },
    {
      id: 6,
      code: 'CP-ECO-03',
      station_name: 'Ecopark Hưng Yên',
      consecutive_faults: 3,
      last_event_time: '15:10:04 12/10/2026',
      reason: 'Lỗi phần cứng đầu nối CCS2',
    },
  ],
  // Danh sách trụ ngoại tuyến quá lâu (> 30 phút)
  offline: [
    {
      id: 5,
      code: 'CP-ECO-02',
      station_name: 'Ecopark Hưng Yên',
      offline_minutes: 45,
      last_event_time: '13:40:00 12/10/2026',
      reason: 'Mất kết nối WebSocket quá 30 phút',
    },
    {
      id: 8,
      code: 'CP-MD-03',
      station_name: 'Mỹ Đình',
      offline_minutes: 62,
      last_event_time: '12:15:30 12/10/2026',
      reason: 'Không nhận được nhịp tim Heartbeat',
    },
  ],
};

