/**
 * Dịch vụ API Quản lý Kỳ đối soát (S-55 / SCRUM-387 / SCRUM-408).
 *
 * HỢP ĐỒNG API VỚI BACKEND:
 *
 * 1. Lấy danh sách kỳ đối soát:
 *    - Endpoint: GET /api/v1/settlement/periods
 *    - Phản hồi 200 OK:
 *      Array<{
 *        id: number | string,
 *        label: string,               // Ví dụ: "2026-09" hoặc "Kỳ 09/2026"
 *        from: string,                // ISO 8601 (vd: "2026-09-01T00:00:00Z")
 *        to: string,                  // ISO 8601 (vd: "2026-09-30T23:59:59Z")
 *        status: "OPEN" | "CLOSED",   // Trạng thái kỳ
 *        closed_at?: string | null,   // ISO 8601 thời điểm chốt
 *        closed_by_name?: string | null // Tên người thực hiện chốt
 *      }>
 *    - Lỗi: 401 (Chưa đăng nhập), 403 (Không có quyền), 404/501 ("Chức năng chưa sẵn sàng")
 *
 * 2. Chốt kỳ đối soát:
 *    - Endpoint: POST /api/v1/settlement/periods/{id}/close
 *    - Phân quyền: ACCOUNTANT, ADMIN
 *    - Phản hồi 200 OK:
 *      {
 *        message?: string,
 *        period?: object
 *      }
 *    - Phản hồi 409 Conflict:
 *      {
 *        detail: string,
 *        code: "BLOCKED_BY_ABNORMAL_SESSIONS",
 *        sessions: Array<{
 *          session_id: number | string,
 *          charge_point_code: string,
 *          started_at: string,
 *          reason: string
 *        }>
 *      }
 *    - Lỗi khác: 401, 403, 404, 500
 *
 * 3. Mở lại kỳ đối soát:
 *    - Endpoint: POST /api/v1/settlement/periods/{id}/reopen
 *    - Body: { reason: string } (Bắt buộc, trim, tối thiểu 10 ký tự)
 *    - Phân quyền: CHỈ ADMIN
 *    - Phản hồi 200 OK:
 *      {
 *        message?: string,
 *        period?: object
 *      }
 *    - Lỗi: 403 (Không phải ADMIN), 422 (Lý do không hợp lệ/rỗng), 409 (Kỳ đang mở), 404, 500
 */

import api from './api';

/**
 * Lấy danh sách toàn bộ các kỳ đối soát từ máy chủ.
 * @returns {Promise<Array<object>>}
 */
export async function getSettlementPeriods() {
  const response = await api.get('/settlement/periods');
  return response.data || [];
}

/**
 * Thực hiện chốt kỳ đối soát.
 * @param {number|string} periodId
 * @returns {Promise<object>}
 */
export async function closeSettlementPeriod(periodId) {
  if (!periodId) {
    throw new Error('Mã kỳ đối soát không hợp lệ.');
  }
  const response = await api.post(`/settlement/periods/${periodId}/close`);
  return response.data;
}

/**
 * Thực hiện mở lại kỳ đối soát đã chốt (chỉ dành cho ADMIN, bắt buộc nhập lý do).
 * @param {number|string} periodId
 * @param {string} reason
 * @returns {Promise<object>}
 */
export async function reopenSettlementPeriod(periodId, reason) {
  if (!periodId) {
    throw new Error('Mã kỳ đối soát không hợp lệ.');
  }
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmed) {
    throw new Error('Bắt buộc phải nhập lý do mở lại kỳ.');
  }

  const response = await api.post(`/settlement/periods/${periodId}/reopen`, {
    reason: trimmed,
  });
  return response.data;
}

