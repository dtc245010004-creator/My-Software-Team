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

/**
 * Dữ liệu mẫu kiểm thử UI SCRUM-418 khi backend trên nhánh main chưa triển khai endpoint.
 * Bao gồm đủ các ca: Chờ duyệt hợp lệ, Chờ duyệt bị chặn ví còn tiền, Đã duyệt, Đã từ chối, Hoàn tất.
 */
export const DEMO_ERASURE_REQUESTS = [
  {
    id: 101,
    user_id: 1,
    driver_name: 'Trần Thị Bích Ngọc (Tài xế VF9)',
    driver_email: 'driver_vip@gmail.com',
    status: 'PENDING',
    requested_at: '2026-10-14T08:15:00Z',
    wallet_balance: 0,
    reason: 'Tôi chuyển sang định cư nước ngoài, không còn nhu cầu sử dụng xe điện tại Việt Nam.',
    scope: {
      to_anonymize: [
        'Họ và tên, số điện thoại, email tài xế',
        'Lịch sử phiên sạc chi tiết và thời điểm sạc',
        'Lịch sử đặt chỗ và lộ trình di chuyển các trạm sạc',
      ],
      to_retain: [
        'Tổng số kWh điện năng đã tiêu thụ (Sổ cái kế toán)',
        'Tổng doanh thu phát sinh và chứng từ hạch toán tài chính (Luật Kế toán)',
      ],
    },
  },
  {
    id: 102,
    user_id: 2,
    driver_name: 'Nguyễn Văn Hùng',
    driver_email: 'driver1@gmail.com',
    status: 'PENDING',
    requested_at: '2026-10-14T07:45:00Z',
    wallet_balance: 250000, // Kịch bản kiểm thử: Ví còn số dư dương, nút Duyệt bị chặn
    reason: 'Yêu cầu xóa thông tin tài khoản cá nhân theo Nghị định 13/2023/NĐ-CP.',
    scope: {
      to_anonymize: [
        'Thông tin cá nhân tài xế',
        'Lịch sử sạc và lộ trình di chuyển',
      ],
      to_retain: [
        'Chứng từ thanh toán ví và hóa đơn tiền điện',
      ],
    },
  },
  {
    id: 103,
    user_id: 3,
    driver_name: 'Lê Hoàng Nam',
    driver_email: 'nam.le@example.com',
    status: 'APPROVED',
    requested_at: '2026-10-13T14:20:00Z',
    reviewed_by_id: 1,
    reviewed_at: '2026-10-13T16:00:00Z',
    decided_by_name: 'Quản Trị Viên Hệ Thống',
    decided_at: '2026-10-13T16:00:00Z',
    wallet_balance: 0,
    reason: 'Đã bán xe điện không còn sử dụng.',
  },
  {
    id: 104,
    user_id: 4,
    driver_name: 'Phạm Minh Tuấn',
    driver_email: 'tuan.pm@example.com',
    status: 'REJECTED',
    requested_at: '2026-10-12T09:30:00Z',
    reviewed_by_id: 1,
    reviewed_at: '2026-10-12T11:15:00Z',
    decided_by_name: 'Quản Trị Viên Hệ Thống',
    decided_at: '2026-10-12T11:15:00Z',
    reject_reason: 'Tài khoản đang có khiếu nại bồi thường sự cố sạc tại Trạm Hà Đông chưa giải quyết xong.',
    wallet_balance: 0,
    reason: 'Không muốn lưu lại thông tin trên hệ thống.',
  },
  {
    id: 105,
    user_id: 5,
    driver_name: 'Vũ Đức Thịnh',
    driver_email: 'thinh.vu@example.com',
    status: 'COMPLETED',
    requested_at: '2026-10-10T10:00:00Z',
    reviewed_by_id: 1,
    reviewed_at: '2026-10-10T10:30:00Z',
    completed_at: '2026-10-10T10:35:00Z',
    decided_by_name: 'Quản Trị Viên Hệ Thống',
    decided_at: '2026-10-10T10:30:00Z',
    wallet_balance: 0,
    reason: 'Yêu cầu thực hiện quyền bảo vệ dữ liệu cá nhân.',
  },
];

/**
 * Thêm yêu cầu demo mới từ tài xế (dùng khi backend chưa có API để kiểm thử luồng E2E)
 * @param {object} req
 */
export function addDemoErasureRequest(req) {
  if (req && typeof req === 'object') {
    DEMO_ERASURE_REQUESTS.unshift(req);
  }
}

