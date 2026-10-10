import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet as WalletIcon,
  PlusCircle,
  ShieldCheck,
  AlertOctagon,
  User,
  QrCode,
  X,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  CreditCard,
  Zap,
  Lock,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatVNDateTime } from '../utils/formatTime';

export default function Wallet() {
  const { user, token, isGuest, updateGuestName, guestName } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error403, setError403] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Trạng thái cửa sổ / Modal nạp tiền qua QR
  const [showQrModal, setShowQrModal] = useState(false);
  const [payerName, setPayerName] = useState(() => user?.full_name || guestName || 'Nguyễn Văn Tài');
  const [topupAmount, setTopupAmount] = useState('100000');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  // Pagination (Client-side cho danh sách 50 dòng API trả về)
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    fetchWalletData();
  }, [token, user]);

  useEffect(() => {
    if (user?.full_name && !payerName) {
      setPayerName(user.full_name);
    }
  }, [user]);

  const fetchWalletData = async () => {
    try {
      setLoading(true);
      setError403(false);
      setErrorMsg('');
      
      const [walletRes, txRes] = await Promise.all([
        api.get('/wallet/me'),
        api.get('/wallet/transactions'),
      ]);
      
      setWallet(walletRes.data);
      setTransactions(txRes.data || walletRes.data?.transactions || []);
    } catch (err) {
      console.error('Lỗi tải dữ liệu ví:', err);
      if (err.response?.status === 403) {
        setError403(true);
      } else {
        setErrorMsg(err.response?.data?.detail || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Xác nhận nạp tiền: cộng ngay vào số dư khả dụng
  const handleConfirmTransfer = async () => {
    const amountNum = parseFloat(topupAmount);
    if (!amountNum || amountNum < 10000) {
      alert('Số tiền nạp tối thiểu là 10,000 VND');
      return;
    }

    const cleanName = payerName.trim();
    if (!cleanName) {
      alert('Vui lòng ghi rõ Họ và tên người nạp tiền / tài xế');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post('/wallet/topup', {
        amount: amountNum,
        full_name: cleanName,
        note: `Nạp tiền qua chuyển khoản QR (${cleanName})`,
      });

      // Cập nhật tên tài xế khách vào state chung
      if (updateGuestName) {
        updateGuestName(cleanName);
      }

      // Cập nhật số dư khả dụng ngay lập tức
      setWallet(res.data);
      setMessage(`Xác nhận thành công! Đã cộng +${amountNum.toLocaleString('vi-VN')} VND vào số dư khả dụng của ${cleanName}.`);
      setShowQrModal(false);
      fetchWalletData();
    } catch (err) {
      alert('Lỗi nạp tiền: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-steel-gray">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Đang tải thông tin ví...</span>
      </div>
    );
  }

  if (error403) {
    return (
      <div className="max-w-3xl mx-auto mt-12 bg-panel border border-hairline p-8 rounded-sm text-center space-y-4">
        <div className="mx-auto w-12 h-12 bg-critical-red/10 text-critical-red flex items-center justify-center rounded-full mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-tech-white font-mono">Truy Cập Bị Từ Chối (403)</h2>
        <p className="text-steel-gray text-sm">
          Bạn không có quyền xem thông tin ví của người dùng khác. Vui lòng đăng nhập đúng tài khoản để thực hiện thao tác.
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="max-w-3xl mx-auto mt-12 bg-critical-red/10 border border-critical-red/40 p-6 rounded-sm text-center text-critical-red space-y-2">
        <AlertOctagon className="w-6 h-6 mx-auto mb-2" />
        <p className="font-bold">Lỗi tải dữ liệu</p>
        <p className="text-xs">{errorMsg}</p>
        <button 
          onClick={fetchWalletData}
          className="mt-4 px-4 py-2 bg-critical-red/20 hover:bg-critical-red/30 rounded text-xs font-bold transition-colors"
        >
          Thử Lại
        </button>
      </div>
    );
  }

  const balance = wallet ? Number(wallet.balance) : 0;
  const isDebtLocked = wallet?.is_debt_locked;

  const currentAmountNum = parseFloat(topupAmount) || 100000;
  const transferContent = `EVCSMS NAP ${payerName.trim() || 'TAI XE'}`;
  const vietQrUrl = `https://api.vietqr.io/image/970422-999988886666-compact2.png?amount=${currentAmountNum}&addInfo=${encodeURIComponent(
    transferContent
  )}&accountName=EV%20CSMS%20CHARGING`;

  // Pagination logic
  const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);
  const currentTransactions = transactions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-tech-white">Ví Điện Tử Nạp Tiền & Quản Trị Cước Phí</h1>
        <p className="text-xs text-steel-gray mt-0.5 font-mono">
          ROLE TÀI XẾ KHÔNG CẦN ĐĂNG NHẬP ĐỂ NẠP TIỀN CHUYỂN KHOẢN QR &amp; CỘNG SỐ DƯ TỨC THÌ
        </p>
      </div>

      {message && (
        <div className="bg-grid-green/10 border border-grid-green/40 p-3 rounded text-xs font-mono text-grid-green flex items-center space-x-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-grid-green" />
          <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Balance & Quick Topup Trigger */}
        <div className="space-y-4">
          {/* Balance Card */}
          <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4">
            <div className="flex items-center justify-between text-xs text-steel-gray font-mono">
              <span>SỐ DƯ KHẢ DỤNG HIỆN TẠI</span>
              <div className="flex items-center space-x-1.5 text-electric-cyan">
                <User className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold">
                  {user?.full_name || 'Tài xế sạc'}
                  {isGuest && ' (Không cần đăng nhập)'}
                </span>
              </div>
            </div>

            <div className="font-mono tabular-nums">
              <div
                className={`text-3xl font-bold ${
                  balance < 0 ? 'text-critical-red' : 'text-tech-white'
                }`}
              >
                {balance.toLocaleString('vi-VN')} <span className="text-sm font-normal text-steel-gray">VND</span>
              </div>
            </div>

            {/* Debt status notice */}
            {balance < 0 ? (
              <div className="bg-critical-red/10 border border-critical-red/40 p-3 rounded text-xs font-mono text-critical-red flex items-start space-x-2">
                <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">TÀI KHOẢN ĐANG GHI NỢ TIỀN SẠC</div>
                  <div>Vui lòng nạp tiền để số dư &ge; 50,000 VND để mở phiên sạc tiếp theo.</div>
                </div>
              </div>
            ) : (
              <div className="bg-grid-green/10 border border-grid-green/40 p-3 rounded text-xs font-mono text-grid-green flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Số dư hợp lệ để khởi động phiên sạc mới (&ge; 50,000 đ)</span>
              </div>
            )}

            {/* Financial Policy Box */}
            <div className="border-t border-hairline pt-3 text-[11px] font-mono text-steel-gray space-y-1">
              <div>• Số dư tối thiểu bắt đầu sạc: <span className="text-tech-white">50,000 VND</span></div>
              <div>• Hạn mức cho phép nợ tối đa: <span className="text-caution-amber">-300,000 VND</span></div>
              <div>• Tài xế sử dụng tự do không bắt buộc tạo tài khoản / đăng nhập</div>
            </div>
          </div>

          {/* Topup Action Card */}
          <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-steel-gray font-mono">
                NẠP TIỀN VÍ QUA MÃ QR
              </h2>
              <QrCode className="w-4 h-4 text-electric-cyan" />
            </div>

            <p className="text-xs text-steel-gray font-mono">
              Chuyển khoản nhanh 24/7 qua cổng VietQR / Napas 247. Tiền được cộng tự động vào số dư khả dụng ngay khi xác nhận.
            </p>

            {/* Quick Amount Buttons */}
            <div>
              <label className="text-steel-gray block mb-1.5 text-xs font-mono">CHỌN MỆNH GIÁ CẦN NẠP:</label>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                {['50000', '100000', '200000', '500000'].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setTopupAmount(amt);
                      setShowQrModal(true);
                    }}
                    className={`py-2 rounded border text-center transition-colors ${
                      topupAmount === amt
                        ? 'bg-electric-cyan text-white border-electric-cyan font-bold'
                        : 'bg-obsidian text-steel-gray border-hairline hover:text-tech-white hover:border-steel-gray'
                    }`}
                  >
                    +{Number(amt).toLocaleString()} đ
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="w-full flex items-center justify-center space-x-2 py-3 rounded bg-electric-cyan hover:bg-electric-cyan-hover text-white font-bold text-xs font-mono transition-all shadow-md"
            >
              <QrCode className="w-4 h-4" />
              <span>MỞ MÃ QR NẠP TIỀN</span>
            </button>
          </div>
        </div>

        {/* Right Column: Transaction History */}
        <div className="lg:col-span-2 bg-panel border border-hairline p-5 rounded-sm space-y-4 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-steel-gray font-mono">
              LỊCH SỬ BIẾN ĐỘNG SỐ DƯ &amp; QUYẾT TOÁN CƯỚC SẠC
            </h2>
            <span className="text-[11px] font-mono text-steel-gray">{transactions.length} Giao dịch</span>
          </div>

          <div className="overflow-x-auto flex-1">
            {transactions.length === 0 ? (
              <div className="text-xs text-steel-gray text-center py-12 font-mono">
                Chưa có lịch sử giao dịch nào được ghi nhận cho ví này.
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-hairline text-steel-gray">
                    <th className="pb-2">MÃ GD</th>
                    <th className="pb-2">LOẠI</th>
                    <th className="pb-2">SỐ TIỀN</th>
                    <th className="pb-2">THỜI GIAN</th>
                    <th className="pb-2 text-right">CHI TIẾT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {currentTransactions.map((tx) => {
                    const isCredit = tx.transaction_type === 'TOPUP';
                    const amountNum = Number(tx.amount);
                    
                    // Route to proper detail page based on type
                    const targetLink = isCredit 
                      ? `/topup/${tx.reference_id || tx.id}` // Placeholder route
                      : `/session/${tx.reference_id || tx.id}`;

                    return (
                      <tr key={tx.id} className="hover:bg-panel-hover group transition-colors">
                        <td className="py-2.5 text-steel-gray">#{tx.id}</td>
                        <td className="py-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isCredit
                                ? 'bg-grid-green/20 text-grid-green'
                                : 'bg-critical-red/20 text-critical-red'
                            }`}
                          >
                            {tx.transaction_type}
                          </span>
                        </td>
                        <td className={`py-2.5 font-bold tabular-nums ${isCredit ? 'text-grid-green' : 'text-critical-red'}`}>
                          {isCredit ? '+' : '-'}{amountNum.toLocaleString()} đ
                        </td>
                        <td className="py-2.5 text-steel-gray text-[11px]">
                          {formatVNDateTime(tx.created_at)}
                        </td>
                        <td className="py-2.5 text-right">
                          <Link 
                            to={targetLink}
                            className="inline-flex items-center text-[10px] uppercase font-bold text-electric-cyan hover:text-white transition-colors p-1"
                          >
                            <span>Xem</span>
                            <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          
          {/* Pagination Controls */}
          {transactions.length > 0 && (
            <div className="border-t border-hairline pt-4 flex items-center justify-between text-[11px] font-mono text-steel-gray">
              <div>
                Đang hiển thị {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, transactions.length)} trong tổng số {transactions.length} giao dịch
              </div>
              <div className="flex items-center space-x-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="px-2 py-1 bg-obsidian border border-hairline rounded hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Trang trước
                </button>
                <span className="text-tech-white">
                  {currentPage} / {totalPages || 1}
                </span>
                <button 
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="px-2 py-1 bg-obsidian border border-hairline rounded hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Trang sau
                </button>
              </div>
            </div>
          )}
          {transactions.length >= 50 && (
            <div className="text-[10px] text-steel-gray/60 italic text-center mt-2 font-mono">
              *Hệ thống API hiện tại giới hạn hiển thị tối đa 50 giao dịch gần nhất
            </div>
          )}
        </div>
      </div>

      {/* CỬA SỔ / MODAL NẠP TIỀN QUA MÃ QR */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-hairline max-w-md w-full rounded-sm p-6 space-y-4 font-mono text-xs shadow-2xl relative animate-scaleUp">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded bg-electric-cyan/20 border border-electric-cyan/40 text-electric-cyan">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-tech-white">NẠP TIỀN VÀO SẠC XE ĐIỆN</h3>
                  <p className="text-[10px] text-steel-gray">CỔNG THANH TOÁN VIETQR / NAPAS 247</p>
                </div>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-steel-gray hover:text-tech-white p-1 rounded hover:bg-hairline transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. Ghi tên người nạp / tài xế */}
            <div className="space-y-1">
              <label className="text-steel-gray block text-[11px] font-bold">
                1. HỌ VÀ TÊN NGƯỜI NẠP / TÀI XẾ (GHI TÊN):
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-steel-gray absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="Nhập họ và tên (VD: Nguyễn Văn Tài)"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  className="w-full bg-obsidian border border-hairline pl-8 pr-3 py-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan text-xs font-sans"
                />
              </div>
            </div>

            {/* 2. Chọn / Nhập số tiền nạp */}
            <div className="space-y-1.5">
              <label className="text-steel-gray block text-[11px] font-bold">
                2. CHỌN HOẶC NHẬP SỐ TIỀN CẦN NẠP (VND):
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {['50000', '100000', '200000', '500000'].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTopupAmount(amt)}
                    className={`py-1.5 rounded border text-center text-[11px] transition-colors ${
                      topupAmount === amt
                        ? 'bg-electric-cyan text-white border-electric-cyan font-bold'
                        : 'bg-obsidian text-steel-gray border-hairline hover:text-tech-white'
                    }`}
                  >
                    {Number(amt) / 1000}k
                  </button>
                ))}
              </div>
              <input
                type="number"
                step="10000"
                min="10000"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono tabular-nums text-xs"
              />
            </div>

            {/* 3. Hiển thị mã QR và thông tin chuyển khoản */}
            <div className="bg-obsidian border border-hairline p-3.5 rounded text-center space-y-3">
              <div className="inline-block p-2 bg-white rounded shadow-md">
                <img
                  src={vietQrUrl}
                  alt="Mã QR Chuyển khoản nạp tiền"
                  className="w-44 h-44 object-contain mx-auto"
                  onError={(e) => {
                    // Fallback visual QR placeholder if offline
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <div style={{ display: 'none' }} className="w-44 h-44 flex flex-col items-center justify-center bg-gray-100 text-gray-800 p-2">
                  <QrCode className="w-16 h-16 text-gray-700 mb-1" />
                  <span className="text-[10px] font-bold">VIETQR 24/7</span>
                  <span className="text-[9px] text-gray-500">STK: 999988886666</span>
                </div>
              </div>

              {/* Thông tin tài khoản */}
              <div className="text-[11px] text-left space-y-1 text-steel-gray border-t border-hairline pt-2">
                <div className="flex justify-between">
                  <span>Ngân hàng:</span>
                  <span className="text-tech-white font-bold">MB Bank (Quân Đội)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Số tài khoản:</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-tech-white font-bold tabular-nums">999988886666</span>
                    <button
                      onClick={() => handleCopy('999988886666')}
                      className="text-electric-cyan hover:text-white"
                      title="Sao chép STK"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-grid-green" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span>Người thụ hưởng:</span>
                  <span className="text-tech-white font-bold">EV CSMS CHARGING</span>
                </div>
                <div className="flex justify-between">
                  <span>Số tiền:</span>
                  <span className="text-caution-amber font-bold tabular-nums">
                    {Number(topupAmount || 0).toLocaleString('vi-VN')} VND
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Nội dung CK:</span>
                  <span className="text-grid-green font-bold">{transferContent}</span>
                </div>
              </div>
            </div>

            {/* 4. Nút xác nhận đã chuyển tiền */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleConfirmTransfer}
                disabled={submitting || !payerName.trim() || !topupAmount}
                className="w-full flex items-center justify-center space-x-2 py-3 rounded bg-grid-green hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-lg"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>ĐANG XÁC NHẬN GIAO DỊCH &amp; CỘNG SỐ DƯ...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>XÁC NHẬN ĐÃ CHUYỂN TIỀN</span>
                  </>
                )}
              </button>
              <p className="text-[10px] text-steel-gray text-center mt-1.5">
                Nhấn xác nhận để tiền được cộng ngay tức thì vào số dư khả dụng
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
