/**
 * reservation.js — Hàm thuần (pure functions) cho logic đặt chỗ trạm sạc.
 *
 * Không import React, không gọi API, không dùng hook.
 * Viết unit test bên cạnh file này: reservation.test.js
 *
 * Các hàm export:
 *  - buildArrivalSlots()     sinh danh sách giờ tới có thể chọn
 *  - formatCountdown()       định dạng msLeft thành chuỗi HH:MM:SS hoặc "Hết hạn"
 *  - mapReservationError()   ánh xạ lỗi API thành { code, message, suggestions }
 *  - isReservable()          kiểm tra connector có thể đặt chỗ không
 *  - buildReservationSummary() sinh text tóm tắt đặt chỗ
 */

import {
  MAX_RESERVATION_AHEAD_MINUTES,
  ARRIVAL_SLOT_STEP_MINUTES,
  MIN_BALANCE_FOR_RESERVATION,
} from '../config/reservationConfig';

/**
 * Sinh danh sách giờ tới (arrival slots) có thể chọn.
 *
 * @param {Date} [now] - Thời điểm hiện tại (mặc định: new Date())
 * @param {number} [maxAheadMinutes] - Số phút tối đa tính từ now (mặc định: MAX_RESERVATION_AHEAD_MINUTES)
 * @param {number} [stepMinutes] - Bước nhảy phút (mặc định: ARRIVAL_SLOT_STEP_MINUTES)
 * @returns {{ value: string, label: string, time: Date }[]} value = ISO string, label = "HH:MM - DD/MM"
 */
export function buildArrivalSlots(
  now = new Date(),
  maxAheadMinutes = MAX_RESERVATION_AHEAD_MINUTES,
  stepMinutes = ARRIVAL_SLOT_STEP_MINUTES
) {
  // Làm tròn thời điểm hiện tại lên bội số của stepMinutes (để slot mới bắt đầu đúng giờ)
  const currentMinutes = now.getMinutes();
  const roundedMinutes = Math.ceil(currentMinutes / stepMinutes) * stepMinutes;

  const firstSlot = new Date(now);
  firstSlot.setMinutes(roundedMinutes, 0, 0);

  // Nếu slot đầu tiên <= now (do làm tròn lên mà không nhảy giờ), cộng thêm 1 step
  if (firstSlot.getTime() <= now.getTime()) {
    firstSlot.setMinutes(firstSlot.getMinutes() + stepMinutes);
  }

  const slots = [];
  const maxTime = new Date(now.getTime() + maxAheadMinutes * 60 * 1000);

  for (
    let slot = new Date(firstSlot);
    slot.getTime() <= maxTime.getTime();
    slot = new Date(slot.getTime() + stepMinutes * 60 * 1000)
  ) {
    const isoValue = slot.toISOString();
    const label = slot.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
    slots.push({ value: isoValue, label, time: new Date(slot) });
  }

  return slots;
}

/**
 * Định dạng thời gian đếm ngược.
 *
 * @param {number} msLeft - Số mili-giây còn lại
 * @returns {{ text: string, urgency: 'normal' | 'warning' | 'critical' | 'expired' }}
 */
export function formatCountdown(msLeft) {
  if (!Number.isFinite(msLeft) || msLeft <= 0) {
    return { text: 'Đã hết hạn', urgency: 'expired' };
  }

  const totalSeconds = Math.floor(msLeft / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (hours > 0) {
    const text = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return {
      text,
      urgency: msLeft < 60_000 ? 'critical' : msLeft < 300_000 ? 'warning' : 'normal',
    };
  }

  const text = `${pad(minutes)}:${pad(seconds)}`;
  return {
    text,
    urgency: msLeft < 60_000 ? 'critical' : msLeft < 300_000 ? 'warning' : 'normal',
  };
}

/**
 * Ánh xạ lỗi API đặt chỗ thành cấu trúc chuẩn.
 *
 * @param {any} error - Axios error object
 * @returns {{ code: string, message: string, suggestions: any[], rawStatus: number|null }}
 */
export function mapReservationError(error) {
  if (!error) {
    return { code: 'UNKNOWN', message: 'Đã xảy ra lỗi không xác định.', suggestions: [], rawStatus: null };
  }

  const status = error.response?.status ?? null;
  const data = error.response?.data ?? {};
  const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail ?? '');
  const code = data.code ?? '';

  // 409 Conflict — trụ đã được đặt (S-49)
  if (status === 409 || code === 'RESERVATION_CONFLICT') {
    return {
      code: 'RESERVATION_CONFLICT',
      message: detail || 'Trụ này vừa được người khác đặt trong cùng khung giờ.',
      suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      rawStatus: status,
    };
  }

  // 402 / 403 ví dưới ngưỡng
  if (status === 402 || status === 403 || code === 'WALLET_BELOW_THRESHOLD') {
    return {
      code: 'WALLET_BELOW_THRESHOLD',
      message: 'Số dư ví không đủ để đặt chỗ.',
      minBalance: data.min_balance ?? data.minBalance ?? MIN_BALANCE_FOR_RESERVATION,
      balance: data.balance ?? data.current_balance ?? null,
      suggestions: [],
      rawStatus: status,
    };
  }

  // 422 giờ tới ngoài phạm vi / trụ Occupied / Rejected
  if (status === 422 || code === 'CHARGER_REJECTED' || code === 'CHARGER_OCCUPIED') {
    return {
      code: code || 'CHARGER_REJECTED',
      message: detail || 'Trụ sạc không chấp nhận đặt chỗ vào thời gian này.',
      suggestions: [],
      rawStatus: status,
    };
  }

  // 504 trụ không phản hồi
  if (status === 504 || code === 'GATEWAY_TIMEOUT') {
    return {
      code: 'TIMEOUT',
      message: 'Trụ sạc không phản hồi. Vui lòng thử lại sau ít phút.',
      suggestions: [],
      rawStatus: status,
    };
  }

  // 404 trụ không tồn tại
  if (status === 404 || code === 'CHARGER_NOT_FOUND') {
    return {
      code: 'CHARGER_NOT_FOUND',
      message: 'Không tìm thấy trụ sạc. Trụ có thể đã bị xoá.',
      suggestions: [],
      rawStatus: status,
    };
  }

  // 503 trụ đang bảo trì
  if (status === 503 || code === 'CHARGER_UNDER_MAINTENANCE') {
    return {
      code: 'CHARGER_UNDER_MAINTENANCE',
      message: 'Trụ sạc đang được bảo trì, không thể đặt trong thời gian này.',
      suggestions: [],
      rawStatus: status,
    };
  }

  // Mặc định: dùng detail từ backend
  return {
    code: code || `HTTP_${status ?? 'ERR'}`,
    message: detail || 'Đặt chỗ thất bại. Vui lòng thử lại.',
    suggestions: [],
    rawStatus: status,
  };
}

/**
 * Kiểm tra connector có thể đặt chỗ không.
 *
 * @param {{ status?: string, is_reservable?: boolean }} connector
 * @returns {{ reservable: boolean, reason?: string }}
 */
export function isReservable(connector) {
  if (!connector) return { reservable: false, reason: 'Không tìm thấy thông tin cổng sạc.' };

  // Ưu tiên flag is_reservable từ backend
  if (typeof connector.is_reservable === 'boolean') {
    return connector.is_reservable
      ? { reservable: true }
      : { reservable: false, reason: 'Cổng sạc hiện không hỗ trợ đặt chỗ trước.' };
  }

  // Fallback: kiểm tra status
  const availableStatuses = ['AVAILABLE', 'RESERVED'];
  if (availableStatuses.includes(connector.status)) {
    return { reservable: true };
  }

  const statusReason = {
    CHARGING: 'Cổng đang sạc, không thể đặt chỗ.',
    OCCUPIED: 'Cổng đang có xe đặt cứng, không thể đặt chỗ.',
    UNAVAILABLE: 'Cổng không khả dụng.',
    MAINTENANCE: 'Cổng đang bảo trì.',
    FAULTED: 'Cổng đang báo lỗi.',
    OFFLINE: 'Cổng đang ngoại tuyến.',
  };

  return {
    reservable: false,
    reason: statusReason[connector.status] || `Cổng sạc ở trạng thái "${connector.status}", không thể đặt chỗ.`,
  };
}

/**
 * Sinh text tóm tắt thông tin đặt chỗ.
 *
 * @param {{ station_name: string, charge_point_code: string, connector_number: number, start_time: string, hold_minutes: number }} reservation
 * @returns {string}
 */
export function buildReservationSummary(reservation) {
  if (!reservation) return '';
  const startDate = reservation.start_time
    ? new Date(reservation.start_time).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'N/A';
  const endDate = reservation.expires_at
    ? new Date(reservation.expires_at).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : 'N/A';
  return `Trạm: ${reservation.station_name ?? ''}\nTrụ: ${reservation.charge_point_code ?? ''} | Cổng: ${reservation.connector_number ?? ''}\nBắt đầu: ${startDate}\nKết thúc: ${endDate}`;
}

/**
 * Tính số phút từ giờ bắt đầu đến giờ kết thúc.
 *
 * @param {string} startTime - ISO string
 * @param {string} expiresAt - ISO string
 * @returns {number} Số phút (làm tròn xuống)
 */
export function calcHoldMinutes(startTime, expiresAt) {
  if (!startTime || !expiresAt) return 0;
  const diff = new Date(expiresAt).getTime() - new Date(startTime).getTime();
  return Math.max(0, Math.floor(diff / 60_000));
}
