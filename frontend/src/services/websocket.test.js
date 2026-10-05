import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  telemetryWs,
  createTelemetrySocket,
  WS_STATUS,
  computeReconnectDelay,
} from './websocket';

function useFakeTimers() {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

function getLastWs() {
  return globalThis.WebSocket.instances[globalThis.WebSocket.instances.length - 1];
}

function resetClient() {
  globalThis.WebSocket.clear();
  telemetryWs._teardown({ intentional: true, resetRefCount: true });
}

describe('computeReconnectDelay', () => {
  it('attempt 1 = initial delay', () => {
    const d = computeReconnectDelay(1, { initial: 1000, max: 30000, jitterRatio: 0 });
    expect(d).toBe(1000);
  });
  it('exponential 1k 2k 4k 8k 16k', () => {
    const opts = { initial: 1000, max: 30000, jitterRatio: 0 };
    expect(computeReconnectDelay(1, opts)).toBe(1000);
    expect(computeReconnectDelay(2, opts)).toBe(2000);
    expect(computeReconnectDelay(3, opts)).toBe(4000);
    expect(computeReconnectDelay(4, opts)).toBe(8000);
    expect(computeReconnectDelay(5, opts)).toBe(16000);
  });
  it('khong vuot max', () => {
    expect(computeReconnectDelay(20, { initial: 1000, max: 30000, jitterRatio: 0 })).toBe(30000);
  });
  it('attempt <= 0 fallback ve 1', () => {
    expect(computeReconnectDelay(0, { initial: 1000, max: 30000, jitterRatio: 0 })).toBe(1000);
    expect(computeReconnectDelay(-5, { initial: 1000, max: 30000, jitterRatio: 0 })).toBe(1000);
  });
  it('jitter trong pham vi 30%', () => {
    for (let i = 0; i < 20; i++) {
      const d = computeReconnectDelay(3, { initial: 1000, max: 30000, jitterRatio: 0.3 });
      expect(d).toBeGreaterThanOrEqual(2800);
      expect(d).toBeLessThanOrEqual(5200);
    }
  });
});

describe('Test 1: shared connection, khong duplicate', () => {
  beforeEach(resetClient);
  afterEach(resetClient);

  it('connect nhieu lan chi tao 1 WebSocket', () => {
    telemetryWs.connect();
    telemetryWs.connect();
    telemetryWs.connect();
    expect(globalThis.WebSocket.instances.length).toBe(1);
  });

  it('disconnect giam ref count, dong khi ve 0', () => {
    telemetryWs.connect();
    telemetryWs.connect();
    expect(telemetryWs._refCount).toBe(2);
    telemetryWs.disconnect();
    expect(telemetryWs._refCount).toBe(1);
    expect(telemetryWs._ws).not.toBeNull();
    telemetryWs.disconnect();
    expect(telemetryWs._refCount).toBe(0);
    expect(telemetryWs._ws).toBeNull();
  });
});

describe('Test 2: ket noi thanh cong CONNECTED', () => {
  beforeEach(resetClient);
  afterEach(resetClient);

  it('onopen status CONNECTED', () => {
    const statuses = [];
    telemetryWs.addStatusListener((s) => statuses.push(s));
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    expect(telemetryWs.status).toBe(WS_STATUS.CONNECTED);
    expect(statuses).toContain(WS_STATUS.CONNECTED);
  });
});

describe('Test 3: mat ket noi RECONNECTING', () => {
  useFakeTimers();
  beforeEach(resetClient);
  afterEach(resetClient);

  it('onclose bat thuong -> RECONNECTING (scheduler chay ngay)', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    ws.simulateAbnormalClose();
    // onclose goi _scheduleReconnect ngay -> status = RECONNECTING (khong phai DISCONNECTED)
    expect(telemetryWs.status).toBe(WS_STATUS.RECONNECTING);
    expect(telemetryWs._reconnectTimer).not.toBeNull();
  });
});

describe('Test 4: retry theo backoff', () => {
  useFakeTimers();
  beforeEach(resetClient);
  afterEach(resetClient);

  it('reconnect attempt tang sau moi lan fail', () => {
    telemetryWs.connect();
    let ws = getLastWs();
    ws.simulateOpen();
    ws.simulateAbnormalClose();
    expect(telemetryWs._reconnectAttempt).toBe(1);
    vi.advanceTimersByTime(2000);
    ws = globalThis.WebSocket.instances[1];
    ws.simulateAbnormalClose();
    expect(telemetryWs._reconnectAttempt).toBe(2);
    vi.advanceTimersByTime(5000);
    ws = globalThis.WebSocket.instances[2];
    ws.simulateAbnormalClose();
    expect(telemetryWs._reconnectAttempt).toBe(3);
  });

  it('chi tao 1 reconnect timer', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    ws.simulateAbnormalClose();
    expect(telemetryWs._reconnectTimer).not.toBeNull();
    telemetryWs._scheduleReconnect();
    expect(telemetryWs._reconnectTimer).not.toBeNull();
  });
});

describe('Test 5: reconnect thanh cong CONNECTED, reset counter', () => {
  useFakeTimers();
  beforeEach(resetClient);
  afterEach(resetClient);

  it('reconnect open thanh cong status CONNECTED, counter 0', () => {
    telemetryWs.connect();
    let ws = getLastWs();
    ws.simulateOpen();
    ws.simulateAbnormalClose();
    expect(telemetryWs._reconnectAttempt).toBe(1);
    vi.advanceTimersByTime(2000);
    ws = globalThis.WebSocket.instances[1];
    ws.simulateOpen();
    expect(telemetryWs.status).toBe(WS_STATUS.CONNECTED);
    expect(telemetryWs._reconnectAttempt).toBe(0);
  });
});

describe('Test 6: unmount dong, khong reconnect', () => {
  useFakeTimers();
  beforeEach(resetClient);
  afterEach(resetClient);

  it('disconnect khi refCount ve 0 CLOSED, khong reconnect', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    telemetryWs.disconnect();
    expect(telemetryWs.status).toBe(WS_STATUS.CLOSED);
    expect(telemetryWs._reconnectTimer).toBeNull();
    expect(telemetryWs._heartbeatTimer).toBeNull();
    vi.advanceTimersByTime(60000);
    expect(globalThis.WebSocket.instances.length).toBe(1);
  });
});

describe('Test 7: logout dong, khong reconnect', () => {
  useFakeTimers();
  beforeEach(resetClient);
  afterEach(resetClient);

  it('logout khi dang CONNECTED CLOSED, khong reconnect', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    telemetryWs.disconnect();
    expect(telemetryWs.status).toBe(WS_STATUS.CLOSED);
    vi.advanceTimersByTime(60000);
    expect(globalThis.WebSocket.instances.length).toBe(1);
  });
});

describe('Test 8: browser offline khong spam reconnect', () => {
  useFakeTimers();
  beforeEach(resetClient);
  afterEach(resetClient);

  it('offline event cancel reconnect timer', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    ws.simulateAbnormalClose();
    // Sau abnormalClose, status = RECONNECTING
    expect(telemetryWs.status).toBe(WS_STATUS.RECONNECTING);
    expect(telemetryWs._reconnectTimer).not.toBeNull();
    window.__triggerOffline();
    expect(telemetryWs._reconnectTimer).toBeNull();
    // Sau triggerOffline, status = DISCONNECTED (handleOffline override)
    expect(telemetryWs.status).toBe(WS_STATUS.DISCONNECTED);
    vi.advanceTimersByTime(60000);
    expect(globalThis.WebSocket.instances.length).toBe(1);
  });
});

describe('Test 9: browser online thu reconnect', () => {
  useFakeTimers();
  beforeEach(resetClient);
  afterEach(resetClient);

  it('online event reconnect ngay', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    ws.simulateAbnormalClose();
    window.__triggerOffline();
    const beforeCount = globalThis.WebSocket.instances.length;
    window.__triggerOnline();
    expect(globalThis.WebSocket.instances.length).toBe(beforeCount + 1);
    const ws2 = getLastWs();
    ws2.simulateOpen();
    expect(telemetryWs.status).toBe(WS_STATUS.CONNECTED);
  });
});

describe('Test 10: nhieu component dung chung connection', () => {
  beforeEach(resetClient);
  afterEach(resetClient);

  it('3 createTelemetrySocket van chi 1 WebSocket', () => {
    const a = createTelemetrySocket({ onStatusChange: () => {} });
    const b = createTelemetrySocket({ onMessage: () => {} });
    const c = createTelemetrySocket({});
    expect(globalThis.WebSocket.instances.length).toBe(1);
    a.close();
    b.close();
    c.close();
  });

  it('1 component close nhung con component khac WS van mo', () => {
    const a = createTelemetrySocket({});
    const b = createTelemetrySocket({});
    const ws = getLastWs();
    ws.simulateOpen();
    a.close();
    expect(telemetryWs._ws).not.toBeNull();
    b.close();
    expect(telemetryWs._ws).toBeNull();
  });
});

describe('Test 11: event hop le dispatch dung', () => {
  beforeEach(resetClient);
  afterEach(resetClient);

  it('JSON TELEMETRY message listener nhan dung', () => {
    const received = [];
    telemetryWs.addListener((msg) => received.push(msg));
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    ws.simulateMessage({ event: 'TELEMETRY', session_id: 7, soc: 42.5, power_kw: 11.2 });
    expect(received).toEqual([{ event: 'TELEMETRY', session_id: 7, soc: 42.5, power_kw: 11.2 }]);
  });

  it('subscribeSession gui action dung format khi OPEN', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    telemetryWs.subscribeSession(99);
    expect(ws.sentMessages).toEqual([JSON.stringify({ action: 'subscribe', session_id: 99 })]);
    telemetryWs.unsubscribeSession(99);
    expect(ws.sentMessages).toEqual([
      JSON.stringify({ action: 'subscribe', session_id: 99 }),
      JSON.stringify({ action: 'unsubscribe', session_id: 99 }),
    ]);
  });

  it('reconnect tu re-subscribe cac session da dang ky', () => {
    telemetryWs.connect();
    const ws1 = getLastWs();
    ws1.simulateOpen();
    telemetryWs.subscribeSession(5);
    expect(ws1.sentMessages).toEqual([JSON.stringify({ action: 'subscribe', session_id: 5 })]);
    ws1.simulateAbnormalClose();
    telemetryWs._reconnectTimer && clearTimeout(telemetryWs._reconnectTimer);
    telemetryWs._open();
    const ws2 = getLastWs();
    ws2.simulateOpen();
    expect(ws2.sentMessages[0]).toBe(JSON.stringify({ action: 'subscribe', session_id: 5 }));
  });
});

describe('Test 12: malformed event khong crash', () => {
  beforeEach(resetClient);
  afterEach(resetClient);

  it('nhan text khong phai JSON bo qua, listener van hoat dong', () => {
    const received = [];
    telemetryWs.addListener((msg) => received.push(msg));
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    ws.onmessage({ data: 'not-json-{{{' });
    ws.onmessage({ data: JSON.stringify({ event: 'TELEMETRY', session_id: 1 }) });
    expect(received.length).toBe(1);
    expect(received[0].event).toBe('TELEMETRY');
  });

  it('listener throw error cac listener khac van nhan', () => {
    const received = [];
    telemetryWs.addListener(() => {
      throw new Error('boom');
    });
    telemetryWs.addListener((msg) => received.push(msg));
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    ws.simulateMessage({ event: 'X' });
    expect(received).toEqual([{ event: 'X' }]);
  });

  it('JSON null bo qua', () => {
    const received = [];
    telemetryWs.addListener((msg) => received.push(msg));
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    ws.onmessage({ data: 'null' });
    expect(received.length).toBe(0);
  });
});

describe('Test 13: auth het han dong, khong reconnect', () => {
  useFakeTimers();
  beforeEach(resetClient);
  afterEach(resetClient);

  it('logout goi disconnect WS dong, khong reconnect', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    telemetryWs.disconnect();
    expect(telemetryWs.status).toBe(WS_STATUS.CLOSED);
    vi.advanceTimersByTime(60000);
    expect(globalThis.WebSocket.instances.length).toBe(1);
  });
});

describe('Test 14: resync callback sau reconnect', () => {
  useFakeTimers();
  beforeEach(resetClient);
  afterEach(resetClient);

  it('reconnect open thanh cong goi cac resync listener', () => {
    const resyncs = [];
    telemetryWs.addResyncListener(() => resyncs.push(1));
    telemetryWs.connect();
    const ws1 = getLastWs();
    ws1.simulateOpen();
    expect(resyncs.length).toBe(1);
    ws1.simulateAbnormalClose();
    vi.advanceTimersByTime(2000);
    const ws2 = getLastWs();
    ws2.simulateOpen();
    expect(resyncs.length).toBe(2);
  });
});

describe('Heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetClient();
  });
  afterEach(() => {
    resetClient();
    vi.useRealTimers();
  });

  it('CONNECTED heartbeat timer gui ping moi 25s', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    expect(ws.sentMessages.length).toBe(0);
    vi.advanceTimersByTime(25000);
    expect(ws.sentMessages).toContain('ping');
  });

  it('nhan PONG reset timeout, khong dong', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    vi.advanceTimersByTime(25000);
    expect(ws.sentMessages).toContain('ping');
    ws.simulateMessage({ event: 'PONG' });
    vi.advanceTimersByTime(20000);
    expect(telemetryWs.status).toBe(WS_STATUS.CONNECTED);
  });

  it('PONG timeout dong + reconnect', () => {
    telemetryWs.connect();
    const ws1 = getLastWs();
    ws1.simulateOpen();
    vi.advanceTimersByTime(25000);
    vi.advanceTimersByTime(11000);
    expect(telemetryWs._ws).toBeNull();
    expect(telemetryWs.status).not.toBe(WS_STATUS.CONNECTED);
  });

  it('WS khong OPEN khong gui ping', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    ws.simulateAbnormalClose();
    vi.advanceTimersByTime(25000);
    expect(ws.sentMessages.filter((m) => m === 'ping').length).toBe(0);
  });

  it('disconnect clear heartbeat timer', () => {
    telemetryWs.connect();
    const ws = getLastWs();
    ws.simulateOpen();
    expect(telemetryWs._heartbeatTimer).not.toBeNull();
    telemetryWs.disconnect();
    expect(telemetryWs._heartbeatTimer).toBeNull();
  });

  it('reconnect thanh cong reset heartbeat, khong duplicate timer', () => {
    telemetryWs.connect();
    const ws1 = getLastWs();
    ws1.simulateOpen();
    ws1.simulateAbnormalClose();
    vi.advanceTimersByTime(2000);
    const ws2 = getLastWs();
    ws2.simulateOpen();
    expect(telemetryWs._heartbeatTimer).not.toBeNull();
    vi.advanceTimersByTime(25000);
    const pings = ws2.sentMessages.filter((m) => m === 'ping');
    expect(pings.length).toBe(1);
  });
});
