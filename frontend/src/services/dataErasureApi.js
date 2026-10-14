/**
 * Dịch vụ API Yêu cầu xóa dữ liệu cá nhân tài xế và Phê duyệt của Admin
 * (SCRUM-418 / SCRUM-389 / SCRUM-41 / Phụ thuộc S-55).
 *
 * HỢP ĐỒNG API VỚI BACKEND:
 *
 * 1. Lấy trạng thái yêu cầu hiện tại của tài xế:
 *    - Endpoint: GET /api/v1/data-erasure/requests/me
 *    - Phân quyền: CUSTOMER
 *    - Phản hồi 200 OK:
 *      {
 *        id: number | string,
 *        status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED",
 *        reason?: string | null,
 *        requested_at: string,            // ISO 8601
 *        decided_at?: string | null,      // ISO 8601
 *        decided_by_name?: string | null, // Tên người duyệt/từ chối
 *        reject_reason?: string | null    // Lý do từ chối nếu status = REJECTED
 *      }
 *    - Nếu tài xế chưa từng gửi yêu cầu: Trả 200 OK với null/rỗng hoặc 404 Not Found.
 *    - Lỗi: 401 (Chưa đăng nhập), 403 (Không có quyền), 404/501 ("Chức năng chưa sẵn sàng")
 *
 * 2. Tài xế gửi yêu cầu xóa dữ liệu mới:
 *    - Endpoint: POST /api/v1/data-erasure/requests
 *    - Phân quyền: CUSTOMER
 *    - Body: { reason?: string }
 *    - Phản hồi 201 Created:
 *      {
 *        id: number | string,
 *        status: "PENDING",
 *        requested_at: string
 *      }
 *    - Phản hồi 409 Conflict:
 *      + code: "REQUEST_ALREADY_EXISTS" (Đang có yêu cầu PENDING/APPROVED)
 *      + code: "WALLET_HAS_BALANCE", balance: number (Ví còn số dư dương)
 *
 * 3. Lấy thông tin ví của tài xế hiện tại:
 *    - Endpoint: GET /api/v1/wallet/me
 *    - Phản hồi 200 OK: { id, balance: number, currency: string, ... }
 *
 * 4. Quản trị viên lấy danh sách toàn bộ yêu cầu xóa dữ liệu:
 *    - Endpoint: GET /api/v1/admin/data-erasure/requests?status=...
 *    - Phân quyền: ADMIN
 *    - Phản hồi 200 OK:
 *      Array<{
 *        id: number | string,
 *        driver_id: number | string,
 *        driver_name: string,
 *        driver_email?: string,
 *        status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED",
 *        requested_at: string,
 *        wallet_balance: number,
 *        reason?: string | null
 *      }>
 *
 * 5. Quản trị viên lấy chi tiết 1 yêu cầu xóa dữ liệu:
 *    - Endpoint: GET /api/v1/admin/data-erasure/requests/{id}
 *    - Phân quyền: ADMIN
 *    - Phản hồi 200 OK:
 *      {
 *        id: number | string,
 *        driver_id: number | string,
 *        driver_name: string,
 *        driver_email?: string,
 *        status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED",
 *        requested_at: string,
 *        wallet_balance: number,
 *        reason?: string | null,
 *        decided_by_name?: string | null,
 *        decided_at?: string | null,
 *        reject_reason?: string | null,
 *        scope?: {
 *          to_anonymize: string[],
 *          to_retain: string[]
 *        }
 *      }
 *
 * 6. Quản trị viên phê duyệt yêu cầu xóa:
 *    - Endpoint: POST /api/v1/admin/data-erasure/requests/{id}/approve
 *    - Phân quyền: ADMIN
 *    - Body: { confirm_scope: boolean }
 *    - Phản hồi 200 OK: { message: string, request: object }
 *    - Phản hồi 409 Conflict:
 *      + code: "WALLET_HAS_BALANCE", balance: number
 *      + code: "PERIOD_LOCKED" (Kỳ đối soát liên quan đã bị khóa theo S-55)
 *
 * 7. Quản trị viên từ chối yêu cầu xóa:
 *    - Endpoint: POST /api/v1/admin/data-erasure/requests/{id}/reject
 *    - Phân quyền: ADMIN
 *    - Body: { reason: string } (Bắt buộc, tối thiểu 10 ký tự)
 *    - Phản hồi 200 OK: { message: string, request: object }
 *    - Lỗi: 422 (Lý do rỗng/ngắn), 403, 404, 500
 */

import api from './api';

/**
 * Lấy yêu cầu xóa dữ liệu hiện tại của tài xế đăng nhập.
 * @returns {Promise<object|null>}
 */
export async function getMyErasureRequest() {
  try {
    // Thử endpoint chuẩn của Backend S-57
    try {
      const response = await api.get('/me/data-erasure-requests');
      if (Array.isArray(response.data)) {
        if (response.data.length === 0) return null;
        // Lấy yêu cầu mới nhất
        return [...response.data].sort(
          (a, b) => new Date(b.requested_at) - new Date(a.requested_at)
        )[0];
      }
      return response.data || null;
    } catch (err) {
      if (err.response?.status === 404) {
        // Thử route thay thế nếu có
        try {
          const alt = await api.get('/data-erasure/requests/me');
          return alt?.data || null;
        } catch {
          return null;
        }
      }
      throw err;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Gửi yêu cầu xóa dữ liệu cá nhân mới cho tài xế.
 * @param {object} payload
 * @param {string} [payload.reason]
 * @returns {Promise<object>}
 */
export async function submitErasureRequest(payload = {}) {
  const body = {
    reason: typeof payload.reason === 'string' ? payload.reason.trim() : '',
  };
  try {
    const response = await api.post('/me/data-erasure-requests', body);
    return response.data;
  } catch (err) {
    if (err.response?.status === 404) {
      const alt = await api.post('/data-erasure/requests', body);
      return alt.data;
    }
    throw err;
  }
}

/**
 * Lấy thông tin ví của tài xế đang đăng nhập để kiểm tra số dư.
 * @returns {Promise<object>}
 */
export async function getMyWallet() {
  const response = await api.get('/wallet/me');
  return response.data;
}

/**
 * Lấy danh sách các yêu cầu xóa dữ liệu phía Admin.
 * @param {string} [status] - Lọc theo trạng thái ("PENDING", "APPROVED", "REJECTED", "COMPLETED" hoặc "ALL")
 * @returns {Promise<Array<object>>}
 */
export async function getAdminErasureRequests(status = 'ALL') {
  const params = {};
  if (status && status !== 'ALL') {
    params.status = status;
  }
  try {
    const response = await api.get('/admin/data-erasure-requests', { params });
    return Array.isArray(response.data) ? response.data : (response.data?.items || []);
  } catch (err) {
    if (err.response?.status === 404) {
      const alt = await api.get('/admin/data-erasure/requests', { params });
      return Array.isArray(alt.data) ? alt.data : (alt.data?.items || []);
    }
    throw err;
  }
}

/**
 * Lấy chi tiết một yêu cầu xóa dữ liệu phía Admin.
 * @param {number|string} id
 * @returns {Promise<object>}
 */
export async function getAdminErasureRequestDetail(id) {
  if (!id) {
    throw new Error('Mã yêu cầu không hợp lệ.');
  }
  try {
    const response = await api.get(`/admin/data-erasure-requests/${id}`);
    return response.data;
  } catch (err) {
    if (err.response?.status === 404) {
      const alt = await api.get(`/admin/data-erasure/requests/${id}`);
      return alt.data;
    }
    throw err;
  }
}

/**
 * Quản trị viên duyệt yêu cầu xóa dữ liệu.
 * @param {number|string} id
 * @param {object} payload
 * @param {boolean} [payload.confirm_scope=true]
 * @returns {Promise<object>}
 */
export async function approveErasureRequest(id, payload = { confirm_scope: true }) {
  if (!id) {
    throw new Error('Mã yêu cầu không hợp lệ.');
  }
  const body = { confirm_scope: Boolean(payload.confirm_scope) };
  try {
    const response = await api.post(`/admin/data-erasure-requests/${id}/approve`, body);
    return response.data;
  } catch (err) {
    if (err.response?.status === 404) {
      const alt = await api.post(`/admin/data-erasure/requests/${id}/approve`, body);
      return alt.data;
    }
    throw err;
  }
}

/**
 * Quản trị viên từ chối yêu cầu xóa dữ liệu kèm lý do bắt buộc.
 * @param {number|string} id
 * @param {object} payload
 * @param {string} payload.reason
 * @returns {Promise<object>}
 */
export async function rejectErasureRequest(id, payload = {}) {
  if (!id) {
    throw new Error('Mã yêu cầu không hợp lệ.');
  }
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  if (!reason) {
    throw new Error('Bắt buộc phải nhập lý do từ chối.');
  }
  const body = { reason };
  try {
    const response = await api.post(`/admin/data-erasure-requests/${id}/reject`, body);
    return response.data;
  } catch (err) {
    if (err.response?.status === 404) {
      const alt = await api.post(`/admin/data-erasure/requests/${id}/reject`, body);
      return alt.data;
    }
    throw err;
  }
}

