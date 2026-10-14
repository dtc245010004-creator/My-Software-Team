/**
 * Cấu hình nghiệp vụ Xóa / Ẩn danh hóa dữ liệu cá nhân (SCRUM-418 / SCRUM-389 / SCRUM-41).
 *
 * LƯU Ý PHÁP LÝ & QUYỀN HẠN:
 * Nhóm phát triển KHÔNG đưa ra tư vấn pháp lý.
 * Các nội dung giải thích và quy trình dưới đây là thông tin sơ bộ phục vụ giao diện hệ thống,
 * CHỜ NGƯỜI CÓ THẨM QUYỀN XÁC NHẬN phạm vi dữ liệu phải xóa theo Nghị định 13/2023/NĐ-CP
 * và phạm vi dữ liệu phải lưu trữ theo Luật Kế toán.
 */

/** Giới hạn độ dài tối đa của lý do tài xế yêu cầu xóa dữ liệu (ký tự). */
export const ERASURE_REASON_MAX_LENGTH = 500;

/** Độ dài tối thiểu của lý do từ chối yêu cầu xóa dữ liệu (ký tự). */
export const REJECT_REASON_MIN_LENGTH = 10;

/** Độ dài tối đa của lý do từ chối yêu cầu xóa dữ liệu (ký tự). */
export const REJECT_REASON_MAX_LENGTH = 500;

/** Thời gian tự ẩn thông báo Toast thành công (ms). */
export const DATA_ERASURE_TOAST_MS = 5000;

/** Vai trò được truy cập trang yêu cầu xóa dữ liệu tài xế. */
export const DRIVER_ERASURE_ROLES = ['CUSTOMER'];

/** Vai trò được truy cập màn hình duyệt yêu cầu xóa dữ liệu. */
export const ADMIN_ERASURE_ROLES = ['ADMIN'];

/**
 * Nội dung giải thích tĩnh về quy trình xóa/ẩn danh hóa dữ liệu cho tài xế.
 * Ghi chú: Chờ người có thẩm quyền xác nhận phạm vi dữ liệu.
 */
export const DATA_ERASURE_DISCLAIMER_TEXT = {
  title: 'Thông tin về quyền yêu cầu xóa dữ liệu cá nhân',
  subTitle: 'Quy trình tiếp nhận và xử lý theo Nghị định 13/2023/NĐ-CP (Chờ người có thẩm quyền xác nhận)',
  points: [
    'Khi yêu cầu được duyệt và xử lý: Hệ thống sẽ ẩn danh hóa các thông tin nhận diện tài xế, lịch sử sạc và lộ trình di chuyển.',
    'Phiên sạc và hóa đơn được ẩn danh hóa thay vì xóa hoàn toàn nhằm bảo đảm tính toàn vẹn của số liệu doanh thu tổng hợp và sổ cái kế toán.',
    'Nếu tài khoản ví còn số dư dương: Bạn bắt buộc phải xử lý hoàn tiền hoặc rút hết số dư trước khi yêu cầu xóa được chấp thuận.',
    'Thao tác xóa/ẩn danh hóa sau khi Quản trị viên duyệt sẽ KHÔNG THỂ HOÀN TÁC.',
  ],
  legalNote: 'Lưu ý: Nhóm phát triển không đưa ra tư vấn pháp lý. Phạm vi dữ liệu được xóa hoặc giữ lại được quyết định bởi chính sách bảo vệ dữ liệu do người có thẩm quyền phê duyệt.',
};
