import React, { useState } from 'react';

export default function StationManagement() {
  // 1. Quản lý Vai trò (RBAC) - 'CPO' | 'ADMIN' | 'DRIVER'
  const [role, setRole] = useState('ADMIN');

  // 2. Trạng thái chuyển Tab: 'STATIONS' | 'RBAC'
  const [activeTab, setActiveTab] = useState('STATIONS');

  // Dữ liệu trụ sạc mẫu
  const [stations, setStations] = useState([
    { id: 'ST-001', name: 'Trụ sạc nhanh Q.1', location: '12 Lê Duẩn, Bến Nghé, Q.1', type: 'CCS2 (DC Fast)', power: '120 kW', connectors: 2, status: 'ACTIVE' },
    { id: 'ST-002', name: 'Trụ sạc Cầu Ánh Sao', location: 'KĐT Phú Mỹ Hưng, Q.7', type: 'Type 2 (AC)', power: '22 kW', connectors: 4, status: 'CHARGING' },
    { id: 'ST-003', name: 'Trụ sạc Landmark 81', location: '720A Điện Biên Phủ, Bình Thạnh', type: 'CCS2 + CHAdeMO', power: '180 kW', connectors: 3, status: 'MAINTENANCE' },
  ]);

  // Dữ liệu Tài khoản dành cho Chức năng Phân Quyền RBAC
  const [users, setUsers] = useState([
    { id: 'USR-001', name: 'Nguyễn Văn A', email: 'admin@evcsms.com', role: 'ADMIN', status: 'ACTIVE' },
    { id: 'USR-002', name: 'Operator Quận 1', email: 'cpo.q1@evcsms.com', role: 'CPO', status: 'ACTIVE' },
    { id: 'USR-003', name: 'Lê Văn Lái Xe', email: 'driver01@gmail.com', role: 'DRIVER', status: 'ACTIVE' },
  ]);

  // Bộ lọc & Tìm kiếm Trụ sạc
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // State Modal Thêm Trụ Sạc
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({ id: '', name: '', location: '', type: 'CCS2 (DC Fast)', power: '120 kW', connectors: 2 });
  const [errorMessage, setErrorMessage] = useState('');

  // State Modal Sửa & Chi Tiết Trụ Sạc
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editFormData, setEditFormData] = useState(null);

  // State Modal Sửa & Thêm Quyền RBAC
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ id: '', name: '', email: '', role: 'CPO', status: 'ACTIVE' });
  const [userError, setUserError] = useState('');

  // Xử lý chuyển vai trò
  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (newRole !== 'ADMIN' && activeTab === 'RBAC') {
      setActiveTab('STATIONS');
    }
  };

  // ==================== CÁC HÀM XỬ LÝ CHỨC NĂNG RBAC ====================
  const handleOpenEditUser = (user) => {
    setEditingUser({ ...user });
    setIsEditUserOpen(true);
  };

  const handleSaveUserRole = (e) => {
    e.preventDefault();
    setUsers(users.map((u) => (u.id === editingUser.id ? editingUser : u)));
    setIsEditUserOpen(false);
  };

  const handleToggleUserStatus = (userId) => {
    setUsers(users.map((u) => {
      if (u.id === userId) {
        return { ...u, status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' };
      }
      return u;
    }));
  };

  const handleDeleteUser = (userId) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa tài khoản [${userId}] không?`)) {
      setUsers(users.filter((u) => u.id !== userId));
    }
  };

  const handleAddUser = (e) => {
    e.preventDefault();
    setUserError('');
    if (!newUserForm.id.trim() || !newUserForm.name.trim() || !newUserForm.email.trim()) {
      setUserError('Vui lòng điền đầy đủ Mã ND, Tên và Email!');
      return;
    }
    const isDup = users.some((u) => u.id.toLowerCase() === newUserForm.id.toLowerCase().trim());
    if (isDup) {
      setUserError(`LỖI: Mã tài khoản "${newUserForm.id.toUpperCase()}" đã tồn tại!`);
      return;
    }
    setUsers([{ ...newUserForm, id: newUserForm.id.toUpperCase().trim() }, ...users]);
    setIsAddUserOpen(false);
    setNewUserForm({ id: '', name: '', email: '', role: 'CPO', status: 'ACTIVE' });
  };

  // ==================== CÁC HÀM XỬ LÝ TRẠM SẠC ====================
  const handleDeleteStation = (stationId) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa trụ sạc [${stationId}] khỏi hệ thống không?`)) {
      setStations((prev) => prev.filter((s) => s.id !== stationId));
    }
  };

  const handleOpenDetail = (station) => {
    setSelectedStation(station);
    setIsDetailOpen(true);
  };

  const handleOpenEdit = (station) => {
    setEditFormData({ ...station });
    setIsEditOpen(true);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    setStations((prev) => prev.map((s) => (s.id === editFormData.id ? editFormData : s)));
    setIsEditOpen(false);
  };

  const handleAddStation = (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formData.id.trim()) {
      setErrorMessage('Vui lòng nhập Mã trụ sạc!');
      return;
    }

    const isDuplicate = stations.some(
      (s) => s.id.toLowerCase().trim() === formData.id.toLowerCase().trim()
    );

    if (isDuplicate) {
      setErrorMessage(`LỖI: Mã trụ "${formData.id.toUpperCase().trim()}" đã tồn tại trong hệ thống!`);
      return;
    }

    const newStation = {
      ...formData,
      id: formData.id.toUpperCase().trim(),
      status: 'ACTIVE'
    };

    setStations([newStation, ...stations]);
    setStatusFilter('ALL');
    setSearchTerm('');
    setIsAddOpen(false);
    setFormData({ id: '', name: '', location: '', type: 'CCS2 (DC Fast)', power: '120 kW', connectors: 2 });
  };

  // Lọc danh sách trụ sạc
  const filteredStations = stations.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Render Badge Trạng Thái Trụ Sạc
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Sẵn sàng
          </span>
        );
      case 'CHARGING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
            Đang sạc
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            Bảo trì
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
            Ngoại tuyến
          </span>
        );
    }
  };

  // Render Badge Role RBAC
  const renderRoleBadge = (userRole) => {
    switch (userRole) {
      case 'ADMIN':
        return <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-purple-100 text-purple-800 border border-purple-200">SYSTEM ADMIN</span>;
      case 'CPO':
        return <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">CPO OPERATOR</span>;
      default:
        return <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-blue-100 text-blue-800 border border-blue-200">EV DRIVER</span>;
    }
  };

  // ROUTE GUARD: Màn hình 403 Chặn Driver
  if (role === 'DRIVER') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-3xl flex items-center justify-center text-4xl shadow-2xl shadow-rose-500/20 mb-6">
          🚫
        </div>
        <h1 className="text-3xl font-black tracking-tight">403 - KHÔNG CÓ QUYỀN TRUY CẬP</h1>
        <p className="text-slate-400 mt-3 text-center max-w-md text-sm leading-relaxed">
          Giao diện Quản lý Trụ sạc chỉ dành cho <span className="text-emerald-400 font-bold">CPO (Đơn vị vận hành)</span> và <span className="text-purple-400 font-bold">System Admin</span>.
        </p>
        <button
          onClick={() => handleRoleChange('CPO')}
          className="mt-8 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/30 transition-all transform active:scale-95"
        >
          🔄 Chuyển sang vai trò CPO
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans antialiased overflow-hidden w-full">
      
      {/* 1. SIDEBAR */}
      <aside className="w-64 bg-slate-950 text-slate-300 flex flex-col justify-between shrink-0 border-r border-slate-800 shadow-2xl z-20">
        <div>
          {/* Logo Brand */}
          <div className="h-20 flex items-center px-6 border-b border-slate-800/80 bg-slate-950/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-xl flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-emerald-500/20">
                ⚡
              </div>
              <div>
                <h2 className="font-extrabold text-base text-white tracking-wide">EV CSMS</h2>
                <p className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase">
                  {role === 'ADMIN' ? 'System Admin' : 'CPO Operator'}
                </p>
              </div>
            </div>
          </div>

          {/* SIDEBAR MENU */}
          <nav className="p-4 flex flex-col space-y-2">
            <p className="px-3 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
              QUẢN TRỊ HẠ TẦNG
            </p>

            <button
              type="button"
              onClick={() => setActiveTab('STATIONS')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition ${
                activeTab === 'STATIONS'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              <span>Quản Lý Trụ Sạc</span>
            </button>

            {role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => setActiveTab('RBAC')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition ${
                  activeTab === 'RBAC'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                <span>Phân Quyền RBAC</span>
              </button>
            )}

            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-900 hover:text-white transition"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>Biểu Giá TOU</span>
            </button>
          </nav>
        </div>

        <div className="p-4 bg-slate-900/60 border-t border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-white text-xs">
              {role === 'ADMIN' ? 'AD' : 'CP'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{role === 'ADMIN' ? 'Admin System' : 'Operator Q.1'}</p>
              <p className="text-[10px] text-emerald-400 font-medium">Trực tuyến</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. KHU VỰC NỘI DUNG CHÍNH */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        
        {/* Top Header */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-8 flex items-center justify-between sticky top-0 z-10 w-full">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              {activeTab === 'STATIONS' ? 'Quản Lý Trụ & Đầu Nối Trạm Sạc' : 'Quản Lý Phân Quyền Hệ Thống (RBAC)'}
            </h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              {activeTab === 'STATIONS' ? 'Giám sát thông số kỹ thuật & cấu hình cổng sạc realtime' : 'Quản lý tài khoản và phân quyền người dùng trong hệ thống'}
            </p>
          </div>

          {/* Bộ chuyển đổi vai trò (Đã bỏ chữ TEST ROLE, Driver ngắn gọn) */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
            <button
              onClick={() => handleRoleChange('CPO')}
              className={`px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all ${
                role === 'CPO' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              CPO
            </button>
            <button
              onClick={() => handleRoleChange('ADMIN')}
              className={`px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all ${
                role === 'ADMIN' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Admin
            </button>
            <button
              onClick={() => handleRoleChange('DRIVER')}
              className={`px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all ${
                role === 'DRIVER' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Driver
            </button>
          </div>
        </header>

        {/* TAB 1: QUẢN LÝ TRỤ SẠC */}
        {activeTab === 'STATIONS' ? (
          <main className="p-6 md:p-8 space-y-6 w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Tổng số trụ sạc</p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-black text-slate-900">{stations.length}</span>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">Trụ hệ thống</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition border-l-4 border-l-emerald-500">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Sẵn sàng (Active)</p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-black text-emerald-600">
                    {stations.filter(s => s.status === 'ACTIVE').length}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">Khả dụng</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition border-l-4 border-l-blue-500">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Đang hoạt động sạc</p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-black text-blue-600">
                    {stations.filter(s => s.status === 'CHARGING').length}
                  </span>
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">Realtime Telemetry</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition border-l-4 border-l-amber-500">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Bảo trì / Báo lỗi</p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-black text-amber-600">
                    {stations.filter(s => s.status === 'MAINTENANCE').length}
                  </span>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">Cảnh báo AI</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative w-full sm:w-80">
                    <input
                      type="text"
                      placeholder="Tìm theo Mã trụ, Tên trụ..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition"
                    />
                    <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs font-bold bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  >
                    <option value="ALL">Tất cả trạng thái</option>
                    <option value="ACTIVE">Sẵn sàng</option>
                    <option value="CHARGING">Đang sạc</option>
                    <option value="MAINTENANCE">Bảo trì</option>
                  </select>
                </div>

                <button
                  onClick={() => setIsAddOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-5 py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all transform active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
                  Thêm Trụ / Đầu Nối Mới
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-600">
                      <th className="py-4 px-6">Mã Trụ (Unique Code)</th>
                      <th className="py-4 px-6">Tên Trụ Sạc & Vị Trí</th>
                      <th className="py-4 px-6">Loại Cổng & Công Suất</th>
                      <th className="py-4 px-6 text-center">Số Cổng</th>
                      <th className="py-4 px-6 text-center">Trạng Thái</th>
                      <th className="py-4 px-6 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredStations.map((station) => (
                      <tr key={station.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-6 font-mono font-bold text-slate-900">
                          <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200">
                            {station.id}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <p className="font-extrabold text-slate-900 text-sm">{station.name}</p>
                          <p className="text-slate-500 font-medium text-[11px] mt-0.5">{station.location}</p>
                        </td>
                        <td className="py-4 px-6">
                          <p className="font-bold text-slate-800">{station.type}</p>
                          <p className="text-[11px] font-extrabold text-emerald-600 mt-0.5">{station.power}</p>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className="font-extrabold text-slate-800 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                            {station.connectors} đầu nối
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          {renderStatusBadge(station.status)}
                        </td>
                        <td className="py-4 px-6 text-right space-x-1">
                          <button onClick={() => handleOpenDetail(station)} className="px-3 py-1.5 font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition">Chi tiết</button>
                          <button onClick={() => handleOpenEdit(station)} className="px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition">Sửa</button>
                          <button onClick={() => handleDeleteStation(station.id)} className="px-3 py-1.5 font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition">Xóa</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        ) : (
          /* TAB 2: QUẢN LÝ PHÂN QUYỀN RBAC */
          <main className="p-6 md:p-8 space-y-6 w-full">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Tổng số tài khoản</p>
                <p className="text-3xl font-black text-slate-900 mt-2">{users.length} tài khoản</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm border-l-4 border-l-purple-500">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">System Admins</p>
                <p className="text-3xl font-black text-purple-700 mt-2">{users.filter(u => u.role === 'ADMIN').length}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm border-l-4 border-l-emerald-500">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">CPO Operators</p>
                <p className="text-3xl font-black text-emerald-600 mt-2">{users.filter(u => u.role === 'CPO').length}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-black text-slate-900">Danh Sách Tài Khoản & Phân Quyền Truy Cập</h3>
                <button
                  onClick={() => setIsAddUserOpen(true)}
                  className="bg-purple-700 hover:bg-purple-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition"
                >
                  + Thêm Tài Khoản Mới
                </button>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600">
                    <th className="py-4 px-6">Mã ND</th>
                    <th className="py-4 px-6">Tên Người Dùng</th>
                    <th className="py-4 px-6">Email Đăng Nhập</th>
                    <th className="py-4 px-6 text-center">Vai Trò (Role)</th>
                    <th className="py-4 px-6 text-center">Trạng Thái</th>
                    <th className="py-4 px-6 text-right">Thao Tác RBAC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6 font-mono font-bold text-slate-900">{u.id}</td>
                      <td className="py-4 px-6 font-extrabold text-slate-900">{u.name}</td>
                      <td className="py-4 px-6 text-slate-600 font-medium">{u.email}</td>
                      <td className="py-4 px-6 text-center">{renderRoleBadge(u.role)}</td>
                      <td className="py-4 px-6 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          u.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {u.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right space-x-1">
                        <button
                          onClick={() => handleOpenEditUser(u)}
                          className="px-2.5 py-1.5 font-bold text-purple-700 hover:bg-purple-50 rounded-lg transition"
                        >
                          Sửa quyền
                        </button>
                        <button
                          onClick={() => handleToggleUserStatus(u.id)}
                          className={`px-2.5 py-1.5 font-bold rounded-lg transition ${
                            u.status === 'ACTIVE' ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {u.status === 'ACTIVE' ? 'Khóa' : 'Mở'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="px-2.5 py-1.5 font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        )}

      </div>

      {/* ================= 1. MODAL THÊM TRỤ SẠC ================= */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">⚡ Thêm Trụ Sạc Mới</h3>
                <p className="text-xs text-slate-500 mt-0.5">Khởi tạo mã trụ sạc duy nhất cho trạm</p>
              </div>
              <button
                onClick={() => { setIsAddOpen(false); setErrorMessage(''); }}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold text-sm transition"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-2xl flex items-center gap-2">
                <span>⚠️</span> {errorMessage}
              </div>
            )}

            <form onSubmit={handleAddStation} className="mt-6 space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-700 mb-1.5">Mã Trụ Sạc (Unique Code) <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  placeholder="Ví dụ: ST-004"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none transition"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1.5">Tên Trụ Sạc</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Trụ sạc siêu nhanh Công viên Gia Định"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none transition"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1.5">Địa Chỉ Vị Trí</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Hoàng Minh Giám, Q. Phú Nhuận"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1.5">Công Suất Sạc (kW)</label>
                  <input
                    type="text"
                    value={formData.power}
                    onChange={(e) => setFormData({ ...formData, power: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1.5">Số Đầu Nối (Connectors)</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={formData.connectors}
                    onChange={(e) => setFormData({ ...formData, connectors: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none transition"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => { setIsAddOpen(false); setErrorMessage(''); }}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-600/30 transition active:scale-95"
                >
                  Lưu Trụ Sạc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 2. MODAL SỬA TRỤ SẠC ================= */}
      {isEditOpen && editFormData && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">✏️ Chỉnh Sửa Trụ Sạc [{editFormData.id}]</h3>
                <p className="text-xs text-slate-500 mt-0.5">Cập nhật thông số cấu hình và trạng thái</p>
              </div>
              <button onClick={() => setIsEditOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold text-sm">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-6 space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-700 mb-1.5">Tên Trụ Sạc</label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1.5">Địa Chỉ Vị Trí</label>
                <input
                  type="text"
                  value={editFormData.location}
                  onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1.5">Công Suất (kW)</label>
                  <input
                    type="text"
                    value={editFormData.power}
                    onChange={(e) => setEditFormData({ ...editFormData, power: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1.5">Số Cổng Sạc</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={editFormData.connectors}
                    onChange={(e) => setEditFormData({ ...editFormData, connectors: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1.5">Trạng Thái Trụ Sạc</label>
                <select
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="ACTIVE">Sẵn sàng (Active)</option>
                  <option value="CHARGING">Đang sạc (Charging)</option>
                  <option value="MAINTENANCE">Bảo trì (Maintenance)</option>
                  <option value="OFFLINE">Ngoại tuyến (Offline)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 mt-6">
                <button type="button" onClick={() => setIsEditOpen(false)} className="px-5 py-3 bg-slate-100 text-slate-700 font-extrabold rounded-xl">Hủy Bỏ</button>
                <button type="submit" className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-xl shadow-lg shadow-blue-600/30">Cập Nhật</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 3. MODAL CHI TIẾT TRỤ SẠC ================= */}
      {isDetailOpen && selectedStation && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">🔍 Chi Tiết Trụ Sạc [{selectedStation.id}]</h3>
                <p className="text-xs text-slate-500 mt-0.5">Thông số vận hành thời gian thực</p>
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold text-sm">✕</button>
            </div>

            <div className="mt-6 space-y-4 text-xs font-semibold text-slate-700">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <p className="flex justify-between"><span>Mã định danh (Code):</span> <strong className="font-mono text-slate-900">{selectedStation.id}</strong></p>
                <p className="flex justify-between"><span>Tên trụ:</span> <strong className="text-slate-900">{selectedStation.name}</strong></p>
                <p className="flex justify-between"><span>Vị trí lắp đặt:</span> <strong className="text-slate-900">{selectedStation.location}</strong></p>
                <p className="flex justify-between"><span>Loại đầu sạc:</span> <strong className="text-slate-900">{selectedStation.type}</strong></p>
                <p className="flex justify-between"><span>Công suất định mức:</span> <strong className="text-emerald-600 font-bold">{selectedStation.power}</strong></p>
                <p className="flex justify-between"><span>Số cổng sạc:</span> <strong className="text-slate-900">{selectedStation.connectors} cổng</strong></p>
                <p className="flex justify-between items-center"><span>Trạng thái hiện tại:</span> {renderStatusBadge(selectedStation.status)}</p>
              </div>

              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-800">
                <p className="font-bold flex items-center gap-1.5">⚡ Telemetry Status:</p>
                <p className="text-[11px] mt-1 font-medium">Kết nối OCPP 1.6J/2.0.1 thành công. Tín hiệu mạng ổn định (Ping: 18ms).</p>
              </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-slate-100 mt-6">
              <button onClick={() => setIsDetailOpen(false)} className="px-6 py-2.5 bg-slate-900 text-white font-extrabold rounded-xl shadow-md">Đóng Window</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 4. MODAL SỬA PHÂN QUYỀN RBAC ================= */}
      {isEditUserOpen && editingUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">👑 Sửa Quyền Hạn [{editingUser.name}]</h3>
                <p className="text-xs text-slate-500 mt-0.5">Thay đổi cấp độ phân quyền trong hệ thống</p>
              </div>
              <button onClick={() => setIsEditUserOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold text-sm">✕</button>
            </div>

            <form onSubmit={handleSaveUserRole} className="mt-6 space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-700 mb-1.5">Mã Người Dùng & Email</label>
                <input
                  type="text"
                  value={`${editingUser.id} - ${editingUser.email}`}
                  disabled
                  className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1.5">Chọn Vai Trò Mới (Role)</label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ADMIN">SYSTEM ADMIN (Quản trị toàn quyền)</option>
                  <option value="CPO">CPO OPERATOR (Đơn vị vận hành trạm)</option>
                  <option value="DRIVER">EV DRIVER (Khách hàng lái xe)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1.5">Trạng Thái Tài Khoản</label>
                <select
                  value={editingUser.status}
                  onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ACTIVE">Cho phép hoạt động (Active)</option>
                  <option value="INACTIVE">Khóa tạm thời (Inactive)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 mt-6">
                <button type="button" onClick={() => setIsEditUserOpen(false)} className="px-5 py-3 bg-slate-100 text-slate-700 font-extrabold rounded-xl">Hủy Bỏ</button>
                <button type="submit" className="px-6 py-3 bg-purple-700 hover:bg-purple-600 text-white font-extrabold rounded-xl shadow-lg shadow-purple-700/30">Cập Nhật Quyền</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 5. MODAL THÊM TÀI KHOẢN RBAC ================= */}
      {isAddUserOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">👤 Thêm Tài Khoản Mới</h3>
                <p className="text-xs text-slate-500 mt-0.5">Khởi tạo user và gán quyền RBAC</p>
              </div>
              <button onClick={() => { setIsAddUserOpen(false); setUserError(''); }} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold text-sm">✕</button>
            </div>

            {userError && (
              <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-2xl">
                ⚠️ {userError}
              </div>
            )}

            <form onSubmit={handleAddUser} className="mt-6 space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-700 mb-1.5">Mã Người Dùng (ID) <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  placeholder="Ví dụ: USR-005"
                  value={newUserForm.id}
                  onChange={(e) => setNewUserForm({ ...newUserForm, id: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1.5">Tên Người Dùng <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  placeholder="Ví dụ: Trần Văn Bình"
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1.5">Email Đăng Nhập <span className="text-rose-500">*</span></label>
                <input
                  type="email"
                  placeholder="Ví dụ: binh.tran@evcsms.com"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1.5">Vai Trò (Role)</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="ADMIN">SYSTEM ADMIN</option>
                  <option value="CPO">CPO OPERATOR</option>
                  <option value="DRIVER">EV DRIVER</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 mt-6">
                <button type="button" onClick={() => { setIsAddUserOpen(false); setUserError(''); }} className="px-5 py-3 bg-slate-100 text-slate-700 font-extrabold rounded-xl">Hủy Bỏ</button>
                <button type="submit" className="px-6 py-3 bg-purple-700 hover:bg-purple-600 text-white font-extrabold rounded-xl shadow-lg shadow-purple-700/30">Thêm Tài Khoản</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}