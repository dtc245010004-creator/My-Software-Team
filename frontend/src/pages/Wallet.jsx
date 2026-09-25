import React, { useState, useEffect } from 'react';
import { Wallet as WalletIcon, PlusCircle, ArrowUpRight, ArrowDownLeft, ShieldCheck, AlertOctagon } from 'lucide-react';
import api from '../services/api';

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState('100000');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      setLoading(true);
      const [walletRes, txRes] = await Promise.all([
        api.get('/wallet/me'),
        api.get('/wallet/transactions').catch(() => ({ data: [] })),
      ]);
      setWallet(walletRes.data);
      setTransactions(txRes.data || []);
    } catch (err) {
      console.error('Lỗi tải dữ liệu ví:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTopup = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(topupAmount);
    if (!amountNum || amountNum < 10000) {
      alert('Số tiền nạp tối thiểu là 10,000 VND');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post('/wallet/topup', {
        amount: amountNum,
        description: `Nạp tiền ví tài xế qua cổng thanh toán mô phỏng`,
      });
      setMessage(`Đã nạp thành công ${amountNum.toLocaleString()} VND vào ví.`);
      fetchWalletData();
    } catch (err) {
      alert('Lỗi nạp tiền: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const balance = wallet ? Number(wallet.balance) : 0;
  const isDebtLocked = wallet?.is_debt_locked;

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-tech-white">Ví Điện Tử Nạp Tiền & Quản Trị Cước Phí</h1>
        <p className="text-xs text-steel-gray mt-0.5 font-mono">
          GIAO DỊCH TÀI CHÍNH ACID — BẢO TOÀN SỐ DƯ & QUẢN LÝ HẠN MỨC CHO NỢ
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Balance & Topup Form */}
        <div className="space-y-4">
          {/* Balance Card */}
          <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4">
            <div className="flex items-center justify-between text-xs text-steel-gray font-mono">
              <span>SỐ DƯ KHẢ DỤNG HIỆN TẠI</span>
              <WalletIcon className="w-4 h-4 text-electric-cyan" />
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
              <div>• Đảm bảo tính nhất quán dữ liệu ACID 100%</div>
            </div>
          </div>

          {/* Quick Topup Form */}
          <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-steel-gray font-mono">
              NẠP TIỀN VÍ NHANH
            </h2>

            {message && (
              <div className="bg-obsidian border border-hairline p-2 text-xs font-mono text-grid-green">
                {message}
              </div>
            )}

            <form onSubmit={handleTopup} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-steel-gray block mb-1">CHỌN MỆNH GIÁ NẠP NHANH:</label>
                <div className="grid grid-cols-2 gap-2">
                  {['50000', '100000', '200000', '500000'].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTopupAmount(amt)}
                      className={`py-2 rounded border text-center transition-colors ${
                        topupAmount === amt
                          ? 'bg-electric-cyan text-white border-electric-cyan font-bold'
                          : 'bg-obsidian text-steel-gray border-hairline hover:text-tech-white'
                      }`}
                    >
                      +{Number(amt).toLocaleString()} đ
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-steel-gray block mb-1">SỐ TIỀN TÙY CHỌN (VND):</label>
                <input
                  type="number"
                  step="10000"
                  min="10000"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center space-x-1.5 py-2.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover disabled:opacity-50 text-white font-bold transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>XÁC NHẬN NẠP TIỀN</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Transaction History */}
        <div className="lg:col-span-2 bg-panel border border-hairline p-5 rounded-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-steel-gray font-mono">
              LỊCH SỬ BIẾN ĐỘNG SỐ DƯ & QUYẾT TOÁN CƯỚC SẠC
            </h2>
            <span className="text-[11px] font-mono text-steel-gray">{transactions.length} Giao dịch</span>
          </div>

          <div className="overflow-x-auto">
            {transactions.length === 0 ? (
              <div className="text-xs text-steel-gray text-center py-12 font-mono">
                Chưa có lịch sử giao dịch nào được ghi nhận.
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-hairline text-steel-gray">
                    <th className="pb-2">MÃ GD</th>
                    <th className="pb-2">LOẠI</th>
                    <th className="pb-2">BIẾN ĐỘNG</th>
                    <th className="pb-2">SỐ DƯ SAU</th>
                    <th className="pb-2">NỘI DUNG</th>
                    <th className="pb-2">THỜI GIAN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {transactions.map((tx) => {
                    const isCredit = tx.transaction_type === 'TOPUP';
                    const amountNum = Number(tx.amount);

                    return (
                      <tr key={tx.id} className="hover:bg-panel-hover">
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
                        <td className="py-2.5 tabular-nums text-tech-white">
                          {Number(tx.balance_after).toLocaleString()} đ
                        </td>
                        <td className="py-2.5 text-steel-gray max-w-xs truncate">{tx.description}</td>
                        <td className="py-2.5 text-steel-gray text-[11px]">
                          {new Date(tx.created_at).toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
