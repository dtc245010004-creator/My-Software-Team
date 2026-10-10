import { useEffect, useState } from 'react';
import { telemetryWs, WS_STATUS } from './websocket';

export function normalizeTelemetry(message) {
  return {
    ...message,
    current_energy_kwh: message.energy_kwh ?? message.current_energy_kwh,
    cost_estimate_vnd: message.cost_estimate ?? message.cost_estimate_vnd,
    soc_percent: message.soc ?? message.soc_percent,
    temperature_c: message.temp_c ?? message.temperature_c,
  };
}

export function useChargingTelemetry(sessionId) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('Đang kết nối...');
  const [isStale, setIsStale] = useState(false);
  const [isStopped, setIsStopped] = useState(false);

  useEffect(() => {
    const id = Number(sessionId);
    if (!Number.isFinite(id)) return undefined;

    let mounted = true;
    let stopped = false;
    let staleTimer = null;
    setData(null);
    setStatus('Đang kết nối...');
    setIsStale(false);
    setIsStopped(false);

    const unsubscribeStatus = telemetryWs.addStatusListener((nextStatus) => {
      if (!mounted || stopped) return;
      if (nextStatus === WS_STATUS.DISCONNECTED || nextStatus === WS_STATUS.RECONNECTING) {
        setStatus('Mất kết nối - đang thử lại');
      } else if (nextStatus === WS_STATUS.CONNECTING || nextStatus === WS_STATUS.CONNECTED) {
        setStatus((current) =>
          current === 'Đang cập nhật trực tiếp' ? current : 'Đang kết nối...',
        );
      }
    });

    const unsubscribeMessage = telemetryWs.addListener((message) => {
      if (!mounted || Number(message.session_id) !== id) return;

      if (message.event === 'TELEMETRY') {
        const nextData = normalizeTelemetry(message);
        setData((current) => {
          const previousKwh = Number(current?.current_energy_kwh);
          const nextKwh = Number(nextData.current_energy_kwh);
          if (Number.isFinite(previousKwh) && Number.isFinite(nextKwh) && nextKwh < previousKwh) {
            return current;
          }
          return nextData;
        });
        setStatus('Đang cập nhật trực tiếp');
        setIsStale(false);
        if (staleTimer) clearTimeout(staleTimer);
        staleTimer = setTimeout(() => {
          if (mounted) setIsStale(true);
        }, 10000);
      } else if (message.event === 'STOPPED' || message.event === 'SESSION_STOPPED') {
        stopped = true;
        setIsStopped(true);
        setStatus('Hoàn tất');
        setIsStale(false);
        if (staleTimer) clearTimeout(staleTimer);
      }
    });

    telemetryWs.connect();
    telemetryWs.subscribeSession(id);

    return () => {
      mounted = false;
      if (staleTimer) clearTimeout(staleTimer);
      unsubscribeMessage();
      unsubscribeStatus();
      telemetryWs.unsubscribeSession(id);
      telemetryWs.disconnect();
    };
  }, [sessionId]);

  return { data, status, isStale, isStopped };
}
