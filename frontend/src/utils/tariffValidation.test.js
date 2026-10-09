import { describe, it, expect } from 'vitest';
import { validateTariffPeriods, timeToMinutes, minutesToTime } from './tariffValidation';

describe('tariffValidation', () => {
  describe('timeToMinutes & minutesToTime', () => {
    it('chuyển đổi chính xác giữa giờ và phút', () => {
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('08:30')).toBe(510);
      expect(timeToMinutes('24:00')).toBe(1440);
      
      expect(minutesToTime(0)).toBe('00:00');
      expect(minutesToTime(510)).toBe('08:30');
      expect(minutesToTime(1440)).toBe('24:00');
    });
  });

  describe('validateTariffPeriods', () => {
    it('hợp lệ với 3 khung giờ phủ kín 24h (AC1)', () => {
      const periods = [
        { start: '00:00', end: '08:00', price: 1000 },
        { start: '08:00', end: '16:00', price: 2000 },
        { start: '16:00', end: '24:00', price: 3000 },
      ];
      const result = validateTariffPeriods(periods);
      expect(result.isValid).toBe(true);
      expect(result.gaps).toHaveLength(0);
      expect(result.overlaps).toHaveLength(0);
    });

    it('báo lỗi khi có chồng lấn (AC2)', () => {
      const periods = [
        { start: '00:00', end: '10:00', price: 1000 },
        { start: '08:00', end: '24:00', price: 2000 },
      ];
      const result = validateTariffPeriods(periods);
      expect(result.isValid).toBe(false);
      expect(result.overlaps.length).toBeGreaterThan(0);
      expect(result.errorsByIndex[1]).toContain('chồng lấn');
    });

    it('báo lỗi khi có khoảng trống (AC2)', () => {
      const periods = [
        { start: '00:00', end: '10:00', price: 1000 },
        { start: '12:00', end: '24:00', price: 2000 },
      ];
      const result = validateTariffPeriods(periods);
      expect(result.isValid).toBe(false);
      expect(result.gaps.length).toBeGreaterThan(0);
    });

    it('tự động tách khung giờ qua nửa đêm (AC3)', () => {
      const periods = [
        { start: '22:00', end: '06:00', price: 1000 },
        { start: '06:00', end: '22:00', price: 2000 },
      ];
      const result = validateTariffPeriods(periods);
      expect(result.isValid).toBe(true);
      expect(result.segments.some(s => s.isOvernight)).toBe(true);
    });
  });
});

