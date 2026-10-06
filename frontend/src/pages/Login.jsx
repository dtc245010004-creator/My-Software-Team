import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Shield, Key, User, ArrowRight, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ui/ThemeToggle';
import Button from '../components/ui/Button';

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
      setError(
        err.response?.data?.detail ||
          'Không thể đăng nhập tài khoản demo. Hãy kiểm tra thông tin đăng nhập và backend.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] flex flex-col justify-center items-center px-4 font-sans transition-colors duration-200 relative selection:bg-sky-500 selection:text-white py-12">
      
      {/* Top Right Theme Toggle */}
      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>

      <div className="max-w-md w-full bg-white dark:bg-[#151D2A] border border-slate-200 dark:border-slate-800 p-8 rounded-3xl shadow-xl dark:shadow-soft-dark space-y-6">
        
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-400 p-0.5 shadow-lg shadow-sky-500/25 items-center justify-center transform transition-transform hover:scale-105">
            <div className="w-full h-full bg-slate-900/10 rounded-[14px] flex items-center justify-center">
              <Zap className="w-7 h-7 text-white fill-white/80" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            EV CSMS Console
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Nền tảng Vận hành Trạm sạc Xe điện &amp; Phân phối Lưới điện
          </p>
        </div>

        {/* 1-Click Fast Login for Demo */}
        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl space-y-2.5 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-semibold block text-[11px] uppercase tracking-wider">
            Đăng nhập nhanh (Demo 1-Click):
          </span>
          <div className="grid grid-cols-5 gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickDemo('ADMIN')}
              className="py-1.5 px-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 rounded-xl font-bold text-center transition-all text-[11px]"
              title="Quản trị viên toàn hệ thống"
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('OPERATOR_A')}
              className="py-1.5 px-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 rounded-xl font-bold text-center transition-all text-[11px]"
              title="Chủ trạm A (VinFast - ST1, ST2)"
            >
              Chủ A
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('OPERATOR_B')}
              className="py-1.5 px-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 rounded-xl font-bold text-center transition-all text-[11px]"
              title="Chủ trạm B (Trung Tâm - ST3)"
            >
              Chủ B
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('CUSTOMER')}
              className="py-1.5 px-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 rounded-xl font-bold text-center transition-all text-[11px]"
              title="Tài xế sạc hợp lệ"
            >
              Tài xế
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('DEBT')}
              className="py-1.5 px-1 bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700 hover:bg-rose-200 rounded-xl font-bold text-center transition-all text-[11px]"
              title="Mô phỏng tài khoản nợ -330.000đ bị khóa"
            >
              Tài xế nợ
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 p-3 text-xs text-rose-700 dark:text-rose-300 rounded-xl font-medium">
            {error}
          </div>
        )}

        {/* Form Login/Register */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="text-slate-600 dark:text-slate-400 font-medium block mb-1.5">
              Tên đăng nhập
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên đăng nhập..."
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
              />
            </div>
          </div>

          {isRegisterMode && (
            <>
              <div>
                <label className="text-slate-600 dark:text-slate-400 font-medium block mb-1.5">
                  Họ và tên
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nhập họ và tên..."
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
                />
              </div>
              <div>
                <label className="text-slate-600 dark:text-slate-400 font-medium block mb-1.5">
                  Địa chỉ Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Nhập địa chỉ email..."
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-slate-600 dark:text-slate-400 font-medium block mb-1.5">
              Mật khẩu bảo mật
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="w-full shadow-lg shadow-sky-600/25 font-bold"
          >
            {isRegisterMode ? 'Đăng ký tài khoản mới' : 'Đăng nhập hệ thống'}
          </Button>
        </form>

        <div className="text-center pt-3 border-t border-slate-100 dark:border-slate-800 text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setError('');
            }}
            className="text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 font-medium transition-colors"
          >
            {isRegisterMode ? 'Đã có tài khoản? Đăng nhập ngay' : 'Chưa có tài khoản? Đăng ký mới'}
          </button>
        </div>
      </div>
    </div>
  );
}

