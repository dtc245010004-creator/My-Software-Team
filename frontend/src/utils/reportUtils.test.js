import { describe, it, expect } from 'vitest';
import {
  REPORT_PERIODS,
  getPeriodDateRange,
  filterSessionsByDateRange,
  calculateStationChargerReport,
  formatCurrencyVND,
  formatKwh,
} from './reportUtils';

describe('SCRUM-392: reportUtils unit tests', () => {
  describe('getPeriodDateRange', () => {
    const fixedDate = new Date('2026-10-13T10:30:00Z');

    it('tính đúng khoảng ngày cho kỳ TODAY', () => {
      const range = getPeriodDateRange(REPORT_PERIODS.TODAY, null, fixedDate);
      expect(range.startDate.getHours()).toBe(0);
      expect(range.startDate.getMinutes()).toBe(0);
      expect(range.endDate.getHours()).toBe(23);
      expect(range.endDate.getMinutes()).toBe(59);
      expect(range.label).toContain('Hôm nay');
    });

    it('tính đúng khoảng ngày cho kỳ THIS_WEEK (7 ngày)', () => {
      const range = getPeriodDateRange(REPORT_PERIODS.THIS_WEEK, null, fixedDate);
      const diffDays = Math.round(
        (range.endDate.getTime() - range.startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBe(7);
      expect(range.label).toContain('7 ngày qua');
    });

    it('tính đúng khoảng ngày cho kỳ THIS_MONTH (từ ngày 1 đầu tháng)', () => {
      const range = getPeriodDateRange(REPORT_PERIODS.THIS_MONTH, null, fixedDate);
      expect(range.startDate.getDate()).toBe(1);
      expect(range.label).toContain('Tháng 10/2026');
    });

    it('tính đúng khoảng ngày cho kỳ CUSTOM', () => {
      const custom = {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
      };
      const range = getPeriodDateRange(REPORT_PERIODS.CUSTOM, custom, fixedDate);
      expect(range.startDate.getDate()).toBe(1);
      expect(range.endDate.getDate()).toBe(10);
      expect(range.label).toContain('Từ');
    });
  });

  describe('filterSessionsByDateRange', () => {
    const sessions = [
      { id: 1, start_time: '2026-10-10T08:00:00Z' },
      { id: 2, start_time: '2026-10-12T14:00:00Z' },
      { id: 3, start_time: '2026-10-15T09:00:00Z' },
    ];

    it('lọc chính xác các phiên sạc nằm trong khoảng thời gian', () => {
      const start = new Date('2026-10-11T00:00:00Z');
      const end = new Date('2026-10-13T23:59:59Z');
      const filtered = filterSessionsByDateRange(sessions, start, end);
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(2);
    });
  });

  describe('calculateStationChargerReport', () => {
    const mockChargers = [
      { id: 1, code: 'SIM-001', model: 'DC Fast 60kW', connectors: [{ id: 1 }, { id: 2 }] },
      { id: 2, code: 'SIM-002', model: 'DC Fast 120kW', connectors: [{ id: 3 }] },
      { id: 3, code: 'SIM-003', model: 'AC 22kW', connectors: [{ id: 4 }] },
    ];

    const mockSessions = [
      {
        id: 101,
        charger_id: 1,
        total_kwh: 35.5,
        total_amount: 150000,
        idle_amount: 20000,
      },
      {
        id: 102,
        charger_id: 1,
        total_kwh: 20.0,
        total_amount: 90000,
        idle_amount: 0,
      },
      {
        id: 103,
        charger_id: 2,
        total_kwh: 50.0,
        total_amount: 220000,
        idle_amount: 30000,
      },
      // SIM-003 không có phiên nào trong kỳ
    ];

    it('tổng hợp chính xác số phiên, kWh, tiền sạc và phí chiếm trụ cho từng trụ', () => {
      const result = calculateStationChargerReport(mockChargers, mockSessions);
      const row1 = result.chargerRows.find((r) => r.chargerId === 1);
      const row2 = result.chargerRows.find((r) => r.chargerId === 2);
      const row3 = result.chargerRows.find((r) => r.chargerId === 3);

      expect(row1.sessionsCount).toBe(2);
      expect(row1.totalKwh).toBe(55.5);
      expect(row1.chargingFee).toBe(220000); // 130k + 90k
      expect(row1.idleFee).toBe(20000);
      expect(row1.totalRevenue).toBe(240000);

      expect(row2.sessionsCount).toBe(1);
      expect(row2.totalKwh).toBe(50.0);
      expect(row2.chargingFee).toBe(190000);
      expect(row2.idleFee).toBe(30000);
      expect(row2.totalRevenue).toBe(220000);

      expect(row3.sessionsCount).toBe(0);
      expect(row3.totalKwh).toBe(0);
      expect(row3.totalRevenue).toBe(0);
    });

    it('TIÊU CHÍ CHẤP NHẬN: Tổng các dòng trụ bằng đúng tổng của trạm', () => {
      const result = calculateStationChargerReport(mockChargers, mockSessions);
      const rows = result.chargerRows;
      const total = result.stationTotal;

      const sumSessions = rows.reduce((s, r) => s + r.sessionsCount, 0);
      const sumKwh = Math.round(rows.reduce((s, r) => s + r.totalKwh, 0) * 100) / 100;
      const sumChargingFee = rows.reduce((s, r) => s + r.chargingFee, 0);
      const sumIdleFee = rows.reduce((s, r) => s + r.idleFee, 0);
      const sumTotalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);

      expect(total.sessionsCount).toBe(sumSessions);
      expect(total.totalKwh).toBe(sumKwh);
      expect(total.chargingFee).toBe(sumChargingFee);
      expect(total.idleFee).toBe(sumIdleFee);
      expect(total.totalRevenue).toBe(sumTotalRevenue);

      expect(total.sessionsCount).toBe(3);
      expect(total.totalKwh).toBe(105.5);
      expect(total.chargingFee).toBe(410000);
      expect(total.idleFee).toBe(50000);
      expect(total.totalRevenue).toBe(460000);
    });

    it('tính đúng tỷ trọng % đóng góp doanh thu của từng trụ', () => {
      const result = calculateStationChargerReport(mockChargers, mockSessions);
      const row1 = result.chargerRows.find((r) => r.chargerId === 1);
      const row2 = result.chargerRows.find((r) => r.chargerId === 2);

      // Total = 460.000. Row1 = 240.000 (52.2%), Row2 = 220.000 (47.8%)
      expect(row1.percentage).toBeCloseTo(52.2, 0);
      expect(row2.percentage).toBeCloseTo(47.8, 0);
    });
  });

  describe('format helpers', () => {
    it('formatCurrencyVND thêm đơn vị đ và dấu phân cách', () => {
      expect(formatCurrencyVND(1500000)).toBe('1.500.000 đ');
      expect(formatCurrencyVND(0)).toBe('0 đ');
    });

    it('formatKwh định dạng số thập phân kWh', () => {
      expect(formatKwh(1250.5)).toContain('1.250,5');
      expect(formatKwh(1250.5)).toContain('kWh');
    });
  });
});

