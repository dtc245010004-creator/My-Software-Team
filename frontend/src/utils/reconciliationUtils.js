/**
 * Tiện ích hỗ trợ Đối Soát Kế Toán: kWh đã cấp với tiền đã thu (S-53 / SCRUM-385 / SCRUM-397)
 */

export const RECONCILIATION_ANOMALY_TYPES = {
  MISSING_INVOICE: 'MISSING_INVOICE', // (1) Phiên có kWh mà không có hóa đơn
  MISSING_LEDGER: 'MISSING_LEDGER',   // (2) Có hóa đơn mà không có dòng sổ cái
  PRICE_MISMATCH: 'PRICE_MISMATCH',   // (3) Tiền hóa đơn lệch so với tính lại từ biểu giá
  MATCHED: 'MATCHED',                 // Khớp hoàn toàn (Hợp lệ)
};

export const DEFAULT_TOLERANCE_VND = 1000; // Ngưỡng chênh lệch chấp nhận được do làm tròn (NFR)

/**
 * Phân tích và phát hiện bất thường đối soát cho 1 phiên sạc
 * @param {object} session
 * @param {number} [tolerance=DEFAULT_TOLERANCE_VND]
 * @returns {{
 *   isAnomaly: boolean,
 *   type: string,
 *   typeLabel: string,
 *   badgeClass: string,
 *   kwh: number,
 *   actualAmount: number,
 *   expectedAmount: number,
 *   varianceAmount: number,
 *   description: string,
 *   hasInvoice: boolean,
 *   hasLedger: boolean
 * }}
 */
export function detectSessionAnomaly(session, tolerance = DEFAULT_TOLERANCE_VND) {
  if (!session) {
    return {
      isAnomaly: false,
      type: RECONCILIATION_ANOMALY_TYPES.MATCHED,
      typeLabel: 'Hợp lệ',
      badgeClass: 'bg-grid-green/20 text-grid-green',
      kwh: 0,
      actualAmount: 0,
      expectedAmount: 0,
      varianceAmount: 0,
      description: '',
      hasInvoice: true,
      hasLedger: true,
    };
  }

  const kwh = Number(session.total_kwh) || 0;
  const billedAmount = session.total_amount !== null && session.total_amount !== undefined
    ? Number(session.total_amount)
    : null;
  const appliedPrice = Number(session.applied_price_per_kwh) || 3850;
  const idleFee = Number(session.idle_amount) || 0;

  // Tiền lý thuyết tính lại từ biểu giá = (kWh * đơn giá) + phí chiếm trụ
  const expectedAmount = Math.round(kwh * appliedPrice + idleFee);

  // Cờ kiểm tra hóa đơn và sổ cái
  const hasInvoice = session.has_invoice ?? (billedAmount !== null && billedAmount > 0);
  const hasLedger = session.has_ledger ?? (Boolean(session.wallet_transaction_id || session.ledger_entry_id) || Boolean(session.payment_id));

  // Loại 1: Phiên có kWh (> 0) mà không có hóa đơn
  if (kwh > 0 && !hasInvoice) {
    const variance = -expectedAmount;
    return {
      isAnomaly: true,
      type: RECONCILIATION_ANOMALY_TYPES.MISSING_INVOICE,
      typeLabel: '(1) CÓ kWh CHƯA LẬP HÓA ĐƠN',
      badgeClass: 'bg-critical-red/20 text-critical-red border border-critical-red/30',
      kwh,
      actualAmount: 0,
      expectedAmount,
      varianceAmount: variance,
      description: `Đã cấp ${kwh} kWh nhưng chưa tạo hóa đơn tính tiền. Thất thoát dự kiến: ${Math.abs(variance).toLocaleString('vi-VN')} đ.`,
      hasInvoice: false,
      hasLedger,
    };
  }

  // Loại 2: Có hóa đơn mà không có dòng sổ cái ví
  if (hasInvoice && !hasLedger) {
    const actual = billedAmount || expectedAmount;
    const variance = -actual;
    return {
      isAnomaly: true,
      type: RECONCILIATION_ANOMALY_TYPES.MISSING_LEDGER,
      typeLabel: '(2) CÓ HÓA ĐƠN THIẾU SỔ CÁI VÍ',
      badgeClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
      kwh,
      actualAmount: 0,
      expectedAmount: actual,
      varianceAmount: variance,
      description: `Đã lập hóa đơn (${actual.toLocaleString('vi-VN')} đ) nhưng chưa ghi nhận dòng sổ cái ví điện tử (chưa trừ tiền).`,
      hasInvoice: true,
      hasLedger: false,
    };
  }

  // Loại 3: Tiền hóa đơn lệch so với tính lại từ biểu giá
  if (hasInvoice && billedAmount !== null) {
    const diff = billedAmount - expectedAmount;
    if (Math.abs(diff) > tolerance) {
      return {
        isAnomaly: true,
        type: RECONCILIATION_ANOMALY_TYPES.PRICE_MISMATCH,
        typeLabel: '(3) LỆCH TIỀN SO VỚI BIỂU GIÁ',
        badgeClass: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
        kwh,
        actualAmount: billedAmount,
        expectedAmount,
        varianceAmount: diff,
        description: `Hóa đơn (${billedAmount.toLocaleString('vi-VN')} đ) lệch ${Math.abs(diff).toLocaleString('vi-VN')} đ so với biểu giá tính lại (${expectedAmount.toLocaleString('vi-VN')} đ).`,
        hasInvoice: true,
        hasLedger: true,
      };
    }
  }

  // Khớp hoàn toàn
  const actual = billedAmount ?? expectedAmount;
  return {
    isAnomaly: false,
    type: RECONCILIATION_ANOMALY_TYPES.MATCHED,
    typeLabel: 'KHỚP HOÀN TOÀN',
    badgeClass: 'bg-grid-green/20 text-grid-green border border-grid-green/30',
    kwh,
    actualAmount: actual,
    expectedAmount,
    varianceAmount: actual - expectedAmount,
    description: 'Tiền thu khớp với sản lượng điện năng đã cấp.',
    hasInvoice: true,
    hasLedger: true,
  };
}

/**
 * Tổng hợp toàn bộ số liệu đối soát trong kỳ (SCRUM-397)
 * Tiêu chí chấp nhận: "Tổng chênh lệch và danh sách phiên cần xem xét hiện ở đầu báo cáo."
 * @param {Array} sessions
 * @param {number} [tolerance=DEFAULT_TOLERANCE_VND]
 * @returns {{
 *   totalSessions: number,
 *   anomalyCount: number,
 *   totalVarianceAmount: number,
 *   totalKwhDelivered: number,
 *   totalActualRevenue: number,
 *   totalExpectedRevenue: number,
 *   missingInvoiceCount: number,
 *   missingLedgerCount: number,
 *   priceMismatchCount: number,
 *   matchedCount: number,
 *   anomalySessions: Array,
 *   allAuditedSessions: Array
 * }}
 */
export function calculateReconciliationSummary(sessions = [], tolerance = DEFAULT_TOLERANCE_VND) {
  if (!Array.isArray(sessions)) sessions = [];

  let totalKwhDelivered = 0;
  let totalActualRevenue = 0;
  let totalExpectedRevenue = 0;
  let totalVarianceAmount = 0;

  let missingInvoiceCount = 0;
  let missingLedgerCount = 0;
  let priceMismatchCount = 0;
  let matchedCount = 0;

  const auditedSessions = sessions.map((s) => {
    const analysis = detectSessionAnomaly(s, tolerance);

    totalKwhDelivered += analysis.kwh;
    totalActualRevenue += analysis.actualAmount;
    totalExpectedRevenue += analysis.expectedAmount;
    totalVarianceAmount += analysis.varianceAmount;

    if (analysis.isAnomaly) {
      if (analysis.type === RECONCILIATION_ANOMALY_TYPES.MISSING_INVOICE) missingInvoiceCount++;
      if (analysis.type === RECONCILIATION_ANOMALY_TYPES.MISSING_LEDGER) missingLedgerCount++;
      if (analysis.type === RECONCILIATION_ANOMALY_TYPES.PRICE_MISMATCH) priceMismatchCount++;
    } else {
      matchedCount++;
    }

    return {
      ...s,
      reconciliation: analysis,
    };
  });

  const anomalySessions = auditedSessions.filter((s) => s.reconciliation.isAnomaly);

  // Sắp xếp các phiên bất thường có độ lệch tiền lớn nhất lên đầu
  anomalySessions.sort((a, b) => Math.abs(b.reconciliation.varianceAmount) - Math.abs(a.reconciliation.varianceAmount));

  return {
    totalSessions: sessions.length,
    anomalyCount: anomalySessions.length,
    totalVarianceAmount: Math.round(totalVarianceAmount),
    totalKwhDelivered: Math.round(totalKwhDelivered * 100) / 100,
    totalActualRevenue: Math.round(totalActualRevenue),
    totalExpectedRevenue: Math.round(totalExpectedRevenue),
    missingInvoiceCount,
    missingLedgerCount,
    priceMismatchCount,
    matchedCount,
    anomalySessions,
    allAuditedSessions: auditedSessions,
  };
}

/**
 * Lọc danh sách phiên đối soát theo Tab và tìm kiếm
 * @param {Array} auditedSessions
 * @param {string} filterTab - ALL_ANOMALIES | MISSING_INVOICE | MISSING_LEDGER | PRICE_MISMATCH | ALL_SESSIONS | MATCHED
 * @param {string} searchQuery
 * @returns {Array}
 */
export function filterReconciliationSessions(auditedSessions = [], filterTab = 'ALL_ANOMALIES', searchQuery = '') {
  if (!Array.isArray(auditedSessions)) return [];
  const q = String(searchQuery || '').trim().toLowerCase();

  return auditedSessions.filter((s) => {
    const analysis = s.reconciliation;
    if (!analysis) return true;

    // Lọc theo tab
    if (filterTab === 'ALL_ANOMALIES' && !analysis.isAnomaly) return false;
    if (filterTab === 'MISSING_INVOICE' && analysis.type !== RECONCILIATION_ANOMALY_TYPES.MISSING_INVOICE) return false;
    if (filterTab === 'MISSING_LEDGER' && analysis.type !== RECONCILIATION_ANOMALY_TYPES.MISSING_LEDGER) return false;
    if (filterTab === 'PRICE_MISMATCH' && analysis.type !== RECONCILIATION_ANOMALY_TYPES.PRICE_MISMATCH) return false;
    if (filterTab === 'MATCHED' && analysis.isAnomaly) return false;

    // Lọc theo từ khóa
    if (q) {
      const id = String(s.id || '').toLowerCase();
      const stName = String(s.station_name || '').toLowerCase();
      const chCode = String(s.charger_code || '').toLowerCase();
      const desc = String(analysis.description || '').toLowerCase();
      const match = id.includes(q) || stName.includes(q) || chCode.includes(q) || desc.includes(q);
      if (!match) return false;
    }

    return true;
  });
}
