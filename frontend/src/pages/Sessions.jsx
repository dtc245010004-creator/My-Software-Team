import React, { useState, useEffect } from 'react';
import { History, Zap, CheckCircle2, AlertOctagon, XCircle, FileText } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatVNDateTime } from '../utils/formatTime';

export default function Sessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedSession, setSelectedSession] = useState(null);

  useEffect(() => {
    fetchSessions();
  }, [user]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/sessions/me');
      setSessions(res.data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách phiên sạc:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSessions = sessions.filter((s) => {
    if (statusFilter === 'ALL') return true;
    return s.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-tech-white">Nhật Ký Phiên Sạc & Hóa Đơn Điện Tử</h1>
          <p className="text-xs text-steel-gray mt-0.5 font-mono">
            QUẢN LÝ LỊCH SỬ NẠP ĐIỆN, ĐO ĐẾM ĐIỆN NĂNG KWH & ĐƠN GIÁ KHUNG GIỜ TOU
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center bg-panel border border-hairline rounded p-0.5 text-xs font-mono">
          {['ALL', 'ACTIVE', 'COMPLETED', 'INTERRUPTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded transition-colors ${
                statusFilter === st
                  ? 'bg-obsidian text-tech-white font-bold border border-hairline'
                  : 'text-steel-gray hover:text-tech-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-panel border border-hairline rounded-sm overflow-hidden">
        {filteredSessions.length === 0 ? (
          <div className="text-xs text-steel-gray text-center py-12 font-mono">
            Không tìm thấy phiên sạc nào phù hợp với bộ lọc.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-hairline bg-obsidian text-steel-gray">
                  <th className="py-3 px-4">MÃ PHIÊN</th>
                  <th className="py-3 px-4">CỔNG SẠC</th>
                  <th className="py-3 px-4">ĐƠN GIÁ TOU</th>
                  <th className="py-3 px-4">ĐIỆN NĂNG</th>
                  <th className="py-3 px-4">TỔNG TIỀN</th>
                  <th className="py-3 px-4">TRẠNG THÁI</th>
                  <th className="py-3 px-4">LÝ DO DỪNG</th>
                  <th className="py-3 px-4">THỜI GIAN</th>
                  <th className="py-3 px-4 text-right">CHI TIẾT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filteredSessions.map((sess) => {
                  const isCompleted = sess.status === 'COMPLETED';
                  const isActive = sess.status === 'ACTIVE';

                  return (
                    <tr key={sess.id} className="hover:bg-panel-hover transition-colors">
                      <td className="py-3 px-4 font-bold text-tech-white">#{sess.id}</td>
                      <td className="py-3 px-4 text-steel-gray">Cổng #{sess.connector_id}</td>
                      <td className="py-3 px-4 tabular-nums text-steel-gray">
                        {Number(sess.applied_price_per_kwh).toLocaleString()} đ/kWh
                      </td>
                      <td className="py-3 px-4 tabular-nums font-bold text-electric-cyan">
                        {Number(sess.total_kwh).toFixed(2)} kWh
                      </td>
                      <td className="py-3 px-4 tabular-nums font-bold text-tech-white">
                        {Number(sess.total_amount).toLocaleString()} đ
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isActive
                              ? 'bg-electric-cyan/20 text-electric-cyan animate-pulse'
                              : isCompleted
                              ? 'bg-grid-green/20 text-grid-green'
                              : 'bg-critical-red/20 text-critical-red'
                          }`}
                        >
                          {sess.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-steel-gray">
                        {sess.stop_reason || (isActive ? 'Đang cấp dòng' : 'N/A')}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-steel-gray">
                        {formatVNDateTime(sess.start_time)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedSession(sess)}
                          className="px-2 py-1 rounded bg-obsidian border border-hairline hover:bg-hairline text-steel-gray hover:text-tech-white text-[11px]"
                        >
                          Hóa đơn
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Modal */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-hairline p-6 rounded-sm max-w-md w-full space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-electric-cyan" />
                <span className="font-bold text-sm text-tech-white">HÓA ĐƠN ĐIỆN TỬ SẠC XE</span>
              </div>
              <span className="text-steel-gray">#{selectedSession.id}</span>
            </div>

            <div className="space-y-2 text-steel-gray">
              <div className="flex justify-between">
                <span>Cổng sạc tiếp nhận:</span>
                <span className="text-tech-white font-bold">Cổng #{selectedSession.connector_id}</span>
              </div>
              <div className="flex justify-between">
                <span>Bắt đầu sạc:</span>
                <span className="text-tech-white">{formatVNDateTime(selectedSession.start_time)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kết thúc sạc:</span>
                <span className="text-tech-white">
                  {selectedSession.end_time ? formatVNDateTime(selectedSession.end_time) : 'Đang sạc'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Chỉ số điện đầu:</span>
                <span className="text-tech-white">{Number(selectedSession.meter_start_kwh).toFixed(2)} kWh</span>
              </div>
              <div className="flex justify-between">
                <span>Chỉ số điện cuối:</span>
                <span className="text-tech-white">
                  {selectedSession.meter_stop_kwh ? Number(selectedSession.meter_stop_kwh).toFixed(2) + ' kWh' : 'Đang cập nhật'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tổng điện năng tiêu thụ:</span>
                <span className="text-electric-cyan font-bold">{Number(selectedSession.total_kwh).toFixed(2)} kWh</span>
              </div>
              <div className="flex justify-between">
                <span>Đơn giá TOU áp dụng:</span>
                <span className="text-tech-white">{Number(selectedSession.applied_price_per_kwh).toLocaleString()} đ/kWh</span>
              </div>
              <div className="flex justify-between border-t border-hairline pt-2 text-sm font-bold text-tech-white">
                <span>TỔNG TIỀN THANH TOÁN:</span>
                <span className="text-caution-amber">{Number(selectedSession.total_amount).toLocaleString()} VND</span>
              </div>
            </div>

            <div className="pt-3 border-t border-hairline flex justify-end">
              <button
                onClick={() => setSelectedSession(null)}
                className="px-4 py-1.5 rounded bg-electric-cyan text-white font-bold"
              >
                ĐÓNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
