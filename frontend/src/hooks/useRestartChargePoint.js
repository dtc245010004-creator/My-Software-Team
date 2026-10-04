import { useState, useCallback } from 'react';
import { restartChargePoint } from '../services/chargePointApi';

export const useRestartChargePoint = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success' | 'offline' | 'timeout' | 'error', message: string, chargerId: string }

  const restart = useCallback(async (chargerId, forceMockState = 'success') => {
    setLoading(true);
    setResult(null);
    
    // Timeout 15s cho lệnh điều khiển phần cứng
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      await restartChargePoint(chargerId, controller.signal, forceMockState);
      setResult({ type: 'success', message: 'Đã gửi lệnh khởi động lại thành công.', chargerId });
    } catch (err) {
      if (err.message === 'CanceledError' || err.name === 'CanceledError') {
        setResult({ type: 'timeout', message: 'Trụ sạc không phản hồi trong thời gian chờ (Timeout). Chưa rõ lệnh đã thực hiện hay chưa.', chargerId });
      } else if (!err.response) {
        setResult({ type: 'error', message: 'Mất mạng hoặc không thể kết nối tới máy chủ. Vui lòng kiểm tra lại Internet.', chargerId });
      } else {
        const status = err.response.status;
        const detail = err.response.data?.detail || 'Lỗi không xác định';
        
        if (status === 409 || status === 503) {
          setResult({ type: 'offline', message: `Trụ sạc đang mất kết nối nên chưa thể khởi động lại (${detail}).`, chargerId });
        } else if (status === 504) {
          setResult({ type: 'timeout', message: `Quá thời gian: ${detail}`, chargerId });
        } else if (status === 401 || status === 403) {
          setResult({ type: 'error', message: 'Lỗi xác thực: Phiên đăng nhập đã hết hạn hoặc bạn không đủ quyền.', chargerId });
        } else {
          setResult({ type: 'error', message: `Lỗi hệ thống: ${detail}`, chargerId });
        }
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const resetResult = useCallback(() => setResult(null), []);

  return { loading, result, restart, resetResult };
};
