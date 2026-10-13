/**
 * reservation.test.js — Unit test cho reservation.js
 *
 * Chạy: npm test -- reservation.test.js
 * Hoặc: npx vitest run src/utils/reservation.test.js
 */
import { describe, it, expect } from 'vitest';
import {
  buildArrivalSlots,
  formatCountdown,
  mapReservationError,
  isReservable,
  buildReservationSummary,
  calcHoldMinutes,
} from './reservation';

describe('buildArrivalSlots', () => {
  it('trả về mảng rỗng khi now undefined', () => {
    // Không crash khi gọi không có tham số
    const result = buildArrivalSlots();
    expect(Array.isArray(result)).toBe(true);
  });

  it('mỗi slot có đủ field value, label, time', () => {
    const now = new Date('2026-10-14T08:00:00Z');
    const slots = buildArrivalSlots(now, 120, 15);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(typeof slot.value).toBe('string');
      expect(typeof slot.label).toBe('string');
      expect(slot.time instanceof Date).toBe(true);
    }
  });

  it('slot đầu tiên lớn hơn now', () => {
    const now = new Date('2026-10-14T08:07:22Z');
    const slots = buildArrivalSlots(now, 120, 15);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].time.getTime()).toBeGreaterThan(now.getTime());
  });

  it('slot cuối cùng <= now + maxAheadMinutes', () => {
    const now = new Date('2026-10-14T08:00:00Z');
    const maxAhead = 120;
    const slots = buildArrivalSlots(now, maxAhead, 15);
    const maxTime = now.getTime() + maxAhead * 60 * 1000;
    expect(slots[slots.length - 1].time.getTime()).toBeLessThanOrEqual(maxTime);
  });

  it('slot cách nhau đúng stepMinutes phút', () => {
    const now = new Date('2026-10-14T08:00:00Z');
    const slots = buildArrivalSlots(now, 60, 15);
    for (let i = 1; i < slots.length; i++) {
      const diff = (slots[i].time.getTime() - slots[i - 1].time.getTime()) / 60000;
      expect(diff).toBe(15);
    }
  });
});

describe('formatCountdown', () => {
  it('msLeft <= 0 trả expired', () => {
    expect(formatCountdown(0).urgency).toBe('expired');
    expect(formatCountdown(-1000).urgency).toBe('expired');
  });

  it('dưới 30s trả critical', () => {
    expect(formatCountdown(29_000).urgency).toBe('critical');
  });

  it('dưới 5 phút trả warning', () => {
    expect(formatCountdown(4 * 60 * 1000).urgency).toBe('warning');
  });

  it('trên 5 phút trả normal', () => {
    expect(formatCountdown(10 * 60 * 1000).urgency).toBe('normal');
  });

  it('định dạng HH:MM:SS khi có giờ', () => {
    const { text } = formatCountdown(1 * 3600 * 1000 + 5 * 60 * 1000 + 3 * 1000);
    expect(text).toBe('01:05:03');
  });

  it('định dạng MM:SS khi không có giờ', () => {
    const { text } = formatCountdown(5 * 60 * 1000 + 7 * 1000);
    expect(text).toBe('05:07');
  });

  it('pad số < 10 với số 0', () => {
    const { text } = formatCountdown(62 * 1000); // 1 phút 2 giây
    expect(text).toBe('01:02');
  });

  it('không crash với NaN', () => {
    expect(() => formatCountdown(NaN)).not.toThrow();
    expect(formatCountdown(NaN).urgency).toBe('expired');
  });
});

describe('mapReservationError', () => {
  it('null error trả UNKNOWN', () => {
    const r = mapReservationError(null);
    expect(r.code).toBe('UNKNOWN');
  });

  it('409 RESERVATION_CONFLICT trả đúng code + suggestions', () => {
    const err = {
      response: {
        status: 409,
        data: {
          detail: 'Trùng đặt chỗ',
          code: 'RESERVATION_CONFLICT',
          suggestions: [
            { connector_id: 5, charge_point_code: 'ST-2', station_name: 'Trạm B' },
          ],
        },
      },
    };
    const r = mapReservationError(err);
    expect(r.code).toBe('RESERVATION_CONFLICT');
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0].station_name).toBe('Trạm B');
  });

  it('402 WALLET_BELOW_THRESHOLD trả đúng code', () => {
    const err = {
      response: {
        status: 402,
        data: {
          code: 'WALLET_BELOW_THRESHOLD',
          detail: 'Số dư không đủ',
          min_balance: 50000,
          balance: 20000,
        },
      },
    };
    const r = mapReservationError(err);
    expect(r.code).toBe('WALLET_BELOW_THRESHOLD');
    expect(r.minBalance).toBe(50000);
    expect(r.balance).toBe(20000);
  });

  it('422 CHARGER_REJECTED trả đúng code', () => {
    const err = {
      response: {
        status: 422,
        data: { code: 'CHARGER_REJECTED', detail: 'Trụ từ chối' },
      },
    };
    const r = mapReservationError(err);
    expect(r.code).toBe('CHARGER_REJECTED');
  });

  it('504 trả TIMEOUT', () => {
    const err = { response: { status: 504, data: {} } };
    const r = mapReservationError(err);
    expect(r.code).toBe('TIMEOUT');
  });

  it('404 CHARGER_NOT_FOUND trả đúng code', () => {
    const err = { response: { status: 404, data: { code: 'CHARGER_NOT_FOUND' } } };
    const r = mapReservationError(err);
    expect(r.code).toBe('CHARGER_NOT_FOUND');
  });

  it('503 CHARGER_UNDER_MAINTENANCE trả đúng code', () => {
    const err = { response: { status: 503, data: { code: 'CHARGER_UNDER_MAINTENANCE' } } };
    const r = mapReservationError(err);
    expect(r.code).toBe('CHARGER_UNDER_MAINTENANCE');
  });

  it('lỗi không rõ trả message từ detail', () => {
    const err = { response: { status: 500, data: { detail: 'Máy chủ lỗi' } } };
    const r = mapReservationError(err);
    expect(r.message).toBe('Máy chủ lỗi');
  });
});

describe('isReservable', () => {
  it('connector null/undefined => false', () => {
    expect(isReservable(null).reservable).toBe(false);
    expect(isReservable(undefined).reservable).toBe(false);
  });

  it('AVAILABLE => true', () => {
    expect(isReservable({ status: 'AVAILABLE' }).reservable).toBe(true);
  });

  it('RESERVED => true', () => {
    expect(isReservable({ status: 'RESERVED' }).reservable).toBe(true);
  });

  it('is_reservable=false => false', () => {
    expect(isReservable({ status: 'AVAILABLE', is_reservable: false }).reservable).toBe(false);
  });

  it('is_reservable=true => true bất kể status', () => {
    expect(isReservable({ status: 'MAINTENANCE', is_reservable: true }).reservable).toBe(true);
  });

  it('CHARGING => false kèm reason', () => {
    const r = isReservable({ status: 'CHARGING' });
    expect(r.reservable).toBe(false);
    expect(r.reason).toContain('đang sạc');
  });

  it('MAINTENANCE => false kèm reason', () => {
    const r = isReservable({ status: 'MAINTENANCE' });
    expect(r.reservable).toBe(false);
    expect(r.reason).toContain('bảo trì');
  });

  it('OFFLINE => false kèm reason', () => {
    const r = isReservable({ status: 'OFFLINE' });
    expect(r.reservable).toBe(false);
    expect(r.reason).toContain('ngoại tuyến');
  });
});

describe('buildReservationSummary', () => {
  it('trả chuỗi có đủ thông tin', () => {
    const r = {
      station_name: 'Trạm Vincom',
      charge_point_code: 'ST-1',
      connector_number: 1,
      start_time: '2026-10-14T10:00:00Z',
      expires_at: '2026-10-14T11:00:00Z',
    };
    const summary = buildReservationSummary(r);
    expect(summary).toContain('Trạm Vincom');
    expect(summary).toContain('ST-1');
    expect(summary).toContain('Cổng: 1');
  });

  it('trả chuỗi rỗng khi null', () => {
    expect(buildReservationSummary(null)).toBe('');
  });
});

describe('calcHoldMinutes', () => {
  it('tính đúng hiệu giữa hai thời điểm', () => {
    const start = '2026-10-14T10:00:00Z';
    const end = '2026-10-14T11:30:00Z';
    expect(calcHoldMinutes(start, end)).toBe(90);
  });

  it('trả 0 khi expiresAt sớm hơn startTime', () => {
    const start = '2026-10-14T11:00:00Z';
    const end = '2026-10-14T10:00:00Z';
    expect(calcHoldMinutes(start, end)).toBe(0);
  });

  it('trả 0 khi thiếu tham số', () => {
    expect(calcHoldMinutes(null, null)).toBe(0);
    expect(calcHoldMinutes('2026-10-14T10:00:00Z', null)).toBe(0);
  });
});
