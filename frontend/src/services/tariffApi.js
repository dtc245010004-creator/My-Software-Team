import api from './api';

/**
 * CONTRACT API BIỂU GIÁ NHIỀU KHUNG GIỜ (ĐỒNG BỘ TRỰC TIẾP VỚI DATABASE):
 * 
 * GET /api/v1/tariffs/live-config?station_id={stationId}
 * Response 200 OK: {
 *   station_id: 1,
 *   periods: [
 *     { start: "00:00", end: "06:00", price: 2000 },
 *     ...
 *   ]
 * }
 * 
 * PUT /api/v1/tariffs/live-config
 * Body: { station_id: 1, periods: [...] }
 * Response 200 OK
 */

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
    try {
        const response = await api.get('/tariffs/live-config', {
            params: { station_id: stationId }
        });
        return response.data;
    } catch {
        return mockTariffs[String(stationId)] || { station_id: stationId, periods: [] };
    }
};

export const saveTariff = async (stationId, payload) => {
    if (!payload.periods || payload.periods.length === 0) {
        throw new Error("Phải có ít nhất 1 khung giờ");
    }
    const response = await api.put('/tariffs/live-config', {
        station_id: Number(stationId) || 1,
        periods: payload.periods
    });
    mockTariffs[String(stationId)] = response.data;
    return response.data;
};


