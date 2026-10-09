import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, FileText, Printer, AlertTriangle, CheckCircle2, Clock, Layers, ShieldCheck, Hourglass } from 'lucide-react';
import api from '../services/api';

function formatVNDateTime(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const sessionId = parseInt(id, 10);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchInvoice = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/sessions/${sessionId}/invoice`);
        if (isMounted) setInvoice(res.data);
      } catch (err) {
        if (isMounted) setError(err.response?.data?.detail || 'Không thể tải thông tin hóa đơn.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchInvoice();
    return () => { isMounted = false; };
  }, [sessionId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-2xl mx-auto pb-8 font-mono text-xs">
      {/* Nút quay lại & Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-steel-gray hover:text-tech-white p-2 -ml-2 rounded transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          <span>Quay lại</span>
        </button>

        <h1 className="text-sm font-bold text-tech-white tracking-wider uppercase">
          HÓA ĐƠN CHI TIẾT #{sessionId}
        </h1>

        <button
          onClick={handlePrint}
          className="px-3 py-1.5 rounded bg-panel border border-hairline hover:bg-panel-hover text-steel-gray hover:text-tech-white flex items-center space-x-1.5 transition-colors"
        >
          <Printer className="w-4 h-4" />
          <span className="hidden sm:inline">In hóa đơn</span>
        </button>
      </div>

      {loading ? (
        <div className="bg-panel border border-hairline p-12 rounded text-center text-steel-gray flex flex-col items-center justify-center space-y-2">
          <Hourglass className="w-6 h-6 animate-spin text-electric-cyan" />
          <p>Đang tải chi tiết từng đoạn giá cho hóa đơn #{sessionId}...</p>
        </div>
      ) : error ? (
        <div className="bg-panel border border-critical-red/40 p-6 rounded text-critical-red space-y-2">
          <div className="font-bold flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5" />
            <span>Không tìm thấy hóa đơn</span>
          </div>
          <p className="text-tech-white">{error}</p>
        </div>
      ) : invoice ? (
        <div className="bg-panel border border-hairline rounded p-5 space-y-4 shadow-xl">
          {/* Cảnh báo phiên đang chờ xem xét (AC S-33) */}
          {invoice.is_reviewing || invoice.status === 'NEEDS_REVIEW' ? (
            <div
              id="invoice-page-needs-review-banner"
              role="alert"
              className="p-3.5 bg-caution-amber/15 border border-caution-amber/50 rounded text-caution-amber space-y-1.5"
            >
              <div className="flex items-center space-x-2 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-caution-amber" />
                <span className="uppercase tracking-wide">
                  PHIÊN SẠC ĐANG CHỜ XEM XÉT / ĐỐI SOÁT KỸ THUẬT
                </span>
              </div>
              <p className="text-tech-white leading-relaxed text-[11px]">
                {invoice.review_message ||
                  'Hệ thống đang tiến hành đối soát số đo công tơ và kiểm tra kỹ thuật. Số tiền và sản lượng chi tiết được giữ nguyên trạng thái chờ xử lý để tránh hiểu nhầm.'}
              </p>
              <div className="text-[10px] text-steel-gray font-normal pt-1">
                Trạng thái: <strong className="text-caution-amber">CHỜ ĐỐI SOÁT (PENDING REVIEW)</strong>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-2.5 bg-obsidian border border-hairline rounded text-[11px]">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-grid-green" />
                <span className="text-steel-gray">Trạng thái:</span>
                <strong className="text-grid-green font-bold">
                  {invoice.status === 'COMPLETED' ? 'ĐÃ QUYẾT TOÁN THÀNH CÔNG (PAID)' : 'ĐANG SẠC (TẠM TÍNH)'}
                </strong>
              </div>
              <span className="text-steel-gray">
                Khách hàng: <strong className="text-tech-white">{invoice.driver_name || `User #${invoice.driver_id || '—'}`}</strong>
              </span>
            </div>
          )}

          {/* Thông tin trạm, trụ, xe, công tơ */}
          <div className="bg-obsidian border border-hairline rounded p-4 space-y-2.5">
            <div className="text-[10px] font-bold text-steel-gray uppercase tracking-wider border-b border-hairline pb-1.5 flex items-center justify-between">
              <span>THÔNG TIN TRẠM & THIẾT BỊ SẠC</span>
              <span className="text-electric-cyan font-bold">
                {invoice.tariff_name || 'Biểu giá TOU 3 khung giờ'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-steel-gray">Trạm sạc tiếp nhận:</span>
                <span className="text-tech-white font-bold">{invoice.station_name || `Trạm #${invoice.station_id || 'N/A'}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-gray">Mã trụ sạc (EVSE):</span>
                <span className="text-electric-cyan font-bold">{invoice.charger_code || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-gray">Cổng / Đầu nối:</span>
                <span className="text-tech-white font-bold">
                  Cổng #{invoice.connector_number || invoice.connector_id} ({invoice.connector_type || 'CCS2'})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-gray">Thời lượng nạp:</span>
                <span className="text-tech-white font-bold">{invoice.duration_minutes || 0} phút</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-gray">Bắt đầu:</span>
                <span className="text-tech-white">{formatVNDateTime(invoice.start_time)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-gray">Kết thúc:</span>
                <span className="text-tech-white">{invoice.end_time ? formatVNDateTime(invoice.end_time) : 'Đang sạc'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-gray">Công tơ đầu:</span>
                <span className="text-tech-white">{Number(invoice.meter_start_kwh || 0).toFixed(2)} kWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-gray">Công tơ cuối:</span>
                <span className="text-tech-white">
                  {invoice.meter_stop_kwh != null ? `${Number(invoice.meter_stop_kwh).toFixed(2)} kWh` : 'Đang ghi nhận'}
                </span>
              </div>
            </div>
          </div>

          {/* BẢNG DANH SÁCH TỪNG ĐOẠN GIÁ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-electric-cyan" />
                <h2 className="font-bold text-xs text-tech-white tracking-wide uppercase">
                  DIỄN GIẢI DANH SÁCH TỪNG ĐOẠN GIÁ (PRICE SEGMENTS)
                </h2>
              </div>
              <span className="text-[10px] text-steel-gray">
                Tổng sản lượng: <strong className="text-electric-cyan font-bold">{Number(invoice.total_kwh || 0).toFixed(2)} kWh</strong>
              </span>
            </div>

            <div className="border border-hairline rounded overflow-hidden">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="bg-obsidian border-b border-hairline text-steel-gray text-[10px] uppercase">
                    <th className="py-2.5 px-3">STT</th>
                    <th className="py-2.5 px-3">KHOẢNG THỜI GIAN</th>
                    <th className="py-2.5 px-3">KHUNG GIỜ</th>
                    <th className="py-2.5 px-3 text-right">SẢN LƯỢNG</th>
                    <th className="py-2.5 px-3 text-right">ĐƠN GIÁ</th>
                    <th className="py-2.5 px-3 text-right">THÀNH TIỀN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-panel">
                  {invoice.price_segments && invoice.price_segments.length > 0 ? (
                    invoice.price_segments.map((seg, idx) => {
                      const isPeak = seg.rate_type === 'PEAK';
                      const isOffpeak = seg.rate_type === 'OFFPEAK';

                      return (
                        <tr key={idx} className="hover:bg-panel-hover transition-colors">
                          <td className="py-2.5 px-3 text-steel-gray">#{seg.segment_index || idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-tech-white flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-steel-gray shrink-0" />
                            <span>{seg.time_range}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                isPeak
                                  ? 'bg-critical-red/20 text-critical-red border border-critical-red/40'
                                  : isOffpeak
                                  ? 'bg-grid-green/20 text-grid-green border border-grid-green/40'
                                  : 'bg-electric-cyan/20 text-electric-cyan border border-electric-cyan/40'
                              }`}
                            >
                              {seg.rate_name || seg.rate_type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-electric-cyan font-bold">
                            {Number(seg.kwh || 0).toFixed(2)} kWh
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-steel-gray">
                            {Number(seg.unit_price || 0).toLocaleString()} đ
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-tech-white">
                            {Number(seg.amount || 0).toLocaleString()} đ
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="py-2.5 px-3 text-steel-gray">#1</td>
                      <td className="py-2.5 px-3 font-bold text-tech-white">
                        {formatVNDateTime(invoice.start_time)} - {formatVNDateTime(invoice.end_time)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="bg-electric-cyan/20 text-electric-cyan px-2 py-0.5 rounded text-[10px] font-bold">
                          Tiêu chuẩn
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-electric-cyan font-bold">
                        {Number(invoice.total_kwh || 0).toFixed(2)} kWh
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-steel-gray">
                        {Number(invoice.applied_price_per_kwh || 0).toLocaleString()} đ
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-tech-white">
                        {Number(invoice.charging_amount || invoice.total_amount || 0).toLocaleString()} đ
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* DÒNG PHÍ CHIẾM TRỤ */}
          <div className="bg-obsidian border border-hairline rounded p-3.5 space-y-2">
            <div className="text-[10px] font-bold text-steel-gray uppercase tracking-wider border-b border-hairline pb-1.5 flex items-center justify-between">
              <span>CÁC KHOẢN PHÍ VÀ DỊCH VỤ KHÁC</span>
              <span className="text-[10px] text-steel-gray">Quy định chống chiếm dụng hạ tầng</span>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1">
              <div>
                <span className="text-tech-white font-bold block">
                  Phí chiếm trụ sạc sau khi pin đầy (Idle Fee)
                </span>
                <span className="text-[10px] text-steel-gray block mt-0.5">
                  {invoice.idle_minutes > 0
                    ? `Xe chiếm trụ thêm ${invoice.idle_minutes} phút quá hạn (Đơn giá: ${Number(invoice.idle_rate_per_min || 1000).toLocaleString()} đ/phút)`
                    : 'Không phát sinh (Rút súng đúng thời gian quy định)'}
                </span>
              </div>
              <div className="text-right">
                <span
                  className={`font-bold tabular-nums ${
                    Number(invoice.idle_fee || 0) > 0 ? 'text-caution-amber' : 'text-steel-gray'
                  }`}
                >
                  {Number(invoice.idle_fee || 0) > 0
                    ? `+${Number(invoice.idle_fee).toLocaleString()} VND`
                    : '0 VND'}
                </span>
              </div>
            </div>
          </div>

          {/* TỔNG CỘNG THANH TOÁN */}
          <div className="bg-gradient-to-r from-obsidian to-panel border-2 border-hairline rounded p-4 space-y-2">
            <div className="flex justify-between text-xs text-steel-gray">
              <span>Tổng tiền điện năng (Tổng các đoạn giá):</span>
              <span className="tabular-nums font-bold text-tech-white">
                {Number(invoice.charging_amount || 0).toLocaleString()} VND
              </span>
            </div>

            <div className="flex justify-between text-xs text-steel-gray">
              <span>Phí chiếm trụ sạc:</span>
              <span className="tabular-nums font-bold text-tech-white">
                {Number(invoice.idle_fee || 0).toLocaleString()} VND
              </span>
            </div>

            <div className="border-t border-hairline pt-2.5 flex items-baseline justify-between">
              <div>
                <span className="text-xs font-black text-tech-white uppercase tracking-wider block">
                  TỔNG CỘNG THANH TOÁN
                </span>
                <span className="text-[10px] text-steel-gray">
                  (Đã bao gồm VAT và khấu trừ ví điện tử tự động)
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-caution-amber tabular-nums drop-shadow">
                  {Number(invoice.total_amount || 0).toLocaleString()}{' '}
                  <span className="text-xs font-normal text-steel-gray">VND</span>
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-[10px] text-steel-gray border-t border-hairline">
            <div className="flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-grid-green" />
              <span>Hóa đơn hợp lệ theo dữ liệu công tơ điện tử EV CSMS</span>
            </div>
            <button
              onClick={() => navigate('/sessions')}
              className="text-electric-cyan hover:underline"
            >
              Xem tất cả hóa đơn →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
