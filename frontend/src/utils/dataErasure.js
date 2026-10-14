import {
  REJECT_REASON_MIN_LENGTH,
  REJECT_REASON_MAX_LENGTH,
} from '../config/dataErasureConfig';

/**
 * Ánh xạ trạng thái yêu cầu xóa dữ liệu sang nhãn tiếng Việt và màu Badge.
 *
 * @param {string} status
 * @returns {{ label: string, variant: 'neutral'|'primary'|'success'|'warning'|'danger', description: string }}
 */
export function mapErasureStatus(status) {
  const normalized = (status || '').toUpperCase();
  switch (normalized) {
    case 'PENDING':
      return {
        label: 'Chờ duyệt',
        variant: 'warning',
        description: 'Yêu cầu đang chờ Quản trị viên xem xét và xác nhận phạm vi dữ liệu.',
      };
    case 'APPROVED':
      return {
        label: 'Đã duyệt (Đang xử lý)',
        variant: 'primary',
        description: 'Quản trị viên đã phê duyệt, hệ thống đang thực hiện quy trình ẩn danh hóa dữ liệu.',
      };
    case 'REJECTED':
      return {
        label: 'Đã từ chối',
        variant: 'danger',
        description: 'Yêu cầu bị từ chối. Bạn có thể xem lý do từ chối và gửi lại yêu cầu nếu cần.',
      };
    case 'COMPLETED':
      return {
        label: 'Đã hoàn tất',
        variant: 'success',
        description: 'Dữ liệu cá nhân và lịch sử sạc đã được ẩn danh hóa an toàn.',
      };
    default:
      return {
        label: status || 'Không xác định',
        variant: 'neutral',
        description: 'Trạng thái chưa được xác định.',
      };
  }
}

/**
 * Kiểm tra xem tài xế có thể gửi yêu cầu xóa dữ liệu mới hay không.
 * - Không được có yêu cầu đang xử lý (PENDING hoặc APPROVED)
 * - Số dư ví không được lớn hơn 0 (nếu ví còn tiền thì phải xử lý hoàn tiền trước)
 *
 * @param {object|null} existingRequest
 * @param {object|null} wallet
 * @returns {boolean}
 */
export function canSubmitRequest(existingRequest, wallet) {
  if (existingRequest) {
    const status = (existingRequest.status || '').toUpperCase();
    if (status === 'PENDING' || status === 'APPROVED') {
      return false;
    }
  }

  const balance = Number(wallet?.balance);
  if (!isNaN(balance) && balance > 0) {
    return false;
  }

  return true;
}

/**
 * Kiểm tra xem người dùng có thể duyệt yêu cầu xóa dữ liệu hay không.
 * - Vai trò phải là ADMIN
 * - Yêu cầu phải ở trạng thái PENDING
 * - Ví tài xế không được còn số dư dương
 *
 * @param {object|null} request
 * @param {string|null} role
 * @returns {boolean}
 */
export function canApprove(request, role) {
  if (!request || !role) return false;
  if (role !== 'ADMIN') return false;

  const status = (request.status || '').toUpperCase();
  if (status !== 'PENDING') return false;

  const balance = Number(request.wallet_balance);
  if (!isNaN(balance) && balance > 0) {
    return false;
  }

  return true;
}

/**
 * Kiểm tra xem người dùng có thể từ chối yêu cầu xóa dữ liệu hay không.
 * - Vai trò phải là ADMIN
 * - Yêu cầu phải ở trạng thái PENDING
 *
 * @param {object|null} request
 * @param {string|null} role
 * @returns {boolean}
 */
export function canReject(request, role) {
  if (!request || !role) return false;
  if (role !== 'ADMIN') return false;

  const status = (request.status || '').toUpperCase();
  return status === 'PENDING';
}

/**
 * Kiểm tra tính hợp lệ của lý do từ chối yêu cầu xóa dữ liệu.
 * - Bắt buộc nhập, trim khoảng trắng
 * - Độ dài tối thiểu REJECT_REASON_MIN_LENGTH (10 ký tự)
 * - Độ dài tối đa REJECT_REASON_MAX_LENGTH (500 ký tự)
 *
 * @param {string} reason
 * @returns {{ valid: boolean, error: string | null, reason: string }}
 */
export function validateRejectReason(reason) {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';

  if (!trimmed) {
    return {
      valid: false,
      error: 'Bắt buộc phải nhập lý do từ chối yêu cầu.',
      reason: '',
    };
  }

  if (trimmed.length < REJECT_REASON_MIN_LENGTH) {
    return {
      valid: false,
      error: `Lý do từ chối phải có ít nhất ${REJECT_REASON_MIN_LENGTH} ký tự (hiện có ${trimmed.length} ký tự).`,
      reason: trimmed,
    };
  }

  if (trimmed.length > REJECT_REASON_MAX_LENGTH) {
    return {
      valid: false,
      error: `Lý do từ chối không được vượt quá ${REJECT_REASON_MAX_LENGTH} ký tự (hiện có ${trimmed.length} ký tự).`,
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
 * Ánh xạ lỗi API phản hồi sang thông báo tiếng Việt thân thiện,
 * nhận diện chính xác các mã lỗi nghiệp vụ của SCRUM-418 và S-55.
 *
 * @param {any} error
 * @returns {{ message: string, code: string, balance?: number }}
 */
export function mapErasureError(error) {
  if (!error) {
    return {
      message: 'Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.',
      code: 'UNKNOWN_ERROR',
    };
  }

  if (error.response) {
    const status = error.response.status;
    const data = error.response.data || {};
    const detail = typeof data.detail === 'string' ? data.detail : '';
    const code = data.code || '';

    // Lỗi 409 Conflict cụ thể
    if (status === 409) {
      if (code === 'REQUEST_ALREADY_EXISTS') {
        return {
          message: detail || 'Bạn đã có một yêu cầu xóa dữ liệu đang trong quá trình xử lý.',
          code: 'REQUEST_ALREADY_EXISTS',
        };
      }
      if (code === 'WALLET_HAS_BALANCE') {
        const bal = data.balance !== undefined ? data.balance : null;
        return {
          message: detail || 'Ví tài xế còn số dư dương. Cần xử lý hoàn tiền hoặc rút tiền trước khi xóa.',
          code: 'WALLET_HAS_BALANCE',
          balance: bal,
        };
      }
      if (code === 'PERIOD_LOCKED') {
        return {
          message: detail || 'Không thể thực hiện do kỳ đối soát tài chính liên quan đã bị khóa (S-55).',
          code: 'PERIOD_LOCKED',
        };
      }
      return {
        message: detail || 'Yêu cầu không thể thực hiện do xung đột dữ liệu trên hệ thống.',
        code: code || 'CONFLICT',
      };
    }

    if (status === 401) {
      return {
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        code: 'UNAUTHORIZED',
      };
    }

    if (status === 403) {
      return {
        message: detail || 'Bạn không có quyền thực hiện thao tác này.',
        code: 'FORBIDDEN',
      };
    }

    if (status === 422) {
      return {
        message: detail || 'Dữ liệu yêu cầu không hợp lệ. Vui lòng kiểm tra lại thông tin.',
        code: 'VALIDATION_ERROR',
      };
    }

    if (status === 404 || status === 501) {
      return {
        message: 'Chức năng chưa sẵn sàng (backend chưa triển khai).',
        code: 'NOT_IMPLEMENTED',
      };
    }

    if (status >= 500) {
      return {
        message: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau giây lát.',
        code: 'SERVER_ERROR',
      };
    }

    return {
      message: detail || `Lỗi máy chủ (${status}). Vui lòng thử lại.`,
      code: code || `HTTP_${status}`,
    };
  }

  if (error.request) {
    return {
      message: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng của bạn.',
      code: 'NETWORK_ERROR',
    };
  }

  return {
    message: error.message || 'Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.',
    code: 'CLIENT_ERROR',
  };
}

/**
 * Bao bọc một hàm bất đồng bộ để chống bấm đôi (anti-double-click).
 * Chỉ cho phép 1 lời gọi diễn ra tại một thời điểm.
 *
 * @param {Function} asyncFn
 * @returns {Function}
 */
export function createSingleFlightHandler(asyncFn) {
  let inFlight = false;
  return async function (...args) {
    if (inFlight) return undefined;
    inFlight = true;
    try {
      return await asyncFn.apply(this, args);
    } finally {
      inFlight = false;
    }
  };
}

/**
 * Định dạng tiền tệ VND chuẩn Việt Nam.
 * @param {number|string|null|undefined} amount
 * @returns {string}
 */
export function formatCurrencyVND(amount) {
  const num = Number(amount);
  if (isNaN(num)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN').format(num) + ' ₫';
}
