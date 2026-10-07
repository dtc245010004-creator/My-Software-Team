import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Battery, Zap, Thermometer, Activity, DollarSign, Wifi, WifiOff, CheckCircle2, ChevronLeft, FileText } from 'lucide-react';
import { useChargingTelemetry } from '../services/telemetryClient';
import InvoiceModal from '../components/InvoiceModal';

export default function ActiveSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const sessionId = parseInt(id, 10);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  
  const { data, status, isStale, isStopped } = useChargingTelemetry(sessionId);

  // Helper định dạng tiền tệ VN
  const formatCurrency = (val) => {
    if (val === undefined || val === null) return '--';
    return new Intl.NumberFormat('vi-VN').format(Math.round(val));
  };

  return (
    <div className="max-w-xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center text-steel-gray hover:text-tech-white p-2 -ml-2 rounded transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Quay lại
        </button>
        <h1 className="text-sm font-bold font-mono tracking-wider text-tech-white">PHIÊN SẠC #{sessionId}</h1>
        <div className="w-16"></div> {/* Spacer để cân đối giữa */}
      </div>

      {/* Trạng thái kết nối */}
      <div 
        aria-live="polite"
        className={`mb-4 px-3 py-2 rounded border flex items-center justify-center space-x-2 text-xs font-mono font-bold shadow-sm transition-colors ${
          isStopped 
            ? 'bg-grid-green/10 border-grid-green/30 text-grid-green'
            : status === 'Đang cập nhật trực tiếp' && !isStale
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
            : status === 'Đang kết nối...'
            ? 'bg-obsidian border-hairline text-steel-gray'
            : 'bg-caution-amber/10 border-caution-amber/30 text-caution-amber'
        }`}
      >
        {isStopped ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : status === 'Đang cập nhật trực tiếp' && !isStale ? (
          <Wifi className="w-4 h-4 animate-pulse" />
        ) : (
          <WifiOff className="w-4 h-4" />
        )}
        <span>{isStale ? 'Dữ liệu có thể đã cũ, đang thử làm mới...' : status}</span>
      </div>

      {/* Thông số chính */}
      <div className="bg-panel border border-hairline rounded-sm p-6 mb-4 flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
        {/* Họa tiết trang trí */}
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Zap className="w-24 h-24 text-electric-cyan" />
        </div>

        <p className="text-steel-gray text-xs font-mono font-bold tracking-widest mb-2 z-10">TỔNG ĐIỆN NĂNG</p>
        <div className="flex items-baseline space-x-2 z-10">
          <span 
            className="text-6xl font-black text-electric-cyan drop-shadow-md"
            style={{ fontVariantNumeric: 'tabular-nums' }} // Tránh nhảy bố cục khi đổi số
          >
            {data?.current_energy_kwh !== undefined ? data.current_energy_kwh.toFixed(3) : '--.---'}
          </span>
          <span className="text-xl font-bold text-steel-gray">kWh</span>
        </div>
        
        <div className="mt-6 flex flex-col items-center z-10">
          <p className="text-steel-gray text-[10px] font-mono tracking-wider mb-1">CHI PHÍ TẠM TÍNH</p>
          <div className="text-2xl font-bold text-grid-green bg-obsidian px-4 py-1.5 rounded-full border border-hairline shadow-inner">
            {formatCurrency(data?.cost_estimate_vnd)} <span className="text-sm font-normal">VND</span>
          </div>
        </div>
      </div>

      {/* Thông số phụ lưới Responsive: 1 cột cho mobile nhỏ, 2 cột cho màn ngang/lớn */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* SoC */}
        <div className="bg-panel border border-hairline p-4 rounded-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3 text-tech-white">
            <div className="p-2 bg-obsidian rounded-full border border-hairline">
              <Battery className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] text-steel-gray font-mono tracking-wider">MỨC PIN (SOC)</p>
              <p className="text-lg font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {data?.soc_percent !== undefined ? `${data.soc_percent}%` : '--'}
              </p>
            </div>
          </div>
          {/* Thanh progress nhỏ */}
          <div className="w-16 h-2 bg-obsidian rounded-full overflow-hidden border border-hairline">
            <div 
              className="h-full bg-blue-500 transition-all duration-1000 ease-out" 
              style={{ width: `${data?.soc_percent || 0}%` }}
            ></div>
          </div>
        </div>

        {/* Công suất */}
        <div className="bg-panel border border-hairline p-4 rounded-sm flex items-center space-x-3 shadow-sm">
          <div className="p-2 bg-obsidian rounded-full border border-hairline">
            <Activity className="w-5 h-5 text-caution-amber" />
          </div>
          <div>
            <p className="text-[10px] text-steel-gray font-mono tracking-wider">CÔNG SUẤT HIỆN TẠI</p>
            <p className="text-lg font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {data?.power_kw !== undefined ? `${data.power_kw} kW` : '--'}
            </p>
          </div>
        </div>

        {/* Dòng điện & Điện áp */}
        <div className="bg-panel border border-hairline p-4 rounded-sm flex items-center space-x-3 shadow-sm">
          <div className="p-2 bg-obsidian rounded-full border border-hairline">
            <Zap className="w-5 h-5 text-electric-cyan" />
          </div>
          <div className="flex-1 flex justify-between">
            <div>
              <p className="text-[10px] text-steel-gray font-mono tracking-wider">DÒNG ĐIỆN</p>
              <p className="text-sm font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {data?.current_a !== undefined ? `${data.current_a} A` : '--'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-steel-gray font-mono tracking-wider">ĐIỆN ÁP</p>
              <p className="text-sm font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {data?.voltage_v !== undefined ? `${data.voltage_v} V` : '--'}
              </p>
            </div>
          </div>
        </div>

        {/* Nhiệt độ */}
        <div className="bg-panel border border-hairline p-4 rounded-sm flex items-center space-x-3 shadow-sm">
          <div className="p-2 bg-obsidian rounded-full border border-hairline">
            <Thermometer className={`w-5 h-5 ${data?.temperature_c > 65 ? 'text-critical-red' : 'text-steel-gray'}`} />
          </div>
          <div>
            <p className="text-[10px] text-steel-gray font-mono tracking-wider">NHIỆT ĐỘ SÚNG SẠC</p>
            <p className={`text-lg font-bold ${data?.temperature_c > 65 ? 'text-critical-red animate-pulse' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {data?.temperature_c !== undefined ? `${data.temperature_c} °C` : '--'}
            </p>
          </div>
        </div>
      </div>

      {/* Khi phiên sạc đã kết thúc: Thông báo và Nút mở Hóa đơn chi tiết từng đoạn giá */}
      {isStopped && (
        <div className="mt-6 bg-panel border border-grid-green/40 p-5 rounded font-mono text-center space-y-3 shadow-lg">
          <div className="flex items-center justify-center space-x-2 text-grid-green">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-bold text-sm">PHIÊN SẠC ĐÃ KẾT THÚC THÀNH CÔNG</span>
          </div>
          <p className="text-xs text-steel-gray">
            Hệ thống đã chốt chỉ số công tơ điện và quyết toán ví tự động. Bạn có thể tháo súng sạc.
          </p>

          <button
            type="button"
            id="view-invoice-btn"
            onClick={() => setShowInvoiceModal(true)}
            className="w-full py-3 px-4 bg-gradient-to-r from-electric-cyan to-blue-600 hover:from-electric-cyan-hover hover:to-blue-700 text-tech-white rounded font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-md transition-all active:scale-[0.99]"
          >
            <FileText className="w-4 h-4" />
            <span>XEM HÓA ĐƠN CHI TIẾT (TỪNG ĐOẠN GIÁ & PHÍ)</span>
          </button>
        </div>
      )}

      {/* Modal Hóa đơn chi tiết từng đoạn giá (Story S-33 / SCRUM-224) */}
      <InvoiceModal
        sessionId={sessionId}
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
      />
    </div>
  );
}
