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
  Smartphone,
  Building2,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRight,
  Wallet as WalletIcon,
  Info,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import api from '../services/api';
import { telemetryWs } from '../services/websocket';
import { useAuth } from '../context/AuthContext';
import { formatVNDateTime } from '../utils/formatTime';
import { isPenaltyTransaction } from '../utils/reservationUtils';

// ============================================================================
// HẰNG SỐ & HÀM HELPER THUẦN KHIẾT (PURE FUNCTIONS) CHO VALIDATION & CALLBACK
// (Bảo lưu nguyên vẹn phục vụ Unit Test / Integration Test tại SCRUM-244 & SCRUM-232)
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
// DANH SÁCH CÁC KÊNH THANH TOÁN ĐA DẠNG (MULTI-CHANNEL GATEWAY)
// ============================================================================
export const PAYMENT_CHANNELS = [
  {
    id: 'VIETQR',
    name: 'Chuyển khoản VietQR',
    subname: 'Napas 247 • Quét mã qua 40+ ngân hàng',
    badge: 'Khuyên Dùng',
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    icon: QrCode,
  },
  {
    id: 'CARD',
    name: 'Thẻ Quốc Tế',
    subname: 'Visa, Mastercard, JCB, American Express',
    badge: '3D-Secure',
    badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
    icon: CreditCard,
  },
  {
    id: 'EWALLET',
    name: 'Ví Điện Tử',
    subname: 'MoMo, VNPAY, ZaloPay, ShopeePay',
    badge: 'Siêu Tốc',
    badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
    icon: Smartphone,
  },
  {
    id: 'ATM',
    name: 'Thẻ ATM Nội Địa',
    subname: 'Thẻ ghi nợ Napas kết nối 40+ Ngân hàng Việt Nam',
    badge: 'Napas 247',
    badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
    icon: Building2,
  },
];

// Danh sách ngân hàng tiêu biểu
const POPULAR_BANKS = [
  { code: 'MB', name: 'MB Bank', full: 'Ngân hàng Quân Đội', logoText: 'MB' },
  { code: 'VCB', name: 'Vietcombank', full: 'Ngoại Thương Việt Nam', logoText: 'VCB' },
  { code: 'TCB', name: 'Techcombank', full: 'Kỹ Thương Việt Nam', logoText: 'TCB' },
  { code: 'BIDV', name: 'BIDV', full: 'Đầu Tư & Phát Triển', logoText: 'BIDV' },
  { code: 'CTG', name: 'VietinBank', full: 'Công Thương Việt Nam', logoText: 'CTG' },
  { code: 'ACB', name: 'ACB', full: 'Á Châu', logoText: 'ACB' },
  { code: 'VPB', name: 'VPBank', full: 'Việt Nam Thịnh Vượng', logoText: 'VPB' },
  { code: 'TPB', name: 'TPBank', full: 'Tiên Phong', logoText: 'TPB' },
];

// ============================================================================
// COMPONENT CHÍNH: MÀN HÌNH VÍ ĐIỆN TỬ & CỔNG THANH TOÁN SANDBOX ĐA PHƯƠNG THỨC
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

  // Kênh thanh toán được chọn ở form chính: 'VIETQR' | 'CARD' | 'EWALLET' | 'ATM'
  const [selectedChannel, setSelectedChannel] = useState('VIETQR');

  // State cho Form Nạp tiền (SCRUM-242)
  const [sandboxAmount, setSandboxAmount] = useState('100000');
  const [amountError, setAmountError] = useState('');
  const [creatingOrder, setCreatingOrder] = useState(false);

  // State cho Cổng Thanh Toán Sandbox (WebView / Checkout Simulator)
  const [sandboxCheckout, setSandboxCheckout] = useState(null);
  const [activeGatewayTab, setActiveGatewayTab] = useState('VIETQR');
  const [processingGatewayAction, setProcessingGatewayAction] = useState(false);
  const [delayedWebhookCountdown, setDelayedWebhookCountdown] = useState(0);

  // State hỗ trợ kiểm thử / Dev Sandbox drawer
  const [showDevSandboxTools, setShowDevSandboxTools] = useState(false);

  // State mô phỏng form thẻ Quốc Tế (Visa / Mastercard)
  const [cardForm, setCardForm] = useState({
    cardNumber: '4242 4242 4242 4242',
    cardHolder: (user?.full_name || guestName || 'TRAN THI BICH NGOC').toUpperCase(),
    expiry: '12/28',
    cvv: '888',
  });
  const [cardProcessingStep, setCardProcessingStep] = useState(''); // 'ENCRYPTING' | '3DSECURE' | 'APPROVED' | ''

  // State mô phỏng ví điện tử & thẻ nội địa
  const [selectedEwallet, setSelectedEwallet] = useState('MOMO'); // 'MOMO' | 'VNPAY' | 'ZALOPAY'
  const [selectedAtmBank, setSelectedAtmBank] = useState('MB');
  const [atmCardNumber, setAtmCardNumber] = useState('9704 2200 1234 5678');

  // Đếm ngược phiên thanh toán an toàn (15 phút)
  const [checkoutCountdown, setCheckoutCountdown] = useState(900);

  // Thông báo trạng thái trên màn hình Ví (SUCCESS / PENDING / FAILED / CANCELLED)
  const [bannerAlert, setBannerAlert] = useState(null);

  // Trạng thái cửa sổ / Modal nạp tiền qua QR truyền thống (Bảo lưu)
  const [showQrModal, setShowQrModal] = useState(false);
  const [payerName, setPayerName] = useState(
    () => user?.full_name || guestName || 'Trần Thị Bích Ngọc'
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

  // Tự động cập nhật tên chủ thẻ khi user thay đổi
  useEffect(() => {
    if (user?.full_name) {
      setCardForm((prev) => ({
        ...prev,
        cardHolder: user.full_name.toUpperCase(),
      }));
      setPayerName(user.full_name);
    }
  }, [user]);

  // Bộ đếm ngược thời gian phiên checkout 15 phút
  useEffect(() => {
    if (!sandboxCheckout) {
      setCheckoutCountdown(900);
      return undefined;
    }
    const timer = setInterval(() => {
      setCheckoutCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [sandboxCheckout]);

  // Format đếm ngược mm:ss
  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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
        title: 'Thanh toán thành công! Đã nạp tiền vào ví',
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
          : `Giao dịch #${failedOrder.order_code} không thành công`,
        detail:
          failedOrder.failure_reason ||
          (isCancelled
            ? 'Bạn đã chủ động hủy thanh toán. Số dư ví không thay đổi.'
            : 'Cổng thanh toán từ chối giao dịch. Vui lòng kiểm tra lại phương thức thanh toán.'),
      });
    },
    pollIntervalMs: 2000,
  });

  useEffect(() => {
    fetchWalletData();
  }, [token, user, fetchWalletData]);

  // ============================================================================
  // XỬ LÝ CALLBACK / RETURN URL KHI TÀI XẾ QUAY VỀ TỪ CỔNG THANH TOÁN (SCRUM-239 & 240)
  // ============================================================================
  useEffect(() => {
    const callbackInfo = parseTopupReturnParams(`?${searchParams.toString()}`);
    if (!callbackInfo.hasCallback) return;

    const { orderCode, clientHintStatus, clientMessage } = callbackInfo;

    // RÀNG BUỘC NFR: Tuyệt đối KHÔNG cộng tiền vào state `wallet.balance` tại đây!
    if (clientHintStatus === 'PENDING') {
      setBannerAlert({
        type: 'PENDING',
        title: `Đang chờ xác nhận giao dịch #${orderCode}...`,
        detail:
          'Hệ thống đang đồng bộ với cổng thanh toán. Số dư ví sẽ tự động cập nhật ngay khi nhận được tín hiệu xác thực.',
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
          'Giao dịch không thành công tại cổng thanh toán. Số dư ví được bảo toàn nguyên vẹn.',
      });
    } else {
      setBannerAlert({
        type: 'PENDING',
        title: `Đang đồng bộ kết quả giao dịch #${orderCode}...`,
        detail: 'Hệ thống đang xác thực chữ ký bảo mật Webhook trước khi ghi nhận vào sổ cái ví.',
      });
    }

    upsertTopupOrder({
      order_code: orderCode,
      status: 'PENDING',
      amount: Number(sandboxAmount) || 100000,
      created_at: new Date().toISOString(),
    });
    checkOrderStatusNow(orderCode);

    const cleanParams = new URLSearchParams(searchParams);
    cleanParams.delete('order_code');
    cleanParams.delete('status');
    cleanParams.delete('message');
    cleanParams.delete('reason');
    setSearchParams(cleanParams, { replace: true });
  }, [searchParams, setSearchParams, upsertTopupOrder, checkOrderStatusNow, sandboxAmount]);

  useEffect(() => {
    if (delayedWebhookCountdown <= 0) return undefined;
    const timer = setInterval(() => {
      setDelayedWebhookCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [delayedWebhookCountdown]);

  // ============================================================================
  // XỬ LÝ KHỞI TẠO ĐƠN NẠP VÀ MỞ CỔNG THANH TOÁN (SCRUM-242)
  // ============================================================================
  const handleSandboxAmountChange = (val) => {
    setSandboxAmount(val);
    const validation = validateTopupAmount(val);
    setAmountError(validation.isValid ? '' : validation.error);
  };

  const handleCreateTopupOrder = async (e) => {
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

      const channelName =
        PAYMENT_CHANNELS.find((c) => c.id === selectedChannel)?.name || 'Cổng thanh toán EV-Pay';

      // Gọi API tạo giao dịch nạp ở trạng thái chờ (PENDING)
      const res = await api.post('/wallet/topup-requests', {
        amount: validation.amount,
        full_name: (payerName || user?.full_name || 'Tài xế EV').trim(),
        note: `Nạp tiền ví qua ${channelName}`,
      });

      const { order_id: orderId, redirect_url: redirectUrl } = res.data;
      const parsedGateway = parseSandboxRedirectUrl(redirectUrl, orderId, validation.amount);

      // Thêm ngay giao dịch PENDING vào danh sách (Số dư chưa đổi!)
      upsertTopupOrder({
        order_code: parsedGateway.orderCode,
        amount: parsedGateway.amount,
        status: 'PENDING',
        failure_reason: null,
        created_at: new Date().toISOString(),
      });

      // Mở modal Cổng thanh toán với tab được chọn trước
      setActiveGatewayTab(selectedChannel);
      setSandboxCheckout(parsedGateway);
      setCheckoutCountdown(900);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      setAmountError(`Không thể khởi tạo giao dịch: ${detail}`);
    } finally {
      setCreatingOrder(false);
    }
  };

  // ============================================================================
  // HÀM XÁC THỰC THANH TOÁN AN TOÀN QUA WEBHOOK & CHỮ KÝ HMAC
  // ============================================================================
  const executeGatewayPayment = async (status = 'SUCCESS', failureReason = '') => {
    if (!sandboxCheckout) return;
    try {
      setProcessingGatewayAction(true);
      const { orderCode } = sandboxCheckout;

      // 1. Lấy chữ ký HMAC-SHA256 chuẩn xác từ Backend Sandbox Signer
      let signature = sandboxCheckout.signature;
      try {
        const signRes = await api.post('/payments/sandbox/sign', {
          order_code: orderCode,
          status,
        });
        if (signRes.data?.signature) {
          signature = signRes.data.signature;
        }
      } catch (signErr) {
        console.warn('Sandbox signing endpoint fallback:', signErr);
        signature = signature || 'test_valid_signature';
      }

      // 2. Gửi Webhook chính thức
      const channelLabel =
        PAYMENT_CHANNELS.find((c) => c.id === activeGatewayTab)?.name || 'Cổng thanh toán';
      const message =
        status === 'SUCCESS'
          ? `Thanh toán thành công qua ${channelLabel} (EV-CSMS Pay)`
          : failureReason || 'Giao dịch bị từ chối tại cổng thanh toán';

      await api.post('/payments/webhook', {
        order_code: orderCode,
        status,
        message,
        signature,
      });

      setSandboxCheckout(null);

      // Điều hướng về màn hình kết quả
      const targetUrl =
        status === 'SUCCESS'
          ? `/wallet/topup/result?order_code=${orderCode}&status=SUCCESS`
          : `/wallet/topup/result?order_code=${orderCode}&status=${status}&message=${encodeURIComponent(
              message
            )}`;
      navigate(targetUrl);
    } catch (err) {
      alert('Lỗi xử lý giao dịch tại cổng thanh toán: ' + (err.response?.data?.detail || err.message));
    } finally {
      setProcessingGatewayAction(false);
      setCardProcessingStep('');
    }
  };

  // Kịch bản 1 (AC1 & AC2): Thanh toán thành công
  const handleSandboxPaySuccess = async () => {
    await executeGatewayPayment('SUCCESS');
  };

  // Thanh toán Thẻ quốc tế với mô phỏng 3D-Secure
  const handlePayWithCreditCard = async () => {
    setProcessingGatewayAction(true);
    setCardProcessingStep('ENCRYPTING');

    setTimeout(() => {
      setCardProcessingStep('3DSECURE');
      setTimeout(async () => {
        setCardProcessingStep('APPROVED');
        setTimeout(async () => {
          await executeGatewayPayment('SUCCESS');
        }, 800);
      }, 1000);
    }, 800);
  };

  // Kịch bản 2 (AC3): Quay về App TRƯỚC khi Webhook xử lý xong -> Ví hiện PENDING -> 4s sau Webhook tới -> Tự cập nhật số dư
  const handleSandboxReturnBeforeWebhook = () => {
    if (!sandboxCheckout) return;
    const { orderCode } = sandboxCheckout;

    setSandboxCheckout(null);
    setDelayedWebhookCountdown(4);

    navigate(`/wallet/topup/result?order_code=${orderCode}&status=PENDING`);

    setTimeout(async () => {
      try {
        let signature = sandboxCheckout.signature;
        try {
          const signRes = await api.post('/payments/sandbox/sign', {
            order_code: orderCode,
            status: 'SUCCESS',
          });
          if (signRes.data?.signature) signature = signRes.data.signature;
        } catch {
          signature = signature || 'test_valid_signature';
        }

        await api.post('/payments/webhook', {
          order_code: orderCode,
          status: 'SUCCESS',
          message: 'Webhook Sandbox xử lý hoàn tất (đến sau khi tài xế quay về ví)',
          signature,
        });
      } catch (err) {
        console.error('Lỗi gửi Webhook trễ:', err);
      }
    }, 4000);
  };

  // Kịch bản 3 (AC4 - Failed): Cổng thanh toán báo lỗi thất bại
  const handleSandboxPayFailed = async () => {
    const reason = 'Ngân hàng phát hành từ chối giao dịch (Thẻ vượt hạn mức ngày hoặc số dư không đủ)';
    await executeGatewayPayment('FAILED', reason);
  };

  // Kịch bản 4 (AC4 - Cancelled): Tài xế chủ động hủy giao dịch
  const handleSandboxCancel = async () => {
    const reason = 'Khách hàng chủ động hủy thanh toán tại cổng giao dịch';
    await executeGatewayPayment('CANCELLED', reason);
  };

  // Nút hỗ trợ kích hoạt Webhook trực tiếp cho một đơn đang PENDING trong danh sách
  const handleTriggerWebhookForOrder = async (orderCode) => {
    try {
      let signature = 'test_valid_signature';
      try {
        const signRes = await api.post('/payments/sandbox/sign', {
          order_code: orderCode,
          status: 'SUCCESS',
        });
        if (signRes.data?.signature) signature = signRes.data.signature;
      } catch {
        // fallback
      }

      await api.post('/payments/webhook', {
        order_code: orderCode,
        status: 'SUCCESS',
        message: 'Xác nhận Webhook từ cổng Sandbox',
        signature,
      });
      await checkOrderStatusNow(orderCode);
    } catch (err) {
      alert('Không thể gửi Webhook: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Xác nhận nạp tiền qua QR truyền thống (Bảo lưu tính tương thích)
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

  // Helper định dạng số thẻ tự động thêm dấu cách 4 số
  const handleCardNumberChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
    const formatted = raw.replace(/(\d{4})/g, '$1 ').trim();
    setCardForm((prev) => ({ ...prev, cardNumber: formatted }));
  };

  const handleExpiryChange = (e) => {
    let raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (raw.length >= 3) {
      raw = raw.slice(0, 2) + '/' + raw.slice(2);
    }
    setCardForm((prev) => ({ ...prev, expiry: raw }));
  };

  // Nhận diện loại thẻ tín dụng qua số đầu
  const getCardBrand = (num) => {
    const clean = (num || '').replace(/\s/g, '');
    if (clean.startsWith('4')) return 'VISA';
    if (/^5[1-5]/.test(clean) || /^2[2-7]/.test(clean)) return 'MASTERCARD';
    if (/^3[47]/.test(clean)) return 'AMEX';
    if (/^35/.test(clean)) return 'JCB';
    return 'VISA';
  };

  const balance = wallet ? Number(wallet.balance) : 0;
  const currentAmountNum = parseFloat(sandboxAmount) || 100000;
  const checkoutOrderCode = sandboxCheckout?.orderCode || 'ORDER_DEMO';
  const transferContent = checkoutOrderCode;
  const vietQrUrl = `https://api.vietqr.io/image/970422-999988886666-compact2.png?amount=${
    sandboxCheckout?.amount || currentAmountNum
  }&addInfo=${encodeURIComponent(transferContent)}&accountName=CONG%20TY%20EV%20CSMS`;

  // SCRUM-378: Lọc giao dịch theo loại (Tất cả, Nạp tiền, Cước sạc, Phí quá hạn)
  const penaltyTxs = useMemo(
    () => (Array.isArray(transactions) ? transactions.filter(isPenaltyTransaction) : []),
    [transactions]
  );
  const totalPenaltyAmount = useMemo(() => {
    return penaltyTxs.reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  }, [penaltyTxs]);

  const topupTxsCount = useMemo(
    () =>
      Array.isArray(transactions)
        ? transactions.filter((tx) => tx.transaction_type === 'TOPUP').length
        : 0,
    [transactions]
  );
  const chargeTxsCount = useMemo(
    () =>
      Array.isArray(transactions)
        ? transactions.filter(
            (tx) => tx.transaction_type === 'CHARGE_FEE' && !isPenaltyTransaction(tx)
          ).length
        : 0,
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-500 dark:text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-3 text-sky-500" />
        <span className="font-medium text-sm">Đang tải thông tin ví và sổ cái thanh toán...</span>
      </div>
    );
  }

  if (error403) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-xl text-center space-y-4 shadow-sm">
        <div className="mx-auto w-12 h-12 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center rounded-full mb-3 border border-rose-200 dark:border-rose-800/40">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-sans">
          Truy Cập Bị Từ Chối (403 Forbidden)
        </h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md mx-auto">
          Bạn không có quyền xem thông tin ví của người dùng khác. Vui lòng đăng nhập đúng tài khoản để thực hiện thao tác.
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-6 rounded-xl text-center text-rose-800 dark:text-rose-300 space-y-3">
        <AlertOctagon className="w-6 h-6 mx-auto mb-2 text-rose-600" />
        <p className="font-bold text-sm">Lỗi tải dữ liệu ví</p>
        <p className="text-xs opacity-90">{errorMsg}</p>
        <button
          onClick={() => fetchWalletData(false)}
          className="mt-3 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
        >
          Thử Lại
        </button>
      </div>
    );
  }

  // Render Badge trạng thái chuẩn WCAG AA
  const renderOrderStatusBadge = (status) => {
    const st = String(status || 'PENDING').toUpperCase();
    if (st === 'SUCCESS') {
      return (
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Thành công</span>
        </span>
      );
    }
    if (st === 'FAILED') {
      return (
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
          <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span>Thất bại</span>
        </span>
      );
    }
    if (st === 'CANCELLED') {
      return (
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          <X className="w-3.5 h-3.5 text-slate-500" />
          <span>Đã hủy</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 animate-pulse">
        <Clock className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400" />
        <span>Đang xử lý</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Headline & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Hệ Thống EV CSMS</span>
            <span>/</span>
            <span className="text-sky-600 dark:text-sky-400">Ví Điện Tử &amp; Nạp Tiền</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">
            Cổng Thanh Toán &amp; Ví Nạp Tiền Đa Kênh
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Hỗ trợ Chuyển khoản VietQR 24/7, Thẻ Quốc Tế Visa/Mastercard, Ví MoMo/VNPay và Thẻ ATM Nội địa.
          </p>
        </div>

        {/* Trạng thái kết nối Realtime Polling */}
        <div className="flex items-center space-x-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-1.5 rounded-lg shadow-sm">
          <Radio
            className={`w-3.5 h-3.5 ${
              isPolling ? 'text-amber-500 animate-ping' : 'text-emerald-500'
            }`}
          />
          <span className={isPolling ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}>
            {isPolling
              ? 'Đang lắng nghe Webhook (Polling 2s)...'
              : 'Đồng bộ Realtime sẵn sàng'}
          </span>
        </div>
      </div>

      {/* Banner hướng dẫn vai trò nếu đang đăng nhập Admin / Kế toán */}
      {user && user.role !== 'CUSTOMER' && (
        <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-lg">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Bạn đang xem ví với tài khoản quản trị: {user.full_name || user.username} ({user.role}).
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                Để kiểm tra luồng nạp tiền và cước sạc thực tế của Tài xế (driver_vip - Trần Thị Bích Ngọc), hãy bấm chuyển vai trò.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => quickSwitch && quickSwitch('CUSTOMER')}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shrink-0 shadow-sm"
          >
            <span>Chuyển sang Tài xế (driver_vip)</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Banner thông báo kết quả Callback / Webhook */}
      {bannerAlert && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-3 shadow-sm ${
            bannerAlert.type === 'SUCCESS'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : bannerAlert.type === 'PENDING'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-start space-x-3">
            {bannerAlert.type === 'SUCCESS' && (
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            )}
            {bannerAlert.type === 'PENDING' && (
              <RefreshCw className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400 animate-spin" />
            )}
            {bannerAlert.type === 'ERROR' && (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            )}
            <div className="space-y-1">
              <div className="font-bold text-sm">{bannerAlert.title}</div>
              <div className="opacity-90 leading-relaxed">{bannerAlert.detail}</div>
              {delayedWebhookCountdown > 0 && bannerAlert.type === 'PENDING' && (
                <div className="text-[11px] font-semibold underline pt-1 text-amber-700 dark:text-amber-300">
                  ⏳ Webhook đang xử lý ngầm, sẽ tự động bắn về Server sau {delayedWebhookCountdown} giây...
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setBannerAlert(null)}
            className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Cột trái (Số dư + Cổng Nạp Đa Kênh) & Cột phải (Lịch sử đơn nạp & Sổ cái) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5/12 cols): Balance & Multi-channel Topup Form */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Card Số dư khả dụng hiện tại */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center space-x-1.5 font-medium">
                <WalletIcon className="w-4 h-4 text-sky-500" />
                <span>SỐ DƯ KHẢ DỤNG</span>
              </div>
              <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                <User className="w-3 h-3 text-sky-500" />
                <span>{user?.full_name || 'Tài xế EV'}</span>
              </div>
            </div>

            <div className="tabular-nums">
              <div
                data-testid="wallet-balance-value"
                className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
                  balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {balance.toLocaleString('vi-VN')}{' '}
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">VND</span>
              </div>
            </div>

            {/* Trạng thái công nợ / điều kiện sạc */}
            {balance < 0 ? (
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 p-3 rounded-lg text-xs text-rose-800 dark:text-rose-300 flex items-start space-x-2.5">
                <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <div>
                  <div className="font-bold">Tài khoản đang ghi nợ cước sạc</div>
                  <div className="text-[11px] opacity-90 mt-0.5">
                    Vui lòng nạp tiền để số dư &ge; 50,000 VND để tiếp tục sử dụng trụ sạc.
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-3 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium">Số dư đủ điều kiện khởi động phiên sạc mới (&ge; 50.000 đ)</span>
              </div>
            )}

            {/* Quick Policies */}
            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Hạn mức nạp mỗi lần:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">10,000 - 50,000,000 VND</span>
              </div>
              <div className="flex justify-between">
                <span>Số dư tối thiểu mở trụ:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">50,000 VND</span>
              </div>
              <div className="flex justify-between">
                <span>Phí nạp tiền:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Miễn phí 100%</span>
              </div>
            </div>
          </div>

          {/* 2. Form Nạp Tiền Đa Kênh (Multi-channel Topup) */}
          <form
            onSubmit={handleCreateTopupOrder}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    Nạp Tiền Vào Ví Điện Tử
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Chọn phương thức &amp; số tiền cần nạp</p>
                </div>
              </div>
              <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                AN TOÀN PCI-DSS
              </span>
            </div>

            {/* Bước 1: Chọn phương thức thanh toán */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                1. CHỌN HÌNH THỨC THANH TOÁN:
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {PAYMENT_CHANNELS.map((ch) => {
                  const Icon = ch.icon;
                  const isSelected = selectedChannel === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setSelectedChannel(ch.id)}
                      className={`p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between ${
                        isSelected
                          ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/30 ring-1 ring-sky-500'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-start justify-between w-full mb-1">
                        <div
                          className={`p-1.5 rounded-md ${
                            isSelected
                              ? 'bg-sky-500 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${ch.badgeClass}`}
                        >
                          {ch.badge}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {ch.name}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                          {ch.subname}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bước 2: Chọn nhanh mệnh giá */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                2. CHỌN NHANH MỆNH GIÁ (VND):
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {QUICK_TOPUP_AMOUNTS.map((amt) => {
                  const isSelected = Number(sandboxAmount) === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleSandboxAmountChange(String(amt))}
                      className={`py-2 px-1 rounded-lg border text-center font-semibold transition-all ${
                        isSelected
                          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      +{amt >= 1000000 ? `${amt / 1000000}Tr` : `${amt / 1000}k`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bước 3: Hoặc nhập số tiền tùy ý */}
            <div className="space-y-1.5">
              <label
                htmlFor="sandbox-amount-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                3. HOẶC NHẬP SỐ TIỀN CẦN NẠP:
              </label>
              <div className="relative">
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
                  className={`w-full bg-slate-50 dark:bg-slate-800/80 border p-2.5 rounded-lg text-slate-900 dark:text-slate-100 tabular-nums text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    amountError
                      ? 'border-rose-500 focus:ring-rose-500'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                  VND
                </span>
              </div>

              {amountError ? (
                <p
                  data-testid="sandbox-amount-error"
                  className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center space-x-1 font-medium mt-1"
                >
                  <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                  <span>{amountError}</span>
                </p>
              ) : (
                /* Bảng tính số dư sau nạp */
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-2.5 rounded-lg text-[11px] space-y-1 text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Số dư hiện tại:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {balance.toLocaleString('vi-VN')} VND
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Số tiền nạp thêm:</span>
                    <span className="font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                      +{Number(sandboxAmount || 0).toLocaleString('vi-VN')} VND
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 text-slate-900 dark:text-slate-100 font-bold">
                    <span>Dự kiến sau nạp:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {(balance + Number(sandboxAmount || 0)).toLocaleString('vi-VN')} VND
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Nút Submit chính */}
            <button
              type="submit"
              data-testid="sandbox-submit-btn"
              disabled={creatingOrder || Boolean(amountError)}
              className="w-full flex items-center justify-center space-x-2 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-sky-600/20"
            >
              {creatingOrder ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>ĐANG TẠO ĐƠN &amp; MỞ CỔNG THANH TOÁN...</span>
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  <span>
                    TIẾP TỤC THANH TOÁN • {Number(sandboxAmount || 0).toLocaleString('vi-VN')} VND
                  </span>
                </>
              )}
            </button>

            {/* Security note */}
            <div className="text-center text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center space-x-1.5 pt-1">
              <Lock className="w-3 h-3 text-emerald-500" />
              <span>Giao dịch được mã hóa SSL 256-bit • Tiêu chuẩn an toàn ngân hàng</span>
            </div>
          </form>
        </div>

        {/* Right Column (7/12 cols): Đơn nạp Sandbox & Lịch sử sổ cái */}
        <div className="lg:col-span-7 space-y-6">
          {/* BẢNG 1: TRẠNG THÁI ĐƠN NẠP CỔNG THANH TOÁN (REALTIME / POLLING) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-sky-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Trạng Thái Đơn Nạp Gần Đây (Realtime / Polling)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => fetchWalletData(true)}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isPolling ? 'animate-spin' : ''}`} />
                <span>Làm mới</span>
              </button>
            </div>

            {topupOrders.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-8 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800">
                Chưa có yêu cầu nạp tiền nào. Hãy chọn hình thức và số tiền bên trái để thực hiện giao dịch nạp.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="pb-2.5 font-semibold">MÃ ĐƠN HÀNG</th>
                      <th className="pb-2.5 font-semibold">SỐ TIỀN</th>
                      <th className="pb-2.5 font-semibold">TRẠNG THÁI</th>
                      <th className="pb-2.5 font-semibold">GHI CHÚ / KẾT QUẢ</th>
                      <th className="pb-2.5 font-semibold text-right">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {topupOrders.map((order) => {
                      const statusUpper = String(order.status || 'PENDING').toUpperCase();
                      return (
                        <tr
                          key={order.order_code}
                          data-testid={`topup-order-row-${order.order_code}`}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2.5 font-semibold text-slate-900 dark:text-slate-100 font-mono">
                            {order.order_code}
                          </td>
                          <td className="py-2.5 font-bold tabular-nums text-sky-600 dark:text-sky-400">
                            +{Number(order.amount || 0).toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-2.5">{renderOrderStatusBadge(statusUpper)}</td>
                          <td className="py-2.5 text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate">
                            {statusUpper === 'PENDING' && (
                              <span className="text-amber-600 dark:text-amber-400">
                                Đang chờ thanh toán &amp; Webhook...
                              </span>
                            )}
                            {statusUpper === 'SUCCESS' && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                Đã nạp thành công vào ví
                              </span>
                            )}
                            {(statusUpper === 'FAILED' || statusUpper === 'CANCELLED') && (
                              <span className="text-rose-600 dark:text-rose-400">
                                {order.failure_reason || 'Giao dịch bị từ chối'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            {statusUpper === 'PENDING' ? (
                              <div className="inline-flex items-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleTriggerWebhookForOrder(order.order_code)}
                                  className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-[10px] font-bold hover:bg-emerald-100 transition-colors"
                                  title="Xác nhận thanh toán thành công ngay"
                                >
                                  Bắn Webhook OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => checkOrderStatusNow(order.order_code)}
                                  className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 text-[10px] transition-colors"
                                >
                                  Kiểm tra
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Lịch Sử Biến Động Số Dư Sổ Cái (Ledger)
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Hiển thị {filteredTransactions.length} / {transactions.length} Giao dịch
                </p>
              </div>

              {/* Phím tắt giả lập & Đặt chỗ */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleSimulatePenaltyTx}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[11px] font-medium transition-colors inline-flex items-center space-x-1"
                  title="Thêm 1 giao dịch mẫu trừ phí quá hạn giữ chỗ để đối soát trên ví"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>+ Mẫu Phí Quá Hạn</span>
                </button>

                <Link
                  to="/reservations"
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 text-[11px] font-medium transition-colors inline-flex items-center space-x-1"
                >
                  <Clock className="w-3.5 h-3.5 text-sky-500" />
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
                    className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                      isSelected
                        ? tab.highlight
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-sky-600 text-white shadow-sm'
                        : tab.highlight && tab.count > 0
                        ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected ? 'bg-black/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Cảnh báo phí phạt giữ chỗ */}
            {penaltyTxs.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Có <strong>{penaltyTxs.length}</strong> khoản phí giữ chỗ quá 15 phút không nhận trụ (Tổng: <strong className="text-rose-600 dark:text-rose-400">-{totalPenaltyAmount.toLocaleString('vi-VN')} đ</strong>).
                  </span>
                </div>
                <Link
                  to="/reservations?tab=EXPIRED"
                  className="text-amber-700 dark:text-amber-300 font-bold underline hover:text-amber-900 shrink-0 ml-3"
                >
                  Chi tiết &rarr;
                </Link>
              </div>
            )}

            <div className="overflow-x-auto">
              {filteredTransactions.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-10">
                  {txFilter === 'PENALTY'
                    ? 'Không có khoản phí phạt giữ chỗ quá hạn nào.'
                    : 'Chưa có lịch sử biến động số dư nào được ghi nhận.'}
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="pb-2 font-semibold">MÃ GD</th>
                      <th className="pb-2 font-semibold">LOẠI GIAO DỊCH</th>
                      <th className="pb-2 font-semibold">SỐ TIỀN</th>
                      <th className="pb-2 font-semibold">GHI CHÚ / THAM CHIẾU</th>
                      <th className="pb-2 font-semibold">THỜI GIAN</th>
                      <th className="pb-2 font-semibold text-right">CHI TIẾT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
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
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                            isPenalty ? 'bg-amber-500/5' : ''
                          }`}
                        >
                          <td className="py-2.5 text-slate-500 font-mono">#{tx.id}</td>
                          <td className="py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                isCredit
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : isPenalty
                                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 inline-flex items-center space-x-1'
                                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                              }`}
                            >
                              {isPenalty && <Clock className="w-2.5 h-2.5 mr-0.5" />}
                              {isPenalty ? 'PHÍ QUÁ HẠN GIỮ CHỖ' : tx.transaction_type}
                            </span>
                          </td>
                          <td
                            className={`py-2.5 font-bold tabular-nums ${
                              isCredit
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : isPenalty
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {isCredit ? '+' : '-'}
                            {Math.abs(amountNum).toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-2.5 text-slate-600 dark:text-slate-400 text-[11px] max-w-xs truncate">
                            {tx.note || (isPenalty ? 'Phí giữ chỗ quá hạn không tới nhận trụ' : '—')}
                          </td>
                          <td className="py-2.5 text-slate-500 text-[11px]">
                            {formatVNDateTime(tx.created_at)}
                          </td>
                          <td className="py-2.5 text-right">
                            <Link
                              to={targetLink}
                              className={`inline-flex items-center text-[11px] font-semibold transition-colors p-1 ${
                                isPenalty
                                  ? 'text-amber-600 hover:text-amber-700'
                                  : 'text-sky-600 hover:text-sky-700'
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
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex items-center justify-between text-xs text-slate-500">
                <div>
                  Đang hiển thị {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{' '}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredTransactions.length)} trong tổng số{' '}
                  {filteredTransactions.length} giao dịch
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Trang trước
                  </button>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {currentPage} / {totalPages || 1}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          MODAL CỔNG THANH TOÁN EV-PAY CHECKOUT ĐA KÊNH HIỆN ĐẠI (PRODUCTION GRADE)
          Tích hợp VietQR, Thẻ Visa/Mastercard, Ví MoMo/VNPay và Thẻ ATM Nội địa
          Đồng thời bảo lưu trọn vẹn 4 kịch bản kiểm thử AC1, AC2, AC3, AC4 của SCRUM-232
         ============================================================================ */}
      {sandboxCheckout && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-2xl w-full rounded-2xl shadow-2xl overflow-hidden my-auto animate-scaleUp">
            {/* Header Cổng Thanh Toán Chuẩn SSL */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-base tracking-tight">CỔNG THANH TOÁN EV-PAY</h3>
                    <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      SSL 256-BIT
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Hệ thống thanh toán sạc xe điện an toàn &bull; Đơn hàng #{sandboxCheckout.orderCode}
                  </p>
                </div>
              </div>

              {/* Đồng hồ đếm ngược 15:00 & Nút đóng */}
              <div className="flex items-center space-x-3">
                <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-amber-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatCountdown(checkoutCountdown)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSandboxCheckout(null)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Đóng cửa sổ thanh toán"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Thanh thông tin đơn hàng tóm tắt */}
            <div className="bg-slate-50 dark:bg-slate-800/60 px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Khách hàng: </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {user?.full_name || guestName || 'Trần Thị Bích Ngọc'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-slate-500 dark:text-slate-400">Tổng thanh toán:</span>
                <span className="text-base font-extrabold text-sky-600 dark:text-sky-400 tabular-nums">
                  {Number(sandboxCheckout.amount).toLocaleString('vi-VN')} VND
                </span>
              </div>
            </div>

            {/* Navigation Tabs Phương Thức Thanh Toán Bên Trong Modal */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-5">
              <div className="flex space-x-2 overflow-x-auto no-scrollbar py-2">
                {PAYMENT_CHANNELS.map((ch) => {
                  const Icon = ch.icon;
                  const isActive = activeGatewayTab === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setActiveGatewayTab(ch.id)}
                      className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                        isActive
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{ch.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nội Dung Chi Tiết Từng Phương Thức Thanh Toán */}
            <div className="p-5 sm:p-6 space-y-6">
              {/* ============================================================== */}
              {/* TAB 1: CHUYỂN KHOẢN VIETQR (NAPAS 24/7) */}
              {/* ============================================================== */}
              {activeGatewayTab === 'VIETQR' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  {/* Mã QR Thông Minh */}
                  <div className="md:col-span-5 flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="p-2.5 bg-white rounded-xl shadow-md border border-slate-200">
                      <img
                        src={vietQrUrl}
                        alt="Mã VietQR Thanh Toán"
                        className="w-48 h-48 object-contain mx-auto"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                      <div
                        style={{ display: 'none' }}
                        className="w-48 h-48 flex flex-col items-center justify-center bg-slate-100 text-slate-800 p-2 text-center"
                      >
                        <QrCode className="w-16 h-16 text-slate-700 mb-2" />
                        <span className="text-xs font-bold">VIETQR 24/7</span>
                        <span className="text-[10px] text-slate-500">STK: 999988886666</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 animate-pulse">
                      <Radio className="w-3.5 h-3.5" />
                      <span>Đang chờ quét mã chuyển khoản...</span>
                    </div>
                  </div>

                  {/* Thông tin chuyển khoản chi tiết */}
                  <div className="md:col-span-7 space-y-3 text-xs">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 dark:text-slate-400">Ngân hàng thụ hưởng:</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          MB Bank (Quân Đội)
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 dark:text-slate-400">Số tài khoản:</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                            999988886666
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy('999988886666')}
                            className="p-1 rounded text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-700 transition-colors"
                            title="Sao chép STK"
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 dark:text-slate-400">Người thụ hưởng:</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          CONG TY CP CONG NGHE EV CSMS
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 dark:text-slate-400">Số tiền chính xác:</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-extrabold text-sky-600 dark:text-sky-400 text-sm font-mono tabular-nums">
                            {Number(sandboxCheckout.amount).toLocaleString('vi-VN')} VND
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(String(sandboxCheckout.amount))}
                            className="p-1 rounded text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-700 transition-colors"
                            title="Sao chép số tiền"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">
                          Nội dung chuyển khoản:
                        </span>
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 rounded font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            {transferContent}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(transferContent)}
                            className="p-1 rounded text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-700 transition-colors"
                            title="Sao chép nội dung"
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Nút hành động */}
                    <button
                      type="button"
                      disabled={processingGatewayAction}
                      onClick={() => executeGatewayPayment('SUCCESS')}
                      className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-600/20"
                    >
                      {processingGatewayAction ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>ĐANG ĐỐI SOÁT SAO KÊ NGÂN HÀNG...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>XÁC NHẬN ĐÃ CHUYỂN KHOẢN THÀNH CÔNG</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB 2: THẺ QUỐC TẾ (VISA / MASTERCARD / JCB) */}
              {/* ============================================================== */}
              {activeGatewayTab === 'CARD' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  {/* Mô Phỏng Thẻ 3D Kim Loại Tương Tác */}
                  <div className="md:col-span-5 flex flex-col items-center">
                    <div className="w-full max-w-[280px] h-[175px] rounded-2xl p-4 bg-gradient-to-tr from-slate-900 via-sky-950 to-indigo-900 text-white shadow-xl relative flex flex-col justify-between border border-slate-700 overflow-hidden">
                      {/* Hologram background circles */}
                      <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-sky-500/20 blur-xl pointer-events-none" />
                      <div className="absolute -left-8 -top-8 w-28 h-28 rounded-full bg-indigo-500/20 blur-xl pointer-events-none" />

                      <div className="flex items-center justify-between relative z-10">
                        <div className="w-8 h-6 rounded bg-amber-400/80 border border-amber-300 flex items-center justify-center">
                          <div className="w-6 h-4 border-t border-b border-amber-700/50" />
                        </div>
                        <span className="font-extrabold text-sm tracking-widest font-mono text-sky-400">
                          {getCardBrand(cardForm.cardNumber)}
                        </span>
                      </div>

                      <div className="font-mono text-base font-bold tracking-widest text-center my-auto tabular-nums text-slate-100 drop-shadow">
                        {cardForm.cardNumber || '•••• •••• •••• ••••'}
                      </div>

                      <div className="flex items-end justify-between text-[10px] font-mono relative z-10">
                        <div>
                          <div className="text-[8px] text-slate-400 uppercase">CHỦ THẺ</div>
                          <div className="font-bold truncate max-w-[150px] uppercase">
                            {cardForm.cardHolder || 'CARD HOLDER'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[8px] text-slate-400 uppercase">HẾT HẠN</div>
                          <div className="font-bold">{cardForm.expiry || 'MM/YY'}</div>
                        </div>
                      </div>
                    </div>

                    {/* Nút điền mẫu test nhanh */}
                    <div className="flex items-center space-x-2 mt-3 text-[10px]">
                      <span className="text-slate-500">Mẫu test:</span>
                      <button
                        type="button"
                        onClick={() =>
                          setCardForm((prev) => ({
                            ...prev,
                            cardNumber: '4242 4242 4242 4242',
                            expiry: '12/28',
                            cvv: '888',
                          }))
                        }
                        className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400 hover:underline font-semibold"
                      >
                        Visa (4242)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCardForm((prev) => ({
                            ...prev,
                            cardNumber: '5555 5555 5555 4444',
                            expiry: '10/27',
                            cvv: '666',
                          }))
                        }
                        className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400 hover:underline font-semibold"
                      >
                        Mastercard (5555)
                      </button>
                    </div>
                  </div>

                  {/* Form Nhập Thông Tin Thẻ */}
                  <div className="md:col-span-7 space-y-3 text-xs">
                    <div className="space-y-1">
                      <label className="block text-slate-600 dark:text-slate-400 font-semibold">
                        SỐ THẺ QUỐC TẾ:
                      </label>
                      <div className="relative">
                        <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={cardForm.cardNumber}
                          onChange={handleCardNumberChange}
                          placeholder="4242 4242 4242 4242"
                          maxLength={19}
                          className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2.5 rounded-lg text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-slate-600 dark:text-slate-400 font-semibold">
                        TÊN CHỦ THẺ (KHÔNG DẤU):
                      </label>
                      <input
                        type="text"
                        value={cardForm.cardHolder}
                        onChange={(e) =>
                          setCardForm((prev) => ({ ...prev, cardHolder: e.target.value.toUpperCase() }))
                        }
                        placeholder="NGUYEN VAN TAI"
                        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-lg text-slate-900 dark:text-slate-100 font-mono text-xs uppercase focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-slate-600 dark:text-slate-400 font-semibold">
                          NGÀY HẾT HẠN:
                        </label>
                        <input
                          type="text"
                          value={cardForm.expiry}
                          onChange={handleExpiryChange}
                          placeholder="MM/YY"
                          maxLength={5}
                          className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-lg text-slate-900 dark:text-slate-100 font-mono text-xs text-center focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-slate-600 dark:text-slate-400 font-semibold flex items-center justify-between">
                          <span>MÃ CVV / CVC:</span>
                          <span className="text-[10px] text-slate-400 font-normal">3 số mặt sau</span>
                        </label>
                        <div className="relative">
                          <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                          <input
                            type="password"
                            value={cardForm.cvv}
                            onChange={(e) =>
                              setCardForm((prev) => ({
                                ...prev,
                                cvv: e.target.value.replace(/\D/g, '').slice(0, 4),
                              }))
                            }
                            placeholder="•••"
                            maxLength={4}
                            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 pl-8 pr-3 py-2.5 rounded-lg text-slate-900 dark:text-slate-100 font-mono text-xs text-center focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Nút hành động thanh toán thẻ */}
                    <button
                      type="button"
                      disabled={processingGatewayAction}
                      onClick={handlePayWithCreditCard}
                      className="w-full flex items-center justify-center space-x-2 py-3 mt-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-sky-600/20"
                    >
                      {processingGatewayAction ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>
                            {cardProcessingStep === 'ENCRYPTING'
                              ? 'ĐANG MÃ HÓA THÔNG TIN THẺ...'
                              : cardProcessingStep === '3DSECURE'
                              ? 'XÁC THỰC BẢO MẬT 3D-SECURE...'
                              : cardProcessingStep === 'APPROVED'
                              ? 'GIAO DỊCH ĐÃ ĐƯỢC DUYỆT!'
                              : 'ĐANG XỬ LÝ...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span>
                            THANH TOÁN AN TOÀN • {Number(sandboxCheckout.amount).toLocaleString('vi-VN')} VND
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB 3: VÍ ĐIỆN TỬ (MOMO / VNPAY / ZALOPAY) */}
              {/* ============================================================== */}
              {activeGatewayTab === 'EWALLET' && (
                <div className="space-y-4 text-xs">
                  {/* Chọn thương hiệu ví */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'MOMO', name: 'Ví MoMo', color: 'border-pink-500 text-pink-600', desc: 'Thanh toán 1 chạm' },
                      { id: 'VNPAY', name: 'VNPAY-QR', color: 'border-red-500 text-red-600', desc: 'Quét mã siêu tốc' },
                      { id: 'ZALOPAY', name: 'ZaloPay', color: 'border-blue-500 text-blue-600', desc: 'Ví điện tử Zalo' },
                    ].map((w) => {
                      const isChosen = selectedEwallet === w.id;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setSelectedEwallet(w.id)}
                          className={`p-3 rounded-xl border text-center transition-all ${
                            isChosen
                              ? `${w.color} bg-slate-50 dark:bg-slate-800 ring-2 ring-sky-500 font-bold`
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <Smartphone className="w-5 h-5 mx-auto mb-1 text-slate-700 dark:text-slate-300" />
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{w.name}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{w.desc}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* QR code hoặc hướng dẫn quét app */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-5">
                    <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm shrink-0">
                      <img
                        src={vietQrUrl}
                        alt="QR Ví điện tử"
                        className="w-32 h-32 object-contain mx-auto"
                      />
                    </div>
                    <div className="space-y-2 text-slate-600 dark:text-slate-400 text-xs">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        Hướng dẫn thanh toán qua {selectedEwallet === 'MOMO' ? 'Ví MoMo' : selectedEwallet === 'VNPAY' ? 'VNPAY-QR' : 'ZaloPay'}:
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                        <li>Mở ứng dụng <strong>{selectedEwallet}</strong> trên điện thoại của bạn.</li>
                        <li>Chọn tính năng <strong>&ldquo;Quét mã QR&rdquo;</strong> và hướng camera vào mã bên cạnh.</li>
                        <li>Kiểm tra số tiền <strong>{Number(sandboxCheckout.amount).toLocaleString('vi-VN')} VND</strong> và xác nhận.</li>
                      </ol>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={processingGatewayAction}
                    onClick={() => executeGatewayPayment('SUCCESS')}
                    className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-purple-600/20"
                  >
                    {processingGatewayAction ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>ĐANG KẾT NỐI VÍ ĐIỆN TỬ...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>XÁC NHẬN ĐÃ QUÉT MÃ VÍ THÀNH CÔNG</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB 4: THẺ ATM NỘI ĐỊA (NAPAS 24/7) */}
              {/* ============================================================== */}
              {activeGatewayTab === 'ATM' && (
                <div className="space-y-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="block text-slate-600 dark:text-slate-400 font-semibold">
                      CHỌN NGÂN HÀNG PHÁT HÀNH THẺ ATM:
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {POPULAR_BANKS.map((b) => {
                        const isChosen = selectedAtmBank === b.code;
                        return (
                          <button
                            key={b.code}
                            type="button"
                            onClick={() => setSelectedAtmBank(b.code)}
                            className={`p-2.5 rounded-lg border text-center transition-all ${
                              isChosen
                                ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 ring-1 ring-sky-500 font-bold text-sky-700 dark:text-sky-300'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="font-extrabold text-sm">{b.logoText}</div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">{b.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-600 dark:text-slate-400 font-semibold">
                      SỐ THẺ ATM NỘI ĐỊA (GHI NỢ / DEBIT):
                    </label>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={atmCardNumber}
                        onChange={(e) => setAtmCardNumber(e.target.value)}
                        placeholder="9704 •••• •••• ••••"
                        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2.5 rounded-lg text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={processingGatewayAction}
                    onClick={() => executeGatewayPayment('SUCCESS')}
                    className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-600/20"
                  >
                    {processingGatewayAction ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>ĐANG KẾT NỐI CỔNG NAPAS...</span>
                      </>
                    ) : (
                      <>
                        <Building2 className="w-4 h-4" />
                        <span>THANH TOÁN QUA CỔNG NAPAS 247</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* ============================================================== */}
              {/* DRAWER MỞ RỘNG: CÔNG CỤ TEST & KỊCH BẢN AC DÀNH CHO DEVELOPER / HỘI ĐỒNG */}
              {/* Giữ nguyên 100% testid & kịch bản AC1-AC4 theo tiêu chuẩn SCRUM-232 */}
              {/* ============================================================== */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowDevSandboxTools((prev) => !prev)}
                  className="w-full flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                    <span>Công cụ kiểm thử Sandbox &amp; Kịch bản AC (Dành cho Developer / Tester)</span>
                  </div>
                  {showDevSandboxTools ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showDevSandboxTools && (
                  <div className="mt-3 p-4 bg-slate-100 dark:bg-slate-800/80 rounded-xl space-y-3 text-xs border border-slate-200 dark:border-slate-700">
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono space-y-1">
                      <div>
                        &bull; Gateway URL:{' '}
                        <span className="text-slate-900 dark:text-slate-200 break-all">{sandboxCheckout.rawUrl}</span>
                      </div>
                      <div>
                        &bull; HMAC-SHA256 Signature:{' '}
                        <span className="text-sky-600 dark:text-sky-400 break-all">
                          {sandboxCheckout.signature || 'hmac_sha256_verified'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                      {/* 1. AC1 & AC2: Thành công */}
                      <button
                        type="button"
                        data-testid="sandbox-btn-success"
                        disabled={processingGatewayAction}
                        onClick={handleSandboxPaySuccess}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all text-left text-[11px]"
                      >
                        <div>
                          <div>1. Thành công (AC1 &amp; AC2)</div>
                          <div className="text-[9px] font-normal opacity-90">Bắn Webhook &rarr; Cộng tiền ví</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      </button>

                      {/* 2. AC3: Quay về trước khi webhook tới */}
                      <button
                        type="button"
                        data-testid="sandbox-btn-pending-return"
                        disabled={processingGatewayAction}
                        onClick={handleSandboxReturnBeforeWebhook}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-bold transition-all text-left text-[11px]"
                      >
                        <div>
                          <div>2. Quay về trước Webhook (AC3)</div>
                          <div className="text-[9px] font-normal opacity-90">Ví PENDING &rarr; 4s sau Webhook tới</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      </button>

                      {/* 3. AC4: Lỗi từ chối */}
                      <button
                        type="button"
                        data-testid="sandbox-btn-failed"
                        disabled={processingGatewayAction}
                        onClick={handleSandboxPayFailed}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 border border-rose-500/40 font-bold transition-all text-left text-[11px]"
                      >
                        <div>
                          <div>3. Giả lập Thất bại (AC4)</div>
                          <div className="text-[9px] font-normal opacity-90">Ngân hàng từ chối &rarr; Giữ nguyên ví</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      </button>

                      {/* 4. AC4: Hủy giao dịch */}
                      <button
                        type="button"
                        data-testid="sandbox-btn-cancel"
                        disabled={processingGatewayAction}
                        onClick={handleSandboxCancel}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold transition-all text-left text-[11px]"
                      >
                        <div>
                          <div>4. Khách hàng Hủy (AC4)</div>
                          <div className="text-[9px] font-normal opacity-90">Hủy đơn nạp &rarr; Quay lại ví</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================
          MODAL NẠP TIỀN QUA QR TRUYỀN THỐNG (Bảo lưu tính tương thích cho luồng cũ)
         ============================================================================ */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-md w-full rounded-2xl p-6 space-y-4 text-xs shadow-2xl relative animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    NẠP TIỀN VÀO VÍ SẠC XE ĐIỆN
                  </h3>
                  <p className="text-[10px] text-slate-500">CỔNG THANH TOÁN VIETQR / NAPAS 247</p>
                </div>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-slate-600 dark:text-slate-400 block text-[11px] font-bold">
                1. HỌ VÀ TÊN NGƯỜI NẠP / TÀI XẾ:
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="Nhập họ và tên (VD: Trần Thị Bích Ngọc)"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-8 pr-3 py-2 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs font-sans"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-slate-400 block text-[11px] font-bold">
                2. CHỌN HOẶC NHẬP SỐ TIỀN CẦN NẠP (VND):
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {['50000', '100000', '200000', '500000'].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTopupAmount(amt)}
                    className={`py-1.5 rounded-lg border text-center text-[11px] font-semibold transition-colors ${
                      topupAmount === amt
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
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
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono tabular-nums text-xs"
              />
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3.5 rounded-xl text-center space-y-3">
              <div className="inline-block p-2 bg-white rounded-xl shadow-md border border-slate-200">
                <img
                  src={vietQrUrl}
                  alt="Mã QR Chuyển khoản"
                  className="w-40 h-40 object-contain mx-auto"
                />
              </div>

              <div className="text-[11px] text-left space-y-1 text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-2">
                <div className="flex justify-between">
                  <span>Ngân hàng:</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold">MB Bank (Quân Đội)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Số tài khoản:</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-900 dark:text-slate-100 font-bold font-mono">999988886666</span>
                    <button
                      onClick={() => handleCopy('999988886666')}
                      className="text-sky-600 hover:text-sky-700"
                      title="Sao chép STK"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span>Người thụ hưởng:</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold">EV CSMS CHARGING</span>
                </div>
                <div className="flex justify-between">
                  <span>Số tiền:</span>
                  <span className="text-sky-600 dark:text-sky-400 font-bold tabular-nums">
                    {Number(topupAmount || 0).toLocaleString('vi-VN')} VND
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Nội dung CK:</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold font-mono">
                    EVCSMS NAP {payerName.trim() || 'TAI XE'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleConfirmTransfer}
                disabled={submitting || !payerName.trim() || !topupAmount}
                className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-600/20"
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
