/**
 * Tiện ích định dạng ngày giờ theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
 */

/**
 * Chuẩn hóa chuỗi thời gian:
 * Nếu chuỗi không chứa thông tin múi giờ (không có 'Z', '+00:00', ...),
 * ép trình duyệt hiểu là giờ UTC bằng cách gắn hậu tố 'Z'.
 * @param {string|Date} input
 * @returns {Date|null}
 */
export function parseToDate(input) {
  if (!input) return null;
  if (input instanceof Date) return input;

  let str = String(input).trim();
  // Nếu là định dạng ISO/SQL thiếu timezone (vd: "2026-09-26T14:41:00" hoặc "2026-09-26 14:41:00")
  if (!str.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(str)) {
    str = str.replace(' ', 'T') + 'Z';
  }
  return new Date(str);
}

/**
 * Định dạng ngày giờ đầy đủ tiếng Việt: dd/mm/yyyy, HH:MM:SS
 * @param {string|Date} isoString
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatVNDateTime(isoString, options = {}) {
  const d = parseToDate(isoString);
  if (!d || isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('vi-VN', options);
}

/**
 * Định dạng chỉ hiển thị giờ phút giây: HH:MM:SS
 * @param {string|Date} isoString
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatVNTime(isoString, options = {}) {
  const d = parseToDate(isoString);
  if (!d || isNaN(d.getTime())) return 'N/A';
  return d.toLocaleTimeString('vi-VN', options);
}

/**
 * Định dạng chỉ hiển thị ngày: dd/mm/yyyy
 * @param {string|Date} isoString
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatVNDate(isoString, options = {}) {
  const d = parseToDate(isoString);
  if (!d || isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('vi-VN', options);
}

export default formatVNDateTime;
