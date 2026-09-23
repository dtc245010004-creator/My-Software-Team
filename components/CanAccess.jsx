import { useAuth } from '../context/AuthContext';

const CanAccess = ({ allowedRoles, children }) => {
  const { user } = useAuth();

  // Nếu không có user hoặc role không nằm trong danh sách allowedRoles -> Không hiển thị UI
  if (!user || !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
};

export default CanAccess;