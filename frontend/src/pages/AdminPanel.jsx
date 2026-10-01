import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Unlock,
  UserCog,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './AdminPanel.css';

const ROLE_OPTIONS = ['ADMIN', 'OPERATOR', 'OWNER', 'DRIVER', 'CUSTOMER'];

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

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/users');
      const payload = Array.isArray(response.data)
        ? response.data
        : response.data.users ?? [];
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

    try {
      await api.post(`/admin/users/${id}/${action}`);
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
      await api.post('/admin/users', newUser);
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

  const handleRoleChange = async (id, nextRole) => {
    setActionId(id);
    setError('');
    setMessage('');

    try {
      await api.patch(`/admin/users/${id}/role`, { role: nextRole });
      setMessage('Đã cập nhật vai trò. Vai trò mới áp dụng từ API tiếp theo.');
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể cập nhật vai trò.'));
    } finally {
      setActionId(null);
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

          <div className="admin-nav-item">
            <Activity size={18} />
            <span>Bảng điều khiển</span>
          </div>

          <div className="admin-nav-item active">
            <Users size={18} />
            <span>Quản lý tài khoản</span>
          </div>

          <div className="admin-nav-item">
            <ShieldCheck size={18} />
            <span>Phân quyền</span>
          </div>

          <div className="admin-nav-item">
            <Zap size={18} />
            <span>Trạm sạc</span>
          </div>

          <div className="admin-nav-item">
            <UserCog size={18} />
            <span>Phiên sạc</span>
          </div>

          <div className="admin-nav-item">
            <Settings size={18} />
            <span>Cấu hình hệ thống</span>
          </div>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-mini">
            <div className="admin-avatar">{(rawUser?.username || 'A')[0].toUpperCase()}</div>
            <div className="admin-user-mini-text">
              <strong>{rawUser?.username || 'admin'}</strong>
              <span>ADMIN</span>
            </div>
          </div>

          <button className="admin-logout" onClick={logout}>
            <LogOut size={16} />
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <div className="admin-kicker">SYSTEM / ACCOUNTS</div>
            <h1>QUẢN LÝ TÀI KHOẢN</h1>
            <p>Quản lý tài khoản, trạng thái khóa và vai trò người dùng.</p>
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
            <span>ACTIVE</span>
            <strong className="green">{activeCount}</strong>
          </div>
          <div className="admin-stat-card">
            <span>LOCKED</span>
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
              <option key={item} value={item}>
                {item}
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
            <option value="ACTIVE">Active</option>
            <option value="LOCKED">Locked</option>
          </select>

          <button className="admin-create" onClick={() => setShowCreate(true)}>
            <Plus size={17} />
            Tạo tài khoản
          </button>
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
                  <th>NGÀY TẠO</th>
                  <th>THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="admin-empty">
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                ) : visibleUsers.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="admin-empty">
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
                            value={ROLE_OPTIONS.includes(user.role) ? user.role : 'CUSTOMER'}
                            onChange={(event) =>
                              handleRoleChange(user.id, event.target.value)
                            }
                            disabled={busy || user.username === rawUser?.username}
                            title={
                              user.username === rawUser?.username
                                ? 'Không cho tự đổi role của tài khoản ADMIN hiện tại'
                                : 'Đổi vai trò'
                            }
                          >
                            {ROLE_OPTIONS.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {locked ? (
                            <div className="status locked">
                              <span className="status-dot" />
                              LOCKED
                              {user.locked_until && (
                                <small>đến {formatDate(user.locked_until)}</small>
                              )}
                            </div>
                          ) : (
                            <div className="status active">
                              <span className="status-dot" />
                              ACTIVE
                            </div>
                          )}
                        </td>
                        <td className="date-cell">{formatDate(user.created_at)}</td>
                        <td>
                          <div className="action-buttons">
                            {locked ? (
                              <button
                                className="table-action unlock"
                                disabled={busy}
                                onClick={() =>
                                  doUserAction(
                                    user.id,
                                    'unlock',
                                    `Đã mở khóa tài khoản ${user.username}.`
                                  )
                                }
                              >
                                <Unlock size={15} />
                                Mở
                              </button>
                            ) : (
                              <button
                                className="table-action lock"
                                disabled={busy || user.username === rawUser?.username}
                                onClick={() =>
                                  doUserAction(
                                    user.id,
                                    'lock',
                                    `Đã khóa tài khoản ${user.username} và yêu cầu vô hiệu hóa session đang mở.`
                                  )
                                }
                              >
                                <Lock size={15} />
                                Khóa
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

        <div className="admin-note">
          <Lock size={15} />
          <span>
            Khóa thủ công nên đồng thời vô hiệu hóa session hiện tại của tài khoản.
            Tài khoản bị khóa sẽ không đăng nhập được cho tới khi ADMIN mở khóa.
          </span>
        </div>
      </main>

      {showCreate && (
        <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}>
          <form
            className="admin-modal"
            onSubmit={handleCreate}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <div className="admin-kicker">ACCOUNT / NEW</div>
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
              Username
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

            <label>
              Vai trò
              <select
                value={newUser.role}
                onChange={(event) =>
                  setNewUser((current) => ({
                    ...current,
                    role: event.target.value,
                  }))
                }
              >
                {ROLE_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

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
