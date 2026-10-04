/**
 * Xác định route trang chủ mặc định theo vai trò người dùng
 * - ADMIN: Bảng Điều Khiển ('/')
 * - OPERATOR: Bảng Điều Khiển trạm sở hữu ('/')
 * - CUSTOMER: Bản Đồ Trạm Sạc ('/map')
 */
export function getHomeRouteByRole(role) {
  if (role === 'ADMIN' || role === 'OPERATOR') {
    return '/';
  }
  return '/map';
}
