/**
 * Bảng ánh xạ nhãn vai trò người dùng chuẩn hóa toàn hệ thống EV CSMS
 */
export const ROLE_LABELS = {
  ADMIN: 'Quản trị viên',
  OPERATOR: 'Chủ trạm',
  ACCOUNTANT: 'Kế toán',
  CUSTOMER: 'Tài xế',
};

/**
 * Lấy nhãn hiển thị tiếng Việt của vai trò
 * @param {string} role
 * @returns {string}
 */
export const getRoleLabel = (role) => {
  return ROLE_LABELS[role] || role || 'Khách';
};

/**
 * Danh mục tài khoản Demo phục vụ kiểm thử phân quyền 1-Click
 */
export const DEMO_USERS = {
  ADMIN: {
    username: 'admin',
    password: '12345678a',
    role: 'ADMIN',
    label: 'Admin',
    fullName: 'Quản Trị Viên Hệ Thống',
    description: 'Toàn quyền mạng lưới trạm sạc',
  },
  OPERATOR: {
    username: 'operator_a',
    password: 'OpPass123',
    role: 'OPERATOR',
    label: 'Chủ trạm sạc',
    fullName: 'Chủ Trạm Sạc Mẫu',
    description: 'Quản lý trạm sạc thuộc quyền sở hữu',
  },
  ACCOUNTANT: {
    username: 'accountant',
    password: 'AccPass123',
    role: 'ACCOUNTANT',
    label: 'Kế toán',
    fullName: 'Kế Toán Viên Hệ Thống',
    description: 'Đối soát doanh thu & tra cứu kiểm toán',
  },
  CUSTOMER: {
    username: 'driver_vip',
    password: 'DriverPass123',
    role: 'CUSTOMER',
    label: 'Tài xế',
    fullName: 'Trần Thị Bích Ngọc (Tài xế VF9)',
    description: 'Tìm trạm và cắm sạc xe điện',
  },
};

