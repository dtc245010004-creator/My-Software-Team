import { Link } from 'react-router-dom';

const Unauthorized = () => {
  return (
    <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '60px', color: '#dc3545', margin: '0' }}>403</h1>
      <h2 style={{ marginTop: '10px' }}>Không có quyền truy cập!</h2>
      <p style={{ color: '#6c757d' }}>Tài khoản của bạn không có đủ thẩm quyền để xem nội dung này.</p>
      <Link to="/" style={{ color: '#0d6efd', textDecoration: 'none', fontWeight: 'bold' }}>
        ← Quay lại Trang chủ
      </Link>
    </div>
  );
};

export default Unauthorized;