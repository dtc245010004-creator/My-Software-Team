import api from './api';

function compareVersions(left, right) {
    const timestampDifference = Date.parse(right.effective_from) - Date.parse(left.effective_from);
    return timestampDifference || Number(right.id) - Number(left.id);
}

function toFormPeriod(period) {
    return {
        start: period.start_time,
        end: period.end_time,
        price: String(period.price_per_kwh),
    };
}

export const getTariff = async (stationId) => {
    const response = await api.get('/tariffs', { params: { station_id: stationId } });
    const effectiveTariffs = response.data.filter(
        (tariff) => Date.parse(tariff.effective_from) <= Date.now(),
    );
    const stationTariffs = effectiveTariffs.filter(
        (tariff) => Number(tariff.station_id) === Number(stationId),
    );
    const candidates = stationTariffs.length
        ? stationTariffs
        : effectiveTariffs.filter((tariff) => tariff.station_id == null);
    const currentTariffs = candidates.sort(compareVersions);
    const current = currentTariffs[0];

    if (!current) {
        return { id: null, station_id: Number(stationId), periods: [] };
    }

    return {
        ...current,
        periods: (current.periods || []).map(toFormPeriod),
    };
};

export const saveTariff = async (tariffId, payload) => {
    if (!tariffId) {
        throw new Error('Không tìm thấy biểu giá hiện hành để tạo phiên bản mới.');
    }

    const response = await api.put(`/tariffs/${tariffId}`, {
        periods: (payload.periods || []).map((period, index) => ({
            start_time: period.start,
            end_time: period.end,
            price_per_kwh: period.price,
            sort_order: index,
        })),
    });
    return response.data;
};

