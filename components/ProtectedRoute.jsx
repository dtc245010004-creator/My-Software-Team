import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
  const { user } = useAuth();

  // 1. Chưa đăng nhập -> Chuyển về trang Login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 2. Không nằm trong danh sách Role được phép -> Chuyển về trang 403 (Unauthorized)
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // 3. Hợp lệ -> Cho phép xem nội dung của Route con
  return <Outlet />;
};

export default ProtectedRoute;