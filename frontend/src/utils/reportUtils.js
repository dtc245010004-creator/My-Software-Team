/**
 * Tiện ích tính toán và xử lý dữ liệu Báo cáo Doanh thu & Sản lượng theo Trạm, theo Trụ (SCRUM-384 / SCRUM-392)
 */

export const REPORT_PERIODS = {
  TODAY: 'TODAY',
  THIS_WEEK: 'THIS_WEEK',
  THIS_MONTH: 'THIS_MONTH',
  CUSTOM: 'CUSTOM',
};

/**
 * Tạo khoảng ngày bắt đầu - kết thúc theo kỳ báo cáo
 * @param {string} periodKey - TODAY | THIS_WEEK | THIS_MONTH | CUSTOM
 * @param {object} [customRange] - { startDate: Date|string, endDate: Date|string }
 * @param {Date} [referenceDate] - Ngày mốc (mặc định là hiện tại)
 * @returns {{ startDate: Date, endDate: Date, label: string }}
 */
export function getPeriodDateRange(periodKey, customRange = null, referenceDate = new Date()) {
  const ref = new Date(referenceDate);

  if (periodKey === REPORT_PERIODS.TODAY) {
    const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
    const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
    return {
      startDate: start,
      endDate: end,
      label: `Hôm nay (${start.toLocaleDateString('vi-VN')})`,
    };
  }

  if (periodKey === REPORT_PERIODS.THIS_WEEK) {
    // 7 ngày gần nhất tính đến hết hôm nay
    const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 6, 0, 0, 0, 0);
    const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
    return {
      startDate: start,
      endDate: end,
      label: `7 ngày qua (${start.toLocaleDateString('vi-VN')} - ${end.toLocaleDateString('vi-VN')})`,
    };
  }

  if (periodKey === REPORT_PERIODS.THIS_MONTH) {
    // Đầu tháng đến cuối ngày hiện tại
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
    return {
      startDate: start,
      endDate: end,
      label: `Tháng ${ref.getMonth() + 1}/${ref.getFullYear()} (${start.toLocaleDateString('vi-VN')} - ${end.toLocaleDateString('vi-VN')})`,
    };
  }

  if (periodKey === REPORT_PERIODS.CUSTOM && customRange?.startDate && customRange?.endDate) {
    const start = new Date(customRange.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(customRange.endDate);
    end.setHours(23, 59, 59, 999);
    return {
      startDate: start,
      endDate: end,
      label: `Từ ${start.toLocaleDateString('vi-VN')} đến ${end.toLocaleDateString('vi-VN')}`,
    };
  }

  // Mặc định tháng này
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
  return {
    startDate: start,
    endDate: end,
    label: `Tháng ${ref.getMonth() + 1}/${ref.getFullYear()}`,
  };
}

/**
 * Lọc danh sách phiên sạc nằm trong khoảng thời gian đã chọn
 * @param {Array} sessions
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array}
 */
export function filterSessionsByDateRange(sessions = [], startDate, endDate) {
  if (!Array.isArray(sessions)) return [];
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  return sessions.filter((s) => {
    const sessionTimeStr = s.start_time || s.created_at;
    if (!sessionTimeStr) return false;
    const sessionMs = new Date(sessionTimeStr).getTime();
    return sessionMs >= startMs && sessionMs <= endMs;
  });
}

/**
 * Tổng hợp số liệu báo cáo theo từng trụ và tính dòng tổng của trạm (SCRUM-392)
 * TIÊU CHÍ CHẤP NHẬN: "Tổng các dòng trụ bằng tổng của trạm."
 * @param {Array} chargers - Danh sách trụ của trạm
 * @param {Array} sessions - Danh sách phiên sạc của trạm trong kỳ
 * @returns {{
 *   chargerRows: Array,
 *   stationTotal: {
 *     sessionsCount: number,
 *     totalKwh: number,
 *     chargingFee: number,
 *     idleFee: number,
 *     totalRevenue: number,
 *     percentage: number
 *   }
 * }}
 */
export function calculateStationChargerReport(chargers = [], sessions = []) {
  if (!Array.isArray(chargers)) chargers = [];
  if (!Array.isArray(sessions)) sessions = [];

  // Tạo map gom nhóm theo charger_id hoặc charger_code
  const chargerMap = new Map();

  chargers.forEach((c) => {
    chargerMap.set(c.id, {
      chargerId: c.id,
      chargerCode: c.charge_point_string_id || c.code || `CP-${c.id}`,
      model: c.model || 'DC Fast 60kW',
      connectorsCount: (c.connectors || []).length || 1,
      status: c.status || 'AVAILABLE',
      sessionsCount: 0,
      totalKwh: 0,
      chargingFee: 0,
      idleFee: 0,
      totalRevenue: 0,
    });
  });

  // Duyệt qua từng phiên sạc để cộng dồn vào trụ tương ứng
  sessions.forEach((s) => {
    let targetChargerId = s.charger_id || s.charging_point_id;

    // Nếu phiên chỉ lưu connector_id, map qua connector
    if (!targetChargerId && s.connector?.charging_point_id) {
      targetChargerId = s.connector.charging_point_id;
    }

    // Nếu không tìm thấy trong map (trụ mới phát sinh), tự khởi tạo row
    if (!chargerMap.has(targetChargerId)) {
      const fallbackCode = s.charger_code || `CP-${targetChargerId || 'UNKNOWN'}`;
      chargerMap.set(targetChargerId, {
        chargerId: targetChargerId,
        chargerCode: fallbackCode,
        model: 'Standard Charger',
        connectorsCount: 1,
        status: 'AVAILABLE',
        sessionsCount: 0,
        totalKwh: 0,
        chargingFee: 0,
        idleFee: 0,
        totalRevenue: 0,
      });
    }

    const row = chargerMap.get(targetChargerId);
    row.sessionsCount += 1;

    const kwh = Number(s.total_kwh) || 0;
    row.totalKwh += kwh;

    const totalAmt = Number(s.total_amount) || 0;
    const idleAmt = Number(s.idle_amount) || 0;
    const chargingAmt = Math.max(0, totalAmt - idleAmt);

    row.chargingFee += chargingAmt;
    row.idleFee += idleAmt;
    row.totalRevenue += totalAmt;
  });

  // Chuyển map thành danh sách mảng và làm tròn số học
  const chargerRows = Array.from(chargerMap.values()).map((row) => ({
    ...row,
    totalKwh: Math.round(row.totalKwh * 100) / 100,
    chargingFee: Math.round(row.chargingFee),
    idleFee: Math.round(row.idleFee),
    totalRevenue: Math.round(row.totalRevenue),
  }));

  // Sắp xếp theo mã trụ hoặc doanh thu giảm dần
  chargerRows.sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Tính DÒNG TỔNG CỦA TRẠM (STATION TOTAL ROW)
  // RÀNG BUỘC AC: Tổng các dòng trụ PHẢI BẰNG tổng của trạm
  const stationTotal = chargerRows.reduce(
    (acc, row) => ({
      sessionsCount: acc.sessionsCount + row.sessionsCount,
      totalKwh: acc.totalKwh + row.totalKwh,
      chargingFee: acc.chargingFee + row.chargingFee,
      idleFee: acc.idleFee + row.idleFee,
      totalRevenue: acc.totalRevenue + row.totalRevenue,
    }),
    {
      sessionsCount: 0,
      totalKwh: 0,
      chargingFee: 0,
      idleFee: 0,
      totalRevenue: 0,
    }
  );

  stationTotal.totalKwh = Math.round(stationTotal.totalKwh * 100) / 100;
  stationTotal.percentage = 100;

  // Tính tỷ trọng (%) của từng trụ so với tổng trạm
  const rowsWithPercentage = chargerRows.map((row) => ({
    ...row,
    percentage:
      stationTotal.totalRevenue > 0
        ? Math.round((row.totalRevenue / stationTotal.totalRevenue) * 1000) / 10
        : 0,
  }));

  return {
    chargerRows: rowsWithPercentage,
    stationTotal,
  };
}

/**
 * Định dạng tiền tệ VND
 * @param {number} val
 * @returns {string}
 */
export function formatCurrencyVND(val) {
  const num = Number(val) || 0;
  return `${num.toLocaleString('vi-VN')} đ`;
}

/**
 * Định dạng điện năng kWh
 * @param {number} val
 * @returns {string}
 */
export function formatKwh(val) {
  const num = Number(val) || 0;
  return `${num.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kWh`;
}
