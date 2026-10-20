import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Unlock,
  UserCog,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './AdminPanel.css';

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Quản trị viên' },
  { value: 'OPERATOR', label: 'Chủ trạm sạc' },
  { value: 'ACCOUNTANT', label: 'Kế toán viên' },
  { value: 'CUSTOMER', label: 'Tài xế' },
  { value: 'OWNER', label: 'Chủ sở hữu' },
  { value: 'DRIVER', label: 'Tài xế' },
];

function getRoleLabel(role) {
  const found = ROLE_OPTIONS.find((r) => r.value === role);
  return found ? found.label : role;
}

function normalizeUser(user) {
  return {
    id: user.id,
    username: user.username ?? '',
    email: user.email ?? '',
    full_name: user.full_name ?? '',
    role: user.role ?? (user.roles?.[0]?.name ?? 'CUSTOMER'),
    is_locked: Boolean(user.is_locked ?? user.locked ?? false),
    locked_until: user.locked_until ?? null,
    is_active: user.is_active !== false,
    created_at: user.created_at ?? user.createdAt ?? null,
  };
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('vi-VN');
}

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    fallback
  );
}

export default function AdminPanel() {
  const { role, rawUser, logout } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    role: 'CUSTOMER',
  });

  // State đổi mật khẩu từng người dùng
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  // State đổi mật khẩu toàn bộ / hàng loạt
  const [showBatchResetModal, setShowBatchResetModal] = useState(false);
  const [batchRole, setBatchRole] = useState('ALL');
  const [batchPassword, setBatchPassword] = useState('');
  const [batchConfirmPassword, setBatchConfirmPassword] = useState('');
  const [batchShowPassword, setBatchShowPassword] = useState(false);
  const [batchExcludeSelf, setBatchExcludeSelf] = useState(true);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState('');

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const [activeTab, setActiveTab] = useState('accounts'); // 'accounts' | 'rbac' | 'settings'
  const [systemConfig, setSystemConfig] = useState({
    maxGridLoadKw: 250,
    emergencyCutoffTemp: 70,
    remoteStartTimeoutSec: 60,
    aiHeuristicFallback: true,
    failedLoginLockMinutes: 15,
  });

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/users');
      const data = response.data;
      const payload = Array.isArray(data)
        ? data
        : data.users ?? data.items ?? data.data ?? [];
      setUsers(payload.map(normalizeUser));
    } catch (err) {
      setUsers([]);
      setError(
        getErrorMessage(
          err,
          'Không tải được danh sách tài khoản. Hãy kiểm tra API /admin/users.'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'ADMIN') {
      loadUsers();
    }
  }, [role]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesQuery =
        !q ||
        String(user.id).includes(q) ||
        user.username.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.full_name.toLowerCase().includes(q);

      const matchesRole =
        selectedRole === 'ALL' || user.role === selectedRole;

      const locked = user.is_locked || !user.is_active;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && !locked) ||
        (statusFilter === 'LOCKED' && locked);

      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [users, query, selectedRole, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const visibleUsers = filteredUsers.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const doUserAction = async (id, action, successText) => {
    setActionId(id);
    setError('');
    setMessage('');

    const endpointByAction = {
      lock: `/admin/users/${id}/lock-login`,
      unlock: `/admin/users/${id}/unlock-login`,
      disable: `/admin/users/${id}/disable`,
      enable: `/admin/users/${id}/enable`,
    };

    try {
      await api.patch(endpointByAction[action]);
      setMessage(successText);
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, `Không thể thực hiện thao tác ${action}.`));
    } finally {
      setActionId(null);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setActionId('create');
    setError('');
    setMessage('');

    try {
      const { role: _role, ...registerData } = newUser;
      await api.post('/auth/register', registerData);
      setShowCreate(false);
      setNewUser({
        username: '',
        email: '',
        full_name: '',
        password: '',
        role: 'CUSTOMER',
      });
      setMessage('Đã tạo tài khoản thành công.');
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tạo tài khoản.'));
    } finally {
      setActionId(null);
    }
  };

  // Tạo mật khẩu ngẫu nhiên an toàn
  const generateRandomPassword = () => {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    const numbers = '23456789';
    let pass = 'EvCsms@';
    for (let i = 0; i < 4; i++) {
      pass += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    for (let i = 0; i < 2; i++) {
      pass += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    return pass;
  };

  // Mở modal đổi mật khẩu từng người dùng
  const handleOpenResetPassword = (targetUser) => {
    setResetTargetUser(targetUser);
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setResetError('');
  };

  // Gửi yêu cầu đổi mật khẩu cho 1 người dùng
  const handleSubmitResetPassword = async (e) => {
    e.preventDefault();
    if (!resetTargetUser) return;

    if (newPassword.length < 8) {
      setResetError('Mật khẩu phải có độ dài tối thiểu 8 ký tự.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setResetError('Mật khẩu phải chứa ít nhất 1 chữ cái và 1 chữ số.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setResetLoading(true);
    setResetError('');
    try {
      const res = await api.patch(`/admin/users/${resetTargetUser.id}/password`, {
        new_password: newPassword,
      });
      setMessage(res.data?.message || `Đã đổi mật khẩu thành công cho tài khoản ${resetTargetUser.username}.`);
      setResetTargetUser(null);
    } catch (err) {
      setResetError(getErrorMessage(err, 'Không thể đổi mật khẩu.'));
    } finally {
      setResetLoading(false);
    }
  };

  // Gửi yêu cầu đổi mật khẩu toàn bộ / hàng loạt
  const handleSubmitBatchReset = async (e) => {
    e.preventDefault();
    if (batchPassword.length < 8) {
      setBatchError('Mật khẩu phải có độ dài tối thiểu 8 ký tự.');
      return;
    }
    if (!/[A-Za-z]/.test(batchPassword) || !/\d/.test(batchPassword)) {
      setBatchError('Mật khẩu phải chứa ít nhất 1 chữ cái và 1 chữ số.');
      return;
    }
    if (batchPassword !== batchConfirmPassword) {
      setBatchError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setBatchLoading(true);
    setBatchError('');
    try {
      const res = await api.post('/admin/users/batch-reset-password', {
        new_password: batchPassword,
        role: batchRole,
        exclude_self: batchExcludeSelf,
      });
      setMessage(res.data?.message || 'Đã cập nhật mật khẩu đồng loạt thành công.');
      setShowBatchResetModal(false);
    } catch (err) {
      setBatchError(getErrorMessage(err, 'Không thể đổi mật khẩu toàn bộ người dùng.'));
    } finally {
      setBatchLoading(false);
    }
  };

  if (role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const activeCount = users.filter(
    (user) => !user.is_locked && user.is_active
  ).length;
  const lockedCount = users.filter(
    (user) => user.is_locked || !user.is_active
  ).length;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-icon">
            <Zap size={20} />
          </div>
          <div>
            <div className="admin-brand-title">EV CSMS</div>
            <div className="admin-brand-subtitle">ADMIN CONSOLE</div>
          </div>
        </div>

        <nav className="admin-nav">
          <div className="admin-nav-label">ĐIỀU HÀNH</div>

          <button
            type="button"
            className="admin-nav-item"
            onClick={() => navigate('/')}
          >
            <Activity size={18} />
            <span>Bảng điều khiển</span>
          </button>

          <button
            type="button"
            className={`admin-nav-item ${activeTab === 'accounts' ? 'active' : ''}`}
            onClick={() => setActiveTab('accounts')}
          >
            <Users size={18} />
            <span>Quản lý tài khoản</span>
          </button>

          <button
            type="button"
            className={`admin-nav-item ${activeTab === 'rbac' ? 'active' : ''}`}
            onClick={() => setActiveTab('rbac')}
          >
            <ShieldCheck size={18} />
            <span>Phân quyền</span>
          </button>

          <button
            type="button"
            className="admin-nav-item"
            onClick={() => navigate('/stations')}
          >
            <Zap size={18} />
            <span>Trạm sạc</span>
          </button>

          <button
            type="button"
            className="admin-nav-item"
            onClick={() => navigate('/sessions')}
          >
            <UserCog size={18} />
            <span>Phiên sạc</span>
          </button>

          <button
            type="button"
            className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} />
            <span>Cấu hình hệ thống</span>
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-mini">
            <div className="admin-avatar">{(rawUser?.username || 'A')[0].toUpperCase()}</div>
            <div className="admin-user-mini-text">
              <strong>{rawUser?.username || 'admin'}</strong>
              <span>QUẢN TRỊ VIÊN</span>
            </div>
          </div>

          <button className="admin-logout" onClick={logout}>
            <LogOut size={16} />
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {activeTab === 'accounts' && (
          <>
            <header className="admin-topbar">
              <div>
                <div className="admin-kicker">HỆ THỐNG / TÀI KHOẢN</div>
                <h1>QUẢN LÝ TÀI KHOẢN</h1>
                <p>Quản lý danh sách người dùng, phân quyền vai trò và trạng thái hoạt động.</p>
              </div>

              <button
                className="admin-refresh"
                type="button"
                onClick={loadUsers}
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                Tải lại
              </button>
            </header>

            <section className="admin-stat-grid">
              <div className="admin-stat-card">
                <span>TỔNG TÀI KHOẢN</span>
                <strong>{users.length}</strong>
              </div>
              <div className="admin-stat-card">
                <span>HOẠT ĐỘNG</span>
                <strong className="green">{activeCount}</strong>
              </div>
              <div className="admin-stat-card">
                <span>ĐÃ KHÓA</span>
                <strong className="red">{lockedCount}</strong>
              </div>
            </section>

            <section className="admin-toolbar">
              <div className="admin-search">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Tìm ID, username, email, tên..."
                />
              </div>

              <select
                value={selectedRole}
                onChange={(event) => {
                  setSelectedRole(event.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">Tất cả vai trò</option>
                {ROLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Hoạt động</option>
                <option value="LOCKED">Đã khóa</option>
              </select>

              <div className="admin-toolbar-actions">
                <button
                  type="button"
                  className="admin-create batch-reset"
                  onClick={() => {
                    setBatchPassword('');
                    setBatchConfirmPassword('');
                    setBatchShowPassword(false);
                    setBatchRole('ALL');
                    setBatchExcludeSelf(true);
                    setBatchError('');
                    setShowBatchResetModal(true);
                  }}
                  title="Đổi mật khẩu đồng loạt cho toàn bộ người dùng trong hệ thống"
                >
                  <KeyRound size={16} />
                  <span>Đổi MK toàn bộ</span>
                </button>

                <button
                  className="admin-create"
                  onClick={() => setShowCreate(true)}
                  title="Tài khoản mới sẽ được tạo qua API đăng ký hiện có"
                >
                  <Plus size={17} />
                  <span>Tạo tài khoản</span>
                </button>
              </div>
            </section>

            {message && <div className="admin-alert success">{message}</div>}
            {error && (
              <div className="admin-alert error">
                <AlertTriangle size={17} />
                <span>{error}</span>
              </div>
            )}

            <section className="admin-table-card">
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>HEAD</th>
                      <th>ID</th>
                      <th>TÀI KHOẢN</th>
                      <th>TÊN NGƯỜI DÙNG</th>
                      <th>EMAIL</th>
                      <th>VAI TRÒ</th>
                      <th>TRẠNG THÁI</th>
                      <th>THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="8" className="admin-empty">
                          Đang tải dữ liệu...
                        </td>
                      </tr>
                    ) : visibleUsers.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="admin-empty">
                          Không tìm thấy tài khoản phù hợp.
                        </td>
                      </tr>
                    ) : (
                      visibleUsers.map((user) => {
                        const locked = user.is_locked || !user.is_active;
                        const busy = actionId === user.id;

                        return (
                          <tr key={user.id}>
                            <td>
                              <div className="admin-head">{String(user.id).slice(-2)}</div>
                            </td>
                            <td className="mono">{user.id}</td>
                            <td>
                              <strong className="account-name">{user.username}</strong>
                            </td>
                            <td>{user.full_name || '—'}</td>
                            <td className="email-cell">{user.email || '—'}</td>
                            <td>
                              <select
                                className="role-select"
                                value={user.role}
                                disabled={busy}
                                onChange={async (event) => {
                                  const nextRole = event.target.value;

                                  if (nextRole === user.role) return;

                                  setActionId(user.id);
                                  setError('');
                                  setMessage('');

                                  try {
                                    await api.patch(`/admin/users/${user.id}/role`, {
                                      role: nextRole,
                                    });

                                    setMessage(
                                      `Đã đổi vai trò tài khoản ${user.username} thành ${getRoleLabel(nextRole)}.`
                                    );

                                    await loadUsers();
                                  } catch (err) {
                                    setError(
                                      getErrorMessage(err, 'Không thể cập nhật vai trò tài khoản.')
                                    );
                                  } finally {
                                    setActionId(null);
                                  }
                                }}
                              >
                                {ROLE_OPTIONS.map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              {locked ? (
                                <div className="status locked">
                                  <span className="status-dot" />
                                  ĐÃ KHÓA
                                  {user.locked_until && (
                                    <small>đến {formatDate(user.locked_until)}</small>
                                  )}
                                </div>
                              ) : (
                                <div className="status active">
                                  <span className="status-dot" />
                                  HOẠT ĐỘNG
                                </div>
                              )}
                            </td>
                            <td>
                              <div className="action-buttons">
                                <button
                                  type="button"
                                  className="table-action key"
                                  disabled={busy}
                                  title={`Đổi mật khẩu cho tài khoản ${user.username}`}
                                  onClick={() => handleOpenResetPassword(user)}
                                >
                                  <KeyRound size={13} />
                                  Đổi MK
                                </button>

                                {locked ? (
                                  <button
                                    className="table-action unlock"
                                    disabled={busy}
                                    title="Mở khóa tài khoản"
                                    onClick={() =>
                                      doUserAction(
                                        user.id,
                                        'unlock',
                                        `Đã mở khóa tài khoản ${user.username}.`
                                      )
                                    }
                                  >
                                    <Unlock size={14} />
                                    Mở
                                  </button>
                                ) : (
                                  <button
                                    className="table-action lock"
                                    disabled={busy || user.username === rawUser?.username || user.username === 'admin'}
                                    title="Khóa đăng nhập 15 phút"
                                    onClick={() =>
                                      doUserAction(
                                        user.id,
                                        'lock',
                                        `Đã khóa tài khoản ${user.username} 15 phút.`
                                      )
                                    }
                                  >
                                    <Lock size={14} />
                                    Khóa
                                  </button>
                                )}

                                {user.is_active ? (
                                  <button
                                    className="table-action disable"
                                    disabled={busy || user.username === rawUser?.username || user.username === 'admin'}
                                    title="Vô hiệu hóa tài khoản"
                                    onClick={() =>
                                      doUserAction(
                                        user.id,
                                        'disable',
                                        `Đã vô hiệu hóa tài khoản ${user.username}.`
                                      )
                                    }
                                  >
                                    Tắt
                                  </button>
                                ) : (
                                  <button
                                    className="table-action enable"
                                    disabled={busy}
                                    title="Kích hoạt lại tài khoản"
                                    onClick={() =>
                                      doUserAction(
                                        user.id,
                                        'enable',
                                        `Đã kích hoạt tài khoản ${user.username}.`
                                      )
                                    }
                                  >
                                    Bật
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <footer className="admin-pagination">
                <span>
                  Hiển thị {visibleUsers.length} / {filteredUsers.length} tài khoản
                </span>

                <div className="pagination-controls">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <strong>
                    {page} / {totalPages}
                  </strong>
                  <button
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((value) => Math.min(totalPages, value + 1))
                    }
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </footer>
            </section>
          </>
        )}

        {activeTab === 'rbac' && (
          <div>
            <header className="admin-topbar">
              <div>
                <div className="admin-kicker">HỆ THỐNG / RBAC</div>
                <h1>MA TRẬN PHÂN QUYỀN HỆ THỐNG</h1>
                <p>Quy chuẩn phân quyền vai trò (Role-Based Access Control) theo quy chuẩn kiến trúc EV CSMS.</p>
              </div>
            </header>

            <div className="admin-table-card">
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>NGHIỆP VỤ & TÀI NGUYÊN</th>
                      <th>QUẢN TRỊ VIÊN</th>
                      <th>CHỦ TRẠM SẠC</th>
                      <th>KẾ TOÁN VIÊN</th>
                      <th>TÀI XẾ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Điều phối phụ tải & Giám sát Dashboard</strong></td>
                      <td><span className="status active"><span className="status-dot" />Toàn quyền hệ thống</span></td>
                      <td><span className="status active"><span className="status-dot" />Trạm sở hữu</span></td>
                      <td><span className="status active"><span className="status-dot" />Xem doanh thu</span></td>
                      <td><span className="status locked"><span className="status-dot" />Không được phép</span></td>
                    </tr>
                    <tr>
                      <td><strong>Hạ tầng Trạm sạc & Cấu hình Trụ (EVSE)</strong></td>
                      <td><span className="status active"><span className="status-dot" />Thêm / Sửa / Khởi động lại</span></td>
                      <td><span className="status active"><span className="status-dot" />Khởi động lại trụ sở hữu</span></td>
                      <td><span className="status locked"><span className="status-dot" />Không được phép</span></td>
                      <td><span className="status locked"><span className="status-dot" />Chỉ xem bản đồ</span></td>
                    </tr>
                    <tr>
                      <td><strong>Khởi động sạc từ xa (S-24 / T-52 RemoteStart)</strong></td>
                      <td><span className="status active"><span className="status-dot" />Hỗ trợ điều khiển</span></td>
                      <td><span className="status active"><span className="status-dot" />Điều khiển trạm nhà</span></td>
                      <td><span className="status locked"><span className="status-dot" />Không được phép</span></td>
                      <td><span className="status active"><span className="status-dot" />Cắm sạc thực tế</span></td>
                    </tr>
                    <tr>
                      <td><strong>Quản lý Biểu giá điện (TOU Tariff)</strong></td>
                      <td><span className="status active"><span className="status-dot" />Toàn quyền cấu hình</span></td>
                      <td><span className="status locked"><span className="status-dot" />Chỉ xem</span></td>
                      <td><span className="status locked"><span className="status-dot" />Chỉ xem</span></td>
                      <td><span className="status locked"><span className="status-dot" />Chỉ xem</span></td>
                    </tr>
                    <tr>
                      <td><strong>Tra cứu Nhật ký vận hành & Kiểm toán (Audit Logs)</strong></td>
                      <td><span className="status active"><span className="status-dot" />Toàn bộ lịch sử</span></td>
                      <td><span className="status active"><span className="status-dot" />Nhật ký trạm sở hữu</span></td>
                      <td><span className="status active"><span className="status-dot" />Đối soát giao dịch</span></td>
                      <td><span className="status locked"><span className="status-dot" />Nhật ký cá nhân</span></td>
                    </tr>
                    <tr>
                      <td><strong>Quản trị Tài khoản, Đổi vai trò & Mật khẩu người dùng</strong></td>
                      <td><span className="status active"><span className="status-dot" />Toàn quyền</span></td>
                      <td><span className="status locked"><span className="status-dot" />Không được phép</span></td>
                      <td><span className="status locked"><span className="status-dot" />Không được phép</span></td>
                      <td><span className="status locked"><span className="status-dot" />Không được phép</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <header className="admin-topbar">
              <div>
                <div className="admin-kicker">HỆ THỐNG / CẤU HÌNH</div>
                <h1>CẤU HÌNH THÔNG SỐ VẬN HÀNH MẠNG LƯỚI</h1>
                <p>Thiết lập ngưỡng tải an toàn, ngắt sạc khẩn cấp và chu trình bảo vệ hệ thống trạm sạc xe điện.</p>
              </div>
              <button
                type="button"
                className="admin-create"
                onClick={() => {
                  setMessage('Đã lưu cấu hình vận hành hệ thống EV CSMS thành công!');
                  setTimeout(() => setMessage(''), 4000);
                }}
              >
                Lưu cấu hình
              </button>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div className="admin-stat-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0b78da' }}>NGƯỠNG PHỤ TẢI AN TOÀN TRẠM</span>
                <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 12px' }}>Công suất tải tối đa cho phép mỗi trạm trước khi AI kích hoạt giãn dòng sạc.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    style={{ width: '120px', padding: '6px 10px', border: '1px solid #ced9e4', borderRadius: '6px' }}
                    value={systemConfig.maxGridLoadKw}
                    onChange={(e) => setSystemConfig({ ...systemConfig, maxGridLoadKw: Number(e.target.value) })}
                  />
                  <strong style={{ fontSize: '14px' }}>kW</strong>
                </div>
              </div>

              <div className="admin-stat-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#dc2626' }}>NGƯỠNG NGẮT KHẨN CẤP QUÁ NHIỆT</span>
                <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 12px' }}>Tự động ngắt rơ-le và hủy phiên sạc khẩn cấp để chống cháy nổ pin (Safety First).</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    style={{ width: '120px', padding: '6px 10px', border: '1px solid #ced9e4', borderRadius: '6px' }}
                    value={systemConfig.emergencyCutoffTemp}
                    onChange={(e) => setSystemConfig({ ...systemConfig, emergencyCutoffTemp: Number(e.target.value) })}
                  />
                  <strong style={{ fontSize: '14px' }}>°C</strong>
                </div>
              </div>

              <div className="admin-stat-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0b78da' }}>THỜI GIAN CHỜ LỆNH BẮT ĐẦU SẠC</span>
                <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 12px' }}>Thời gian chờ trụ phản hồi StartTransaction trước khi báo hết hạn (S-24 / T-52).</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    style={{ width: '120px', padding: '6px 10px', border: '1px solid #ced9e4', borderRadius: '6px' }}
                    value={systemConfig.remoteStartTimeoutSec}
                    onChange={(e) => setSystemConfig({ ...systemConfig, remoteStartTimeoutSec: Number(e.target.value) })}
                  />
                  <strong style={{ fontSize: '14px' }}>giây</strong>
                </div>
              </div>

              <div className="admin-stat-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#16a34a' }}>ĐỘNG CƠ DỰ PHÒNG HEURISTIC</span>
                <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 12px' }}>Tự động duy trì sạc an toàn khi mô hình AI bảo trì hoặc mất kết nối API.</p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
                  <input
                    type="checkbox"
                    checked={systemConfig.aiHeuristicFallback}
                    onChange={(e) => setSystemConfig({ ...systemConfig, aiHeuristicFallback: e.target.checked })}
                  />
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>Kích hoạt Heuristic Fallback</span>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="admin-note">
          <Lock size={15} />
          <span>
            Hệ thống phân quyền RBAC và điều khiển tài khoản EV CSMS đã được kích hoạt đầy đủ.
          </span>
        </div>
      </main>

      {/* Modal 1: Đổi mật khẩu cho một người dùng */}
      {resetTargetUser && (
        <div className="modal-backdrop" onMouseDown={() => setResetTargetUser(null)}>
          <form
            className="admin-modal"
            onSubmit={handleSubmitResetPassword}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <div className="admin-kicker">TÀI KHOẢN / MẬT KHẨU</div>
                <h2>ĐỔI MẬT KHẨU NGƯỜI DÙNG</h2>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Tài khoản: <strong style={{ color: '#0a67b8' }}>{resetTargetUser.username}</strong> ({resetTargetUser.full_name || 'Chưa cập nhật tên'})
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setResetTargetUser(null)}
              >
                ×
              </button>
            </div>

            {resetError && (
              <div className="admin-alert error" style={{ margin: '8px 0' }}>
                <AlertTriangle size={16} />
                <span>{resetError}</span>
              </div>
            )}

            <label>
              Mật khẩu mới
              <div className="input-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="Nhập tối thiểu 8 ký tự..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button
              type="button"
              className="btn-generate-password"
              onClick={() => {
                const pass = generateRandomPassword();
                setNewPassword(pass);
                setConfirmPassword(pass);
                setShowPassword(true);
              }}
            >
              <Sparkles size={13} />
              Tạo mật khẩu ngẫu nhiên an toàn
            </button>

            <label>
              Xác nhận mật khẩu mới
              <div className="input-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="Nhập lại mật khẩu mới..."
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </label>

            <div className="admin-form-note">
              Mật khẩu bắt buộc có tối thiểu 8 ký tự, bao gồm cả chữ cái và chữ số. Tài khoản sẽ tự động được mở khóa nếu đang bị khóa đăng nhập tạm thời.
            </div>

            <div className="admin-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setResetTargetUser(null)}
                disabled={resetLoading}
              >
                Hủy
              </button>
              <button
                className="admin-create"
                type="submit"
                disabled={resetLoading}
              >
                <KeyRound size={16} />
                {resetLoading ? 'Đang cập nhật...' : 'Lưu mật khẩu'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 2: Đổi mật khẩu toàn bộ người dùng / hàng loạt */}
      {showBatchResetModal && (
        <div className="modal-backdrop" onMouseDown={() => setShowBatchResetModal(false)}>
          <form
            className="admin-modal"
            onSubmit={handleSubmitBatchReset}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <div className="admin-kicker">HÀNG LOẠT / ĐỔI MẬT KHẨU</div>
                <h2>ĐỔI MẬT KHẨU TOÀN BỘ NGƯỜI DÙNG</h2>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Thiết lập mật khẩu đồng loạt cho toàn hệ thống hoặc theo vai trò
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowBatchResetModal(false)}
              >
                ×
              </button>
            </div>

            {batchError && (
              <div className="admin-alert error" style={{ margin: '8px 0' }}>
                <AlertTriangle size={16} />
                <span>{batchError}</span>
              </div>
            )}

            <label>
              Áp dụng cho nhóm người dùng
              <select
                value={batchRole}
                onChange={(e) => setBatchRole(e.target.value)}
              >
                <option value="ALL">Tất cả người dùng (Toàn bộ hệ thống)</option>
                <option value="CUSTOMER">Tài xế</option>
                <option value="OPERATOR">Chủ trạm sạc</option>
                <option value="ACCOUNTANT">Kế toán viên</option>
              </select>
            </label>

            <label>
              Mật khẩu mới áp dụng chung
              <div className="input-password-wrap">
                <input
                  type={batchShowPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="Nhập tối thiểu 8 ký tự..."
                  value={batchPassword}
                  onChange={(e) => setBatchPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setBatchShowPassword(!batchShowPassword)}
                  title={batchShowPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {batchShowPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button
              type="button"
              className="btn-generate-password"
              onClick={() => {
                const pass = generateRandomPassword();
                setBatchPassword(pass);
                setBatchConfirmPassword(pass);
                setBatchShowPassword(true);
              }}
            >
              <Sparkles size={13} />
              Tạo mật khẩu ngẫu nhiên an toàn
            </button>

            <label>
              Xác nhận mật khẩu mới
              <div className="input-password-wrap">
                <input
                  type={batchShowPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="Nhập lại mật khẩu mới..."
                  value={batchConfirmPassword}
                  onChange={(e) => setBatchConfirmPassword(e.target.value)}
                />
              </div>
            </label>

            <label className="admin-modal-checkbox">
              <input
                type="checkbox"
                checked={batchExcludeSelf}
                onChange={(e) => setBatchExcludeSelf(e.target.checked)}
              />
              <span>Không đổi mật khẩu của tài khoản Admin đang đăng nhập hiện tại</span>
            </label>

            <div className="admin-form-note" style={{ color: '#b45309', background: '#fffbeb', border: '1px solid #fef3c7', padding: '8px', borderRadius: '6px' }}>
              ⚠️ Cảnh báo: Sau khi xác nhận, toàn bộ tài khoản trong nhóm được chọn sẽ được cập nhật mật khẩu mới này và mở khóa đăng nhập.
            </div>

            <div className="admin-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowBatchResetModal(false)}
                disabled={batchLoading}
              >
                Hủy
              </button>
              <button
                className="admin-create batch-reset"
                type="submit"
                disabled={batchLoading}
              >
                <KeyRound size={16} />
                {batchLoading ? 'Đang xử lý...' : 'Xác nhận đổi toàn bộ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 3: Tạo tài khoản mới */}
      {showCreate && (
        <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}>
          <form
            className="admin-modal"
            onSubmit={handleCreate}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <div className="admin-kicker">HỆ THỐNG / TẠO MỚI</div>
                <h2>TẠO TÀI KHOẢN</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowCreate(false)}
              >
                ×
              </button>
            </div>

            <label>
              Tên đăng nhập
              <input
                required
                value={newUser.username}
                onChange={(event) =>
                  setNewUser((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Email
              <input
                type="email"
                required
                value={newUser.email}
                onChange={(event) =>
                  setNewUser((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Họ và tên
              <input
                required
                value={newUser.full_name}
                onChange={(event) =>
                  setNewUser((current) => ({
                    ...current,
                    full_name: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Mật khẩu
              <input
                type="password"
                required
                minLength={8}
                value={newUser.password}
                onChange={(event) =>
                  setNewUser((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
              />
            </label>

            <div className="admin-form-note">
              Tài khoản tạo từ API đăng ký hiện tại sẽ nhận vai trò mặc định của hệ thống.
            </div>

            <div className="admin-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCreate(false)}
              >
                Hủy
              </button>
              <button
                className="admin-create"
                type="submit"
                disabled={actionId === 'create'}
              >
                <Plus size={17} />
                {actionId === 'create' ? 'Đang tạo...' : 'Tạo tài khoản'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
