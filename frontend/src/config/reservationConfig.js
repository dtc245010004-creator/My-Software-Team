/**
 * reservationConfig.js — Hằng số cấu hình đặt chỗ trạm sạc.
 *
 * PHẢI KHỚP VỚI BACKEND. Khi backend chốt giá trị thực tế,
 * cập nhật file này trước tiên rồi sync với backend.
 */

/**
 * Số phút tối đa cho phép đặt chỗ trước khi giờ tới.
 * @description Tài xế chỉ được đặt chỗ trong vòng tối đa MAX_RESERVATION_AHEAD_MINUTES kể từ bây giờ.
 * Chỉnh sửa giá trị này phải đồng bộ với backend (Pydantic validator).
 */
export const MAX_RESERVATION_AHEAD_MINUTES = 120;

/**
 * Độ dài giữ chỗ mặc định (phút) khi tài xế chưa chọn.
 * @description Sau khi backend chốt chính sách phí đặt trước / thời hạn tối đa,
 * cập nhật DEFAULT_HOLD_MINUTES và thêm trường has_reservation_fee vào mock.
 */
export const DEFAULT_HOLD_MINUTES = 60;

/**
 * Bước nhảy phút khi chọn giờ tới trong modal đặt chỗ.
 */
export const ARRIVAL_SLOT_STEP_MINUTES = 15;

/**
 * Số dư ví tối thiểu (VNĐ) để được đặt chỗ.
 * Nếu backend trả ngưỡng khác qua response WALLET_BELOW_THRESHOLD,
 * ưu tiên giá trị từ server.
 */
export const MIN_BALANCE_FOR_RESERVATION = 50000;

/**
 * Khoảng đếm ngược tối thiểu (ms) để hiện countdown.
 * Nếu còn dưới MIN_COUNTDOWN_MS thì hiện "Sắp hết hạn" thay vì countdown.
 */
export const MIN_COUNTDOWN_MS = 30_000; // 30 giây

/**
 * Tên route dẫn đến trang nạp tiền (đặt vào đây để đổi 1 chỗ duy nhất).
 */
export const WALLET_TOPUP_ROUTE = '/wallet';
