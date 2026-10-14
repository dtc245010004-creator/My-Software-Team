/**
 * Cấu hình giao diện Chốt / Mở lại kỳ đối soát (S-55 / SCRUM-387 / SCRUM-408).
 *
 * GIÁ TRỊ TẠM, CHỜ PO XÁC NHẬN.
 * Backend là nơi quyết định cuối cùng (trả 422 nếu lý do không hợp lệ);
 * FE chỉ kiểm tra sớm để không gửi request vô ích.
 */

/** Độ dài tối thiểu (sau khi trim) của lý do mở lại kỳ. */
export const REOPEN_REASON_MIN_LENGTH = 10;

/** Độ dài tối đa của lý do mở lại kỳ (giới hạn ô nhập). */
export const REOPEN_REASON_MAX_LENGTH = 500;

/** Vai trò được thấy nút "Chốt kỳ". */
export const SETTLEMENT_CLOSE_ROLES = ['ACCOUNTANT', 'ADMIN'];

/** Vai trò được thấy nút "Mở lại kỳ". */
export const SETTLEMENT_REOPEN_ROLES = ['ADMIN'];

/** Vai trò được vào trang /settlement. */
export const SETTLEMENT_PAGE_ROLES = ['ACCOUNTANT', 'ADMIN'];

/** Thời gian tự ẩn thông báo thành công (ms). */
export const SETTLEMENT_SUCCESS_TOAST_MS = 5000;

