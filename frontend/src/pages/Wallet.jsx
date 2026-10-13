import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  PlusCircle,
  ShieldCheck,
  AlertOctagon,
  User,
  QrCode,
  X,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  CreditCard,
  Lock,
  ChevronRight,
  ExternalLink,
  Clock,
  XCircle,
  Radio,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import api from '../services/api';
import { telemetryWs } from '../services/websocket';
import { useAuth } from '../context/AuthContext';
import { formatVNDateTime } from '../utils/formatTime';
import { isPenaltyTransaction } from '../utils/reservationUtils';

// ============================================================================
// HẰNG SỐ & HÀM HELPER THUẦN KHIẾT (PURE FUNCTIONS) CHO VALIDATION & CALLBACK
// (Export phục vụ Unit Test / Integration Test tại SCRUM-244)
// ============================================================================

export const TOPUP_MIN_AMOUNT = 10000;
export const TOPUP_MAX_AMOUNT = 50000000;
export const QUICK_TOPUP_AMOUNTS = [50000, 100000, 200000, 500000, 1000000, 2000000];

/**
 * Validate số tiền nạp vào ví (SCRUM-242)
 * @param {string|number} rawAmount
 * @returns {{ isValid: boolean, amount: number, error: string }}
 */
export function validateTopupAmount(rawAmount) {
  if (rawAmount === null || rawAmount === undefined || String(rawAmount).trim() === '') {
    return {
      isValid: false,
      amount: 0,
      error: 'Vui lòng nhập số tiền cần nạp.',
    };
  }

  const num = Number(rawAmount);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return {
      isValid: false,
      amount: 0,
      error: 'Số tiền nạp không hợp lệ.',
    };
  }

  if (!Number.isInteger(num) || num <= 0) {
    return {
      isValid: false,
      amount: num,
      error: 'Số tiền nạp phải là số nguyên dương (VND).',
    };
  }

  if (num < TOPUP_MIN_AMOUNT) {
    return {
      isValid: false,
      amount: num,
      error: `Số tiền nạp tối thiểu là ${TOPUP_MIN_AMOUNT.toLocaleString('vi-VN')} VND.`,
    };
  }

  if (num > TOPUP_MAX_AMOUNT) {
    return {
      isValid: false,
      amount: num,
      error: `Số tiền nạp tối đa là ${TOPUP_MAX_AMOUNT.toLocaleString('vi-VN')} VND / giao dịch.`,
    };
  }

  return {
    isValid: true,
    amount: num,
    error: '',
  };
}

/**
 * Phân tích URL chuyển hướng cổng thanh toán Sandbox từ API POST /wallet/topup-requests (SCRUM-242)
 * @param {string} redirectUrl
 * @param {string} fallbackOrderId
 * @param {number} fallbackAmount
 */
export function parseSandboxRedirectUrl(redirectUrl, fallbackOrderId = '', fallbackAmount = 0) {
  try {
    const parsed = new URL(redirectUrl);
    const params = parsed.searchParams;
    return {
      orderCode: params.get('order_code') || fallbackOrderId,
      amount: Number(params.get('amount') || fallbackAmount),
      signature: params.get('signature') || '',
      returnUrl: params.get('return_url') || '',
      gatewayHost: parsed.host || 'sandbox.payment-gateway.local',
      rawUrl: redirectUrl,
    };
  } catch {
    return {
      orderCode: fallbackOrderId,
      amount: Number(fallbackAmount),
      signature: '',
      returnUrl: '',
      gatewayHost: 'sandbox.payment-gateway.local',
      rawUrl: redirectUrl || '',
    };
  }
}

/**
 * Phân tích tham số Return URL / Callback khi tài xế quay về từ cổng Sandbox (SCRUM-239 & SCRUM-240)
 * RÀNG BUỘC NFR: Tuyệt đối KHÔNG tin tưởng tham số `status=SUCCESS` trên URL để tự cộng số dư!
 * Chỉ trích xuất `orderCode` để kích hoạt Polling/xác thực trạng thái thực tế từ Backend.
 * @param {string} searchString - Chuỗi query (VD: "?order_code=ORDER_123&status=SUCCESS")
 */
export function parseTopupReturnParams(searchString) {
  const params = new URLSearchParams(searchString || '');
  const orderCode = (params.get('order_code') || '').trim();
  const clientHintStatus = (params.get('status') || 'PENDING').trim().toUpperCase();
  const clientMessage = (params.get('message') || params.get('reason') || '').trim();

  if (!orderCode) {
    return {
      hasCallback: false,
      orderCode: '',
      clientHintStatus: '',
      clientMessage: '',
      shouldTrustClientStatusForBalance: false,
    };
  }

  return {
    hasCallback: true,
    orderCode,
    clientHintStatus,
    clientMessage,
    // Ràng buộc phi chức năng (NFR): Không bao giờ cộng số dư chỉ dựa vào Return URL
    shouldTrustClientStatusForBalance: false,
  };
}

/**
 * Thực thi 1 chu kỳ kiểm tra trạng thái đơn nạp tiền qua API Polling (SCRUM-245 & SCRUM-244)
 * Chỉ khi server xác nhận `status === 'SUCCESS'` (sau khi Webhook hợp lệ đã xử lý) mới gọi callback làm mới số dư.
 */
export async function pollTopupOrderOnce({
  orderCode,
  apiGetOrderStatus,
  onOrderUpdate,
  onWebhookConfirmedSuccess,
  onWebhookFailed,
}) {
  if (!orderCode || typeof apiGetOrderStatus !== 'function') {
    return { done: true, status: 'INVALID', order: null };
  }

  const orderData = await apiGetOrderStatus(orderCode);
  if (!orderData) {
    return { done: false, status: 'PENDING', order: null };
  }

  if (typeof onOrderUpdate === 'function') {
    onOrderUpdate(orderData);
  }

  const normalizedStatus = String(orderData.status || 'PENDING').toUpperCase();

  if (normalizedStatus === 'SUCCESS') {
    if (typeof onWebhookConfirmedSuccess === 'function') {
      await onWebhookConfirmedSuccess(orderData);
    }
    return { done: true, status: 'SUCCESS', order: orderData };
  }

  if (normalizedStatus === 'FAILED' || normalizedStatus === 'CANCELLED') {
    if (typeof onWebhookFailed === 'function') {
      onWebhookFailed(orderData);
    }
    return { done: true, status: normalizedStatus, order: orderData };
  }

  return { done: false, status: 'PENDING', order: orderData };
}

// ============================================================================
// CUSTOM HOOK: ĐỒNG BỘ TRẠNG THÁI GIAO DỊCH NẠP TIỀN REALTIME (POLLING + WS)
// (SCRUM-245)
// ============================================================================

export function useTopupRealtimeSync({
  topupOrders,
  setTopupOrders,
  onConfirmedSuccess,
  onConfirmedFailure,
  pollIntervalMs = 2000,
}) {
  const [isPolling, setIsPolling] = useState(false);
  const confirmedCodesRef = useRef(new Set());
  const failedNotifiedCodesRef = useRef(new Set());

  // Cập nhật hoặc thêm mới 1 bản ghi TopupOrder vào danh sách trên UI
  const upsertTopupOrder = useCallback(
    (incomingOrder) => {
      if (!incomingOrder || !incomingOrder.order_code) return;
      setTopupOrders((prev) => {
        const exists = prev.some((o) => o.order_code === incomingOrder.order_code);
        if (exists) {
          return prev.map((o) =>
            o.order_code === incomingOrder.order_code ? { ...o, ...incomingOrder } : o
          );
        }
        return [incomingOrder, ...prev];
      });
    },
    [setTopupOrders]
  );

  // Kiểm tra ngay trạng thái thực tế của 1 order_code từ Server
  const checkOrderStatusNow = useCallback(
    async (orderCode) => {
      try {
        return await pollTopupOrderOnce({
          orderCode,
          apiGetOrderStatus: async (code) => {
            const res = await api.get(`/wallet/topup-requests/${code}`);
            return res.data;
          },
          onOrderUpdate: (orderData) => {
            upsertTopupOrder(orderData);
          },
          onWebhookConfirmedSuccess: async (orderData) => {
            if (!confirmedCodesRef.current.has(orderData.order_code)) {
              confirmedCodesRef.current.add(orderData.order_code);
              if (onConfirmedSuccess) {
                await onConfirmedSuccess(orderData);
              }
            }
          },
          onWebhookFailed: (orderData) => {
            if (!failedNotifiedCodesRef.current.has(orderData.order_code)) {
              failedNotifiedCodesRef.current.add(orderData.order_code);
              if (onConfirmedFailure) {
                onConfirmedFailure(orderData);
              }
            }
          },
        });
      } catch (err) {
        console.error(`Lỗi kiểm tra trạng thái đơn nạp ${orderCode}:`, err);
        return { done: false, status: 'ERROR', order: null };
      }
    },
    [upsertTopupOrder, onConfirmedSuccess, onConfirmedFailure]
  );

  // Tự động Polling định kỳ khi có ít nhất 1 giao dịch đang ở trạng thái PENDING
  useEffect(() => {
    const pendingOrders = topupOrders.filter(
      (o) => String(o.status || '').toUpperCase() === 'PENDING'
    );

    if (pendingOrders.length === 0) {
      setIsPolling(false);
      return undefined;
    }

    setIsPolling(true);
    const timer = setInterval(() => {
      pendingOrders.forEach((order) => {
        checkOrderStatusNow(order.order_code);
      });
    }, pollIntervalMs);

    return () => clearInterval(timer);
  }, [topupOrders, checkOrderStatusNow, pollIntervalMs]);

  // Lắng nghe thêm kênh WebSocket chung nếu Backend đẩy sự kiện WALLET_TOPUP_UPDATED
  useEffect(() => {
    const removeListener = telemetryWs.addListener((msg) => {
      if (
        msg &&
        (msg.event === 'WALLET_TOPUP_UPDATED' || msg.event === 'TOPUP_SUCCESS') &&
        msg.order_code
      ) {
        checkOrderStatusNow(msg.order_code);
      }
    });
    return () => {
      if (typeof removeListener === 'function') removeListener();
    };
  }, [checkOrderStatusNow]);

  return {
    isPolling,
    upsertTopupOrder,
    checkOrderStatusNow,
  };
}

// ============================================================================
// COMPONENT CHÍNH: MÀN HÌNH VÍ ĐIỆN TỬ & CỔNG THANH TOÁN SANDBOX
// ============================================================================

export default function Wallet() {
  const { user, token, isGuest, updateGuestName, guestName, quickSwitch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [topupOrders, setTopupOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error403, setError403] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // State cho Form Nạp tiền qua cổng Sandbox (SCRUM-242)
  const [sandboxAmount, setSandboxAmount] = useState('100000');
  const [amountError, setAmountError] = useState('');
  const [creatingOrder, setCreatingOrder] = useState(false);

  // State cho Cổng Thanh Toán Sandbox (WebView / Checkout Simulator)
  const [sandboxCheckout, setSandboxCheckout] = useState(null);
  const [processingGatewayAction, setProcessingGatewayAction] = useState(false);
  const [delayedWebhookCountdown, setDelayedWebhookCountdown] = useState(0);

  // Thông báo trạng thái trên màn hình Ví (SUCCESS / PENDING / FAILED / CANCELLED)
  const [bannerAlert, setBannerAlert] = useState(null);

  // Trạng thái cửa sổ / Modal nạp tiền qua QR truyền thống
  const [showQrModal, setShowQrModal] = useState(false);
  const [payerName, setPayerName] = useState(
    () => user?.full_name || guestName || 'Nguyễn Văn Tài'
  );
  const [topupAmount, setTopupAmount] = useState('100000');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Pagination (Client-side cho danh sách 50 dòng API trả về)
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // SCRUM-378: Bộ lọc loại giao dịch sổ cái (Tất cả, Nạp tiền, Cước sạc, Phí quá hạn giữ chỗ)
  const [txFilter, setTxFilter] = useState(() => {
    const filterParam = searchParams.get('filter');
    const hlParam = searchParams.get('highlight');
    if (
      filterParam === 'PENALTY' ||
      hlParam === 'penalty' ||
      (hlParam && String(hlParam).toLowerCase().includes('res'))
    ) {
      return 'PENALTY';
    }
    return 'ALL';
  });

  // Giả lập trừ phí giữ chỗ quá hạn để kiểm thử hiển thị (S-50 / SCRUM-354 / SCRUM-378)
  const handleSimulatePenaltyTx = () => {
    const fee = 20000;
    const mockTx = {
      id: Date.now(),
      wallet_id: wallet?.id || 1,
      amount: -fee,
      transaction_type: 'NO_SHOW_PENALTY',
      balance_before: wallet ? Number(wallet.balance) : 250000,
      balance_after: (wallet ? Number(wallet.balance) : 250000) - fee,
      reference_type: 'RESERVATION',
      reference_id: `RES-20261013-001`,
      receipt_code: null,
      note: 'Phí giữ chỗ quá hạn không tới nhận trụ #RES-20261013-001 tại Trạm Sạc VinFast Thảo Điền',
      created_at: new Date().toISOString(),
    };
    setTransactions((prev) => [mockTx, ...prev]);
    if (wallet) {
      setWallet((prev) => ({
        ...prev,
        balance: (Number(prev.balance) - fee).toFixed(2),
      }));
    }
    setTxFilter('PENALTY');
  };

  // Tải số dư ví, lịch sử sổ cái và danh sách đơn nạp Sandbox
  const fetchWalletData = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError403(false);
      setErrorMsg('');

      const [walletRes, txRes, ordersRes] = await Promise.all([
        api.get('/wallet/me'),
        api.get('/wallet/transactions'),
        api.get('/wallet/topup-requests').catch(() => ({ data: [] })),
      ]);

      setWallet(walletRes.data);
      setTransactions(txRes.data || walletRes.data?.transactions || []);
      if (Array.isArray(ordersRes.data)) {
        setTopupOrders(ordersRes.data);
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu ví:', err);
      if (err.response?.status === 403) {
        setError403(true);
      } else if (!silent) {
        setErrorMsg(err.response?.data?.detail || err.message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // Tích hợp Hook đồng bộ Realtime Polling (SCRUM-245)
  const { isPolling, upsertTopupOrder, checkOrderStatusNow } = useTopupRealtimeSync({
    topupOrders,
    setTopupOrders,
    onConfirmedSuccess: async (confirmedOrder) => {
      // Chỉ khi Webhook đã xử lý xong (status === SUCCESS trên DB), mới tải lại số dư ví & sổ cái
      await fetchWalletData(true);
      setBannerAlert({
        type: 'SUCCESS',
        title: 'Webhook xác nhận nạp tiền thành công!',
        detail: `Đơn nạp #${confirmedOrder.order_code} với số tiền +${Number(
          confirmedOrder.amount
        ).toLocaleString('vi-VN')} VND đã được cộng vào số dư khả dụng của bạn.`,
      });
    },
    onConfirmedFailure: (failedOrder) => {
      const isCancelled = String(failedOrder.status).toUpperCase() === 'CANCELLED';
      setBannerAlert({
        type: 'ERROR',
        title: isCancelled
          ? `Giao dịch #${failedOrder.order_code} đã bị hủy`
          : `Giao dịch #${failedOrder.order_code} thất bại`,
        detail:
          failedOrder.failure_reason ||
          (isCancelled
            ? 'Tài xế đã chủ động hủy thanh toán tại cổng Sandbox. Số dư ví không thay đổi.'
            : 'Cổng thanh toán Sandbox từ chối giao dịch. Số dư ví không thay đổi.'),
      });
    },
    pollIntervalMs: 2000,
  });

  useEffect(() => {
    fetchWalletData();
  }, [token, user, fetchWalletData]);

  useEffect(() => {
    if (user?.full_name && !payerName) {
      setPayerName(user.full_name);
    }
  }, [user, payerName]);

  // ============================================================================
  // XỬ LÝ CALLBACK / RETURN URL KHI TÀI XẾ QUAY VỀ TỪ SANDBOX (SCRUM-239 & SCRUM-240)
  // ============================================================================
  useEffect(() => {
    const callbackInfo = parseTopupReturnParams( `?${searchParams.toString()}` );
    if (!callbackInfo.hasCallback) return;

    const { orderCode, clientHintStatus, clientMessage } = callbackInfo;

    // RÀNG BUỘC NFR: Tuyệt đối KHÔNG cộng tiền vào state `wallet.balance` tại đây!
    // Hiển thị thông báo trạng thái ban đầu và gọi API kiểm tra trạng thái thực tế từ Backend.
    if (clientHintStatus === 'PENDING') {
      setBannerAlert({
        type: 'PENDING',
        title: `Đang chờ xác nhận Webhook cho đơn #${orderCode}...`,
        detail:
          'Bạn đã quay về ứng dụng trước khi Webhook hoàn tất. Số dư ví chưa thay đổi và sẽ tự động cập nhật ngay khi hệ thống nhận được tín hiệu xác nhận từ cổng Sandbox.',
      });
    } else if (clientHintStatus === 'FAILED' || clientHintStatus === 'CANCELLED') {
      setBannerAlert({
        type: 'ERROR',
        title:
          clientHintStatus === 'CANCELLED'
            ? `Đã hủy giao dịch nạp tiền #${orderCode}`
            : `Giao dịch nạp tiền #${orderCode} thất bại`,
        detail:
          clientMessage ||
          'Giao dịch không thành công tại cổng thanh toán Sandbox. Số dư ví giữ nguyên.',
      });
    } else {
      setBannerAlert({
        type: 'PENDING',
        title: `Đang đồng bộ kết quả giao dịch #${orderCode}...`,
        detail: 'Hệ thống đang xác thực chữ ký số Webhook trước khi cập nhật số dư ví.',
      });
    }

    // Đưa đơn vào danh sách theo dõi (nếu chưa có) và gọi kiểm tra ngay lập tức
    upsertTopupOrder({
      order_code: orderCode,
      status: 'PENDING',
      amount: Number(sandboxAmount) || 100000,
      created_at: new Date().toISOString(),
    });
    checkOrderStatusNow(orderCode);

    // Xóa query params trên thanh địa chỉ để tránh xử lý lặp khi F5, chuyển về /wallet sạch
    const cleanParams = new URLSearchParams(searchParams);
    cleanParams.delete('order_code');
    cleanParams.delete('status');
    cleanParams.delete('message');
    cleanParams.delete('reason');
    setSearchParams(cleanParams, { replace: true });
  }, [searchParams, setSearchParams, upsertTopupOrder, checkOrderStatusNow, sandboxAmount]);

  // Đếm ngược hiển thị khi giả lập kịch bản "Quay về trước khi Webhook tới" (AC3)
  useEffect(() => {
    if (delayedWebhookCountdown <= 0) return undefined;
    const timer = setInterval(() => {
      setDelayedWebhookCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [delayedWebhookCountdown]);

  // ============================================================================
  // XỬ LÝ FORM NẠP TIỀN & MỞ CỔNG SANDBOX (SCRUM-242)
  // ============================================================================
  const handleSandboxAmountChange = (val) => {
    setSandboxAmount(val);
    const validation = validateTopupAmount(val);
    setAmountError(validation.isValid ? '' : validation.error);
  };

  const handleCreateSandboxTopup = async (e) => {
    if (e) e.preventDefault();

    const validation = validateTopupAmount(sandboxAmount);
    if (!validation.isValid) {
      setAmountError(validation.error);
      return;
    }

    try {
      setCreatingOrder(true);
      setAmountError('');
      setBannerAlert(null);

      // Gọi API tạo giao dịch nạp ở trạng thái chờ (PENDING)
      const res = await api.post('/wallet/topup-requests', {
        amount: validation.amount,
        full_name: (payerName || user?.full_name || 'Tài xế EV').trim(),
        note: 'Nạp tiền qua cổng thanh toán Sandbox',
      });

      const { order_id: orderId, redirect_url: redirectUrl } = res.data;
      const parsedGateway = parseSandboxRedirectUrl(redirectUrl, orderId, validation.amount);

      // Thêm ngay giao dịch PENDING vào danh sách trên màn hình Ví (Số dư chưa đổi!)
      upsertTopupOrder({
        order_code: parsedGateway.orderCode,
        amount: parsedGateway.amount,
        status: 'PENDING',
        failure_reason: null,
        created_at: new Date().toISOString(),
      });

      // Mở giao diện Cổng Thanh Toán Sandbox (WebView / Redirect Simulator)
      setSandboxCheckout(parsedGateway);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      setAmountError(`Không thể khởi tạo giao dịch: ${detail}`);
    } finally {
      setCreatingOrder(false);
    }
  };

  // ============================================================================
  // CÁC HÀNH ĐỘNG TRÊN CỔNG THANH TOÁN SANDBOX (4 KỊCH BẢN AC CỦA SCRUM-232)
  // ============================================================================

  // Kịch bản 1 (AC1 & AC2): Thanh toán thành công -> Gửi Webhook hợp lệ -> Quay về Return URL
  const handleSandboxPaySuccess = async () => {
    if (!sandboxCheckout) return;
    try {
      setProcessingGatewayAction(true);
      const { orderCode } = sandboxCheckout;

      await api.post('/payments/webhook', {
        order_code: orderCode,
        status: 'SUCCESS',
        message: 'Thanh toán thành công tại cổng Sandbox',
        signature: 'test_valid_signature',
      });

      setSandboxCheckout(null);
      navigate(`/wallet/topup/result?order_code=${orderCode}&status=SUCCESS`);
    } catch (err) {
      alert('Lỗi gửi Webhook Sandbox: ' + (err.response?.data?.detail || err.message));
    } finally {
      setProcessingGatewayAction(false);
    }
  };

  // Kịch bản 2 (AC3): Quay về App TRƯỚC khi Webhook xử lý xong -> Ví hiện PENDING -> 4s sau Webhook tới -> Tự cập nhật số dư
  const handleSandboxReturnBeforeWebhook = () => {
    if (!sandboxCheckout) return;
    const { orderCode } = sandboxCheckout;

    setSandboxCheckout(null);
    setDelayedWebhookCountdown(4);

    // Điều hướng quay về Return URL ngay lập tức khi đơn vẫn đang PENDING (Số dư chưa tăng)
    navigate(`/wallet/topup/result?order_code=${orderCode}&status=PENDING`);

    // Giả lập cổng thanh toán gửi Webhook trễ sau 4 giây
    setTimeout(async () => {
      try {
        await api.post('/payments/webhook', {
          order_code: orderCode,
          status: 'SUCCESS',
          message: 'Webhook Sandbox xử lý hoàn tất (đến sau khi tài xế quay về ví)',
          signature: 'test_valid_signature',
        });
      } catch (err) {
        console.error('Lỗi bắn Webhook trễ:', err);
      }
    }, 4000);
  };

  // Kịch bản 3 (AC4 - Failed): Cổng thanh toán báo lỗi thất bại -> Ghi lý do, số dư không đổi
  const handleSandboxPayFailed = async () => {
    if (!sandboxCheckout) return;
    try {
      setProcessingGatewayAction(true);
      const { orderCode } = sandboxCheckout;
      const reason = 'Ngân hàng phát hành từ chối giao dịch (Thẻ Sandbox vượt hạn mức ngày)';

      await api.post('/payments/webhook', {
        order_code: orderCode,
        status: 'FAILED',
        message: reason,
        signature: 'test_valid_signature',
      });

      setSandboxCheckout(null);
      navigate(
        `/wallet/topup/result?order_code=${orderCode}&status=FAILED&message=${encodeURIComponent(
          reason
        )}`
      );
    } catch (err) {
      alert('Lỗi gửi Webhook thất bại: ' + (err.response?.data?.detail || err.message));
    } finally {
      setProcessingGatewayAction(false);
    }
  };

  // Kịch bản 4 (AC4 - Cancelled): Tài xế chủ động hủy giao dịch -> Ghi lý do hủy, số dư không đổi
  const handleSandboxCancel = async () => {
    if (!sandboxCheckout) return;
    try {
      setProcessingGatewayAction(true);
      const { orderCode } = sandboxCheckout;
      const reason = 'Tài xế chủ động hủy giao dịch tại cổng thanh toán Sandbox';

      await api.post('/payments/webhook', {
        order_code: orderCode,
        status: 'CANCELLED',
        message: reason,
        signature: 'test_valid_signature',
      });

      setSandboxCheckout(null);
      navigate(
        `/wallet/topup/result?order_code=${orderCode}&status=CANCELLED&message=${encodeURIComponent(
          reason
        )}`
      );
    } catch (err) {
      alert('Lỗi hủy giao dịch: ' + (err.response?.data?.detail || err.message));
    } finally {
      setProcessingGatewayAction(false);
    }
  };

  // Nút hỗ trợ kích hoạt Webhook trực tiếp cho một đơn đang PENDING trong danh sách
  const handleTriggerWebhookForOrder = async (orderCode) => {
    try {
      await api.post('/payments/webhook', {
        order_code: orderCode,
        status: 'SUCCESS',
        message: 'Xác nhận Webhook từ cổng Sandbox',
        signature: 'test_valid_signature',
      });
      await checkOrderStatusNow(orderCode);
    } catch (err) {
      alert('Không thể gửi Webhook: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Xác nhận nạp tiền qua QR truyền thống
  const handleConfirmTransfer = async () => {
    const validation = validateTopupAmount(topupAmount);
    if (!validation.isValid) {
      alert(validation.error);
      return;
    }

    const cleanName = payerName.trim();
    if (!cleanName) {
      alert('Vui lòng ghi rõ Họ và tên người nạp tiền / tài xế');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post('/wallet/topup', {
        amount: validation.amount,
        full_name: cleanName,
        note: `Nạp tiền qua chuyển khoản QR (${cleanName})`,
      });

      if (updateGuestName) {
        updateGuestName(cleanName);
      }

      setWallet(res.data);
      setBannerAlert({
        type: 'SUCCESS',
        title: 'Nạp tiền QR thành công!',
        detail: `Đã cộng +${validation.amount.toLocaleString('vi-VN')} VND vào số dư khả dụng của ${cleanName}.`,
      });
      setShowQrModal(false);
      fetchWalletData(true);
    } catch (err) {
      alert('Lỗi nạp tiền: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-steel-gray">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Đang tải thông tin ví...</span>
      </div>
    );
  }

  if (error403) {
    return (
      <div className="max-w-3xl mx-auto mt-12 bg-panel border border-hairline p-8 rounded-sm text-center space-y-4">
        <div className="mx-auto w-12 h-12 bg-critical-red/10 text-critical-red flex items-center justify-center rounded-full mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-tech-white font-mono">Truy Cập Bị Từ Chối (403)</h2>
        <p className="text-steel-gray text-sm">
          Bạn không có quyền xem thông tin ví của người dùng khác. Vui lòng đăng nhập đúng tài khoản để thực hiện thao tác.
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="max-w-3xl mx-auto mt-12 bg-critical-red/10 border border-critical-red/40 p-6 rounded-sm text-center text-critical-red space-y-2">
        <AlertOctagon className="w-6 h-6 mx-auto mb-2" />
        <p className="font-bold">Lỗi tải dữ liệu</p>
        <p className="text-xs">{errorMsg}</p>
        <button
          onClick={() => fetchWalletData(false)}
          className="mt-4 px-4 py-2 bg-critical-red/20 hover:bg-critical-red/30 rounded text-xs font-bold transition-colors"
        >
          Thử Lại
        </button>
      </div>
    );
  }

  const balance = wallet ? Number(wallet.balance) : 0;
  const currentAmountNum = parseFloat(topupAmount) || 100000;
  const transferContent = `EVCSMS NAP ${payerName.trim() || 'TAI XE'}`;
  const vietQrUrl = `https://api.vietqr.io/image/970422-999988886666-compact2.png?amount=${currentAmountNum}&addInfo=${encodeURIComponent(
    transferContent
  )}&accountName=EV%20CSMS%20CHARGING`;

  // SCRUM-378: Lọc giao dịch theo loại (Tất cả, Nạp tiền, Cước sạc, Phí quá hạn)
  const penaltyTxs = useMemo(() => transactions.filter(isPenaltyTransaction), [transactions]);
  const totalPenaltyAmount = useMemo(() => {
    return penaltyTxs.reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  }, [penaltyTxs]);

  const topupTxsCount = useMemo(
    () => transactions.filter((tx) => tx.transaction_type === 'TOPUP').length,
    [transactions]
  );
  const chargeTxsCount = useMemo(
    () =>
      transactions.filter(
        (tx) => tx.transaction_type === 'CHARGE_FEE' && !isPenaltyTransaction(tx)
      ).length,
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    if (txFilter === 'TOPUP') return transactions.filter((tx) => tx.transaction_type === 'TOPUP');
    if (txFilter === 'CHARGE_FEE')
      return transactions.filter(
        (tx) => tx.transaction_type === 'CHARGE_FEE' && !isPenaltyTransaction(tx)
      );
    if (txFilter === 'PENALTY') return penaltyTxs;
    return transactions;
  }, [transactions, txFilter, penaltyTxs]);

  // Pagination logic
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE) || 1;
  const currentTransactions = filteredTransactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Render Badge cho trạng thái đơn nạp tiền Sandbox (SCRUM-245)
  const renderOrderStatusBadge = (status) => {
    const st = String(status || 'PENDING').toUpperCase();
    if (st === 'SUCCESS') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-grid-green/20 text-grid-green border border-grid-green/30">
          <CheckCircle2 className="w-3 h-3" />
          <span>THÀNH CÔNG (SUCCESS)</span>
        </span>
      );
    }
    if (st === 'FAILED') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-critical-red/20 text-critical-red border border-critical-red/30">
          <XCircle className="w-3 h-3" />
          <span>THẤT BẠI (FAILED)</span>
        </span>
      );
    }
    if (st === 'CANCELLED') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-steel-gray/20 text-steel-gray border border-steel-gray/30">
          <X className="w-3 h-3" />
          <span>ĐÃ HỦY (CANCELLED)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-caution-amber/20 text-caution-amber border border-caution-amber/40 animate-pulse">
        <Clock className="w-3 h-3 animate-spin" />
        <span>ĐANG CHỜ (PENDING)</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-tech-white">
            Ví Điện Tử Nạp Tiền &amp; Cổng Thanh Toán Sandbox
          </h1>
          <p className="text-xs text-steel-gray mt-0.5 font-mono">
            BẢO TOÀN GIAO DỊCH NFR: CHỈ CẬP NHẬT SỐ DƯ KHI NHẬN WEBHOOK XÁC THỰC CHỮ KÝ SỐ TỪ SERVER
          </p>
        </div>

        {/* Trạng thái kết nối Realtime Polling */}
        <div className="flex items-center space-x-2 text-xs font-mono bg-panel border border-hairline px-3 py-1.5 rounded-sm">
          <Radio
            className={`w-3.5 h-3.5 ${
              isPolling ? 'text-caution-amber animate-ping' : 'text-grid-green'
            }`}
          />
          <span className={isPolling ? 'text-caution-amber font-bold' : 'text-steel-gray'}>
            {isPolling
              ? 'ĐANG LẮNG NGHE WEBHOOK (POLLING 2S)...'
              : 'ĐỒNG BỘ SỐ DƯ REALTIME SẴN SÀNG'}
          </span>
        </div>
      </div>

      {/* Banner hướng dẫn vai trò nếu đang đăng nhập Admin / Kế toán / Chủ trạm */}
      {user && user.role !== 'CUSTOMER' && (
        <div className="bg-sky-950/40 border border-sky-500/40 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-sky-500/20 text-sky-400 rounded-md">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-tech-white">
                Bạn đang xem ví với tài khoản {user.full_name || user.username} ({user.role}).
              </p>
              <p className="text-steel-gray">
                Để kiểm tra ví và các giao dịch nạp tiền / cước sạc thực tế của Tài xế (driver_vip - Trần Thị Bích Ngọc), bạn có thể chuyển nhanh sang vai trò Tài xế.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => quickSwitch && quickSwitch('CUSTOMER')}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md transition-colors shrink-0 shadow-sm shadow-emerald-600/30"
          >
            <span>Chuyển sang Tài xế (driver_vip)</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Banner thông báo kết quả Callback / Webhook (SCRUM-239, SCRUM-240, SCRUM-245) */}
      {bannerAlert && (
        <div
          className={`p-4 rounded-sm border text-xs font-mono flex items-start justify-between gap-3 ${
            bannerAlert.type === 'SUCCESS'
              ? 'bg-grid-green/10 border-grid-green/40 text-grid-green'
              : bannerAlert.type === 'PENDING'
              ? 'bg-caution-amber/10 border-caution-amber/40 text-caution-amber'
              : 'bg-critical-red/10 border-critical-red/40 text-critical-red'
          }`}
        >
          <div className="flex items-start space-x-2.5">
            {bannerAlert.type === 'SUCCESS' && (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-grid-green" />
            )}
            {bannerAlert.type === 'PENDING' && (
              <RefreshCw className="w-4 h-4 shrink-0 mt-0.5 text-caution-amber animate-spin" />
            )}
            {bannerAlert.type === 'ERROR' && (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-critical-red" />
            )}
            <div className="space-y-1">
              <div className="font-bold text-sm">{bannerAlert.title}</div>
              <div className="opacity-90 leading-relaxed">{bannerAlert.detail}</div>
              {delayedWebhookCountdown > 0 && bannerAlert.type === 'PENDING' && (
                <div className="text-[11px] font-bold underline pt-1">
                  ⏳ Webhook Sandbox đang xử lý ngầm, sẽ tự động bắn về Server sau{' '}
                  {delayedWebhookCountdown} giây...
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setBannerAlert(null)}
            className="p-1 rounded hover:bg-black/20 transition-colors"
            title="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Balance & Sandbox Top-up Form */}
        <div className="space-y-4">
          {/* Balance Card */}
          <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4">
            <div className="flex items-center justify-between text-xs text-steel-gray font-mono">
              <span>SỐ DƯ KHẢ DỤNG HIỆN TẠI</span>
              <div className="flex items-center space-x-1.5 text-electric-cyan">
                <User className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold">
                  {user?.full_name || 'Tài xế sạc'}
                  {isGuest && ' (Tự do)'}
                </span>
              </div>
            </div>

            <div className="font-mono tabular-nums">
              <div
                data-testid="wallet-balance-value"
                className={`text-3xl font-bold ${
                  balance < 0 ? 'text-critical-red' : 'text-tech-white'
                }`}
              >
                {balance.toLocaleString('vi-VN')}{' '}
                <span className="text-sm font-normal text-steel-gray">VND</span>
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
              <div>
                • Hạn mức nạp Sandbox:{' '}
                <span className="text-tech-white">10,000 - 50,000,000 VND</span>
              </div>
              <div>
                • Số dư tối thiểu bắt đầu sạc: <span className="text-tech-white">50,000 VND</span>
              </div>
              <div>
                • Hạn mức cho phép nợ tối đa:{' '}
                <span className="text-caution-amber">-300,000 VND</span>
              </div>
            </div>
          </div>

          {/* FORM NẠP TIỀN QUA CỔNG THANH TOÁN SANDBOX (SCRUM-242) */}
          <form
            onSubmit={handleCreateSandboxTopup}
            className="bg-panel border border-electric-cyan/40 p-5 rounded-sm space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-electric-cyan" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-tech-white font-mono">
                  NẠP TIỀN QUA CỔNG SANDBOX
                </h2>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-electric-cyan/20 text-electric-cyan">
                SANDBOX GATEWAY
              </span>
            </div>

            <p className="text-xs text-steel-gray font-mono leading-relaxed">
              Tạo giao dịch chờ (<span className="text-caution-amber font-bold">PENDING</span>) và
              chuyển hướng sang Cổng thanh toán Sandbox. Số dư chỉ tăng khi Webhook báo thành công.
            </p>

            {/* Chọn nhanh mệnh giá */}
            <div>
              <label className="text-steel-gray block mb-1.5 text-xs font-mono">
                1. CHỌN NHANH MỆNH GIÁ (VND):
              </label>
              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                {QUICK_TOPUP_AMOUNTS.map((amt) => {
                  const isSelected = Number(sandboxAmount) === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleSandboxAmountChange(String(amt))}
                      className={`py-2 px-1 rounded border text-center transition-colors ${
                        isSelected
                          ? 'bg-electric-cyan text-white border-electric-cyan font-bold'
                          : 'bg-obsidian text-steel-gray border-hairline hover:text-tech-white hover:border-steel-gray'
                      }`}
                    >
                      +{amt >= 1000000 ? `${amt / 1000000}Tr` : `${amt / 1000}k`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ô nhập số tiền tùy chỉnh + Validate */}
            <div className="space-y-1.5">
              <label
                htmlFor="sandbox-amount-input"
                className="text-steel-gray block text-xs font-mono"
              >
                2. HOẶC NHẬP SỐ TIỀN CẦN NẠP (10,000 - 50,000,000 VND):
              </label>
              <input
                id="sandbox-amount-input"
                data-testid="sandbox-amount-input"
                type="number"
                step="10000"
                min={TOPUP_MIN_AMOUNT}
                max={TOPUP_MAX_AMOUNT}
                value={sandboxAmount}
                onChange={(e) => handleSandboxAmountChange(e.target.value)}
                placeholder="Nhập số tiền (VD: 100000)"
                className={`w-full bg-obsidian border p-2.5 rounded text-tech-white font-mono tabular-nums text-sm focus:outline-none ${
                  amountError
                    ? 'border-critical-red focus:border-critical-red'
                    : 'border-hairline focus:border-electric-cyan'
                }`}
              />
              {amountError ? (
                <p
                  data-testid="sandbox-amount-error"
                  className="text-[11px] font-mono text-critical-red flex items-center space-x-1"
                >
                  <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                  <span>{amountError}</span>
                </p>
              ) : (
                <p className="text-[11px] font-mono text-grid-green">
                  Số tiền thanh toán:{' '}
                  <span className="font-bold">
                    {Number(sandboxAmount || 0).toLocaleString('vi-VN')} VND
                  </span>
                </p>
              )}
            </div>

            {/* Nút Submit gọi POST /api/v1/wallet/topup-requests & Mở cổng Sandbox */}
            <button
              type="submit"
              data-testid="sandbox-submit-btn"
              disabled={creatingOrder || Boolean(amountError)}
              className="w-full flex items-center justify-center space-x-2 py-3 rounded bg-electric-cyan hover:bg-electric-cyan-hover disabled:opacity-50 text-white font-bold text-xs font-mono transition-all shadow-md"
            >
              {creatingOrder ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>ĐANG KHỞI TẠO ĐƠN HÀNG &amp; CHỮ KÝ HMAC...</span>
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  <span>NẠP TIỀN QUA CỔNG SANDBOX</span>
                </>
              )}
            </button>

            {/* Nút phụ mở nạp QR truyền thống */}
            <div className="pt-2 border-t border-hairline flex items-center justify-between">
              <span className="text-[11px] font-mono text-steel-gray">Phương thức khác:</span>
              <button
                type="button"
                onClick={() => {
                  setTopupAmount(sandboxAmount || '100000');
                  setShowQrModal(true);
                }}
                className="inline-flex items-center space-x-1 text-[11px] font-mono text-electric-cyan hover:underline"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Chuyển khoản mã VietQR</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Sandbox Orders Status (PENDING / SUCCESS / FAILED) & Ledger History */}
        <div className="lg:col-span-2 space-y-6">
          {/* BẢNG 1: DANH SÁCH GIAO DỊCH CỔNG SANDBOX & ĐỒNG BỘ REALTIME (SCRUM-245) */}
          <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-electric-cyan" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-tech-white font-mono">
                  TRẠNG THÁI ĐƠN NẠP CỔNG SANDBOX (REALTIME / POLLING)
                </h2>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => fetchWalletData(true)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-obsidian border border-hairline text-[11px] font-mono text-steel-gray hover:text-tech-white transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${isPolling ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
              </div>
            </div>

            {topupOrders.length === 0 ? (
              <div className="text-xs text-steel-gray text-center py-6 font-mono bg-obsidian/50 rounded border border-hairline/60">
                Chưa có yêu cầu nạp tiền Sandbox nào. Hãy chọn mệnh giá bên trái và nhấn &ldquo;NẠP
                TIỀN QUA CỔNG SANDBOX&rdquo;.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-hairline text-steel-gray">
                      <th className="pb-2">MÃ ĐƠN (ORDER CODE)</th>
                      <th className="pb-2">SỐ TIỀN NẠP</th>
                      <th className="pb-2">TRẠNG THÁI</th>
                      <th className="pb-2">GHI CHÚ / LÝ DO</th>
                      <th className="pb-2 text-right">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {topupOrders.map((order) => {
                      const statusUpper = String(order.status || 'PENDING').toUpperCase();
                      return (
                        <tr
                          key={order.order_code}
                          data-testid={`topup-order-row-${order.order_code}`}
                          className="hover:bg-panel-hover transition-colors"
                        >
                          <td className="py-2.5 font-bold text-tech-white">{order.order_code}</td>
                          <td className="py-2.5 font-bold tabular-nums text-electric-cyan">
                            +{Number(order.amount || 0).toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-2.5">{renderOrderStatusBadge(statusUpper)}</td>
                          <td className="py-2.5 text-[11px] text-steel-gray max-w-xs">
                            {statusUpper === 'PENDING' && (
                              <span className="text-caution-amber">
                                Đang chờ Webhook xác nhận chữ ký... (Số dư chưa cộng)
                              </span>
                            )}
                            {statusUpper === 'SUCCESS' && (
                              <span className="text-grid-green">
                                Đã xác thực Webhook &amp; cộng tiền vào sổ cái ví
                              </span>
                            )}
                            {(statusUpper === 'FAILED' || statusUpper === 'CANCELLED') && (
                              <span className="text-critical-red">
                                {order.failure_reason || 'Giao dịch bị hủy hoặc từ chối'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            {statusUpper === 'PENDING' ? (
                              <div className="inline-flex items-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleTriggerWebhookForOrder(order.order_code)}
                                  className="px-2 py-1 rounded bg-grid-green/20 hover:bg-grid-green/30 text-grid-green border border-grid-green/40 text-[10px] font-bold transition-colors"
                                  title="Giả lập cổng Sandbox bắn Webhook thành công ngay"
                                >
                                  Bắn Webhook OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => checkOrderStatusNow(order.order_code)}
                                  className="px-2 py-1 rounded bg-obsidian hover:bg-hairline text-steel-gray hover:text-tech-white border border-hairline text-[10px] transition-colors"
                                >
                                  Poll
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-steel-gray">
                                {order.created_at ? formatVNDateTime(order.created_at) : 'Hoàn tất'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* BẢNG 2: LỊCH SỬ BIẾN ĐỘNG SỐ DƯ SỔ CÁI (WALLET LEDGER) */}
          <div className="bg-panel border border-hairline p-5 rounded-sm space-y-4 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-steel-gray font-mono">
                  LỊCH SỬ BIẾN ĐỘNG SỐ DƯ SỔ CÁI &amp; QUYẾT TOÁN CƯỚC SẠC
                </h2>
                <span className="text-[11px] font-mono text-steel-gray">
                  Hiển thị {filteredTransactions.length} / {transactions.length} Giao dịch
                </span>
              </div>

              {/* Nút giả lập phí quá hạn & Link sang Đặt chỗ (S-50 / SCRUM-354 / SCRUM-378) */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleSimulatePenaltyTx}
                  className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/40 text-[10px] font-mono font-bold transition-colors inline-flex items-center space-x-1"
                  title="Thêm 1 giao dịch mẫu trừ phí quá hạn giữ chỗ để đối soát trên ví"
                >
                  <PlusCircle className="w-3 h-3" />
                  <span>+ Giả Lập Phí Quá Hạn (Demo)</span>
                </button>

                <Link
                  to="/reservations"
                  className="px-2.5 py-1 rounded bg-obsidian hover:bg-hairline text-steel-gray hover:text-tech-white border border-hairline text-[10px] font-mono transition-colors inline-flex items-center space-x-1"
                >
                  <Clock className="w-3 h-3 text-sky-400" />
                  <span>Lịch Sử Đặt Chỗ</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Bộ lọc loại giao dịch (SCRUM-378) */}
            <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pt-1">
              {[
                { key: 'ALL', label: 'TẤT CẢ', count: transactions.length },
                { key: 'TOPUP', label: 'NẠP TIỀN', count: topupTxsCount },
                { key: 'CHARGE_FEE', label: 'CƯỚC SẠC', count: chargeTxsCount },
                {
                  key: 'PENALTY',
                  label: 'PHÍ QUÁ HẠN GIỮ CHỖ',
                  count: penaltyTxs.length,
                  highlight: true,
                },
              ].map((tab) => {
                const isSelected = txFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setTxFilter(tab.key);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                      isSelected
                        ? tab.highlight
                          ? 'bg-amber-500 text-black shadow-sm'
                          : 'bg-electric-cyan text-tech-white shadow-sm'
                        : tab.highlight && tab.count > 0
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25'
                        : 'bg-obsidian border border-hairline text-steel-gray hover:text-tech-white'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                        isSelected ? 'bg-black/20 text-white' : 'bg-panel text-steel-gray'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Cảnh báo nếu có khoản phí giữ chỗ quá hạn (SCRUM-378 Notice) */}
            {penaltyTxs.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 text-[11px] font-mono text-amber-300 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Ví của bạn có <strong>{penaltyTxs.length}</strong> khoản phí phạt do giữ chỗ quá 15 phút không tới nhận trụ (Tổng: <strong className="text-critical-red">-{totalPenaltyAmount.toLocaleString('vi-VN')} đ</strong>).
                  </span>
                </div>
                <Link
                  to="/reservations?tab=EXPIRED"
                  className="text-amber-400 underline font-bold hover:text-white shrink-0 ml-3"
                >
                  Xem chi tiết đặt chỗ &rarr;
                </Link>
              </div>
            )}

            <div className="overflow-x-auto flex-1">
              {filteredTransactions.length === 0 ? (
                <div className="text-xs text-steel-gray text-center py-12 font-mono">
                  {txFilter === 'PENALTY'
                    ? 'Không có khoản phí phạt giữ chỗ quá hạn nào.'
                    : 'Chưa có lịch sử giao dịch nào được ghi nhận cho bộ lọc này.'}
                </div>
              ) : (
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-hairline text-steel-gray">
                      <th className="pb-2">MÃ GD</th>
                      <th className="pb-2">LOẠI GIAO DỊCH</th>
                      <th className="pb-2">SỐ TIỀN</th>
                      <th className="pb-2">GHI CHÚ / THAM CHIẾU</th>
                      <th className="pb-2">THỜI GIAN</th>
                      <th className="pb-2 text-right">CHI TIẾT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {currentTransactions.map((tx) => {
                      const isCredit = tx.transaction_type === 'TOPUP';
                      const isPenalty = isPenaltyTransaction(tx);
                      const amountNum = Number(tx.amount);

                      const targetLink = isCredit
                        ? '/wallet'
                        : isPenalty
                        ? `/reservations?highlight=${tx.reference_id || tx.id}`
                        : `/session/${tx.reference_id || tx.id}`;

                      return (
                        <tr
                          key={tx.id}
                          className={`hover:bg-panel-hover group transition-colors ${
                            isPenalty ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          <td className="py-2.5 text-steel-gray">#{tx.id}</td>
                          <td className="py-2.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isCredit
                                  ? 'bg-grid-green/20 text-grid-green border border-grid-green/30'
                                  : isPenalty
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 inline-flex items-center space-x-1'
                                  : 'bg-critical-red/20 text-critical-red border border-critical-red/30'
                              }`}
                            >
                              {isPenalty && <Clock className="w-2.5 h-2.5 mr-0.5" />}
                              {isPenalty ? 'PHÍ QUÁ HẠN GIỮ CHỖ' : tx.transaction_type}
                            </span>
                          </td>
                          <td
                            className={`py-2.5 font-bold tabular-nums ${
                              isCredit
                                ? 'text-grid-green'
                                : isPenalty
                                ? 'text-amber-400 font-extrabold'
                                : 'text-critical-red'
                            }`}
                          >
                            {isCredit ? '+' : '-'}
                            {Math.abs(amountNum).toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-2.5 text-steel-gray text-[11px] max-w-xs truncate">
                            {tx.note || (isPenalty ? 'Phí giữ chỗ quá hạn không tới nhận trụ' : '—')}
                          </td>
                          <td className="py-2.5 text-steel-gray text-[11px]">
                            {formatVNDateTime(tx.created_at)}
                          </td>
                          <td className="py-2.5 text-right">
                            <Link
                              to={targetLink}
                              className={`inline-flex items-center text-[10px] uppercase font-bold transition-colors p-1 ${
                                isPenalty
                                  ? 'text-amber-400 hover:text-amber-300'
                                  : 'text-electric-cyan hover:text-white'
                              }`}
                            >
                              <span>{isPenalty ? 'Xem Đặt Chỗ' : 'Xem'}</span>
                              <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {filteredTransactions.length > 0 && (
              <div className="border-t border-hairline pt-4 flex items-center justify-between text-[11px] font-mono text-steel-gray">
                <div>
                  Đang hiển thị {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{' '}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredTransactions.length)} trong tổng số{' '}
                  {filteredTransactions.length} giao dịch
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="px-2 py-1 bg-obsidian border border-hairline rounded hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Trang trước
                  </button>
                  <span className="text-tech-white">
                    {currentPage} / {totalPages || 1}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="px-2 py-1 bg-obsidian border border-hairline rounded hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================================
          MODAL CỔNG THANH TOÁN SANDBOX (SANDBOX PAYMENT GATEWAY WEBVIEW)
          Cho phép kiểm thử trọn vẹn 4 kịch bản AC1, AC2, AC3, AC4 của SCRUM-232
         ============================================================================ */}
      {sandboxCheckout && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-electric-cyan/60 max-w-lg w-full rounded-sm p-6 space-y-5 font-mono text-xs shadow-2xl relative animate-scaleUp">
            {/* Thanh địa chỉ giả lập trình duyệt / WebView */}
            <div className="bg-obsidian border border-hairline px-3 py-2 rounded flex items-center justify-between text-[11px] text-steel-gray">
              <div className="flex items-center space-x-2 truncate">
                <Lock className="w-3.5 h-3.5 text-grid-green shrink-0" />
                <span className="text-grid-green font-bold">https://</span>
                <span className="text-tech-white truncate">{sandboxCheckout.rawUrl}</span>
              </div>
              <span className="ml-2 px-1.5 py-0.5 rounded bg-electric-cyan/20 text-electric-cyan text-[10px] font-bold shrink-0">
                SANDBOX
              </span>
            </div>

            {/* Header Cổng Sandbox */}
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded bg-electric-cyan/20 border border-electric-cyan/40 text-electric-cyan">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-tech-white">
                    CỔNG THANH TOÁN SANDBOX EV-PAY
                  </h3>
                  <p className="text-[10px] text-steel-gray">
                    Môi trường kiểm thử tích hợp Webhook &amp; Return URL (SCRUM-232)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSandboxCheckout(null)}
                className="text-steel-gray hover:text-tech-white p-1 rounded hover:bg-hairline transition-colors"
                title="Đóng cửa sổ Sandbox (Giữ nguyên trạng thái PENDING)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thông tin đơn hàng & chữ ký HMAC-SHA256 */}
            <div className="bg-obsidian border border-hairline p-4 rounded space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-steel-gray">Mã đơn hàng (order_code):</span>
                <span className="font-bold text-tech-white">{sandboxCheckout.orderCode}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-steel-gray">Số tiền thanh toán:</span>
                <span className="font-bold text-base text-electric-cyan tabular-nums">
                  {Number(sandboxCheckout.amount).toLocaleString('vi-VN')} VND
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-steel-gray">Trạng thái hiện tại:</span>
                <span className="px-2 py-0.5 rounded bg-caution-amber/20 text-caution-amber font-bold text-[10px]">
                  ĐANG CHỜ THANH TOÁN (PENDING)
                </span>
              </div>
              <div className="pt-2 border-t border-hairline">
                <div className="text-[10px] text-steel-gray mb-1">
                  Chữ ký bảo mật HMAC-SHA256 (Signature):
                </div>
                <div className="bg-panel p-1.5 rounded border border-hairline text-[10px] text-steel-gray break-all">
                  {sandboxCheckout.signature || 'hmac_sha256_verified'}
                </div>
              </div>
            </div>

            {/* 4 Kịch bản Kiểm thử Nghiệp vụ (AC1 -> AC4) */}
            <div className="space-y-2.5">
              <div className="text-[11px] font-bold text-steel-gray uppercase">
                CHỌN KỊCH BẢN PHẢN HỒI TỪ CỔNG SANDBOX:
              </div>

              {/* 1. AC1 & AC2: Thanh toán thành công chuẩn */}
              <button
                type="button"
                data-testid="sandbox-btn-success"
                disabled={processingGatewayAction}
                onClick={handleSandboxPaySuccess}
                className="w-full flex items-center justify-between p-3 rounded bg-grid-green hover:bg-emerald-600 disabled:opacity-50 text-white font-bold transition-all shadow-md"
              >
                <div className="flex items-center space-x-2 text-left">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <div>
                    <div>1. Thanh toán Thành công (AC1 &amp; AC2)</div>
                    <div className="text-[10px] font-normal opacity-90">
                      Gửi Webhook có chữ ký hợp lệ &rarr; Cộng tiền ví &rarr; Quay về Return URL
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>

              {/* 2. AC3: Quay về trước khi Webhook tới (Test Realtime Polling) */}
              <button
                type="button"
                data-testid="sandbox-btn-pending-return"
                disabled={processingGatewayAction}
                onClick={handleSandboxReturnBeforeWebhook}
                className="w-full flex items-center justify-between p-3 rounded bg-caution-amber/20 hover:bg-caution-amber/30 border border-caution-amber/50 text-caution-amber font-bold transition-all"
              >
                <div className="flex items-center space-x-2 text-left">
                  <Clock className="w-4 h-4 shrink-0" />
                  <div>
                    <div>2. Quay về App TRƯỚC khi Webhook xử lý xong (AC3 - NFR)</div>
                    <div className="text-[10px] font-normal opacity-90">
                      Ví hiển thị ĐANG CHỜ (số dư chưa tăng) &rarr; 4 giây sau Webhook tới tự cộng
                      số dư
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>

              {/* 3. AC4: Thanh toán thất bại */}
              <button
                type="button"
                data-testid="sandbox-btn-failed"
                disabled={processingGatewayAction}
                onClick={handleSandboxPayFailed}
                className="w-full flex items-center justify-between p-3 rounded bg-critical-red/15 hover:bg-critical-red/25 border border-critical-red/40 text-critical-red font-bold transition-all"
              >
                <div className="flex items-center space-x-2 text-left">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <div>
                    <div>3. Giả lập Cổng báo lỗi Thất bại (AC4 - Failed)</div>
                    <div className="text-[10px] font-normal opacity-90">
                      Báo lỗi ngân hàng từ chối &rarr; Lưu lý do thất bại, số dư không đổi
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>

              {/* 4. AC4: Tài xế chủ động hủy giao dịch */}
              <button
                type="button"
                data-testid="sandbox-btn-cancel"
                disabled={processingGatewayAction}
                onClick={handleSandboxCancel}
                className="w-full flex items-center justify-between p-3 rounded bg-obsidian hover:bg-hairline border border-hairline text-steel-gray hover:text-tech-white font-bold transition-all"
              >
                <div className="flex items-center space-x-2 text-left">
                  <X className="w-4 h-4 shrink-0" />
                  <div>
                    <div>4. Tài xế chủ động Hủy giao dịch (AC4 - Cancelled)</div>
                    <div className="text-[10px] font-normal opacity-90">
                      Hủy thanh toán và quay về ví &rarr; Hiển thị lý do hủy, số dư không đổi
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CỬA SỔ / MODAL NẠP TIỀN QUA MÃ QR TRUYỀN THỐNG */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-hairline max-w-md w-full rounded-sm p-6 space-y-4 font-mono text-xs shadow-2xl relative animate-scaleUp">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded bg-electric-cyan/20 border border-electric-cyan/40 text-electric-cyan">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-tech-white">NẠP TIỀN VÀO SẠC XE ĐIỆN</h3>
                  <p className="text-[10px] text-steel-gray">CỔNG THANH TOÁN VIETQR / NAPAS 247</p>
                </div>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-steel-gray hover:text-tech-white p-1 rounded hover:bg-hairline transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. Ghi tên người nạp / tài xế */}
            <div className="space-y-1">
              <label className="text-steel-gray block text-[11px] font-bold">
                1. HỌ VÀ TÊN NGƯỜI NẠP / TÀI XẾ (GHI TÊN):
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-steel-gray absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="Nhập họ và tên (VD: Nguyễn Văn Tài)"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  className="w-full bg-obsidian border border-hairline pl-8 pr-3 py-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan text-xs font-sans"
                />
              </div>
            </div>

            {/* 2. Chọn / Nhập số tiền nạp */}
            <div className="space-y-1.5">
              <label className="text-steel-gray block text-[11px] font-bold">
                2. CHỌN HOẶC NHẬP SỐ TIỀN CẦN NẠP (VND):
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {['50000', '100000', '200000', '500000'].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTopupAmount(amt)}
                    className={`py-1.5 rounded border text-center text-[11px] transition-colors ${
                      topupAmount === amt
                        ? 'bg-electric-cyan text-white border-electric-cyan font-bold'
                        : 'bg-obsidian text-steel-gray border-hairline hover:text-tech-white'
                    }`}
                  >
                    {Number(amt) / 1000}k
                  </button>
                ))}
              </div>
              <input
                type="number"
                step="10000"
                min="10000"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                className="w-full bg-obsidian border border-hairline p-2 rounded text-tech-white focus:outline-none focus:border-electric-cyan font-mono tabular-nums text-xs"
              />
            </div>

            {/* 3. Hiển thị mã QR và thông tin chuyển khoản */}
            <div className="bg-obsidian border border-hairline p-3.5 rounded text-center space-y-3">
              <div className="inline-block p-2 bg-white rounded shadow-md">
                <img
                  src={vietQrUrl}
                  alt="Mã QR Chuyển khoản nạp tiền"
                  className="w-44 h-44 object-contain mx-auto"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <div
                  style={{ display: 'none' }}
                  className="w-44 h-44 flex flex-col items-center justify-center bg-gray-100 text-gray-800 p-2"
                >
                  <QrCode className="w-16 h-16 text-gray-700 mb-1" />
                  <span className="text-[10px] font-bold">VIETQR 24/7</span>
                  <span className="text-[9px] text-gray-500">STK: 999988886666</span>
                </div>
              </div>

              <div className="text-[11px] text-left space-y-1 text-steel-gray border-t border-hairline pt-2">
                <div className="flex justify-between">
                  <span>Ngân hàng:</span>
                  <span className="text-tech-white font-bold">MB Bank (Quân Đội)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Số tài khoản:</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-tech-white font-bold tabular-nums">999988886666</span>
                    <button
                      onClick={() => handleCopy('999988886666')}
                      className="text-electric-cyan hover:text-white"
                      title="Sao chép STK"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-grid-green" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span>Người thụ hưởng:</span>
                  <span className="text-tech-white font-bold">EV CSMS CHARGING</span>
                </div>
                <div className="flex justify-between">
                  <span>Số tiền:</span>
                  <span className="text-caution-amber font-bold tabular-nums">
                    {Number(topupAmount || 0).toLocaleString('vi-VN')} VND
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Nội dung CK:</span>
                  <span className="text-grid-green font-bold">{transferContent}</span>
                </div>
              </div>
            </div>

            {/* 4. Nút xác nhận đã chuyển tiền */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleConfirmTransfer}
                disabled={submitting || !payerName.trim() || !topupAmount}
                className="w-full flex items-center justify-center space-x-2 py-3 rounded bg-grid-green hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-lg"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>ĐANG XÁC NHẬN GIAO DỊCH &amp; CỘNG SỐ DƯ...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>XÁC NHẬN ĐÃ CHUYỂN TIỀN</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

