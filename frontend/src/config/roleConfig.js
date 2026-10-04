/**
 * Bảng ánh xạ nhãn vai trò người dùng chuẩn hóa toàn hệ thống EV CSMS
 */
export const ROLE_LABELS = {
  ADMIN: 'Quản trị viên',
  OPERATOR: 'Chủ trạm',
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
  CUSTOMER: {
    username: 'driver_user',
    password: 'DriverPass123',
    role: 'CUSTOMER',
    label: 'Tài xế',
    fullName: 'Tài Xế Khách Hàng',
    description: 'Tìm trạm và cắm sạc xe điện',
  },
};
