import {
  REOPEN_REASON_MIN_LENGTH,
  REOPEN_REASON_MAX_LENGTH,
  SETTLEMENT_CLOSE_ROLES,
  SETTLEMENT_REOPEN_ROLES,
} from '../config/settlementConfig';
import { formatVNDate, formatVNDateTime } from './formatTime';

/**
 * Kiểm tra xem người dùng có quyền và kỳ có đủ điều kiện để Chốt kỳ hay không.
 * - Trạng thái kỳ phải là 'OPEN'
 * - Role phải nằm trong SETTLEMENT_CLOSE_ROLES (ACCOUNTANT, ADMIN)
 *
 * @param {object|null} period
 * @param {string|null} role
 * @returns {boolean}
 */
export function canClose(period, role) {
  if (!period || !role) return false;
  const status = (period.status || '').toUpperCase();
  if (status !== 'OPEN') return false;
  return SETTLEMENT_CLOSE_ROLES.includes(role);
}

/**
 * Kiểm tra xem người dùng có quyền và kỳ có đủ điều kiện để Mở lại kỳ hay không.
 * - Trạng thái kỳ phải là 'CLOSED'
 * - Role phải nằm trong SETTLEMENT_REOPEN_ROLES (chỉ ADMIN)
 *
 * @param {object|null} period
 * @param {string|null} role
 * @returns {boolean}
 */
export function canReopen(period, role) {
  if (!period || !role) return false;
  const status = (period.status || '').toUpperCase();
  if (status !== 'CLOSED') return false;
  return SETTLEMENT_REOPEN_ROLES.includes(role);
}

/**
 * Kiểm tra tính hợp lệ của lý do mở lại kỳ đối soát.
 * Bắt buộc nhập, trim khoảng trắng thừa, độ dài tối thiểu REOPEN_REASON_MIN_LENGTH,
 * độ dài tối đa REOPEN_REASON_MAX_LENGTH.
 *
 * @param {string} reason
 * @returns {{ valid: boolean, error: string | null, reason: string }}
 */
export function validateReopenReason(reason) {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';

  if (!trimmed) {
    return {
      valid: false,
      error: 'Bắt buộc phải nhập lý do mở lại kỳ.',
      reason: '',
    };
  }

  if (trimmed.length < REOPEN_REASON_MIN_LENGTH) {
    return {
      valid: false,
      error: `Lý do mở lại kỳ phải có ít nhất ${REOPEN_REASON_MIN_LENGTH} ký tự để ghi nhận nhật ký kiểm toán (hiện tại: ${trimmed.length} ký tự).`,
      reason: trimmed,
    };
  }

  if (trimmed.length > REOPEN_REASON_MAX_LENGTH) {
    return {
      valid: false,
      error: `Lý do mở lại kỳ không được vượt quá ${REOPEN_REASON_MAX_LENGTH} ký tự (hiện tại: ${trimmed.length} ký tự).`,
      reason: trimmed,
    };
  }

  return {
    valid: true,
    error: null,
    reason: trimmed,
  };
}

/**
 * Chuẩn hóa và mô tả thông tin phiên sạc chặn việc chốt kỳ.
 *
 * @param {object} session
 * @returns {{ id: string|number, chargePointCode: string, startedAtFormatted: string, reason: string }}
 */
export function describeBlockingSession(session) {
  if (!session || typeof session !== 'object') {
    return {
      id: 'N/A',
      chargePointCode: 'Không xác định',
      startedAtFormatted: 'N/A',
      reason: 'Phiên bất thường chưa xử lý',
    };
  }

  const id = session.session_id ?? session.id ?? 'N/A';
  const chargePointCode =
    session.charge_point_code ||
    session.charger_code ||
    session.charge_point_id ||
    'Không xác định';

  const rawStartedAt = session.started_at || session.start_time;
  const startedAtFormatted = rawStartedAt ? formatVNDateTime(rawStartedAt) : 'N/A';

  const reason =
    session.reason ||
    session.stop_reason ||
    session.issue ||
    'Phiên bất thường chưa được can thiệp xử lý';

  return {
    id,
    chargePointCode,
    startedAtFormatted,
    reason,
  };
}

/**
 * Định dạng khoảng ngày của kỳ đối soát: Từ [from] đến [to].
 * FE KHÔNG tự giả định kỳ tháng hay hợp đồng, hiển thị đúng dữ liệu backend trả về.
 *
 * @param {object} period
 * @returns {string}
 */
export function formatPeriodRange(period) {
  if (!period) return 'Không xác định';
  const fromFormatted = period.from ? formatVNDate(period.from) : null;
  const toFormatted = period.to ? formatVNDate(period.to) : null;

  if (fromFormatted && toFormatted) {
    return `Từ ${fromFormatted} đến ${toFormatted}`;
  }
  if (fromFormatted) {
    return `Từ ${fromFormatted}`;
  }
  if (toFormatted) {
    return `Đến ${toFormatted}`;
  }
  return 'Thời gian chưa xác định';
}

/**
 * Ánh xạ lỗi API từ backend sang cấu trúc thông báo thân thiện bằng tiếng Việt.
 * Đặc biệt nhận diện mã lỗi 409 BLOCKED_BY_ABNORMAL_SESSIONS.
 *
 * @param {any} error
 * @returns {{ isBlocked: boolean, code: string | null, message: string, sessions: Array<any> }}
 */
export function mapSettlementError(error) {
  if (!error) {
    return {
      isBlocked: false,
      code: null,
      message: 'Đã xảy ra lỗi không xác định.',
      sessions: [],
    };
  }

  if (error.response) {
    const { status, data } = error.response;
    const errorCode = data?.code || null;
    const detail = data?.detail;

    // 409 BLOCKED_BY_ABNORMAL_SESSIONS: Chặn chốt do còn phiên bất thường
    if (status === 409 && (errorCode === 'BLOCKED_BY_ABNORMAL_SESSIONS' || data?.sessions)) {
      const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
      return {
        isBlocked: true,
        code: 'BLOCKED_BY_ABNORMAL_SESSIONS',
        message:
          typeof detail === 'string' && detail.trim()
            ? detail
            : 'Không thể chốt kỳ: còn phiên bất thường chưa xử lý.',
        sessions,
      };
    }

    // 404 / 501: Endpoint chưa có trên backend
    if (status === 404 || status === 501) {
      return {
        isBlocked: false,
        code: String(status),
        message: 'Chức năng chưa sẵn sàng (backend chưa triển khai).',
        sessions: [],
      };
    }

    // 401: Chưa đăng nhập hoặc hết hạn token
    if (status === 401) {
      return {
        isBlocked: false,
        code: 'UNAUTHORIZED',
        message:
          typeof detail === 'string' && detail.trim()
            ? detail
            : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        sessions: [],
      };
    }

    // 403: Không đủ thẩm quyền
    if (status === 403) {
      return {
        isBlocked: false,
        code: 'FORBIDDEN',
        message:
          typeof detail === 'string' && detail.trim()
            ? detail
            : 'Bạn không có quyền thực hiện thao tác này.',
        sessions: [],
      };
    }

    // 422: Dữ liệu gửi lên không hợp lệ (ví dụ thiếu lý do)
    if (status === 422) {
      let validationMsg = 'Dữ liệu không hợp lệ.';
      if (typeof detail === 'string' && detail.trim()) {
        validationMsg = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        validationMsg = detail.map((d) => d.msg || d.message).filter(Boolean).join('; ');
      }
      return {
        isBlocked: false,
        code: 'VALIDATION_ERROR',
        message: validationMsg || 'Dữ liệu không hợp lệ.',
        sessions: [],
      };
    }

    // 409 khác
    if (status === 409) {
      return {
        isBlocked: false,
        code: errorCode || 'CONFLICT',
        message:
          typeof detail === 'string' && detail.trim()
            ? detail
            : 'Xung đột trạng thái kỳ đối soát.',
        sessions: [],
      };
    }

    // 500+
    if (status >= 500) {
      return {
        isBlocked: false,
        code: 'SERVER_ERROR',
        message:
          typeof detail === 'string' && detail.trim()
            ? detail
            : 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
        sessions: [],
      };
    }

    if (typeof detail === 'string' && detail.trim()) {
      return {
        isBlocked: false,
        code: errorCode || `STATUS_${status}`,
        message: detail,
        sessions: [],
      };
    }

    return {
      isBlocked: false,
      code: `STATUS_${status}`,
      message: `Yêu cầu thất bại với mã lỗi ${status}.`,
      sessions: [],
    };
  }

  // Lỗi mạng không phản hồi
  if (error.request) {
    return {
      isBlocked: false,
      code: 'NETWORK_ERROR',
      message: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền mạng.',
      sessions: [],
    };
  }

  return {
    isBlocked: false,
    code: 'UNKNOWN_ERROR',
    message: error.message || 'Đã xảy ra lỗi không xác định.',
    sessions: [],
  };
}

/**
 * Dữ liệu mẫu kiểm thử giao diện SCRUM-408 (khi backend chưa triển khai endpoint /settlement/periods).
 * Bao gồm cả kỳ chốt thành công và kỳ bị chặn do còn phiên bất thường.
 */
export const DEMO_SETTLEMENT_PERIODS = [
  {
    id: 1,
    label: 'Kỳ 10/2026',
    from: '2026-10-01T00:00:00Z',
    to: '2026-10-14T23:59:59Z',
    status: 'OPEN',
    closed_at: null,
    closed_by_name: null,
    has_abnormal_sessions: true, // Kịch bản kiểm thử 409: Có phiên bất thường chặn chốt
  },
  {
    id: 2,
    label: 'Kỳ 09/2026',
    from: '2026-09-01T00:00:00Z',
    to: '2026-09-30T23:59:59Z',
    status: 'OPEN',
    closed_at: null,
    closed_by_name: null,
    has_abnormal_sessions: false, // Kịch bản kiểm thử 200: Chốt kỳ thành công
  },
  {
    id: 3,
    label: 'Kỳ 08/2026',
    from: '2026-08-01T00:00:00Z',
    to: '2026-08-31T23:59:59Z',
    status: 'CLOSED',
    closed_at: '2026-09-01T08:30:00Z',
    closed_by_name: 'Kế Toán Viên Hệ Thống',
    has_abnormal_sessions: false, // Kịch bản kiểm thử: Mở lại kỳ cho ADMIN
  },
];

/**
 * Danh sách phiên sạc bất thường chặn chốt kỳ mẫu phục vụ nghiệm thu 409 BLOCKED_BY_ABNORMAL_SESSIONS.
 */
export const DEMO_BLOCKING_SESSIONS = [
  {
    session_id: 104,
    charge_point_code: 'SIM-001',
    started_at: '2026-10-10T14:20:00Z',
    reason: 'Có kWh điện cấp qua đồng hồ nhưng chưa phát sinh hóa đơn',
  },
  {
    session_id: 105,
    charge_point_code: 'SIM-002',
    started_at: '2026-10-11T09:15:00Z',
    reason: 'Đã chốt hóa đơn nhưng chưa hạch toán trừ ví điện tử',
  },
  {
    session_id: 106,
    charge_point_code: 'SIM-003',
    started_at: '2026-10-12T18:45:00Z',
    reason: 'Mất tín hiệu truyền thông OCPP đột ngột, phiên chưa kết thúc',
  },
];


