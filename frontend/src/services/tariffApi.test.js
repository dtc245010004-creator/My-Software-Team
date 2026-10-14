import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
    get: vi.fn(),
    put: vi.fn(),
}));

vi.mock('./api', () => ({ default: api }));

import { getTariff, saveTariff } from './tariffApi';

describe('tariffApi', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-13T04:00:00Z'));
        api.get.mockReset();
        api.put.mockReset();
    });

    afterEach(() => vi.useRealTimers());

    it('loads the current station tariff through the shared authenticated API client', async () => {
        api.get.mockResolvedValue({
            data: [
                {
                    id: 1,
                    station_id: null,
                    effective_from: '2000-01-01T00:00:00Z',
                    periods: [
                        {
                            start_time: '00:00',
                            end_time: '24:00',
                            price_per_kwh: '2000.00',
                        },
                    ],
                },
                {
                    id: 2,
                    station_id: 7,
                    effective_from: '2026-10-12T17:00:00Z',
                    periods: [
                        {
                            start_time: '08:00',
                            end_time: '18:00',
                            price_per_kwh: '3500.00',
                        },
                    ],
                },
                {
                    id: 3,
                    station_id: 7,
                    effective_from: '2026-10-14T17:00:00Z',
                    periods: [],
                },
            ],
        });

        const result = await getTariff(7);

        expect(api.get).toHaveBeenCalledWith('/tariffs', { params: { station_id: 7 } });
        expect(result.id).toBe(2);
        expect(result.periods).toEqual([
            { start: '08:00', end: '18:00', price: '3500.00' },
        ]);
    });

    it('uses an effective global tariff when the station has no effective override', async () => {
        api.get.mockResolvedValue({
            data: [
                {
                    id: 3,
                    station_id: 8,
                    effective_from: '2026-10-14T17:00:00Z',
                    periods: [],
                },
                {
                    id: 1,
                    station_id: null,
                    effective_from: '2000-01-01T00:00:00Z',
                    periods: [],
                },
            ],
        });

        expect((await getTariff(8)).id).toBe(1);
    });

    it('updates the selected tariff version using the backend period field names', async () => {
        api.put.mockResolvedValue({ data: { id: 12 } });

        const result = await saveTariff(12, {
            periods: [{ start: '08:00', end: '18:00', price: '3500' }],
        });

        expect(api.put).toHaveBeenCalledWith('/tariffs/12', {
            periods: [
                {
                    start_time: '08:00',
                    end_time: '18:00',
                    price_per_kwh: '3500',
                    sort_order: 0,
                },
            ],
        });
        expect(result).toEqual({ id: 12 });
    });

    it('does not fall back to mock data when no current tariff can be edited', async () => {
        await expect(saveTariff(null, { periods: [] })).rejects.toThrow(
            'Không tìm thấy biểu giá hiện hành để tạo phiên bản mới.',
        );
        expect(api.put).not.toHaveBeenCalled();
    });
});
