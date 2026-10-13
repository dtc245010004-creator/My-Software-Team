/**
 * Tiện ích xử lý dữ liệu và ánh xạ lỗi đặt chỗ trụ sạc (S-48, S-49, SCRUM-372).
 * Hỗ trợ chuẩn hóa phản hồi xung đột (409 RESERVATION_CONFLICT) và danh sách trụ gợi ý.
 */

import { formatVNTime, formatVNDateTime, parseToDate } from './formatTime';

/**
 * Chuẩn hóa danh sách đầu nối/trụ sạc gợi ý từ Backend.
 * Hỗ trợ linh hoạt cả hai định dạng:
 * - Hợp đồng đề xuất: suggestions: [{ connector_id, charge_point_id, charge_point_code, connector_number, station_name, available_from, ... }]
 * - Backend hiện hữu: suggested_connectors: [{ id, charge_point_id, charge_point_code, connector_id, connector_number, connector_type, type, rated_power_kw, status }]
 *
 * @param {Array<Object>} [rawList=[]]
 * @returns {Array<{
 *   connectorId: number,
 *   chargePointId: number,
 *   chargePointCode: string,
 *   connectorNumber: number,
 *   connectorType: string,
 *   ratedPowerKw: number|null,
 *   stationName: string,
 *   availableFrom: string|null,
 *   status: string
 * }>}
 */
export function normalizeSuggestions(rawList) {
  if (!Array.isArray(rawList)) return [];

  return rawList
    .filter((item) => item && (item.id != null || item.connector_id != null))
    .map((item) => {
      const connectorId = item.id ?? item.connector_id;
      const chargePointId = item.charge_point_id ?? null;
      const chargePointCode = item.charge_point_code || (chargePointId ? `Trụ #${chargePointId}` : 'Trụ sạc');
      const connectorNumber = item.connector_number ?? (item.connector_id || 1);
      const connectorType = item.connector_type || item.type || 'CCS2';
      const ratedPowerKw = item.rated_power_kw ?? item.max_power_kw ?? null;
      const stationName = item.station_name || 'Cùng trạm sạc';
      const availableFrom = item.available_from || null;
      const status = item.status || 'AVAILABLE';

      return {
        connectorId,
        chargePointId,
        chargePointCode,
        connectorNumber,
        connectorType,
        ratedPowerKw,
        stationName,
        availableFrom,
        status,
      };
    });
}

/**
 * Ánh xạ lỗi API đặt chỗ sang thông điệp tiếng Việt và phân loại xung đột.
 * @param {any} error Axios error object hoặc generic error
 * @returns {{
 *   code: string,
 *   message: string,
 *   detail?: string,
 *   isConflict: boolean,
 *   suggestions: Array<any>
 * }}
 */
export function mapReservationError(error) {
  if (!error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.',
      isConflict: false,
      suggestions: [],
    };
  }

  // Trường hợp phản hồi từ HTTP Response
  if (error.response) {
    const status = error.response.status;
    const resData = error.response.data || {};
    const detail = typeof resData.detail === 'string' ? resData.detail : '';
    const resCode = resData.code || '';

    // 1. Trường hợp 409 Conflict: Trụ bị trùng/đã có người đặt (S-49 / SCRUM-372)
    if (status === 409 || resCode === 'RESERVATION_CONFLICT') {
      const rawSuggestions = resData.suggestions || resData.suggested_connectors || [];
      const normalizedSuggestions = normalizeSuggestions(rawSuggestions);

      return {
        code: 'RESERVATION_CONFLICT',
        message: 'Trụ này vừa được người khác đặt trước.',
        detail: detail || 'Trụ sạc hoặc đầu nối này vừa được người khác đặt chỗ thành công.',
        isConflict: true,
        suggestions: normalizedSuggestions,
      };
    }

    // 2. Chức năng chưa sẵn sàng (404 hoặc 501)
    if (status === 404 || status === 501) {
      return {
        code: 'NOT_IMPLEMENTED',
        message: 'Chức năng chưa sẵn sàng.',
        detail: detail || 'Dịch vụ đặt chỗ đang được cấu hình hoặc chưa hỗ trợ trên máy chủ.',
        isConflict: false,
        suggestions: [],
      };
    }

    // 3. Hết hạn phiên đăng nhập (401)
    if (status === 401) {
      return {
        code: 'UNAUTHORIZED',
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        detail,
        isConflict: false,
        suggestions: [],
      };
    }

    // 4. Không đủ quyền hoặc tài khoản bị khóa/ví không đủ điều kiện (403)
    if (status === 403) {
      return {
        code: 'FORBIDDEN',
        message: detail || 'Số dư ví hoặc tài khoản chưa đủ điều kiện đặt chỗ (tối thiểu 50.000đ).',
        detail,
        isConflict: false,
        suggestions: [],
      };
    }

    // 5. Tham số không hợp lệ (400 hoặc 422)
    if (status === 400 || status === 422) {
      return {
        code: 'VALIDATION_ERROR',
        message: detail || 'Thông tin thời gian hoặc cổng sạc đặt chỗ không hợp lệ.',
        detail,
        isConflict: false,
        suggestions: [],
      };
    }

    // 6. Timeout kết nối trụ sạc (504 Gateway Timeout)
    if (status === 504) {
      return {
        code: 'GATEWAY_TIMEOUT',
        message: 'Hết thời gian chờ phản hồi từ trụ sạc. Vui lòng thử lại sau giây lát.',
        detail,
        isConflict: false,
        suggestions: [],
      };
    }

    // 7. Lỗi máy chủ khác (500, 502, 503)
    if (status >= 500) {
      return {
        code: 'SERVER_ERROR',
        message: detail || 'Hệ thống đang bận hoặc trụ sạc tạm thời không phản hồi.',
        detail,
        isConflict: false,
        suggestions: [],
      };
    }

    return {
      code: `HTTP_${status}`,
      message: detail || `Yêu cầu thất bại (Mã lỗi: ${status}).`,
      detail,
      isConflict: false,
      suggestions: [],
    };
  }

  // Lỗi mạng hoặc không nhận được phản hồi
  if (error.request) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.',
      isConflict: false,
      suggestions: [],
    };
  }

  return {
    code: 'CLIENT_ERROR',
    message: error.message || 'Đã xảy ra lỗi không xác định.',
    isConflict: false,
    suggestions: [],
  };
}

/**
 * Định dạng mốc thời gian trống của trụ sạc sang tiếng Việt
 * @param {string|Date} [availableFrom]
 * @returns {string}
 */
export function formatSuggestionAvailableTime(availableFrom) {
  if (!availableFrom) return 'Đang có sẵn ngay';

  const d = parseToDate(availableFrom);
  if (!d || isNaN(d.getTime())) return 'Đang có sẵn ngay';

  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return `Trống từ ${formatVNTime(d)}`;
  }
  return `Trống từ ${formatVNDateTime(d)}`;
}

/**
 * Hàm bọc (wrapper) chống bấm đôi (anti-double-click).
 * Đảm bảo khi 1 tác vụ đang chờ phản hồi, các lần bấm tiếp theo bị chặn hoàn toàn.
 * @param {(...args: any[]) => Promise<any>} asyncFn
 * @returns {(...args: any[]) => Promise<any>}
 */
export function createSingleFlightHandler(asyncFn) {
  let isExecuting = false;
  return async function (...args) {
    if (isExecuting) return;
    try {
      isExecuting = true;
      return await asyncFn(...args);
    } finally {
      isExecuting = false;
    }
  };
}
