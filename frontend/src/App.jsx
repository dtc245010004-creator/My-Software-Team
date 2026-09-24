import './App.css';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import StationManagement from './pages/StationManagement';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';

const NavigationBar = () => {
  const { user, logout } = useAuth();

  return (
    <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 28px', background: '#1e293b' }}>
      <div style={{ display: 'flex', gap: '20px' }}>
        <Link to="/" style={{ color: '#ffffff', textDecoration: 'none', fontWeight: 'bold' }}>Trang Chủ</Link>
        <Link to="/stations" style={{ color: '#ffffff', textDecoration: 'none', fontWeight: 'bold' }}>Quản lý Trụ Sạc</Link>
      </div>
      <div>
        {user ? (
          <span style={{ color: '#ffffff' }}>
            Xin chào: <strong>{user.name}</strong> ({user.role}) |{' '}
            <button 
              onClick={logout} 
              style={{ background: 'none', border: 'none', color: '#ffc107', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Đăng xuất
            </button>
          </span>
        ) : (
          <Link to="/login" style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 'bold' }}>Đăng nhập</Link>
        )}
      </div>
    </nav>
  );
};

const Home = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: '#1e293b' }}>
    <h1 style={{ color: '#0f172a', marginBottom: '16px' }}>Hệ Thống Quản Lý Trạm Sạc EV</h1>
    <p style={{ color: '#475569', fontSize: '16px' }}>
      Chào mừng bạn đến với hệ thống quản lý trạm sạc xe điện!
    </p>
    <p style={{ marginTop: '12px', color: '#64748b' }}>
      Vui lòng bấm vào mục <strong>Quản lý Trụ Sạc</strong> trên thanh menu để sử dụng ứng dụng.
    </p>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <NavigationBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'OPERATOR']} />}>
            <Route path="/stations" element={<StationManagement />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;