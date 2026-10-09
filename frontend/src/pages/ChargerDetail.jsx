import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Zap,
  Plug,
  Battery,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ChevronLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function ChargerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const chargerId = parseInt(id, 10);

  const [charger, setCharger] = useState(null);
  const [loadingCharger, setLoadingCharger] = useState(true);
  const [selectedConnectorId, setSelectedConnectorId] = useState(null);

  // Trạng thái yêu cầu bắt đầu sạc từ xa (S-24 / T-52)
  const [isStarting, setIsStarting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeRequestId, setActiveRequestId] = useState(null);

  // Điều kiện mô phỏng kiểm thử 4 ca của S-24
  const [simulateCondition, setSimulateCondition] = useState('AUTO'); // 'AUTO' | 'SUCCESS' | 'REJECTED' | 'BUSY' | 'TIMEOUT' | 'EXPIRED'
  const [showSimulateOptions, setShowSimulateOptions] = useState(false);

  // Thông báo phản hồi nghiệp vụ
  const [alertInfo, setAlertInfo] = useState(null); // { type: 'success' | 'warning' | 'error', title: '', message: '', code: '' }

  const timerIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Tải chi tiết trụ sạc và các cổng kết nối
  const fetchCharger = async () => {
    try {
      setLoadingCharger(true);
      const res = await api.get(`/chargers/${chargerId}`);
      setCharger(res.data);
      // Mặc định chọn cổng sạc AVAILABLE đầu tiên nếu có
      if (res.data.connectors && res.data.connectors.length > 0) {
        const firstAvail = res.data.connectors.find((c) => c.status === 'AVAILABLE');
        setSelectedConnectorId(firstAvail ? firstAvail.id : res.data.connectors[0].id);
      }
    } catch (err) {
      setAlertInfo({
        type: 'error',
        title: 'KHÔNG TÌM THẤY TRỤ SẠC',
        message: err.response?.data?.detail || 'Không thể tải thông tin trụ sạc từ máy chủ.',
      });
    } finally {
      setLoadingCharger(false);
    }
  };

  useEffect(() => {
    fetchCharger();
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [chargerId]);

  // Dọn dẹp timer
  const stopTimers = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Polling kiểm tra trạng thái yêu cầu remote-start (tối đa 60 giây)
  const pollRequestStatus = (reqId) => {
    let secondsCount = 0;
    pollIntervalRef.current = setInterval(async () => {
      secondsCount += 1;
      setElapsedSeconds(secondsCount);

      // Ca 4: Hết thời gian chờ 60 giây
      if (secondsCount >= 60) {
        stopTimers();
        setIsStarting(false);
        setActiveRequestId(null);
        setAlertInfo({
          type: 'error',
          title: 'HẾT THỜI GIAN CHỜ PHẢN HỒI (TIMEOUT)',
          message:
            'Trụ sạc không phản hồi lệnh bắt đầu trong thời gian chờ (60 giây). Phiên sạc chưa thể bắt đầu, vui lòng thử lại.',
          code: 'TIMEOUT',
        });
        return;
      }

      try {
        const res = await api.get(`/sessions/remote-start/${reqId}`);
        const data = res.data;

        if (data.status === 'STARTED') {
          // Ca 1: Thành công! Chuyển sang màn hình phiên T-48
          stopTimers();
          setIsStarting(false);
          setActiveRequestId(null);

          setAlertInfo({
            type: 'success',
            title: 'BẮT ĐẦU PHIÊN SẠC THÀNH CÔNG',
            message: 'Trụ sạc đã chấp nhận lệnh bắt đầu. Đang chuyển sang màn hình phiên sạc...',
          });

          const targetSessionId = data.session_id || data.transaction_id;
          setTimeout(() => {
            if (targetSessionId) {
              navigate(`/session/${targetSessionId}`);
            } else {
              navigate('/sessions');
            }
          }, 1200);
        } else if (data.status === 'EXPIRED') {
          // Ca 4: Hết hạn yêu cầu
          stopTimers();
          setIsStarting(false);
          setActiveRequestId(null);
          setAlertInfo({
            type: 'error',
            title: 'YÊU CẦU ĐÃ HẾT HẠN (EXPIRED)',
            message: 'Yêu cầu bắt đầu sạc đã hết hạn (60 giây) mà chưa nhận được lệnh khởi động từ trụ. Vui lòng thử lại.',
            code: 'EXPIRED',
          });
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra trạng thái yêu cầu sạc:', err);
      }
    }, 1000);
  };

  // Xử lý bấm nút "BẮT ĐẦU SẠC" (S-24 / T-52)
  const handleStartCharging = async () => {
    if (!selectedConnectorId) {
      setAlertInfo({
        type: 'warning',
        title: 'CHƯA CHỌN CỔNG SẠC',
        message: 'Vui lòng chọn một cổng sạc trước khi bắt đầu.',
      });
      return;
    }

    const selectedConn = charger?.connectors?.find((c) => c.id === selectedConnectorId);

    // Ca 3: Kiểm tra đầu nối bận tại client
    if (selectedConn && selectedConn.status !== 'AVAILABLE' && simulateCondition !== 'BUSY') {
      setAlertInfo({
        type: 'warning',
        title: 'CỔNG SẠC ĐANG BẬN HOẶC KHÔNG KHẢ DỤNG',
        message: `Cổng sạc #${selectedConn.connector_number} hiện đang ở trạng thái "${selectedConn.status}". Vui lòng chọn cổng sạc khác còn sẵn sàng.`,
        code: 'BUSY',
      });
      return;
    }

    // NFR: Vô hiệu hóa nút trong lúc chờ để không gửi hai lệnh
    setIsStarting(true);
    setElapsedSeconds(0);
    setAlertInfo(null);

    // Bật đồng hồ đếm thời gian
    stopTimers();

    try {
      const payload = {
        connector_id: selectedConnectorId,
      };

      if (simulateCondition && simulateCondition !== 'AUTO') {
        payload.simulate_condition = simulateCondition;
      }

      // Ca 4 (Mô phỏng Timeout): Đợi hiển thị đồng hồ đếm trước khi ném lỗi
      if (simulateCondition === 'TIMEOUT') {
        let sec = 0;
        timerIntervalRef.current = setInterval(() => {
          sec += 1;
          setElapsedSeconds(sec);
        }, 1000);
        await new Promise((r) => setTimeout(r, 2200));
      }

      const res = await api.post('/sessions/remote-start', payload);
      const reqData = res.data;
      setActiveRequestId(reqData.request_id);

      // Nếu yêu cầu chuyển sang STARTED ngay (trụ ảo khởi động nhanh)
      if (reqData.status === 'STARTED') {
        setIsStarting(false);
        setAlertInfo({
          type: 'success',
          title: 'BẮT ĐẦU PHIÊN SẠC THÀNH CÔNG',
          message: 'Trụ sạc đã bắt đầu phiên sạc. Đang chuyển sang màn hình theo dõi...',
        });

        // Tự động kiểm tra session_id và chuyển sang T-48
        try {
          const checkRes = await api.get(`/sessions/remote-start/${reqData.request_id}`);
          const sid = checkRes.data.session_id || checkRes.data.transaction_id;
          setTimeout(() => {
            if (sid) {
              navigate(`/session/${sid}`);
            } else {
              navigate('/sessions');
            }
          }, 1000);
        } catch {
          setTimeout(() => navigate('/sessions'), 1000);
        }
        return;
      }

      // Ca 4 mô phỏng EXPIRED
      if (reqData.status === 'EXPIRED') {
        setIsStarting(false);
        setAlertInfo({
          type: 'error',
          title: 'YÊU CẦU ĐÃ HẾT HẠN (EXPIRED)',
          message: 'Yêu cầu bắt đầu sạc đã hết hạn (60 giây). Vui lòng thử lại.',
          code: 'EXPIRED',
        });
        return;
      }

      // Ca 1: Chờ phản hồi trong tối đa 60 giây qua polling
      pollRequestStatus(reqData.request_id);
    } catch (err) {
      stopTimers();
      setIsStarting(false);
      setActiveRequestId(null);

      const status = err.response?.status;
      const detail = err.response?.data?.detail || err.message;

      // Xử lý 4 ca lỗi của S-24 hiển thị thông báo rõ ràng:
      if (
        simulateCondition === 'REJECTED' ||
        detail.includes('từ chối') ||
        detail.includes('Rejected')
      ) {
        // Ca 2: Trụ từ chối
        setAlertInfo({
          type: 'warning',
          title: 'TRỤ SẠC TỪ CHỐI LỆNH BẮT ĐẦU (REJECTED)',
          message: 'Trụ sạc từ chối lệnh bắt đầu (Rejected). Vui lòng kiểm tra lại súng sạc đã cắm chắc chắn vào xe chưa và thử lại.',
          code: 'REJECTED',
        });
      } else if (
        simulateCondition === 'BUSY' ||
        detail.includes('bận hoặc không khả dụng') ||
        detail.includes('ngoại tuyến') ||
        status === 409
      ) {
        // Ca 3: Đầu nối bận / Ngoại tuyến
        setAlertInfo({
          type: 'error',
          title: 'ĐẦU NỐI ĐANG BẬN HOẶC KHÔNG KHẢ DỤNG',
          message: detail || 'Đầu nối đang bận hoặc không khả dụng. Vui lòng chọn cổng sạc khác.',
          code: 'BUSY',
        });
      } else if (
        simulateCondition === 'TIMEOUT' ||
        status === 504 ||
        detail.includes('thời gian chờ') ||
        detail.includes('Timeout')
      ) {
        // Ca 4: Hết thời gian chờ
        setAlertInfo({
          type: 'error',
          title: 'HẾT THỜI GIAN CHỜ PHẢN HỒI (TIMEOUT)',
          message: 'Trụ sạc không phản hồi lệnh bắt đầu trong thời gian chờ (60 giây). Phiên sạc chưa thể bắt đầu, vui lòng thử lại.',
          code: 'TIMEOUT',
        });
      } else {
        setAlertInfo({
          type: 'error',
          title: 'KHÔNG THỂ BẮT ĐẦU SẠC',
          message: detail || 'Đã xảy ra lỗi khi gửi lệnh bắt đầu sạc.',
        });
      }
    }
  };

  if (loadingCharger) {
    return (
      <div className="max-w-xl mx-auto pb-8 text-center py-16 text-steel-gray font-mono text-sm">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-electric-cyan" />
        <p>Đang tải thông số kỹ thuật trụ sạc #{chargerId}...</p>
      </div>
    );
  }

  if (!charger) {
    return (
      <div className="max-w-xl mx-auto pb-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-steel-gray hover:text-tech-white p-2 mb-4 rounded transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Quay lại
        </button>
        <div className="bg-panel border border-hairline p-6 rounded text-center font-mono">
          <XCircle className="w-10 h-10 text-critical-red mx-auto mb-2" />
          <h2 className="text-base font-bold text-tech-white mb-1">Không tìm thấy trụ sạc #{chargerId}</h2>
          <p className="text-xs text-steel-gray mb-4">Trụ sạc này có thể đã bị xóa hoặc không tồn tại trong hệ thống.</p>
          <button
            onClick={() => navigate('/map')}
            className="px-4 py-2 rounded bg-electric-cyan text-tech-white text-xs font-bold hover:bg-electric-cyan-hover transition-colors"
          >
            Quay lại bản đồ trạm sạc
          </button>
        </div>
      </div>
    );
  }

  const isChargerAvailable = charger.status === 'AVAILABLE';
  const selectedConnector = (charger.connectors || []).find((c) => c.id === selectedConnectorId);

  return (
    <div className="max-w-xl mx-auto pb-8 font-sans">
      {/* Header thanh điều hướng: Bố cục theo chuẩn T-48 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-steel-gray hover:text-tech-white p-2 -ml-2 rounded transition-colors text-xs font-mono"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Quay lại
        </button>
        <h1 className="text-sm font-bold font-mono tracking-wider text-tech-white uppercase">
          MÀN HÌNH TRỤ SẠC #{charger.code}
        </h1>
        <button
          onClick={fetchCharger}
          title="Làm mới trạng thái trụ"
          className="p-2 text-steel-gray hover:text-tech-white rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Trạng thái kết nối của trụ */}
      <div
        aria-live="polite"
        className={`mb-4 px-3 py-2 rounded border flex items-center justify-between text-xs font-mono font-bold shadow-sm transition-colors ${
          charger.status === 'AVAILABLE'
            ? 'bg-grid-green/10 border-grid-green/30 text-grid-green'
            : charger.status === 'CHARGING'
            ? 'bg-electric-cyan/10 border-electric-cyan/30 text-electric-cyan'
            : charger.status === 'UNAVAILABLE' || charger.status === 'MAINTENANCE'
            ? 'bg-caution-amber/10 border-caution-amber/30 text-caution-amber'
            : 'bg-critical-red/10 border-critical-red/30 text-critical-red'
        }`}
      >
        <div className="flex items-center space-x-2">
          {charger.status === 'AVAILABLE' ? (
            <Wifi className="w-4 h-4" />
          ) : charger.status === 'CHARGING' ? (
            <Zap className="w-4 h-4 animate-pulse" />
          ) : (
            <WifiOff className="w-4 h-4" />
          )}
          <span>
            TRẠNG THÁI TRỤ: {charger.status === 'UNAVAILABLE' ? 'BẢO TRÌ (MAINTENANCE)' : charger.status}
          </span>
        </div>
        <span className="text-[11px] opacity-80">{charger.vendor} • {charger.max_power_kw} kW</span>
      </div>

      {/* Banner thông báo kết quả thao tác S-24 (Thành công / Từ chối / Bận / Timeout) */}
      {alertInfo && (
        <div
          id="remote-start-alert-banner"
          role="alert"
          className={`mb-4 p-4 rounded border text-xs font-mono shadow-md flex items-start space-x-3 transition-all ${
            alertInfo.type === 'success'
              ? 'bg-grid-green/15 border-grid-green text-grid-green'
              : alertInfo.type === 'warning'
              ? 'bg-caution-amber/15 border-caution-amber text-caution-amber'
              : 'bg-critical-red/15 border-critical-red text-critical-red'
          }`}
        >
          {alertInfo.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          ) : alertInfo.type === 'warning' ? (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <strong className="block text-sm mb-1 font-bold">{alertInfo.title}</strong>
            <p className="leading-relaxed opacity-95">{alertInfo.message}</p>
            {/* Gợi ý thêm cho Ca 2 */}
            {alertInfo.code === 'REJECTED' && (
              <div className="mt-2 pt-2 border-t border-caution-amber/30 text-[11px] text-tech-white">
                💡 <strong>Gợi ý:</strong> Rút súng sạc ra, cắm lại thật chặt vào cổng sạc của xe cho đến khi nghe tiếng "tách", sau đó bấm nút "Bắt đầu sạc" lại.
              </div>
            )}
            {/* Nút thử lại cho Ca 4 Timeout */}
            {(alertInfo.code === 'TIMEOUT' || alertInfo.code === 'EXPIRED') && (
              <button
                type="button"
                onClick={handleStartCharging}
                className="mt-2.5 inline-flex items-center space-x-1.5 px-3 py-1 rounded bg-critical-red text-tech-white font-bold text-xs hover:bg-critical-red-hover transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử lại ngay</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Trạng thái chờ phản hồi tối đa 60 giây (NFR: Đồng hồ đếm ngược + Loading) */}
      {isStarting && (
        <div
          id="remote-start-waiting-card"
          className="mb-4 bg-obsidian border border-electric-cyan/60 p-4 rounded shadow-lg text-center font-mono space-y-3"
        >
          <div className="flex items-center justify-center space-x-2 text-electric-cyan">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm font-bold">ĐANG KẾT NỐI VÀ CHỜ TRỤ SẠC PHẢN HỒI...</span>
          </div>

          <div className="flex items-center justify-center space-x-3 text-xs text-tech-white">
            <Clock className="w-4 h-4 text-caution-amber" />
            <span>
              Thời gian đã chờ: <strong className="text-caution-amber text-sm font-bold">{elapsedSeconds}s</strong> / 60s
            </span>
          </div>

          {/* Thanh tiến trình 60 giây */}
          <div className="w-full bg-panel rounded-full h-2 overflow-hidden border border-hairline">
            <div
              className="bg-electric-cyan h-2 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${Math.min(100, (elapsedSeconds / 60) * 100)}%` }}
            />
          </div>

          <p className="text-[11px] text-steel-gray">
            Hệ thống đang gửi lệnh <code className="text-tech-white">RemoteStartTransaction</code> qua kênh OCPP. Vui lòng giữ nguyên màn hình.
          </p>
        </div>
      )}

      {/* Thẻ thông số chính của trụ */}
      <div className="bg-panel border border-hairline rounded p-5 mb-4 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <Zap className="w-24 h-24 text-electric-cyan" />
        </div>

        <div className="flex items-start justify-between relative z-10">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-steel-gray">MÃ ĐỊNH DANH TRỤ (EVSE)</span>
            <div className="text-2xl font-black text-tech-white font-mono mt-0.5">{charger.code}</div>
            <p className="text-xs text-steel-gray mt-1">
              Hãng: <strong className="text-tech-white">{charger.vendor}</strong>
              {charger.model && ` • Model: ${charger.model}`}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-steel-gray">CÔNG SUẤT ĐỊNH MỨC</span>
            <div className="text-xl font-black text-electric-cyan font-mono mt-0.5">
              {charger.max_power_kw} <span className="text-xs font-normal text-steel-gray">kW</span>
            </div>
          </div>
        </div>

        {/* Thông tin phụ */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-hairline text-xs font-mono">
          <div>
            <span className="text-steel-gray block text-[10px]">CHIA SẺ TẢI ĐỘNG:</span>
            <span className="text-tech-white font-bold">
              {charger.power_sharing_enabled ? 'Bật (Dynamic)' : 'Tắt'}
            </span>
          </div>
          <div>
            <span className="text-steel-gray block text-[10px]">SỐ CỔNG SẠC:</span>
            <span className="text-tech-white font-bold">
              {(charger.connectors || []).length} cổng súng
            </span>
          </div>
        </div>
      </div>

      {/* Danh sách các cổng sạc (Connectors) */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold font-mono text-steel-gray uppercase tracking-wider">
            DANH SÁCH ĐẦU NỐI / SÚNG SẠC (CONNECTORS)
          </h2>
          <span className="text-[11px] text-steel-gray font-mono">
            Nhấn để chọn cổng cần sạc
          </span>
        </div>

        <div className="space-y-2">
          {(charger.connectors || []).map((conn) => {
            const isSelected = selectedConnectorId === conn.id;
            const isAvailable = conn.status === 'AVAILABLE';

            return (
              <div
                key={conn.id}
                id={`connector-item-${conn.id}`}
                onClick={() => {
                  if (!isStarting) {
                    setSelectedConnectorId(conn.id);
                  }
                }}
                className={`p-3.5 rounded border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'bg-electric-cyan/15 border-electric-cyan shadow-md ring-1 ring-electric-cyan/60'
                    : 'bg-panel border-hairline hover:border-steel-gray/50'
                } ${isStarting ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-9 h-9 rounded flex items-center justify-center font-mono font-bold text-sm ${
                      isSelected
                        ? 'bg-electric-cyan text-tech-white shadow'
                        : 'bg-obsidian border border-hairline text-steel-gray'
                    }`}
                  >
                    #{conn.connector_number}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-tech-white flex items-center space-x-2 font-mono">
                      <span>{conn.connector_type}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-obsidian border border-hairline text-steel-gray">
                        {conn.max_power_kw} kW
                      </span>
                    </div>
                    <span className="text-xs text-steel-gray mt-0.5 block font-mono">
                      Cổng sạc vật lý súng #{conn.connector_number}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      conn.status === 'AVAILABLE'
                        ? 'bg-grid-green/20 text-grid-green border border-grid-green/40'
                        : conn.status === 'CHARGING'
                        ? 'bg-electric-cyan/20 text-electric-cyan border border-electric-cyan/40'
                        : 'bg-critical-red/20 text-critical-red border border-critical-red/40'
                    }`}
                  >
                    {conn.status}
                  </span>
                  {isSelected && (
                    <div className="text-[10px] text-electric-cyan font-mono mt-1 font-bold">
                      ✓ ĐÃ CHỌN
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Công cụ hỗ trợ Hội đồng kiểm thử & Mô phỏng 4 ca S-24 */}
      <div className="mb-4 bg-obsidian border border-hairline rounded p-3 text-xs font-mono">
        <button
          type="button"
          onClick={() => setShowSimulateOptions(!showSimulateOptions)}
          className="w-full flex items-center justify-between text-steel-gray hover:text-tech-white transition-colors"
        >
          <span className="flex items-center space-x-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-electric-cyan" />
            <strong className="text-[11px]">BỘ CHỌN MÔ PHỎNG 4 CA S-24 (KIỂM THỬ / DEMO)</strong>
          </span>
          <span className="text-[10px] text-electric-cyan underline">
            {showSimulateOptions ? 'Ẩn tùy chọn' : 'Hiện tùy chọn'}
          </span>
        </button>

        {showSimulateOptions && (
          <div className="mt-3 pt-3 border-t border-hairline space-y-2">
            <p className="text-[11px] text-steel-gray leading-relaxed">
              Chọn điều kiện giả lập để kiểm chứng đầy đủ 4 ca của Story S-24 trên trụ ảo:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
              {[
                { value: 'AUTO', label: 'Tự động / Trụ thật', desc: 'Gửi OCPP thật hoặc kiểm tra CSDL' },
                { value: 'SUCCESS', label: 'Ca 1: Thành công (SUCCESS)', desc: 'Trụ trả Accepted -> Chuyển sang T-48' },
                { value: 'REJECTED', label: 'Ca 2: Trụ từ chối (REJECTED)', desc: 'Trụ từ chối -> Báo kiểm tra súng' },
                { value: 'BUSY', label: 'Ca 3: Cổng sạc bận (BUSY)', desc: 'Chặn ngay tại máy chủ (409)' },
                { value: 'TIMEOUT', label: 'Ca 4: Hết thời gian (TIMEOUT)', desc: 'Quá 60s không phản hồi' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`p-2 rounded border flex flex-col cursor-pointer transition-colors ${
                    simulateCondition === opt.value
                      ? 'bg-electric-cyan/20 border-electric-cyan text-tech-white'
                      : 'bg-panel border-hairline text-steel-gray hover:text-tech-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="simulateCondition"
                      value={opt.value}
                      checked={simulateCondition === opt.value}
                      onChange={() => setSimulateCondition(opt.value)}
                      className="accent-electric-cyan"
                    />
                    <strong className="text-xs">{opt.label}</strong>
                  </div>
                  <span className="text-[10px] opacity-75 mt-0.5 ml-5">{opt.desc}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* NÚT BẮT ĐẦU SẠC CHÍNH (NFR: Vô hiệu hóa khi isStarting hoặc cổng không khả dụng) */}
      <div className="space-y-2 pt-2">
        <button
          type="button"
          id="remote-start-submit-btn"
          disabled={isStarting || !selectedConnectorId}
          onClick={handleStartCharging}
          className={`w-full py-4 rounded font-mono font-bold text-sm uppercase tracking-wider flex items-center justify-center space-x-2 shadow-lg transition-all ${
            isStarting
              ? 'bg-hairline text-steel-gray cursor-not-allowed opacity-60'
              : selectedConnector?.status === 'AVAILABLE' || simulateCondition !== 'AUTO'
              ? 'bg-gradient-to-r from-electric-cyan to-blue-600 hover:from-electric-cyan-hover hover:to-blue-700 text-tech-white active:scale-[0.99] shadow-electric-cyan/20'
              : 'bg-obsidian border border-hairline text-steel-gray hover:text-tech-white'
          }`}
        >
          {isStarting ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>ĐANG KẾT NỐI TRỤ SẠC ({elapsedSeconds}s / 60s)...</span>
            </>
          ) : (
            <>
              <Zap className="w-5 h-5 fill-current" />
              <span>BẮT ĐẦU SẠC QUA ỨNG DỤNG (REMOTE START)</span>
            </>
          )}
        </button>

        <p className="text-center text-[11px] text-steel-gray font-mono">
          {selectedConnector
            ? `Đã chọn: Súng #${selectedConnector.connector_number} (${selectedConnector.connector_type} • ${selectedConnector.max_power_kw} kW)`
            : 'Vui lòng chọn một đầu nối súng sạc ở trên'}
        </p>
      </div>
    </div>
  );
}
