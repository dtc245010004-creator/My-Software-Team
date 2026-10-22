import { describe, it, expect } from 'vitest';
import {
  RECONCILIATION_ANOMALY_TYPES,
  DEFAULT_TOLERANCE_VND,
  detectSessionAnomaly,
  calculateReconciliationSummary,
  filterReconciliationSessions,
} from './reconciliationUtils';

describe('SCRUM-385 / SCRUM-397: reconciliationUtils unit tests', () => {
  describe('detectSessionAnomaly', () => {
    it('nhận diện đúng (1) Phiên có kWh mà không có hóa đơn (MISSING_INVOICE)', () => {
      const session = {
        id: 101,
        total_kwh: 40.0,
        total_amount: null,
        has_invoice: false,
        applied_price_per_kwh: 3850,
      };
      const result = detectSessionAnomaly(session);
      expect(result.isAnomaly).toBe(true);
      expect(result.type).toBe(RECONCILIATION_ANOMALY_TYPES.MISSING_INVOICE);
      expect(result.typeLabel).toContain('(1) Có kWh chưa lập hóa đơn');
      expect(result.expectedAmount).toBe(154000); // 40 * 3850
      expect(result.varianceAmount).toBe(-154000);
    });

    it('nhận diện đúng (2) Có hóa đơn mà không có dòng sổ cái ví (MISSING_LEDGER)', () => {
      const session = {
        id: 102,
        total_kwh: 30.0,
        total_amount: 115500,
        has_invoice: true,
        has_ledger: false,
        applied_price_per_kwh: 3850,
      };
      const result = detectSessionAnomaly(session);
      expect(result.isAnomaly).toBe(true);
      expect(result.type).toBe(RECONCILIATION_ANOMALY_TYPES.MISSING_LEDGER);
      expect(result.typeLabel).toContain('(2) Có hóa đơn thiếu sổ cái ví');
      expect(result.varianceAmount).toBe(-115500);
    });

    it('nhận diện đúng (3) Tiền hóa đơn lệch so với tính lại từ biểu giá (PRICE_MISMATCH)', () => {
      const session = {
        id: 103,
        total_kwh: 20.0,
        applied_price_per_kwh: 3850,
        idle_amount: 0,
        total_amount: 100000, // Đúng ra là 20 * 3850 = 77000 (lệch 23.000 đ)
        has_invoice: true,
        has_ledger: true,
      };
      const result = detectSessionAnomaly(session);
      expect(result.isAnomaly).toBe(true);
      expect(result.type).toBe(RECONCILIATION_ANOMALY_TYPES.PRICE_MISMATCH);
      expect(result.typeLabel).toContain('(3) Lệch tiền so với biểu giá');
      expect(result.varianceAmount).toBe(23000);
    });

    it('bỏ qua sai số nhỏ do làm tròn trong ngưỡng tolerance (NFR)', () => {
      const session = {
        id: 104,
        total_kwh: 10.333,
        applied_price_per_kwh: 3850,
        total_amount: 39783, // Sai số < 1.000 đ do làm tròn
        has_invoice: true,
        has_ledger: true,
      };
      const result = detectSessionAnomaly(session, DEFAULT_TOLERANCE_VND);
      expect(result.isAnomaly).toBe(false);
      expect(result.type).toBe(RECONCILIATION_ANOMALY_TYPES.MATCHED);
    });

    it('xác nhận hợp lệ khi điện cấp và tiền thu khớp hoàn toàn (MATCHED)', () => {
      const session = {
        id: 105,
        total_kwh: 50.0,
        applied_price_per_kwh: 3850,
        total_amount: 192500,
        has_invoice: true,
        has_ledger: true,
      };
      const result = detectSessionAnomaly(session);
      expect(result.isAnomaly).toBe(false);
      expect(result.type).toBe(RECONCILIATION_ANOMALY_TYPES.MATCHED);
      expect(result.varianceAmount).toBe(0);
    });
  });

  describe('calculateReconciliationSummary', () => {
    const sampleSessions = [
      // (1) Thiếu hóa đơn
      { id: 1, total_kwh: 20, applied_price_per_kwh: 3850, has_invoice: false },
      // (2) Thiếu sổ cái
      { id: 2, total_kwh: 10, total_amount: 38500, has_invoice: true, has_ledger: false },
      // (3) Lệch tiền
      { id: 3, total_kwh: 10, total_amount: 50000, has_invoice: true, has_ledger: true, applied_price_per_kwh: 3850 },
      // Khớp
      { id: 4, total_kwh: 10, total_amount: 38500, has_invoice: true, has_ledger: true, applied_price_per_kwh: 3850 },
    ];

    it('tổng hợp chính xác số lượng từng loại bất thường và danh sách cần xem xét', () => {
      const summary = calculateReconciliationSummary(sampleSessions);
      expect(summary.totalSessions).toBe(4);
      expect(summary.anomalyCount).toBe(3);
      expect(summary.missingInvoiceCount).toBe(1);
      expect(summary.missingLedgerCount).toBe(1);
      expect(summary.priceMismatchCount).toBe(1);
      expect(summary.matchedCount).toBe(1);
      expect(summary.anomalySessions.length).toBe(3);
    });

    it('sắp xếp phiên có chênh lệch tiền lớn nhất lên đầu danh sách', () => {
      const summary = calculateReconciliationSummary(sampleSessions);
      // Phiên 1 chênh 77.000 đ > Phiên 2 chênh 38.500 đ > Phiên 3 chênh 11.500 đ
      expect(summary.anomalySessions[0].id).toBe(1);
      expect(summary.anomalySessions[1].id).toBe(2);
      expect(summary.anomalySessions[2].id).toBe(3);
    });
  });

  describe('filterReconciliationSessions', () => {
    const audited = [
      { id: 1, station_name: 'Trạm VinFast Thảo Điền', reconciliation: { isAnomaly: true, type: 'MISSING_INVOICE' } },
      { id: 2, station_name: 'Trạm Landmark 81', reconciliation: { isAnomaly: true, type: 'MISSING_LEDGER' } },
      { id: 3, station_name: 'Trạm Quận 1', reconciliation: { isAnomaly: false, type: 'MATCHED' } },
    ];

    it('lọc danh sách theo tab bất thường', () => {
      const missingInv = filterReconciliationSessions(audited, 'MISSING_INVOICE');
      expect(missingInv.length).toBe(1);
      expect(missingInv[0].id).toBe(1);

      const allAnomalies = filterReconciliationSessions(audited, 'ALL_ANOMALIES');
      expect(allAnomalies.length).toBe(2);
    });

    it('lọc theo từ khóa tìm kiếm tên trạm', () => {
      const filtered = filterReconciliationSessions(audited, 'ALL_ANOMALIES', 'Landmark');
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(2);
    });
  });
});
