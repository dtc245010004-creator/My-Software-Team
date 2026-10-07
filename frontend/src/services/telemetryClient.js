import { useState, useEffect, useRef, useCallback } from 'react';

// Đọc cấu hình từ Vite env
const USE_MOCK = import.meta.env.VITE_USE_MOCK_TELEMETRY === 'true';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export function useChargingTelemetry(sessionId) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('Đang kết nối...'); // 'Đang kết nối...', 'Đang cập nhật trực tiếp', 'Mất kết nối - đang thử lại', 'Hoàn tất'
  const [isStale, setIsStale] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const staleTimeoutRef = useRef(null);
  const mockIntervalRef = useRef(null);
  const reconnectCountRef = useRef(0);
  const currentKwhRef = useRef(0);

  // Dọn dẹp timers
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (staleTimeoutRef.current) clearTimeout(staleTimeoutRef.current);
    if (mockIntervalRef.current) clearInterval(mockIntervalRef.current);
  }, []);

  // Xử lý bản tin dữ liệu nhận được
  const handleData = useCallback((newData) => {
    // Chỉ cập nhật nếu kWh lớn hơn hoặc bằng kWh hiện tại (bỏ qua bản tin cũ/chậm trễ)
    if (newData.current_energy_kwh !== undefined) {
      if (newData.current_energy_kwh < currentKwhRef.current) {
        console.warn('Nhận được dữ liệu kWh nhỏ hơn hiện tại, bỏ qua bản tin này.');
        return;
      }
      currentKwhRef.current = newData.current_energy_kwh;
    }

    setData(newData);
    setStatus('Đang cập nhật trực tiếp');
    setIsStale(false);

    // Xóa timer cảnh báo dữ liệu cũ cũ và tạo mới (cảnh báo nếu > 10s không có dữ liệu)
    if (staleTimeoutRef.current) clearTimeout(staleTimeoutRef.current);
    staleTimeoutRef.current = setTimeout(() => {
      setIsStale(true);
    }, 10000);
  }, []);

  // Logic kết nối WebSocket thật
  const connectWebSocket = useCallback(() => {
    if (!sessionId) return;
    
    // Đóng WS cũ nếu có
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const wsUrl = `${WS_BASE_URL}/ws/telemetry`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectCountRef.current = 0;
        // Gửi lệnh subscribe với ID của phiên
        ws.send(JSON.stringify({ action: 'subscribe', session_id: sessionId }));
        setStatus('Đang kết nối...');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.event === 'SUBSCRIBED') {
            setStatus('Đang cập nhật trực tiếp');
          } else if (msg.event === 'SESSION_STOPPED') {
            setIsStopped(true);
            setStatus('Hoàn tất');
            if (staleTimeoutRef.current) clearTimeout(staleTimeoutRef.current);
            ws.close(); // Đóng kết nối khi phiên kết thúc
          } else {
            // Cập nhật dữ liệu đo
            handleData(msg);
          }
        } catch (error) {
          console.error('Lỗi parse JSON telemetry', error);
        }
      };

      ws.onclose = (event) => {
        if (isStopped) return; // Nếu đã dừng hẳn thì không kết nối lại
        setStatus('Mất kết nối - đang thử lại');
        
        // Thử lại sau khoảng thời gian tăng dần (Exponential backoff max 30s)
        const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current), 30000);
        reconnectCountRef.current += 1;
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      };

      ws.onerror = (error) => {
        console.error('Lỗi WebSocket', error);
        ws.close();
      };
    } catch (error) {
      console.error('Không thể tạo kết nối WebSocket', error);
      setStatus('Mất kết nối - đang thử lại');
    }
  }, [sessionId, isStopped, handleData]);

  // Logic chạy Mock giả lập
  const startMock = useCallback(() => {
    if (!sessionId) return;
    
    setStatus('Đang cập nhật trực tiếp');
    let kwh = 0.5;
    let cost = 1500;
    
    mockIntervalRef.current = setInterval(() => {
      kwh += Math.random() * 0.05;
      cost += Math.random() * 150;
      
      const mockData = {
        session_id: sessionId,
        current_energy_kwh: parseFloat(kwh.toFixed(3)),
        power_kw: parseFloat((30 + Math.random() * 5).toFixed(1)), // Công suất dao động 30-35kW
        soc_percent: Math.min(100, Math.floor(20 + (kwh * 2))), // SoC tăng chậm
        voltage_v: 380,
        current_a: parseFloat((80 + Math.random() * 5).toFixed(1)),
        temperature_c: parseFloat((35 + Math.random() * 2).toFixed(1)),
        cost_estimate_vnd: Math.round(cost),
        status: 'CHARGING'
      };
      
      handleData(mockData);

      // Giả lập kết thúc sau khi đạt 100%
      if (mockData.soc_percent >= 100) {
        clearInterval(mockIntervalRef.current);
        setIsStopped(true);
        setStatus('Hoàn tất');
        if (staleTimeoutRef.current) clearTimeout(staleTimeoutRef.current);
      }
    }, 2000); // Phát mỗi 2 giây theo đúng yêu cầu
  }, [sessionId, handleData]);

  useEffect(() => {
    // Reset state khi đổi sessionId
    setData(null);
    setIsStale(false);
    setIsStopped(false);
    currentKwhRef.current = 0;
    clearTimers();

    if (USE_MOCK) {
      startMock();
    } else {
      connectWebSocket();
    }

    return () => {
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [sessionId, USE_MOCK, connectWebSocket, startMock, clearTimers]);

  return { data, status, isStale, isStopped };
}
