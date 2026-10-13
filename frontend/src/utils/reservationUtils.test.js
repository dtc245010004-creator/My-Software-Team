import { describe, it, expect } from 'vitest';
import {
  normalizeSuggestions,
  mapReservationError,
  formatSuggestionAvailableTime,
  createSingleFlightHandler,
} from './reservationUtils';

describe('reservationUtils - normalizeSuggestions', () => {
  it('trả về mảng rỗng khi input không phải mảng hoặc null/undefined', () => {
    expect(normalizeSuggestions(null)).toEqual([]);
    expect(normalizeSuggestions(undefined)).toEqual([]);
    expect(normalizeSuggestions('not-array')).toEqual([]);
    expect(normalizeSuggestions({})).toEqual([]);
  });

  it('chuẩn hóa chính xác định dạng suggestions từ hợp đồng SCRUM-372', () => {
    const rawSuggestions = [
      {
        connector_id: 101,
        charge_point_id: 12,
        charge_point_code: 'EVSE-HANOI-02',
        connector_number: 2,
        station_name: 'Trạm Vincom Metropolis',
        available_from: '2026-10-14T08:30:00Z',
        connector_type: 'CCS2',
        rated_power_kw: 150,
      },
    ];

    const result = normalizeSuggestions(rawSuggestions);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      connectorId: 101,
      chargePointId: 12,
      chargePointCode: 'EVSE-HANOI-02',
      connectorNumber: 2,
      connectorType: 'CCS2',
      ratedPowerKw: 150,
      stationName: 'Trạm Vincom Metropolis',
      availableFrom: '2026-10-14T08:30:00Z',
      status: 'AVAILABLE',
    });
  });

  it('chuẩn hóa chính xác định dạng suggested_connectors từ Backend hiện hữu', () => {
    const rawBackendSuggested = [
      {
        id: 202,
        charge_point_id: 8,
        charge_point_code: 'CP-ECO-03',
        connector_id: 1,
        connector_number: 1,
        type: 'Type 2',
        rated_power_kw: 22.0,
        status: 'AVAILABLE',
      },
    ];

    const result = normalizeSuggestions(rawBackendSuggested);
    expect(result).toHaveLength(1);
    expect(result[0].connectorId).toBe(202);
    expect(result[0].chargePointCode).toBe('CP-ECO-03');
    expect(result[0].connectorNumber).toBe(1);
    expect(result[0].connectorType).toBe('Type 2');
    expect(result[0].ratedPowerKw).toBe(22.0);
    expect(result[0].stationName).toBe('Cùng trạm sạc');
    expect(result[0].availableFrom).toBeNull();
  });

  it('lọc bỏ các phần tử thiếu định danh hoặc rác', () => {
    const dirtyList = [
      null,
      {},
      { some_other_field: 123 },
      { id: 301, charge_point_code: 'CP-VALID' },
    ];
    const result = normalizeSuggestions(dirtyList);
    expect(result).toHaveLength(1);
    expect(result[0].connectorId).toBe(301);
  });
});

describe('reservationUtils - mapReservationError', () => {
  it('xử lý lỗi 409 Conflict với code RESERVATION_CONFLICT và danh sách gợi ý', () => {
    const conflictError = {
      response: {
        status: 409,
        data: {
          detail: 'Trụ/đầu nối này vừa được người khác đặt trước hoặc đang bận.',
          code: 'RESERVATION_CONFLICT',
          suggestions: [
            {
              connector_id: 55,
              charge_point_id: 2,
              charge_point_code: 'EVSE-02',
              connector_number: 1,
              station_name: 'Trạm Cầu Rồng',
              available_from: '2026-10-14T10:00:00Z',
            },
          ],
        },
      },
    };

    const res = mapReservationError(conflictError);
    expect(res.isConflict).toBe(true);
    expect(res.code).toBe('RESERVATION_CONFLICT');
    expect(res.message).toBe('Trụ này vừa được người khác đặt trước.');
    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0].connectorId).toBe(55);
  });

  it('xử lý lỗi 409 Conflict định dạng Backend với suggested_connectors', () => {
    const backendError = {
      response: {
        status: 409,
        data: {
          detail: 'Trụ/đầu nối này vừa được người khác đặt trước hoặc đang bận.',
          suggested_connectors: [
            {
              id: 99,
              charge_point_id: 5,
              charge_point_code: 'EVSE-05',
              type: 'CCS2',
              rated_power_kw: 60,
              status: 'AVAILABLE',
            },
          ],
        },
      },
    };

    const res = mapReservationError(backendError);
    expect(res.isConflict).toBe(true);
    expect(res.code).toBe('RESERVATION_CONFLICT');
    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0].connectorId).toBe(99);
  });

  it('xử lý lỗi 409 Conflict khi danh sách gợi ý rỗng', () => {
    const emptyConflictError = {
      response: {
        status: 409,
        data: {
          detail: 'Không còn trụ trống.',
          suggestions: [],
        },
      },
    };

    const res = mapReservationError(emptyConflictError);
    expect(res.isConflict).toBe(true);
    expect(res.code).toBe('RESERVATION_CONFLICT');
    expect(res.suggestions).toHaveLength(0);
  });

  it('xử lý mã lỗi 404 hoặc 501 là Chức năng chưa sẵn sàng', () => {
    const error404 = { response: { status: 404, data: {} } };
    const error501 = { response: { status: 501, data: {} } };

    expect(mapReservationError(error404).message).toBe('Chức năng chưa sẵn sàng.');
    expect(mapReservationError(error501).message).toBe('Chức năng chưa sẵn sàng.');
  });

  it('xử lý mã lỗi 401 hết hạn phiên đăng nhập', () => {
    const error401 = { response: { status: 401, data: {} } };
    const res = mapReservationError(error401);
    expect(res.code).toBe('UNAUTHORIZED');
    expect(res.message).toContain('đăng nhập lại');
  });

  it('xử lý mã lỗi 403 ví không đủ tiền / thẻ bị khóa', () => {
    const error403 = {
      response: {
        status: 403,
        data: { detail: 'Số dư ví khả dụng không đủ 50.000 VNĐ' },
      },
    };
    const res = mapReservationError(error403);
    expect(res.code).toBe('FORBIDDEN');
    expect(res.message).toBe('Số dư ví khả dụng không đủ 50.000 VNĐ');
  });

  it('xử lý mã lỗi 504 Timeout kết nối trụ', () => {
    const error504 = { response: { status: 504, data: {} } };
    const res = mapReservationError(error504);
    expect(res.code).toBe('GATEWAY_TIMEOUT');
    expect(res.message).toContain('thời gian chờ');
  });

  it('xử lý lỗi kết nối mạng (Network Error)', () => {
    const networkError = { request: {} };
    const res = mapReservationError(networkError);
    expect(res.code).toBe('NETWORK_ERROR');
    expect(res.message).toContain('kết nối');
  });
});

describe('reservationUtils - formatSuggestionAvailableTime', () => {
  it('trả về mặc định khi input rỗng hoặc không hợp lệ', () => {
    expect(formatSuggestionAvailableTime(null)).toBe('Đang có sẵn ngay');
    expect(formatSuggestionAvailableTime('')).toBe('Đang có sẵn ngay');
    expect(formatSuggestionAvailableTime('invalid-date')).toBe('Đang có sẵn ngay');
  });

  it('trả về chuỗi có thông tin giờ khi truyền mốc thời gian hợp lệ', () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 1);
    const res = formatSuggestionAvailableTime(futureDate.toISOString());
    expect(res).toContain('Trống từ');
  });
});

describe('reservationUtils - createSingleFlightHandler (chống bấm đôi)', () => {
  it('chỉ gửi 1 request khi bấm liên tiếp nhiều lần trong lúc request trước đang thực thi', async () => {
    let callCount = 0;
    let resolvePromise;

    const mockAsyncApi = async (arg) => {
      callCount += 1;
      return new Promise((resolve) => {
        resolvePromise = resolve;
      });
    };

    const singleFlightHandler = createSingleFlightHandler(mockAsyncApi);

    // Bấm lần 1
    const promise1 = singleFlightHandler('item-1');
    // Bấm liên tiếp lần 2, lần 3 khi lần 1 chưa xong
    const promise2 = singleFlightHandler('item-1');
    const promise3 = singleFlightHandler('item-1');

    // Chỉ có 1 request thực sự được phát đi
    expect(callCount).toBe(1);

    // Giải quyết promise 1
    resolvePromise('done');
    await promise1;
    await promise2;
    await promise3;

    expect(callCount).toBe(1);

    // Sau khi xong, bấm tiếp lần nữa thì được gửi tiếp
    const promise4 = singleFlightHandler('item-2');
    expect(callCount).toBe(2);
    resolvePromise('done-2');
    await promise4;
    expect(callCount).toBe(2);
  });
});

