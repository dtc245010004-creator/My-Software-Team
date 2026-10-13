/**
 * reservationApi.js — API service cho đặt chỗ trạm sạc.
 *
 * BACKEND CONTRACT (để đối chiếu với người làm backend S-48/S-49):
 *
 * POST /api/v1/reservations
 *   body: { connector_id: number, start_time: string (ISO 8601), hold_minutes?: number }
 *   201 Created  => {
 *     id: string,
 *     status: "ACTIVE",
 *     connector_id: number,
 *     charge_point_id: number,
 *     charge_point_code: string,
 *     station_id: number,
 *     station_name: string,
 *     connector_number: number,
 *     start_time: string (ISO 8601),
 *     expires_at: string (ISO 8601),
 *     hold_minutes: number,
 *     created_at: string (ISO 8601)
 *   }
 *   409 Conflict (S-49) => {
 *     detail: string,
 *     code: "RESERVATION_CONFLICT",
 *     suggestions: [{
 *       connector_id: number,
 *       charge_point_id: number,
 *       charge_point_code: string,
 *       connector_number: number,
 *       station_name: string,
 *       available_from: string (ISO 8601)
 *     }]
 *   }
 *   402 / 403 => {
 *     detail: string,
 *     code: "WALLET_BELOW_THRESHOLD",
 *     min_balance: number,
 *     balance: number
 *   }
 *   404 => { detail: string, code: "CHARGER_NOT_FOUND" }
 *   422 => { detail: string, code: "CHARGER_REJECTED" | "CHARGER_OCCUPIED" }
 *   504 => { detail: string, code: "GATEWAY_TIMEOUT" }
 *   503 => { detail: string, code: "CHARGER_UNDER_MAINTENANCE" }
 *
 * GET /api/v1/reservations/me
 *   200 OK => [{ ...Reservation, is_active: boolean }]
 *
 * DELETE /api/v1/reservations/{id}
 *   200 OK => { message: string }
 *   404 => { detail: string }
 */

import api from './api';
import { extractApiError } from './authService';

/**
 * Tạo đặt chỗ mới.
 *
 * @param {{ connector_id: number, start_time: string, hold_minutes?: number }} payload
 * @returns {Promise<object>} Reservation object
 * @throws {import('axios').AxiosError}
 */
export async function createReservation(payload) {
  const res = await api.post('/reservations', {
    connector_id: payload.connector_id,
    start_time: payload.start_time,
    ...(payload.hold_minutes != null && { hold_minutes: payload.hold_minutes }),
  });
  return res.data;
}

/**
 * Lấy danh sách đặt chỗ của tài xế hiện tại.
 *
 * @returns {Promise<Array>}
 */
export async function listMyReservations() {
  const res = await api.get('/reservations/me');
  return res.data;
}

/**
 * Huỷ đặt chỗ.
 *
 * @param {string|number} reservationId
 * @returns {Promise<{ message: string }>}
 */
export async function cancelReservation(reservationId) {
  const res = await api.delete(`/reservations/${reservationId}`);
  return res.data;
}

/**
 * Lấy số dư ví hiện tại.
 *
 * @returns {Promise<{ balance: number }>}
 */
export async function getMyWallet() {
  const res = await api.get('/wallet/me');
  return res.data;
}

/**
 * Trích lỗi từ API.
 *
 * @param {any} error
 * @param {string} [fallback]
 * @returns {string}
 */
export function extractReservationError(error, fallback = 'Đặt chỗ thất bại. Vui lòng thử lại.') {
  return extractApiError(error, fallback);
}
