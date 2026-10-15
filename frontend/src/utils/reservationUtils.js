/**
 * Tiện ích hỗ trợ hiển thị và xử lý nghiệp vụ Đặt chỗ & Phí giữ chỗ quá hạn (S-50 / SCRUM-354 / SCRUM-378)
 */

export const RESERVATION_STATUS = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const DEFAULT_NO_SHOW_FEE = 20000; // 20.000 VND mặc định theo chính sách trạm

/**
 * Lấy thông tin hiển thị trạng thái đặt chỗ (nhãn, màu sắc, mô tả)
 * @param {string} status - Trạng thái đặt chỗ (EXPIRED, ACTIVE, COMPLETED, CANCELLED)
 * @returns {{ label: string, badgeClass: string, isOverdue: boolean, description: string }}
 */
export function getReservationStatusMeta(status) {
  const st = String(status || '').toUpperCase();
  switch (st) {
    case 'EXPIRED':
    case 'OVERDUE':
    case 'CANCELLED_NO_SHOW':
      return {
        key: 'EXPIRED',
        label: 'QUÁ HẠN',
        badgeClass:
          'bg-rose-50 text-rose-800 text-critical-red border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60',
        isOverdue: true,
        description: 'Quá giờ giữ chỗ không tới nhận trụ. Đặt chỗ bị hủy và tính phí phạt không đến.',
      };
    case 'ACTIVE':
    case 'HOLDING':
    case 'PENDING':
      return {
        key: 'ACTIVE',
        label: 'ĐANG GIỮ CHỖ',
        badgeClass:
          'bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60',
        isOverdue: false,
        description: 'Trụ sạc đang được giữ cho bạn. Vui lòng đến cắm súng trước hạn.',
      };
    case 'COMPLETED':
    case 'STARTED':
      return {
        key: 'COMPLETED',
        label: 'HOÀN THÀNH',
        badgeClass:
          'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60',
        isOverdue: false,
        description: 'Tài xế đã đến cắm súng đúng giờ và bắt đầu phiên sạc. Miễn phí giữ chỗ.',
      };
    case 'CANCELLED':
      return {
        key: 'CANCELLED',
        label: 'ĐÃ HỦY',
        badgeClass:
          'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        isOverdue: false,
        description: 'Đặt chỗ đã được hủy chủ động trước hạn. Không tính phí.',
      };
    default:
      return {
        key: st,
        label: st || 'CHƯA RÕ',
        badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        isOverdue: false,
        description: 'Trạng thái đặt chỗ.',
      };
  }
}

/**
 * Tính toán và hiển thị khoản phí cho lượt đặt chỗ
 * @param {object} reservation
 * @returns {{ amount: number, formatted: string, isPenalty: boolean, note: string }}
 */
export function formatReservationFee(reservation) {
  if (!reservation) {
    return { amount: 0, formatted: '0 đ', isPenalty: false, note: '' };
  }

  const isExpired = ['EXPIRED', 'OVERDUE', 'CANCELLED_NO_SHOW'].includes(
    String(reservation.status || '').toUpperCase()
  );

  if (isExpired) {
    const rawFee = reservation.no_show_fee ?? reservation.fee ?? DEFAULT_NO_SHOW_FEE;
    const feeNum = Number(rawFee) || DEFAULT_NO_SHOW_FEE;
    return {
      amount: feeNum,
      formatted: `-${feeNum.toLocaleString('vi-VN')} đ`,
      isPenalty: true,
      note: 'Phí phạt không đến (Đã trừ vào ví điện tử)',
    };
  }

  if (['COMPLETED', 'STARTED'].includes(String(reservation.status || '').toUpperCase())) {
    return {
      amount: 0,
      formatted: '0 đ',
      isPenalty: false,
      note: 'Miễn phí giữ chỗ (Đến cắm súng đúng hạn)',
    };
  }

  if (String(reservation.status || '').toUpperCase() === 'CANCELLED') {
    return {
      amount: 0,
      formatted: '0 đ',
      isPenalty: false,
      note: 'Miễn phí (Đã hủy trước hạn)',
    };
  }

  // ACTIVE
  const rawFee = reservation.no_show_fee ?? reservation.fee ?? DEFAULT_NO_SHOW_FEE;
  const feeNum = Number(rawFee) || DEFAULT_NO_SHOW_FEE;
  return {
    amount: feeNum,
    formatted: `${feeNum.toLocaleString('vi-VN')} đ`,
    isPenalty: false,
    note: `Phí phạt dự kiến ${feeNum.toLocaleString('vi-VN')} đ nếu quá giờ không tới`,
  };
}

/**
 * Kiểm tra xem một giao dịch sổ cái ví có phải là khoản phí quá hạn/không đến giữ chỗ hay không
 * @param {object} tx
 * @returns {boolean}
 */
export function isPenaltyTransaction(tx) {
  if (!tx) return false;
  const type = String(tx.transaction_type || '').toUpperCase();
  const refType = String(tx.reference_type || '').toUpperCase();
  const note = String(tx.note || '').toLowerCase();
  const refId = String(tx.reference_id || '').toLowerCase();

  return (
    type === 'NO_SHOW_PENALTY' ||
    type === 'RESERVATION_PENALTY' ||
    type === 'HOLD_FEE' ||
    type === 'PENALTY_FEE' ||
    refType === 'RESERVATION' ||
    refType === 'NO_SHOW' ||
    refType === 'RESERVATION_PENALTY' ||
    refId.startsWith('res_') ||
    refId.startsWith('reservation_') ||
    note.includes('quá hạn') ||
    note.includes('không đến') ||
    note.includes('giữ chỗ') ||
    note.includes('no-show') ||
    note.includes('penalty')
  );
}

/**
 * Tính thời gian còn lại trước khi hết hạn giữ chỗ
 * @param {string|Date} validUntil
 * @param {Date} [currentTime]
 * @returns {{ isExpired: boolean, minutes: number, seconds: number, text: string }}
 */
export function calculateRemainingHoldTime(validUntil, currentTime = new Date()) {
  if (!validUntil) {
    return { isExpired: true, minutes: 0, seconds: 0, text: 'Hết hạn' };
  }

  const expiry = new Date(validUntil).getTime();
  const now = new Date(currentTime).getTime();
  const diffMs = expiry - now;

  if (diffMs <= 0) {
    return { isExpired: true, minutes: 0, seconds: 0, text: 'Đã quá hạn' };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return {
    isExpired: false,
    minutes,
    seconds,
    text: `Còn ${mm}:${ss}`,
  };
}

/**
 * Lọc danh sách đặt chỗ theo trạng thái và tìm kiếm
 * @param {Array} reservations
 * @param {string} filterTab - ALL | ACTIVE | EXPIRED | COMPLETED | CANCELLED
 * @param {string} search - Từ khóa tìm kiếm
 * @returns {Array}
 */
export function filterReservations(reservations = [], filterTab = 'ALL', search = '') {
  if (!Array.isArray(reservations)) return [];

  const q = String(search || '').trim().toLowerCase();

  return reservations.filter((item) => {
    // 1. Lọc theo Tab trạng thái
    if (filterTab && filterTab !== 'ALL') {
      const meta = getReservationStatusMeta(item.status);
      if (meta.key !== filterTab) {
        return false;
      }
    }

    // 2. Lọc theo từ khóa
    if (q) {
      const code = String(item.reservation_code || item.id || '').toLowerCase();
      const station = String(item.station_name || '').toLowerCase();
      const charger = String(item.charger_code || '').toLowerCase();
      const note = String(item.note || '').toLowerCase();
      const match =
        code.includes(q) ||
        station.includes(q) ||
        charger.includes(q) ||
        note.includes(q);
      if (!match) return false;
    }

    return true;
  });
}

