/**
 * TẠM THỜI – thay bằng dữ liệu BE
 * Adapter chuẩn hóa dữ liệu từ state trụ sạc sống của màn hình lưới (ChargerGridMonitor)
 * thành danh sách cảnh báo (alerts) phục vụ component AlertBanner.
 *
 * Tuyệt đối KHÔNG chứa danh sách trụ hard-code.
 * Toàn bộ alerts được suy ra tự động từ trạng thái thực tế của màn hình.
 */

import { ALERT_THRESHOLDS } from '../config/chargerAlertConfig';

/**
 * @typedef {Object} AlertItem
 * @property {number|string} chargerId ID định danh của trụ sạc
 * @property {string} chargerCode Mã trụ sạc (VD: EVSE-3-01)
 * @property {string} stationName Tên trạm sạc
 * @property {'offline' | 'repeated_fault'} type Phân loại sự cố: offline hoặc repeated_fault
 * @property {number} [consecutiveFaults] Số lần lỗi FAULTED liên tiếp
 * @property {string|Date} [offlineSince] Mốc thời gian bắt đầu ngoại tuyến
 * @property {string|Date} [lastFaultAt] Mốc thời gian phát sinh lỗi gần nhất
 * @property {string} [reason] Mô tả nguyên nhân sự cố
 */

/**
 * Chuyển đổi danh sách trụ sạc (state chargers) thành danh sách alert đạt ngưỡng
 * @param {Array<Object>} chargers Danh sách trụ sạc từ state màn hình
 * @param {number} [currentTime=Date.now()] Thời điểm hiện tại (ms) để tính toán offline
 * @returns {Array<AlertItem>}
 */
export function buildChargerAlerts(chargers, currentTime = Date.now()) {
  if (!Array.isArray(chargers) || chargers.length === 0) {
    return [];
  }

  const alerts = [];
  const nowMs = typeof currentTime === 'number' ? currentTime : new Date(currentTime).getTime();

  for (const charger of chargers) {
    const status = (charger.status || '').toUpperCase();
    const chargerId = charger.id ?? charger.code;
    const chargerCode = charger.code || `TRU-${chargerId}`;
    const stationName = charger.station_name || 'Trạm sạc';

    // 1. Trường hợp B: Báo lỗi liên tục (repeated_fault) - Mức đỏ
    // Ưu tiên trường consecutiveFaults của BE; nếu BE chưa có, dùng bộ đếm ghi nhận từ FE
    const consecutiveFaults =
      charger.consecutiveFaults !== undefined
        ? charger.consecutiveFaults
        : (status === 'FAULTED' ? (charger.faultCount || 1) : 0);

    const isRepeatedFault =
      status === 'FAULTED' && consecutiveFaults >= ALERT_THRESHOLDS.CONSECUTIVE_FAULTS;

    if (isRepeatedFault) {
      alerts.push({
        chargerId,
        chargerCode,
        stationName,
        type: 'repeated_fault',
        consecutiveFaults,
        lastFaultAt:
          charger.lastFaultAt ||
          charger.faulted_at ||
          charger.updated_at ||
          new Date(nowMs).toISOString(),
        reason: charger.reason || 'Sự cố phần cứng hoặc cảm biến liên tiếp',
      });
    }

    // 2. Trường hợp A: Ngoại tuyến quá lâu (offline) - Mức vàng
    // Chỉ kích hoạt khi dữ liệu có trường cho biết trụ mất kết nối (vd. lastHeartbeat, connected === false, offlineSince)
    const isDisconnected =
      charger.connected === false ||
      charger.is_online === false ||
      Boolean(charger.offlineSince) ||
      Boolean(charger.lastHeartbeat);

    const offlineTimestamp =
      charger.offlineSince ||
      charger.lastHeartbeat ||
      (charger.connected === false ? charger.last_seen_at : null);

    if (isDisconnected && offlineTimestamp) {
      const offlineSinceMs = new Date(offlineTimestamp).getTime();
      const offlineMinutes = Math.floor((nowMs - offlineSinceMs) / 60000);

      // Chỉ đưa vào banner khi đã vượt ngưỡng thời gian quy định M phút
      if (offlineMinutes >= ALERT_THRESHOLDS.OFFLINE_MINUTES) {
        alerts.push({
          chargerId,
          chargerCode,
          stationName,
          type: 'offline',
          offlineSince: offlineTimestamp,
          offlineMinutes,
          reason: charger.reason || 'Mất kết nối vượt quá ngưỡng thời gian quy định',
        });
      }
    }
  }

  return alerts;
}

