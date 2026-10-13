/**
 * Cấu hình ngưỡng cảnh báo & thông điệp cho SCRUM-320 (SCRUM-295)
 * Tập trung các hằng số, thông điệp tiếng Việt và Mock Data theo yêu cầu PO.
 */

// 1. Ngưỡng quy định cảnh báo (TẠM THỜI – giá trị tạm, chờ PO xác nhận)
export const ALERT_THRESHOLDS = {
  // Trụ ngoại tuyến quá lâu (phút) - TẠM THỜI: chờ PO xác nhận (gợi ý: 30)
  OFFLINE_MINUTES: 30,
  // Số lần lỗi FAULTED liên tiếp - TẠM THỜI: chờ PO xác nhận
  // Mặc định = 1 để khớp thẻ thống kê "Bị lỗi" và hiện ngay khi báo lỗi (có thể cấu hình thành 3 nếu PO yêu cầu)
  CONSECUTIVE_FAULTS: 1,
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

/**
 * Định dạng thời gian sự kiện theo chuẩn hiển thị FE: HH:mm:ss DD/MM/YYYY
 * @param {string|number|Date} [dateInput]
 * @returns {string}
 */
export const formatEventTime = (dateInput) => {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const dateStr = now.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return `${timeStr} ${dateStr}`;
  }
  const time = d.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const date = d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `${time} ${date}`;
};

/**
 * Tính toán và định dạng khoảng thời gian đã ngoại tuyến theo thời gian thực
 * @param {string|number|Date} offlineSince Mốc thời điểm bắt đầu mất kết nối
 * @param {number|Date} [currentTime=Date.now()] Mốc thời gian hiện tại từ live timer
 * @returns {string}
 */
export const formatOfflineDuration = (offlineSince, currentTime = Date.now()) => {
  if (!offlineSince) return 'Gần đây';
  const start = new Date(offlineSince).getTime();
  const now = typeof currentTime === 'number' ? currentTime : new Date(currentTime).getTime();
  const diffSec = Math.max(0, Math.floor((now - start) / 1000));

  if (diffSec < 60) {
    return `${diffSec} giây`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} phút`;
  }
  const hours = Math.floor(diffMin / 60);
  const remainingMins = diffMin % 60;
  if (remainingMins === 0) {
    return `${hours} giờ`;
  }
  return `${hours} giờ ${remainingMins} phút`;
};
