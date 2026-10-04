/**
 * Nhãn tiếng Việt cho mã hành động và kết quả trong nhật ký vận hành.
 *
 * [CẦN XÁC NHẬN] Danh sách mã hành động bên dưới được suy ra từ phạm vi
 * T-57 trong `nentangtramsac_bandaydu.md` (Reset, RemoteStopTransaction,
 * đóng phiên bất thường thủ công) chứ CHƯA được đối chiếu với một enum
 * chính thức trong Backend, vì bảng `audit_logs` hiện chưa tồn tại.
 * Khi Backend tạo bảng, cần cập nhật lại khóa `ACTION_LABELS` cho khớp enum thật.
 */

export const ACTION_LABELS = {
  RESET: 'Khởi động lại trụ',
  REMOTE_STOP_TRANSACTION: 'Dừng phiên từ xa',
  CLOSE_ABNORMAL_SESSION: 'Đóng phiên bất thường',
};

export const RESULT_LABELS = {
  SUCCESS: 'Thành công',
  FAILED: 'Thất bại',
  PENDING: 'Đang xử lý',
};

/**
 * Trả về nhãn hiển thị của một dòng nhật ký.
 * @param {string} action - Mã hành động do Backend trả về.
 * @param {string} [result] - Mã kết quả nếu Backend cung cấp.
 * @returns {string}
 */
export function getActionLabel(action, result) {
  const actionLabel = ACTION_LABELS[action] || action || 'Không rõ';
  if (!result) return actionLabel;
  const resultLabel = RESULT_LABELS[result] || result;
  return `${actionLabel} · ${resultLabel}`;
}
