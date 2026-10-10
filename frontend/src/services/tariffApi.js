feature/ManhDung
/**
 * Module API cho biểu giá sạc — dùng instance axios `api` chung của dự án
 * (đã cấu hình baseURL=/api/v1, có JWT interceptor, không tự tạo instance mới).
 *
 * CONTRACT thực tế (xem backend/app/api/v1/endpoints/tariffs.py + schemas/tariff.py):
 *
 * GET    /tariffs?station_id={id}        -> 200: list[TariffResponse]
 * GET    /tariffs/{tariff_id}            -> 200: TariffResponse | 404
 * POST   /tariffs                         -> 201: TariffResponse | 403 | 404 | 422
 * PUT    /tariffs/{tariff_id}            -> 200: TariffResponse | 400 | 403 | 404 | 422
 * DELETE /tariffs/{tariff_id}            -> 200: { message } | 403 | 404
 *
 * Lưu ý quan trọng:
 *  - PUT tạo PHIÊN BẢN MỚI có effective_from = 00:00 ngày mai (giờ VN).
 *    Không ghi đè bản ghi cũ; phiên sạc đang chạy vẫn dùng giá cũ.
 *  - Body TariffCreate: price_normal, price_peak, price_offpeak (Numeric 10,2)
 *    + idle_fee_per_minute, idle_grace_minutes + periods[] (optional)
 *  - Backend đã có sẵn station_id=null (biểu giá hệ thống) chỉ ADMIN được CRUD.
 */

import api from './api';

/** Lấy danh sách trạm mà user có quyền quản lý (dùng cho dropdown chọn trạm). */
export async function listStationsForOperator({ skip = 0, limit = 100 } = {}) {
  const res = await api.get('/stations', { params: { skip, limit } });
  // Backend trả List[StationResponse | StationDistanceResponse]; chỉ lấy field cần
  return Array.isArray(res.data) ? res.data.map(normalizeStation) : [];
}

function normalizeStation(s) {
  return {
    id: s.id,
    name: s.name,
    code: s.code || s.charge_point_code || `ST-${s.id}`,
    address: s.address,
    is_active: s.is_active,
    status: s.status,
  };
}

/** Lấy biểu giá đang có hiệu lực cho 1 trạm; trả null nếu trạm chưa có biểu giá. */
export async function getActiveTariffByStation(stationId) {
  if (!stationId) return null;
  const res = await api.get('/tariffs', { params: { station_id: stationId } });
  const list = Array.isArray(res.data) ? res.data : [];
  if (list.length === 0) return null;
  // Chọn bản ghi active mới nhất theo effective_from
  return list
    .filter((t) => t.is_active !== false)
    .sort((a, b) => new Date(b.effective_from) - new Date(a.effective_from))[0] || null;
}

/**
 * Tạo biểu giá mới cho trạm (POST /tariffs).
 * Body gồm price_normal, price_peak, price_offpeak + idle_fee_per_minute + idle_grace_minutes.
 */
export async function createTariff(payload) {
  const res = await api.post('/tariffs', payload);
  return res.data;
}

/**
 * Cập nhật biểu giá (PUT /tariffs/{id}) — backend tạo phiên bản mới có hiệu lực từ 00:00 ngày mai.
 * Trả về TariffResponse mới.
 */
export async function updateTariff(tariffId, payload) {
  const res = await api.put(`/tariffs/${tariffId}`, payload);
  return res.data;
}

/** Vô hiệu hoá biểu giá (soft-delete) — dùng khi cần. */
export async function deactivateTariff(tariffId) {
  const res = await api.delete(`/tariffs/${tariffId}`);
  return res.data;
}

/**
 * Trích lỗi tiếng Việt từ response Axios.
 * Ưu tiên: detail (mảng/string) -> message -> fallback.
 */
export function extractApiError(err, fallback = 'Lỗi không xác định từ máy chủ') {
  if (!err) return fallback;
  const data = err.response?.data;
  if (!data) return err.message || fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((d) => {
        if (typeof d === 'string') return d;
        const loc = Array.isArray(d.loc) ? d.loc.join('.') : '';
        return loc ? `${loc}: ${d.msg || d.message || 'không hợp lệ'}` : d.msg || d.message || 'không hợp lệ';
      })
      .join('; ');
  }
  if (typeof data.message === 'string') return data.message;
  return fallback;
}

// -------- Backward-compatible wrapper (cho TariffForm cũ & test cũ) --------

/** Lấy periods[] cho 1 trạm; map từ TariffResponse sang định dạng {start,end,price}[]. */
export async function getTariff(stationId) {
  const t = await getActiveTariffByStation(stationId);
  if (!t) {
    return {
      station_id: stationId,
      periods: [],
      idle_fee_per_minute: '0',
      idle_grace_minutes: '0',
    };
  }
  return {
    station_id: stationId,
    periods: (t.periods || []).map((p) => ({
      start: p.start_time,
      end: p.end_time,
      price: String(p.price_per_kwh),
    })),
    idle_fee_per_minute: String(t.idle_fee_per_minute ?? '0'),
    idle_grace_minutes: String(t.idle_grace_minutes ?? '0'),
  };
}

/**
 * Lưu periods[] cho 1 trạm. Nếu đã có tariff active -> PUT tạo version mới;
 * nếu chưa có -> POST tạo mới.
 */
export async function saveTariff(stationId, payload) {
  if (!stationId) throw new Error('Thiếu stationId');
  const periods = (payload?.periods || []).map((p, i) => ({
    start_time: p.start,
    end_time: p.end,
    price_per_kwh: p.price,
    sort_order: i,
  }));
  const body = {
    name: `Biểu giá trạm #${stationId}`,
    station_id: stationId,
    price_normal: periods[0]?.price_per_kwh ?? '0',
    price_peak: periods[0]?.price_per_kwh ?? '0',
    price_offpeak: periods[0]?.price_per_kwh ?? '0',
    idle_fee_per_minute: payload?.idle_fee_per_minute ?? '0',
    idle_grace_minutes: payload?.idle_grace_minutes ?? '0',
    periods,
  };
  const existing = await getActiveTariffByStation(stationId);
  if (existing) return updateTariff(existing.id, body);
  return createTariff(body);
}

import axios from 'axios';

/**
 * CONTRACT GIẢ ĐỊNH CHO API BIỂU GIÁ NHIỀU KHUNG GIỜ:
 * 
 * GET /api/v1/stations/{stationId}/tariff
 * Response 200 OK: {
 *   station_id: 1,
 *   periods: [
 *     { start: "08:00", end: "12:00", price: 4500 },
 *     ...
 *   ]
 * }
 * 
 * PUT /api/v1/stations/{stationId}/tariff
 * Body: { periods: [...] }
 * Response 200 OK
 * Response 400 Bad Request: { detail: "Lỗi từ backend..." }
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const USE_MOCK = true; // Công tắc bật mock data

const apiClient = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

let mockTariffs = {
    '1': {
        station_id: 1,
        periods: [
            { start: '00:00', end: '06:00', price: 2000 },
            { start: '06:00', end: '18:00', price: 3000 },
            { start: '18:00', end: '24:00', price: 4000 }
        ]
    }
};

export const getTariff = async (stationId) => {
    if (USE_MOCK) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const data = mockTariffs[String(stationId)] || { station_id: stationId, periods: [] };
                resolve(data);
            }, 500);
        });
    }
    
    const response = await apiClient.get(`/stations/${stationId}/tariff`);
    return response.data;
};

export const saveTariff = async (stationId, payload) => {
    if (USE_MOCK) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (!payload.periods || payload.periods.length === 0) {
                    reject(new Error("Phải có ít nhất 1 khung giờ"));
                    return;
                }
                
                mockTariffs[String(stationId)] = {
                    ...payload,
                    station_id: stationId
                };
                
                resolve(mockTariffs[String(stationId)]);
            }, 800);
        });
    }
    
    const response = await apiClient.put(`/stations/${stationId}/tariff`, payload);
    return response.data;
};

 main
