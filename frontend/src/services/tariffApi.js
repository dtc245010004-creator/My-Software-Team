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

