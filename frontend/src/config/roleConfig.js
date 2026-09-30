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
    password: 'AdminPass123',
    role: 'ADMIN',
    label: 'Admin',
    fullName: 'Quản Trị Viên Hệ Thống',
    description: 'Toàn quyền mạng lưới trạm sạc',
  },
  OPERATOR_A: {
    username: 'operator_a',
    password: 'OpPass123',
    role: 'OPERATOR',
    label: 'Chủ trạm A',
    fullName: 'Chủ Trạm VinFast (Trạm ST-1, ST-2)',
    description: 'Trạm VinFast Hòa Khánh & Trung Tâm',
  },
  OPERATOR_B: {
    username: 'operator',
    password: 'OpPass123',
    role: 'OPERATOR',
    label: 'Chủ trạm B',
    fullName: 'Chủ Trạm Trung Tâm (Trạm ST-3)',
    description: 'Trạm Sạc Trung Tâm Đà Nẵng',
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
