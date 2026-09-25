import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Shield, Key, User, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, register, quickSwitch } = useAuth();
  const navigate = useNavigate();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('operator_a');
  const [password, setPassword] = useState('OpPass123');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegisterMode) {
        await register({
          username,
          email,
          password,
          full_name: fullName,
        });
        alert('Đăng ký tài khoản thành công! Vui lòng đăng nhập.');
        setIsRegisterMode(false);
      } else {
        await login(username, password);
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Thao tác thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async (role) => {
    try {
      setLoading(true);
      await quickSwitch(role);
      navigate('/');
    } catch (err) {
      setError('Tài khoản demo chưa khởi tạo. Vui lòng đăng nhập bằng form bên dưới.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian flex flex-col justify-center items-center px-4 font-mono">
      <div className="max-w-md w-full bg-panel border border-hairline p-8 rounded-sm space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex bg-electric-cyan/20 border border-electric-cyan/40 p-3 rounded">
            <Zap className="w-8 h-8 text-electric-cyan" />
          </div>
          <h1 className="text-xl font-bold text-tech-white tracking-wide">EV CSMS CONSOLE</h1>
          <p className="text-xs text-steel-gray">Nền tảng Vận hành Trạm sạc Xe điện &amp; Phân phối Lưới điện</p>
        </div>

        {/* 1-Click Fast Login for Demo */}
        <div className="bg-obsidian border border-hairline p-3 rounded space-y-2 text-xs">
          <span className="text-steel-gray font-bold block text-[11px]">ĐĂNG NHẬP NHANH BẢO VỆ ĐỒ ÁN (DEMO 1-CLICK):</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickDemo('ADMIN')}
              className="py-1.5 px-2 bg-critical-red/20 text-critical-red border border-critical-red/40 hover:bg-critical-red/30 rounded font-bold text-center transition-colors"
            >
              Quản trị viên
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('OPERATOR')}
              className="py-1.5 px-2 bg-caution-amber/20 text-caution-amber border border-caution-amber/40 hover:bg-caution-amber/30 rounded font-bold text-center transition-colors"
            >
              Vận hành CPO
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('CUSTOMER')}
              className="py-1.5 px-2 bg-grid-green/20 text-grid-green border border-grid-green/40 hover:bg-grid-green/30 rounded font-bold text-center transition-colors"
            >
              Tài xế sạc
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-critical-red/20 border border-critical-red/40 p-2 text-xs text-critical-red rounded">
            {error}
          </div>
        )}

        {/* Form Login/Register */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="text-steel-gray block mb-1">TÊN ĐĂNG NHẬP / USERNAME</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-obsidian border border-hairline p-2.5 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
            />
          </div>

          {isRegisterMode && (
            <>
              <div>
                <label className="text-steel-gray block mb-1">HỌ VÀ TÊN</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-obsidian border border-hairline p-2.5 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                />
              </div>
              <div>
                <label className="text-steel-gray block mb-1">ĐỊA CHỈ EMAIL</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-obsidian border border-hairline p-2.5 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-steel-gray block mb-1">MẬT KHẨU BẢO MẬT</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-obsidian border border-hairline p-2.5 rounded text-tech-white focus:outline-none focus:border-electric-cyan"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded bg-electric-cyan hover:bg-electric-cyan-hover disabled:opacity-50 text-white font-bold transition-all"
          >
            {loading ? 'ĐANG XỬ LÝ...' : isRegisterMode ? 'ĐĂNG KÝ TÀI KHOẢN MỚI' : 'ĐĂNG NHẬP HỆ THỐNG'}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-hairline text-xs">
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setError('');
            }}
            className="text-steel-gray hover:text-tech-white"
          >
            {isRegisterMode ? 'Đã có tài khoản? Đăng nhập ngay' : 'Chưa có tài khoản? Đăng ký mới'}
          </button>
        </div>
      </div>
    </div>
  );
}
