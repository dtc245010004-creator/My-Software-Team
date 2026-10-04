/**
 * Tiện ích chuẩn hóa khoảng thời gian gửi lên Backend theo định dạng ISO 8601 UTC.
 *
 * Quy ước múi giờ của dự án (xem backend/app/core/datetime_utils.py):
 * - CSDL lưu trữ thời gian theo UTC.
 * - Giao diện hiển thị theo múi giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7).
 * - Backend dùng Annotated[datetime, AfterValidator(ensure_utc)] để chuẩn hóa
 *   mọi tham số thời gian đầu vào về UTC, kể cả khi client gửi chuỗi naive.
 *
 * Vì vậy client gửi chuỗi ISO có múi giờ rõ ràng (Z hoặc +07:00) để tránh
 * mọi nghi vấn về việc Backend phải đoán múi giờ.
 */

/** Chuẩn hóa một chuỗi hoặc Date thành ISO 8601 có múi giờ UTC (kết thúc bằng Z). */
export function toUtcIsoString(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Chuyển giá trị ô chọn ngày giờ (datetime-local) sang ISO 8601 UTC.
 * @param {string} localValue - Chuỗi "YYYY-MM-DDTHH:mm" theo giờ người dùng đang xem.
 * @returns {string|null} ISO 8601 UTC, hoặc null nếu giá trị rỗng/không hợp lệ.
 */
export function localInputToUtcIso(localValue) {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Sinh các khoảng thời gian tương đối cho nút chọn nhanh.
 * @param {number} hours - Số giờ lùi về trước tính từ thời điểm hiện tại.
 * @returns {{from: string, to: string}} Hai mốc thời gian ISO 8601 UTC.
 */
export function buildQuickRange(hours) {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  return { from: toUtcIsoString(from), to: toUtcIsoString(to) };
}

/**
 * Kiểm tra khoảng thời gian có hợp lệ để gửi đi không.
 * @param {string|null} fromValue - Giá trị ISO 8601 mốc bắt đầu.
 * @param {string|null} toValue - Giá trị ISO 8601 mốc kết thúc.
 * @returns {{valid: boolean, message: string}}
 */
export function validateDateRange(fromValue, toValue) {
  if (!fromValue && !toValue) return { valid: true, message: '' };

  if (fromValue && toValue) {
    const from = new Date(fromValue);
    const to = new Date(toValue);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { valid: false, message: 'Khoảng thời gian không hợp lệ.' };
    }
    if (from.getTime() > to.getTime()) {
      return {
        valid: false,
        message: 'Thời điểm bắt đầu phải nhỏn hơn hoặc bằng thời điểm kết thúc.',
      };
    }
  }

  return { valid: true, message: '' };
}
