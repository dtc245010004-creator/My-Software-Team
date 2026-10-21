import api from './api';

/**
 * CONTRACT API BIỂU GIÁ NHIỀU KHUNG GIỜ (ĐỒNG BỘ TRỰC TIẾP VỚI DATABASE):
 * 
 * GET /api/v1/tariffs/live-config?station_id={stationId}
 * Response 200 OK: {
 *   station_id: 1,
 *   idle_fee_per_minute: 3000,
 *   idle_grace_minutes: 0,
 *   periods: [
 *     { start: "00:00", end: "06:00", price: 2000 },
 *     ...
 *   ]
 * }
 * 
 * PUT /api/v1/tariffs/live-config
 * Body: { station_id: 1, idle_fee_per_minute: 3000, idle_grace_minutes: 0, periods: [...] }
 * Response 200 OK
 */

const STORAGE_KEY = 'ev_csms_station_tariffs';

export const TARIFF_PRESETS = [
    {
        id: 'evn_tou',
        name: 'EVN 3 Khung Giờ (TOU Chuẩn)',
        description: 'Thấp điểm 00-04h & 20-24h (1.850đ), Cao điểm 16-20h (4.850đ), Bình thường 04-16h (3.250đ)',
        periods: [
            { start: '00:00', end: '04:00', price: 1850 },
            { start: '04:00', end: '16:00', price: 3250 },
            { start: '16:00', end: '20:00', price: 4850 },
            { start: '20:00', end: '24:00', price: 3250 },
        ]
    },
    {
        id: 'fast_charging',
        name: 'Trạm Cao Tốc / Sạc Nhanh DC',
        description: 'Biểu giá tối ưu cho trạm sạc công suất lớn tại các trục giao thông chính',
        periods: [
            { start: '00:00', end: '06:00', price: 2800 },
            { start: '06:00', end: '18:00', price: 3850 },
            { start: '18:00', end: '24:00', price: 4500 },
        ]
    },
    {
        id: 'flat_rate',
        name: 'Đồng Giá Cố Định 24/7',
        description: 'Mức giá cố định 3.500 đ/kWh cho toàn bộ 24 giờ trong ngày',
        periods: [
            { start: '00:00', end: '24:00', price: 3500 },
        ]
    }
];

function loadStoredTariffs() {
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        }
    } catch {
        // ignore
    }
    return {
        '1': {
            station_id: 1,
            idle_fee_per_minute: 3000,
            idle_grace_minutes: 0,
            periods: [
                { start: '00:00', end: '06:00', price: 2000 },
                { start: '06:00', end: '18:00', price: 3000 },
                { start: '18:00', end: '24:00', price: 4000 }
            ]
        },
        '2': {
            station_id: 2,
            idle_fee_per_minute: 3000,
            idle_grace_minutes: 0,
            periods: [
                { start: '00:00', end: '06:00', price: 2500 },
                { start: '06:00', end: '17:00', price: 3500 },
                { start: '17:00', end: '24:00', price: 4500 }
            ]
        },
        '3': {
            station_id: 3,
            idle_fee_per_minute: 3000,
            idle_grace_minutes: 0,
            periods: [
                { start: '00:00', end: '07:00', price: 2200 },
                { start: '07:00', end: '18:00', price: 3200 },
                { start: '18:00', end: '24:00', price: 4200 }
            ]
        }
    };
}

function saveStoredTariffs(data) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    } catch {
        // ignore
    }
}

let mockTariffs = loadStoredTariffs();

export const getTariff = async (stationId) => {
    const sId = String(stationId || 1);
    try {
        const response = await api.get('/tariffs/live-config', {
            params: { station_id: stationId }
        });
        if (response.data && response.data.periods && response.data.periods.length > 0) {
            mockTariffs[sId] = response.data;
            saveStoredTariffs(mockTariffs);
            return response.data;
        }
        return mockTariffs[sId] || {
            station_id: Number(stationId) || 1,
            idle_fee_per_minute: 3000,
            idle_grace_minutes: 0,
            periods: [
                { start: '00:00', end: '06:00', price: 2200 },
                { start: '06:00', end: '18:00', price: 3300 },
                { start: '18:00', end: '24:00', price: 4400 }
            ]
        };
    } catch {
        return mockTariffs[sId] || {
            station_id: Number(stationId) || 1,
            idle_fee_per_minute: 3000,
            idle_grace_minutes: 0,
            periods: [
                { start: '00:00', end: '06:00', price: 2200 },
                { start: '06:00', end: '18:00', price: 3300 },
                { start: '18:00', end: '24:00', price: 4400 }
            ]
        };
    }
};

export const saveTariff = async (stationId, payload) => {
    if (!payload.periods || payload.periods.length === 0) {
        throw new Error("Phải có ít nhất 1 khung giờ");
    }
    const sId = String(stationId || 1);
    try {
        const response = await api.put('/tariffs/live-config', {
            station_id: Number(stationId) || 1,
            periods: payload.periods,
            idle_fee_per_minute: payload.idle_fee_per_minute !== undefined ? Number(payload.idle_fee_per_minute) : undefined,
            idle_grace_minutes: payload.idle_grace_minutes !== undefined ? Number(payload.idle_grace_minutes) : undefined,
        });
        mockTariffs[sId] = response.data;
        saveStoredTariffs(mockTariffs);
        return response.data;
    } catch {
        // Fallback offline / demo
        const fallbackData = {
            station_id: Number(stationId) || 1,
            periods: payload.periods,
            idle_fee_per_minute: payload.idle_fee_per_minute !== undefined ? Number(payload.idle_fee_per_minute) : 3000,
            idle_grace_minutes: payload.idle_grace_minutes !== undefined ? Number(payload.idle_grace_minutes) : 0,
        };
        mockTariffs[sId] = fallbackData;
        saveStoredTariffs(mockTariffs);
        return fallbackData;
    }
};
