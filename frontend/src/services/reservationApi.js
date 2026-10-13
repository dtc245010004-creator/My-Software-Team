/**
 * HỢP ĐỒNG API ĐẶT CHỖ TRƯỚC TRỤ SẠC (S-48 & S-49 / SCRUM-372 / SCRUM-353)
 *
 * 1. Đặt chỗ đầu nối sạc:
 *    POST /api/v1/reservations
 *    Headers: Authorization: Bearer <access_token>
 *    Request Body:
 *    {
 *      connector_id: number,       // ID đầu nối trong CSDL
 *      expiry_date?: string,       // ISO 8601 UTC (tối đa 2 giờ)
 *      duration_minutes?: number,  // 1 đến 120 phút
 *      simulate_condition?: string // Dùng cho mô phỏng (ACCEPTED, OCCUPIED, ...)
 *    }
 *
 *    Response thành công (201 Created):
 *    {
 *      id: number,
 *      user_id: number,
 *      charge_point_id: number,
 *      charge_point_code: string,
 *      connector_id: number,
 *      connector_number: number,
 *      id_tag: string,
 *      start_time: string,
 *      expiry_date: string,
 *      status: "ACTIVE" | "PENDING",
 *      created_at: string,
 *      updated_at: string
 *    }
 *
 *    Response xung đột (409 Conflict - Hai người đặt cùng lúc):
 *    {
 *      detail: string,
 *      code?: "RESERVATION_CONFLICT",
 *      suggestions?: Array<{
 *        connector_id: number,
 *        charge_point_id: number,
 *        charge_point_code: string,
 *        connector_number: number,
 *        station_name: string,
 *        available_from?: string,
 *        type?: string,
 *        rated_power_kw?: number
 *      }>,
 *      suggested_connectors?: Array<{
 *        id: number,
 *        charge_point_id: number,
 *        charge_point_code: string,
 *        connector_id: number,
 *        connector_number: number,
 *        type: string,
 *        rated_power_kw: number,
 *        status: string
 *      }>
 *    }
 *
 * 2. Xem danh sách đặt chỗ của tôi:
 *    GET /api/v1/reservations/my
 *
 * 3. Hủy đặt chỗ:
 *    POST /api/v1/reservations/{reservation_id}/cancel
 */

import api from './api';
import { mapReservationError } from '../utils/reservationUtils';

/**
 * Gửi yêu cầu đặt chỗ trước đầu nối sạc
 * @param {{
 *   connector_id: number,
 *   expiry_date?: string,
 *   duration_minutes?: number,
 *   simulate_condition?: string
 * }} payload
 * @returns {Promise<any>}
 */
export async function createReservation(payload) {
  try {
    const res = await api.post('/reservations', payload);
    return res.data;
  } catch (error) {
    const mapped = mapReservationError(error);
    const enrichedError = new Error(mapped.message);
    enrichedError.code = mapped.code;
    enrichedError.isConflict = mapped.isConflict;
    enrichedError.suggestions = mapped.suggestions;
    enrichedError.originalError = error;
    enrichedError.status = error.response?.status;
    throw enrichedError;
  }
}

/**
 * Lấy danh sách lượt đặt chỗ của tài xế hiện tại
 * @returns {Promise<Array<any>>}
 */
export async function getMyReservations() {
  try {
    const res = await api.get('/reservations/my');
    return res.data || [];
  } catch (error) {
    const mapped = mapReservationError(error);
    const enrichedError = new Error(mapped.message);
    enrichedError.code = mapped.code;
    enrichedError.status = error.response?.status;
    throw enrichedError;
  }
}

/**
 * Hủy lượt đặt chỗ theo ID
 * @param {number|string} reservationId
 * @returns {Promise<any>}
 */
export async function cancelReservation(reservationId) {
  try {
    const res = await api.post(`/reservations/${reservationId}/cancel`);
    return res.data;
  } catch (error) {
    const mapped = mapReservationError(error);
    const enrichedError = new Error(mapped.message);
    enrichedError.code = mapped.code;
    enrichedError.status = error.response?.status;
    throw enrichedError;
  }
}

export const reservationApi = {
  createReservation,
  getMyReservations,
  cancelReservation,
};

export default reservationApi;

