const HEARTBEAT_INTERVAL_MS = 30000
const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 15000

export function createTelemetrySocket({
  url = '/ws/telemetry',
  onMessage,
  onStatusChange,
  heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
} = {}) {
  let socket = null
  let heartbeatTimer = null
  let reconnectTimer = null
  let reconnectDelay = RECONNECT_BASE_DELAY_MS
  let manuallyClosed = false

  function emitStatus(status, detail = null) {
    if (typeof onStatusChange === 'function') {
      onStatusChange({ status, detail })
    }
  }

  function clearTimers() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect() {
    if (manuallyClosed) return
    clearTimers()
    emitStatus('reconnecting')
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY_MS)
      connect()
    }, reconnectDelay)
  }

  function startHeartbeat(ws) {
    heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }))
        } catch {
          // ignore — onclose sẽ lo phần reconnect
        }
      }
    }, heartbeatIntervalMs)
  }

  function connect() {
    clearTimers()
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const fullUrl = url.startsWith('/') ? `${protocol}//${window.location.host}${url}` : url
    try {
      socket = new WebSocket(fullUrl)
    } catch (err) {
      emitStatus('disconnected', err)
      scheduleReconnect()
      return
    }
    emitStatus('connecting')
    socket.onopen = () => {
      reconnectDelay = RECONNECT_BASE_DELAY_MS
      emitStatus('connected')
      startHeartbeat(socket)
    }
    socket.onmessage = (event) => {
      if (typeof onMessage === 'function') {
        try {
          const payload = JSON.parse(event.data)
          onMessage(payload)
        } catch {
          onMessage(event.data)
        }
      }
    }
    socket.onerror = (event) => {
      emitStatus('disconnected', event)
    }
    socket.onclose = () => {
      clearTimers()
      if (!manuallyClosed) scheduleReconnect()
    }
  }

  connect()

  return {
    close() {
      manuallyClosed = true
      clearTimers()
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close()
      }
      emitStatus('closed')
    },
  }
}
