import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const handleQuickLogin = (role) => {
    login({ id: Date.now(), name: `User (${role})`, role });
    navigate('/stations');
  };

  return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
      <h2>Trang Đăng Nhập / Chọn Vai Trò Test</h2>
      <p>Role hiện tại: <strong>{user ? user.role : 'Chưa đăng nhập'}</strong></p>
      
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
        <button onClick={() => handleQuickLogin('ADMIN')} style={btnStyle('#0d6efd')}>Đăng nhập làm ADMIN</button>
        <button onClick={() => handleQuickLogin('MANAGER')} style={btnStyle('#198754')}>Đăng nhập làm MANAGER</button>
        <button onClick={() => handleQuickLogin('OPERATOR')} style={btnStyle('#ffc107')}>Đăng nhập làm OPERATOR</button>
        <button onClick={() => handleQuickLogin('USER')} style={btnStyle('#6c757d')}>Đăng nhập làm USER thường</button>
      </div>
    </div>
  );
};

const btnStyle = (bgColor) => ({
  padding: '10px 15px',
  backgroundColor: bgColor,
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
});

export default Login;