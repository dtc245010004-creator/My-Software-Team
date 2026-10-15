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
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  XCircle,
  Radio,
  Sparkles,
  AlertTriangle,
  Smartphone,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  Zap,
  Wallet as WalletIcon,
  Shield,
  HelpCircle,
  FileCheck2,
  Filter,
  Search,
  Eye,
  Ban,
  BarChart3,
  TrendingUp,
  Layers,
  Calendar,
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
 * Format tiền tệ VND chuẩn không có số thập phân lẻ
 */
export function formatVND(amount) {
  const num = Math.round(Number(amount) || 0);
  return num.toLocaleString('vi-VN') + ' ₫';
}

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
    shouldTrustClientStatusForBalance: false,
  };
}

/**
 * Thực thi 1 chu kỳ kiểm tra trạng thái đơn nạp tiền qua API Polling (SCRUM-245 & SCRUM-244)
 * Chỉ khi server xác nhận `status === 'SUCCESS'` (sau khi Webhook/Duyệt hợp lệ) mới gọi callback làm mới số dư.
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
// DANH SÁCH PHƯƠNG THỨC THANH TOÁN
// ============================================================================
export const PAYMENT_CHANNELS = [
  {
    id: 'VIETQR',
    name: 'Chuyển khoản VietQR',
    subname: 'Napas 247 • Quét mã qua 40+ app ngân hàng',
    badge: 'Miễn phí',
    icon: QrCode,
  },
  {
    id: 'CARD',
    name: 'Thẻ Quốc Tế',
    subname: 'Visa, Mastercard, JCB',
    badge: '3D-Secure',
    icon: CreditCard,
  },
  {
    id: 'EWALLET',
    name: 'Ví Điện Tử',
    subname: 'MoMo, VNPAY, ZaloPay',
    badge: 'Tức thì',
    icon: Smartphone,
  },
  {
    id: 'ATM',
    name: 'Thẻ ATM Nội Địa',
    subname: 'Thẻ ghi nợ Napas 247',
    badge: 'Nội địa',
    icon: Building2,
  },
];

const POPULAR_BANKS = [
  { code: 'MB', name: 'MB Bank', logoText: 'MB' },
  { code: 'VCB', name: 'Vietcombank', logoText: 'VCB' },
  { code: 'TCB', name: 'Techcombank', logoText: 'TCB' },
  { code: 'BIDV', name: 'BIDV', logoText: 'BIDV' },
  { code: 'CTG', name: 'VietinBank', logoText: 'CTG' },
  { code: 'ACB', name: 'ACB', logoText: 'ACB' },
  { code: 'VPB', name: 'VPBank', logoText: 'VPB' },
  { code: 'TPB', name: 'TPBank', logoText: 'TPB' },
];

// ============================================================================
// COMPONENT CHÍNH: MÀN HÌNH VÍ ĐIỆN TỬ & CỔNG THANH TOÁN
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

  // Quyền Quản trị viên & Chủ trạm (CPO, Accountant, Operator)
  const canApprove = ['ADMIN', 'OPERATOR', 'CPO', 'ACCOUNTANT'].includes(user?.role);
  // Chế độ xem: 'MY_WALLET' (Ví của tôi) hoặc 'APPROVALS' (Duyệt nạp tiền tài xế)
  const [viewTab, setViewTab] = useState(() => (canApprove ? 'APPROVALS' : 'MY_WALLET'));

  // State danh sách duyệt nạp tiền cho Admin & Chủ trạm
  const [adminOrders, setAdminOrders] = useState([]);
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);
  const [adminFilter, setAdminFilter] = useState('PENDING'); // 'ALL' | 'PENDING' | 'SUCCESS' | 'FAILED'
  const [adminSearch, setAdminSearch] = useState('');
  const [processingOrderId, setProcessingOrderId] = useState(null);

  // Thống kê Doanh thu (Hằng ngày, 7 ngày, 30 ngày) cho Admin, Chủ trạm (CPO) & Kế toán
  const [revenueStats, setRevenueStats] = useState(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenuePeriod, setRevenuePeriod] = useState('7D'); // 'TODAY' | '7D' | '30D'
  const [showRevenueChart, setShowRevenueChart] = useState(true);

  // Modal Từ chối nạp tiền
  const [rejectingOrder, setRejectingOrder] = useState(null);
  const [rejectReason, setRejectReason] = useState('Chưa nhận được chuyển khoản hoặc thông tin sai lệch');

  // Modal Chi Tiết Dòng Tiền & Trạng Thái Giao Dịch
  const [flowInspectionOrder, setFlowInspectionOrder] = useState(null);

  // Kênh thanh toán được chọn
  const [selectedChannel, setSelectedChannel] = useState('VIETQR');

  // Form Nạp tiền
  const [sandboxAmount, setSandboxAmount] = useState('100000');
  const [amountError, setAmountError] = useState('');
  const [creatingOrder, setCreatingOrder] = useState(false);

  // Modal Thanh Toán
  const [sandboxCheckout, setSandboxCheckout] = useState(null);
  const [activeGatewayTab, setActiveGatewayTab] = useState('VIETQR');
  const [processingGatewayAction, setProcessingGatewayAction] = useState(false);
  const [delayedWebhookCountdown, setDelayedWebhookCountdown] = useState(0);

  // Trạng thái bước nạp tiền: 'INPUT' | 'CHECKING' | 'SUCCESS' | 'TIMEOUT_OR_ERROR'
  const [checkoutStep, setCheckoutStep] = useState('INPUT');
  const [checkingSecondsLeft, setCheckingSecondsLeft] = useState(15);
  const [successOrderInfo, setSuccessOrderInfo] = useState(null);
  const [submittedOrderInfo, setSubmittedOrderInfo] = useState(null);

  // Form Thẻ Quốc Tế
  const [cardForm, setCardForm] = useState({
    cardNumber: '4242 4242 4242 4242',
    cardHolder: (user?.full_name || guestName || 'TRAN THI BICH NGOC').toUpperCase(),
    expiry: '12/28',
    cvv: '888',
  });

  // Ví điện tử & ATM
  const [selectedEwallet, setSelectedEwallet] = useState('MOMO');
  const [selectedAtmBank, setSelectedAtmBank] = useState('MB');
  const [atmCardNumber, setAtmCardNumber] = useState('9704 2200 1234 5678');

  // Đếm ngược phiên thanh toán an toàn
  const [checkoutCountdown, setCheckoutCountdown] = useState(900);
  const [bannerAlert, setBannerAlert] = useState(null);
  const [copied, setCopied] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 30;

  // Lọc giao dịch
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

  // Tự động cập nhật tên chủ thẻ
  useEffect(() => {
    if (user?.full_name) {
      setCardForm((prev) => ({
        ...prev,
        cardHolder: user.full_name.toUpperCase(),
      }));
    }
  }, [user]);

  // Bộ đếm ngược phiên thanh toán 15 phút
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

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Giả lập trừ phí giữ chỗ quá hạn để kiểm thử (S-50 / SCRUM-354 / SCRUM-378)
  const handleSimulatePenaltyTx = () => {
    const fee = 20000;
    const currentBal = wallet ? Number(wallet.balance) : 250000;
    const mockTx = {
      id: Date.now(),
      wallet_id: wallet?.id || 1,
      amount: -fee,
      transaction_type: 'NO_SHOW_PENALTY',
      balance_before: currentBal,
      balance_after: currentBal - fee,
      reference_type: 'RESERVATION',
      reference_id: `RES-${Date.now().toString().slice(-6)}`,
      receipt_code: null,
      note: 'Phí giữ chỗ quá hạn 15 phút không nhận trụ sạc',
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

  // Tải danh sách đơn nạp chờ duyệt cho Admin & Chủ trạm
  const fetchAdminOrders = useCallback(async () => {
    if (!canApprove) return;
    try {
      setAdminOrdersLoading(true);
      const res = await api.get('/wallet/admin/pending-topups');
      setAdminOrders(res.data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách phê duyệt nạp tiền:', err);
    } finally {
      setAdminOrdersLoading(false);
    }
  }, [canApprove]);

  // Tải thống kê tổng doanh thu (Hôm nay, 7 ngày, 30 ngày) cho Admin, Chủ trạm (CPO) và Kế toán
  const fetchRevenueStats = useCallback(async () => {
    if (!canApprove) return;
    try {
      setRevenueLoading(true);
      const res = await api.get('/wallet/admin/revenue-summary');
      setRevenueStats(res.data);
    } catch (err) {
      console.error('Lỗi tải thống kê tổng doanh thu:', err);
    } finally {
      setRevenueLoading(false);
    }
  }, [canApprove]);

  // Tải dữ liệu ví của cá nhân
  const fetchWalletData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  }, []);

  // Hook Polling Realtime
  const { isPolling, upsertTopupOrder, checkOrderStatusNow } = useTopupRealtimeSync({
    topupOrders,
    setTopupOrders,
    onConfirmedSuccess: async (confirmedOrder) => {
      await fetchWalletData(true);
      if (canApprove) {
        await fetchAdminOrders();
        await fetchRevenueStats();
      }
      setCheckoutStep('SUCCESS');
      setSuccessOrderInfo(confirmedOrder);
      setBannerAlert({
        type: 'SUCCESS',
        title: 'Nạp tiền thành công!',
        detail: `Đơn nạp #${confirmedOrder.order_code} (+${formatVND(
          confirmedOrder.amount
        )}) đã được tự động nạp vào ví của bạn.`,
      });
    },
    onConfirmedFailure: (failedOrder) => {
      const isCancelled = String(failedOrder.status).toUpperCase() === 'CANCELLED';
      if (sandboxCheckout && sandboxCheckout.orderCode === failedOrder.order_code) {
        setCheckoutStep('TIMEOUT_OR_ERROR');
      }
      setBannerAlert({
        type: 'ERROR',
        title: isCancelled ? 'Giao dịch đã được hủy' : 'Yêu cầu nạp tiền bị từ chối',
        detail:
          failedOrder.failure_reason ||
          (isCancelled
            ? 'Giao dịch nạp tiền đã hủy theo yêu cầu của bạn.'
            : 'Giao dịch nạp tiền chưa thành công, vui lòng thử lại hoặc liên hệ hỗ trợ.'),
      });
    },
    pollIntervalMs: 2000,
  });

  useEffect(() => {
    fetchWalletData();
    if (canApprove) {
      fetchAdminOrders();
      fetchRevenueStats();
    }
  }, [token, user, fetchWalletData, fetchAdminOrders, fetchRevenueStats, canApprove]);

  // Xử lý Callback Return URL
  useEffect(() => {
    const callbackInfo = parseTopupReturnParams(`?${searchParams.toString()}`);
    if (!callbackInfo.hasCallback) return;

    const { orderCode, clientHintStatus, clientMessage } = callbackInfo;

    if (clientHintStatus === 'PENDING') {
      setBannerAlert({
        type: 'PENDING',
        title: `Đang chờ Ban quản lý phê duyệt đơn #${orderCode}...`,
        detail: 'Yêu cầu nạp tiền đã được gửi. Quản trị viên hoặc Chủ trạm đang đối soát sao kê tài khoản.',
      });
    } else if (clientHintStatus === 'FAILED' || clientHintStatus === 'CANCELLED') {
      setBannerAlert({
        type: 'ERROR',
        title:
          clientHintStatus === 'CANCELLED'
            ? `Đã hủy giao dịch #${orderCode}`
            : `Giao dịch #${orderCode} thất bại`,
        detail: clientMessage || 'Giao dịch không thành công. Số dư ví được bảo toàn nguyên vẹn.',
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

  // Khởi tạo đơn nạp tiền từ phía Tài xế
  const handleSandboxAmountChange = (val) => {
    setSandboxAmount(val);
    const validation = validateTopupAmount(val);
    setAmountError(validation.isValid ? '' : validation.error);
  };

  // Hàm trợ giúp submit form chuyển hướng trực tiếp tới Cổng thanh toán SePay
  const submitSepayForm = (actionUrl, fields) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = actionUrl;
    form.target = '_blank';

    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
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

      const channelObj = PAYMENT_CHANNELS.find((c) => c.id === selectedChannel);
      const channelName = channelObj ? channelObj.name : 'EV-Pay';

      const res = await api.post('/wallet/topup-requests', {
        amount: validation.amount,
        full_name: (user?.full_name || 'Tài xế EV').trim(),
        note: `Nạp tiền qua ${channelName}`,
      });

      const { order_id: orderId, redirect_url: redirectUrl } = res.data;
      const parsedGateway = parseSandboxRedirectUrl(redirectUrl, orderId, validation.amount);

      upsertTopupOrder({
        order_code: parsedGateway.orderCode,
        amount: parsedGateway.amount,
        status: 'PENDING',
        failure_reason: null,
        created_at: new Date().toISOString(),
      });

      setActiveGatewayTab(selectedChannel);
      setSandboxCheckout(parsedGateway);
      setSuccessOrderInfo(null);
      setSubmittedOrderInfo(null);
      setCheckoutCountdown(900);

      // TỰ ĐỘNG CHUYỂN HƯỚNG SANG CỔNG THANH TOÁN SEPAY (Theo yêu cầu người dùng)
      try {
        const sepayRes = await api.post('/payments/sepay/checkout-init', {
          amount: validation.amount,
          order_code: parsedGateway.orderCode,
        });
        const { action_url, fields } = sepayRes.data;

        submitSepayForm(action_url, fields);

        setSandboxCheckout({
          ...parsedGateway,
          sepayActionUrl: action_url,
          sepayFields: fields,
        });
        setCheckoutStep('CHECKING');
        setCheckingSecondsLeft(30);
      } catch (sepayErr) {
        console.warn('Lỗi kết nối cổng SePay, hiển thị mã QR dự phòng:', sepayErr);
        setCheckoutStep('INPUT');
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      setAmountError(`Không thể khởi tạo đơn nạp: ${detail}`);
    } finally {
      setCreatingOrder(false);
    }
  };

  // Tài xế xác nhận đã chuyển khoản / nạp tiền -> Tự động kiểm tra webhook từ SePay
  const handleDriverConfirmPayment = () => {
    if (!sandboxCheckout) return;
    setCheckoutStep('CHECKING');
    setCheckingSecondsLeft(15);
    checkOrderStatusNow(sandboxCheckout.orderCode);
  };

  // Timer kiểm tra biến động số dư SePay (Đếm ngược 30s nếu trễ mới chuyển Admin)
  useEffect(() => {
    if (checkoutStep !== 'CHECKING' || !sandboxCheckout?.orderCode) return undefined;

    const codeToPoll = sandboxCheckout.orderCode;
    checkOrderStatusNow(codeToPoll);

    const timer = setInterval(() => {
      checkOrderStatusNow(codeToPoll);
      setCheckingSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Hết thời gian mà ngân hàng chưa xác nhận -> Chuyển sang hàng đợi Admin duyệt thủ công
          setCheckoutStep('TIMEOUT_OR_ERROR');
          setSubmittedOrderInfo({
            orderCode: codeToPoll,
            amount: sandboxCheckout.amount,
            channelName:
              PAYMENT_CHANNELS.find((c) => c.id === activeGatewayTab)?.name || 'Chuyển khoản VietQR',
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [checkoutStep, sandboxCheckout?.orderCode, checkOrderStatusNow, activeGatewayTab]);

  // Test runners handlers cho automated tests
  const handleSandboxPaySuccess = () => handleDriverConfirmPayment();
  const handleSandboxReturnBeforeWebhook = () => handleDriverConfirmPayment();
  const handleSandboxPayFailed = () => setSandboxCheckout(null);
  const handleSandboxCancel = () => setSandboxCheckout(null);

  // Mở Cổng thanh toán chính thức SePay (Phương án 2: Hosted Checkout)
  const handleOpenSepayGateway = async () => {
    try {
      setProcessingGatewayAction(true);
      const res = await api.post('/payments/sepay/checkout-init', {
        amount: Number(sandboxCheckout?.amount || currentAmountNum),
        order_code: sandboxCheckout?.orderCode,
      });
      const { action_url, fields } = res.data;
      submitSepayForm(action_url, fields);
    } catch (err) {
      console.error('Lỗi khởi tạo cổng SePay:', err);
      setAmountError(
        'Không thể kết nối Cổng thanh toán SePay: ' +
          (err.response?.data?.detail || err.message)
      );
    } finally {
      setProcessingGatewayAction(false);
    }
  };

  // Hủy đơn nạp tiền đang chờ duyệt / đang thanh toán (SCRUM-SEPAY-CANCEL)
  const handleCancelTopupOrder = async (orderCode) => {
    if (!orderCode) return;
    try {
      setProcessingGatewayAction(true);
      await api.post(`/wallet/topup-requests/${orderCode}/cancel`);
      setTopupOrders((prev) =>
        prev.map((o) => (o.order_code === orderCode ? { ...o, status: 'CANCELLED' } : o))
      );
      if (sandboxCheckout && sandboxCheckout.orderCode === orderCode) {
        setSandboxCheckout(null);
        setCheckoutStep('INPUT');
      }
      if (
        flowInspectionOrder &&
        (flowInspectionOrder.order_code === orderCode ||
          flowInspectionOrder.reference_id === orderCode)
      ) {
        setFlowInspectionOrder((prev) => ({ ...prev, status: 'CANCELLED' }));
      }
      setBannerAlert({
        type: 'INFO',
        title: `Đã hủy giao dịch #${orderCode}`,
        detail: 'Giao dịch nạp tiền đã được hủy và lưu vào lịch sử giao dịch với trạng thái ĐÃ HỦY.',
      });
      await fetchWalletData(true);
    } catch (err) {
      alert('Không thể hủy đơn: ' + (err.response?.data?.detail || err.message));
    } finally {
      setProcessingGatewayAction(false);
    }
  };

  // ============================================================================
  // HÀNH ĐỘNG CỦA ADMIN & CHỦ TRẠM (CPO): PHÊ DUYỆT & TỪ CHỐI ĐƠN NẠP
  // ============================================================================
  const handleAdminApprove = async (orderCode) => {
    try {
      setProcessingOrderId(orderCode);
      const res = await api.post(`/wallet/admin/topup/${orderCode}/approve`);
      setBannerAlert({
        type: 'SUCCESS',
        title: 'Phê duyệt thành công!',
        detail: res.data?.message || `Đã duyệt đơn nạp #${orderCode} vào ví tài xế.`,
      });
      await fetchAdminOrders();
      await fetchRevenueStats();
      await fetchWalletData(true);
    } catch (err) {
      alert('Lỗi phê duyệt: ' + (err.response?.data?.detail || err.message));
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleAdminRejectConfirm = async () => {
    if (!rejectingOrder) return;
    try {
      setProcessingOrderId(rejectingOrder.order_code);
      const res = await api.post(`/wallet/admin/topup/${rejectingOrder.order_code}/reject`, {
        reason: rejectReason.trim(),
      });
      setBannerAlert({
        type: 'ERROR',
        title: 'Đã từ chối đơn nạp',
        detail: res.data?.message || `Đã từ chối đơn #${rejectingOrder.order_code}.`,
      });
      setRejectingOrder(null);
      await fetchAdminOrders();
      await fetchWalletData(true);
    } catch (err) {
      alert('Lỗi từ chối đơn: ' + (err.response?.data?.detail || err.message));
    } finally {
      setProcessingOrderId(null);
    }
  };

  // Helper copy to clipboard
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  const getCardBrand = (num) => {
    const clean = (num || '').replace(/\s/g, '');
    if (clean.startsWith('4')) return 'VISA';
    if (/^5[1-5]/.test(clean) || /^2[2-7]/.test(clean)) return 'MASTERCARD';
    if (/^35/.test(clean)) return 'JCB';
    return 'VISA';
  };

  const rawBalance = wallet ? Number(wallet.balance) : 0;
  const balanceRounded = Math.round(rawBalance);
  const currentAmountNum = parseFloat(sandboxAmount) || 100000;
  const checkoutOrderCode = sandboxCheckout?.orderCode || 'ORDER_DEMO';
  const transferContent = checkoutOrderCode;
  const vietQrUrl = `https://api.vietqr.io/image/970422-999988886666-compact2.png?amount=${
    sandboxCheckout?.amount || currentAmountNum
  }&addInfo=${encodeURIComponent(transferContent)}&accountName=CONG%20TY%20EV%20CSMS`;

  // Hợp nhất Lịch sử giao dịch sổ cái với tất cả các Đơn nạp tiền (kể cả ĐÃ HỦY, THẤT BẠI, ĐANG CHỜ)
  const unifiedTransactions = useMemo(() => {
    const list = Array.isArray(transactions) ? [...transactions] : [];
    const ledgerRefIds = new Set(
      list.map((tx) => String(tx.reference_id || '').trim()).filter(Boolean)
    );

    if (Array.isArray(topupOrders)) {
      topupOrders.forEach((o) => {
        const orderCode = String(o.order_code || '').trim();
        const status = String(o.status || 'PENDING').toUpperCase();

        const alreadyInLedger =
          ledgerRefIds.has(orderCode) ||
          list.some((tx) => tx.note && tx.note.includes(orderCode));

        if (!alreadyInLedger) {
          list.push({
            id: `topup-${orderCode}`,
            wallet_id: wallet?.id,
            amount: Number(o.amount || 0),
            transaction_type: 'TOPUP',
            status: status, // 'PENDING' | 'CANCELLED' | 'FAILED' | 'SUCCESS'
            failure_reason: o.failure_reason,
            balance_before: null,
            balance_after: null,
            reference_type: 'TOPUP_ORDER',
            reference_id: orderCode,
            receipt_code: null,
            note:
              status === 'CANCELLED'
                ? `Yêu cầu nạp tiền #${orderCode} (Đã hủy)`
                : status === 'FAILED'
                ? `Yêu cầu nạp tiền #${orderCode} (${o.failure_reason || 'Bị từ chối'})`
                : status === 'PENDING'
                ? `Yêu cầu nạp tiền #${orderCode} (Chờ đối soát)`
                : `Nạp tiền qua SePay #${orderCode}`,
            created_at: o.created_at || new Date().toISOString(),
            rawOrder: o,
          });
        }
      });
    }

    return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [transactions, topupOrders, wallet]);

  // SCRUM-378: Lọc giao dịch
  const penaltyTxs = useMemo(
    () => (Array.isArray(unifiedTransactions) ? unifiedTransactions.filter(isPenaltyTransaction) : []),
    [unifiedTransactions]
  );
  const totalPenaltyAmount = useMemo(() => {
    return penaltyTxs.reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  }, [penaltyTxs]);

  const topupTxsCount = useMemo(
    () =>
      Array.isArray(unifiedTransactions)
        ? unifiedTransactions.filter((tx) => tx.transaction_type === 'TOPUP').length
        : 0,
    [unifiedTransactions]
  );
  const chargeTxsCount = useMemo(
    () =>
      Array.isArray(unifiedTransactions)
        ? unifiedTransactions.filter(
            (tx) => tx.transaction_type === 'CHARGE_FEE' && !isPenaltyTransaction(tx)
          ).length
        : 0,
    [unifiedTransactions]
  );

  const filteredTransactions = useMemo(() => {
    if (!Array.isArray(unifiedTransactions)) return [];
    if (txFilter === 'TOPUP') return unifiedTransactions.filter((tx) => tx.transaction_type === 'TOPUP');
    if (txFilter === 'CHARGE_FEE')
      return unifiedTransactions.filter(
        (tx) => tx.transaction_type === 'CHARGE_FEE' && !isPenaltyTransaction(tx)
      );
    if (txFilter === 'PENALTY') return penaltyTxs;
    return unifiedTransactions;
  }, [unifiedTransactions, txFilter, penaltyTxs]);

  // Các đơn nạp đang chờ duyệt của cá nhân
  const pendingOrders = useMemo(
    () => topupOrders.filter((o) => String(o.status || '').toUpperCase() === 'PENDING'),
    [topupOrders]
  );

  // Số lượng đơn chờ duyệt toàn hệ thống cho Admin/Chủ trạm
  const adminPendingCount = useMemo(
    () => adminOrders.filter((o) => o.status === 'PENDING').length,
    [adminOrders]
  );

  // Danh sách đơn nạp lọc cho Admin
  const filteredAdminOrders = useMemo(() => {
    return adminOrders.filter((o) => {
      if (adminFilter !== 'ALL' && o.status !== adminFilter) return false;
      if (adminSearch.trim()) {
        const q = adminSearch.toLowerCase();
        const matchCode = o.order_code.toLowerCase().includes(q);
        const matchName = (o.full_name || '').toLowerCase().includes(q);
        const matchUser = (o.username || '').toLowerCase().includes(q);
        return matchCode || matchName || matchUser;
      }
      return true;
    });
  }, [adminOrders, adminFilter, adminSearch]);

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE) || 1;
  const currentTransactions = filteredTransactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20 text-slate-500 dark:text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-3 text-sky-500" />
        <span className="font-medium text-sm">Đang tải thông tin ví cá nhân...</span>
      </div>
    );
  }

  if (error403) {
    return (
      <div className="max-w-xl mx-auto mt-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl text-center space-y-4 shadow-sm">
        <div className="mx-auto w-12 h-12 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center rounded-full mb-2 border border-rose-200 dark:border-rose-800/40">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Truy Cập Bị Từ Chối (403 Forbidden)
        </h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Bạn không có quyền truy cập thông tin ví này. Vui lòng đăng nhập đúng tài khoản.
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="max-w-xl mx-auto mt-12 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-6 rounded-2xl text-center text-rose-800 dark:text-rose-300 space-y-3">
        <AlertOctagon className="w-6 h-6 mx-auto mb-1 text-rose-600" />
        <p className="font-bold text-sm">Lỗi tải dữ liệu ví</p>
        <p className="text-xs opacity-90">{errorMsg}</p>
        <button
          onClick={() => fetchWalletData(false)}
          className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
        >
          Thử Lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Hệ Thống EV CSMS</span>
            <span>/</span>
            <span className="text-sky-600 dark:text-sky-400">Ví Điện Tử &amp; Thanh Toán</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 mt-1">
            {canApprove && viewTab === 'APPROVALS'
              ? 'Phê Duyệt Nạp Tiền Tài Xế'
              : 'Ví Cá Nhân & Nạp Tiền'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {canApprove && viewTab === 'APPROVALS'
              ? 'Đối soát sao kê ngân hàng và phê duyệt yêu cầu nạp tiền vào ví của các tài xế.'
              : 'Quản lý số dư, nạp tiền đa phương thức và theo dõi lịch sử thanh toán sạc xe điện.'}
          </p>
        </div>

        {/* Chuyển tab giữa "Duyệt Nạp Tiền" và "Ví Cá Nhân" cho Admin / Chủ trạm */}
        {canApprove ? (
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setViewTab('APPROVALS')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                viewTab === 'APPROVALS'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <FileCheck2 className="w-4 h-4 text-sky-500" />
              <span>Duyệt Nạp Tiền</span>
              {adminPendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-extrabold animate-pulse">
                  {adminPendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setViewTab('MY_WALLET')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                viewTab === 'MY_WALLET'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <WalletIcon className="w-4 h-4 text-slate-500" />
              <span>Ví Của Tôi</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-1.5 rounded-full shadow-sm text-slate-600 dark:text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="font-medium">Tự động đồng bộ</span>
          </div>
        )}
      </div>

      {/* Thông báo kết quả */}
      {bannerAlert && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-3 shadow-sm transition-all ${
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

      {/* ========================================================================= */}
      {/* TỔNG DOANH THU (HÔM NAY / 7 NGÀY / 30 NGÀY) CHO ADMIN, CHỦ TRẠM, KẾ TOÁN */}
      {/* ========================================================================= */}
      {canApprove && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
          {/* Header & Bộ lọc thời gian */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    Tổng Doanh Thu Hệ Thống &amp; Trạm Sạc
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                    {user?.role === 'ADMIN'
                      ? 'Toàn Hệ Thống'
                      : user?.role === 'ACCOUNTANT'
                      ? 'Kế Toán CSMS'
                      : 'Trạm Quản Lý'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Doanh thu sạc xe thực tế &amp; dòng tiền nạp ví theo 3 mốc: Hôm nay (hằng ngày), 7 ngày và 30 ngày qua.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-auto">
              {/* Tab chuyển đổi chu kỳ xem biểu đồ */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setRevenuePeriod('TODAY')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    revenuePeriod === 'TODAY'
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Hôm Nay
                </button>
                <button
                  type="button"
                  onClick={() => setRevenuePeriod('7D')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    revenuePeriod === '7D'
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  7 Ngày
                </button>
                <button
                  type="button"
                  onClick={() => setRevenuePeriod('30D')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    revenuePeriod === '30D'
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  30 Ngày
                </button>
              </div>

              {/* Toggle Biểu đồ */}
              <button
                type="button"
                onClick={() => setShowRevenueChart(!showRevenueChart)}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={showRevenueChart ? 'Thu gọn biểu đồ' : 'Mở rộng biểu đồ'}
              >
                {showRevenueChart ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {/* Nút Làm Mới */}
              <button
                type="button"
                onClick={fetchRevenueStats}
                disabled={revenueLoading}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Làm mới thống kê doanh thu"
              >
                <RefreshCw
                  className={`w-4 h-4 ${revenueLoading ? 'animate-spin text-sky-500' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* 3 Thẻ Chỉ Số Doanh Thu Chính (Hôm Nay, 7 Ngày, 30 Ngày) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* THẺ 1: HÔM NAY (HẰNG NGÀY) */}
            <div
              onClick={() => setRevenuePeriod('TODAY')}
              className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                revenuePeriod === 'TODAY'
                  ? 'border-sky-500 bg-sky-50/40 dark:bg-sky-950/20 shadow-sm ring-1 ring-sky-500'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold">
                <span className="flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-sky-500" />
                  <span>DOANH THU HÔM NAY</span>
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 font-semibold">
                  Hằng Ngày
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2.5 tabular-nums">
                {revenueLoading && !revenueStats ? (
                  <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                ) : (
                  formatVND(revenueStats?.today?.total_revenue || 0)
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
                    <span>Sạc xe:</span>
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {formatVND(revenueStats?.today?.charging_revenue || 0)}{' '}
                    <span className="font-normal text-[11px] text-slate-500">
                      ({revenueStats?.today?.session_count || 0} phiên)
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span>Nạp ví:</span>
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {formatVND(revenueStats?.today?.topup_revenue || 0)}{' '}
                    <span className="font-normal text-[11px] text-slate-500">
                      ({revenueStats?.today?.topup_count || 0} đơn)
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* THẺ 2: 7 NGÀY GẦN NHẤT */}
            <div
              onClick={() => setRevenuePeriod('7D')}
              className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                revenuePeriod === '7D'
                  ? 'border-sky-500 bg-sky-50/40 dark:bg-sky-950/20 shadow-sm ring-1 ring-sky-500'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold">
                <span className="flex items-center space-x-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-sky-500" />
                  <span>DOANH THU 7 NGÀY QUA</span>
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300 font-semibold">
                  7 Ngày
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2.5 tabular-nums">
                {revenueLoading && !revenueStats ? (
                  <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                ) : (
                  formatVND(revenueStats?.last_7_days?.total_revenue || 0)
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
                    <span>Sạc xe:</span>
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {formatVND(revenueStats?.last_7_days?.charging_revenue || 0)}{' '}
                    <span className="font-normal text-[11px] text-slate-500">
                      ({revenueStats?.last_7_days?.session_count || 0} phiên)
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span>Nạp ví:</span>
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {formatVND(revenueStats?.last_7_days?.topup_revenue || 0)}{' '}
                    <span className="font-normal text-[11px] text-slate-500">
                      ({revenueStats?.last_7_days?.topup_count || 0} đơn)
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* THẺ 3: 30 NGÀY GẦN NHẤT */}
            <div
              onClick={() => setRevenuePeriod('30D')}
              className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                revenuePeriod === '30D'
                  ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-sm ring-1 ring-indigo-500'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold">
                <span className="flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  <span>DOANH THU 30 NGÀY QUA</span>
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 font-semibold">
                  30 Ngày
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2.5 tabular-nums">
                {revenueLoading && !revenueStats ? (
                  <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                ) : (
                  formatVND(revenueStats?.last_30_days?.total_revenue || 0)
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
                    <span>Sạc xe:</span>
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {formatVND(revenueStats?.last_30_days?.charging_revenue || 0)}{' '}
                    <span className="font-normal text-[11px] text-slate-500">
                      ({revenueStats?.last_30_days?.session_count || 0} phiên)
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span>Nạp ví:</span>
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {formatVND(revenueStats?.last_30_days?.topup_revenue || 0)}{' '}
                    <span className="font-normal text-[11px] text-slate-500">
                      ({revenueStats?.last_30_days?.topup_count || 0} đơn)
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Biểu Đồ Cột Xu Hướng Doanh Thu Hằng Ngày */}
          {showRevenueChart && (
            <div className="mt-2 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Biểu Đồ Xu Hướng Doanh Thu ({revenuePeriod === '30D' ? '30 Ngày Gần Nhất' : '7 Ngày Gần Nhất'})
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    (VND &bull; Giờ VN UTC+7)
                  </span>
                </div>
                <div className="flex items-center space-x-4 text-xs">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
                    <span className="text-slate-600 dark:text-slate-400 text-[11px]">Sạc xe</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                    <span className="text-slate-600 dark:text-slate-400 text-[11px]">Nạp ví</span>
                  </div>
                </div>
              </div>

              {/* Bar visualization */}
              {(() => {
                const currentChartData =
                  revenuePeriod === '30D'
                    ? revenueStats?.chart_30d || []
                    : revenueStats?.chart_7d || [];

                if (currentChartData.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs text-slate-400 italic">
                      Chưa có dữ liệu giao dịch trong kỳ này.
                    </div>
                  );
                }

                const maxTotal = Math.max(
                  ...currentChartData.map((d) => Number(d.total_revenue || 0)),
                  1
                );

                return (
                  <div className="space-y-1">
                    <div className="h-44 flex items-end gap-1.5 sm:gap-2 pt-4 pb-2 px-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
                      {currentChartData.map((day, idx) => {
                        const total = Number(day.total_revenue || 0);
                        const charging = Number(day.charging_revenue || 0);
                        const topup = Number(day.topup_revenue || 0);
                        const heightPercent =
                          total > 0 ? Math.max(8, Math.round((total / maxTotal) * 100)) : 4;
                        const chargingPercent =
                          total > 0 ? Math.round((charging / total) * 100) : 0;
                        const topupPercent = total > 0 ? 100 - chargingPercent : 0;

                        return (
                          <div
                            key={day.date || idx}
                            className="flex-1 min-w-[28px] sm:min-w-[34px] flex flex-col items-center justify-end h-full group relative"
                          >
                            {/* Hover Tooltip */}
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col z-30 pointer-events-none bg-slate-900 text-white text-[10px] p-2.5 rounded-lg shadow-xl whitespace-nowrap min-w-[140px] border border-slate-700">
                              <div className="font-bold border-b border-slate-700 pb-1 mb-1 text-slate-200">
                                Ngày: {day.date}
                              </div>
                              <div className="flex justify-between gap-2 text-cyan-300">
                                <span>Sạc xe:</span>
                                <span className="font-semibold">{formatVND(charging)}</span>
                              </div>
                              <div className="flex justify-between gap-2 text-emerald-300">
                                <span>Nạp ví:</span>
                                <span className="font-semibold">{formatVND(topup)}</span>
                              </div>
                              <div className="flex justify-between gap-2 border-t border-slate-700 pt-1 mt-1 font-bold text-amber-300">
                                <span>Tổng:</span>
                                <span>{formatVND(total)}</span>
                              </div>
                            </div>

                            {/* Bar Stack */}
                            <div
                              style={{ height: `${heightPercent}%` }}
                              className="w-full max-w-[26px] rounded-t-md overflow-hidden flex flex-col-reverse transition-all duration-300 group-hover:opacity-90 shadow-sm bg-slate-100 dark:bg-slate-800"
                            >
                              {topup > 0 && (
                                <div
                                  style={{ height: `${topupPercent}%` }}
                                  className="w-full bg-emerald-500 hover:bg-emerald-400 transition-colors"
                                  title={`Nạp ví: ${formatVND(topup)}`}
                                />
                              )}
                              {charging > 0 && (
                                <div
                                  style={{ height: `${chargingPercent}%` }}
                                  className="w-full bg-cyan-500 hover:bg-cyan-400 transition-colors"
                                  title={`Sạc xe: ${formatVND(charging)}`}
                                />
                              )}
                              {total === 0 && (
                                <div className="w-full h-1 bg-slate-200 dark:bg-slate-700" />
                              )}
                            </div>

                            {/* Date Label */}
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 truncate w-full text-center">
                              {day.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* GIAO DIỆN PHÊ DUYỆT NẠP TIỀN (DÀNH CHO ADMIN & CHỦ TRẠM CPO) */}
      {/* ========================================================================= */}
      {canApprove && viewTab === 'APPROVALS' && (
        <div className="space-y-5">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span>ĐƠN ĐANG CHỜ DUYỆT</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-2 tabular-nums">
                {adminPendingCount} <span className="text-xs font-normal text-slate-500">yêu cầu</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span>TỔNG TIỀN CHỜ DUYỆT</span>
                <DollarSignIcon className="w-4 h-4 text-sky-500" />
              </div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-2 tabular-nums">
                {formatVND(
                  adminOrders
                    .filter((o) => o.status === 'PENDING')
                    .reduce((sum, o) => sum + Number(o.amount || 0), 0)
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span>ĐƠN ĐÃ XỬ LÝ HÔM NAY</span>
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
                {adminOrders.filter((o) => o.status === 'SUCCESS').length}{' '}
                <span className="text-xs font-normal text-slate-500">đã duyệt</span>
              </div>
            </div>
          </div>

          {/* Bảng Quản lý và Phê duyệt */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <FileCheck2 className="w-5 h-5 text-sky-500" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Danh Sách Yêu Cầu Nạp Tiền
                </h2>
              </div>

              {/* Tìm kiếm & Lọc trạng thái */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    placeholder="Tìm theo mã đơn, tài xế..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500 w-48 sm:w-60"
                  />
                </div>

                <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
                  {['PENDING', 'ALL', 'SUCCESS', 'FAILED'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setAdminFilter(st)}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                        adminFilter === st
                          ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {st === 'PENDING'
                        ? 'Chờ duyệt'
                        : st === 'ALL'
                        ? 'Tất cả'
                        : st === 'SUCCESS'
                        ? 'Đã duyệt'
                        : 'Từ chối'}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={fetchAdminOrders}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Làm mới danh sách"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${adminOrdersLoading ? 'animate-spin text-sky-500' : ''}`}
                  />
                </button>
              </div>
            </div>

            {/* Bảng Dữ Liệu */}
            <div className="overflow-x-auto">
              {filteredAdminOrders.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">
                  {adminOrdersLoading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-sky-500" />
                      <span>Đang tải dữ liệu...</span>
                    </div>
                  ) : (
                    'Không có yêu cầu nạp tiền nào phù hợp với bộ lọc.'
                  )}
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="pb-3 font-semibold">Mã đơn</th>
                      <th className="pb-3 font-semibold">Tài xế / Khách hàng</th>
                      <th className="pb-3 font-semibold">Số tiền</th>
                      <th className="pb-3 font-semibold">Thời gian gửi</th>
                      <th className="pb-3 font-semibold">Trạng thái</th>
                      <th className="pb-3 font-semibold text-right">Thao tác duyệt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredAdminOrders.map((order) => {
                      const isPending = order.status === 'PENDING';
                      const isProcessing = processingOrderId === order.order_code;
                      return (
                        <tr
                          key={order.order_code}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                            {order.order_code}
                          </td>
                          <td className="py-3.5">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {order.full_name || order.username}
                            </div>
                            <div className="text-xs text-slate-400">
                              @{order.username} &bull; {order.email}
                            </div>
                          </td>
                          <td className="py-3.5 font-bold text-sm text-sky-600 dark:text-sky-400 tabular-nums">
                            +{formatVND(order.amount)}
                          </td>
                          <td className="py-3.5 text-slate-500 text-xs tabular-nums">
                            {formatVNDateTime(order.created_at)}
                          </td>
                          <td className="py-3.5">
                            {order.status === 'PENDING' ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                <Clock className="w-3.5 h-3.5 animate-spin text-amber-500" />
                                <span>Chờ đối soát</span>
                              </span>
                            ) : order.status === 'SUCCESS' ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Đã duyệt</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                                title={order.failure_reason || ''}
                              >
                                <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                <span>Từ chối</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 text-right">
                            {isPending ? (
                              <div className="inline-flex items-center space-x-2">
                                <button
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() => handleAdminApprove(order.order_code)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition-colors shadow-sm inline-flex items-center space-x-1"
                                >
                                  {isProcessing ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                  <span>Duyệt nạp</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() => setRejectingOrder(order)}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold text-xs transition-colors"
                                >
                                  Từ chối
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">
                                {order.status === 'SUCCESS' ? 'Hoàn tất' : 'Đã hủy'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GIAO DIỆN VÍ CỦA TÔI (CHO TÀI XẾ HOẶC ADMIN KHI XEM VÍ CÁ NHÂN) */}
      {/* ========================================================================= */}
      {(!canApprove || viewTab === 'MY_WALLET') && (
        <div className="space-y-6">
          {/* Banner thông báo các đơn nạp đang chờ Ban quản lý phê duyệt (nếu có) */}
          {pendingOrders.length > 0 && (
            <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Clock className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Bạn có {pendingOrders.length} yêu cầu nạp tiền đang chờ Ban quản trị duyệt
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Mã đơn: <strong className="font-mono">{pendingOrders[0].order_code}</strong> &bull; Số tiền:{' '}
                    <strong className="text-amber-700 dark:text-amber-300">
                      {formatVND(pendingOrders[0].amount)}
                    </strong>{' '}
                    (Đang chờ đối soát sao kê)
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setFlowInspectionOrder(pendingOrders[0])}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors shadow-sm flex items-center space-x-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-500" />
                  <span>Kiểm tra trạng thái</span>
                </button>
              </div>
            </div>
          )}

          {/* Main Grid: Cột trái (Thẻ ví + Form nạp tiền) & Cột phải (Lịch sử giao dịch sổ cái) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* CỘT TRÁI (5/12): THẺ VÍ KỸ THUẬT SỐ & FORM NẠP TIỀN */}
            <div className="lg:col-span-5 space-y-5">
              {/* 1. Thẻ Thành Viên Kỹ Thuật Số */}
              <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950 text-white border border-slate-800 shadow-xl">
                <div className="absolute -right-12 -bottom-12 w-48 h-48 rounded-full bg-sky-500/15 blur-2xl pointer-events-none" />
                <div className="absolute -left-12 -top-12 w-40 h-40 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

                <div className="relative z-10 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
                        <Zap className="w-4 h-4 fill-sky-400" />
                      </div>
                      <div>
                        <div className="text-[11px] font-bold tracking-wider text-slate-300 uppercase">
                          EV CSMS MEMBER CARD
                        </div>
                        <div className="text-[10px] text-slate-400">Hệ thống Trạm sạc Quốc gia</div>
                      </div>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200 border border-white/15 backdrop-blur-sm">
                      VIP DRIVER
                    </span>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium text-slate-400 tracking-wide uppercase">
                      SỐ DƯ KHẢ DỤNG
                    </div>
                    <div className="flex items-baseline space-x-2 mt-1">
                      <span
                        data-testid="wallet-balance-value"
                        className={`text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums ${
                          balanceRounded < 0 ? 'text-rose-400' : 'text-white'
                        }`}
                      >
                        {balanceRounded.toLocaleString('vi-VN')}
                      </span>
                      <span className="text-base font-semibold text-slate-400">₫</span>
                    </div>
                  </div>

                  <div className="flex items-end justify-between pt-2 border-t border-white/10 text-xs">
                    <div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider">CHỦ TÀI KHOẢN</div>
                      <div className="font-bold tracking-wide uppercase text-slate-100 mt-0.5">
                        {user?.full_name || guestName || 'Trần Thị Bích Ngọc'}
                      </div>
                    </div>

                    {balanceRounded < 0 ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        <AlertOctagon className="w-3 h-3" />
                        <span>Đang ghi nợ cước</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Sẵn sàng sạc xe</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Form Nạp Tiền Đa Kênh */}
              <form
                onSubmit={handleCreateTopupOrder}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-sm space-y-5"
              >
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    Nạp tiền vào ví
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Gửi yêu cầu nạp tiền để Ban quản lý đối soát và duyệt vào tài khoản
                  </p>
                </div>

                {/* Chọn phương thức thanh toán */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    1. Phương thức thanh toán:
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
                          className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/30 ring-1 ring-sky-500'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex items-start justify-between w-full mb-1.5">
                            <div
                              className={`p-1.5 rounded-lg ${
                                isSelected
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
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

                {/* Chọn số tiền nạp */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    2. Chọn số tiền nạp:
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {QUICK_TOPUP_AMOUNTS.map((amt) => {
                      const isSelected = Number(sandboxAmount) === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => handleSandboxAmountChange(String(amt))}
                          className={`py-2 px-1 rounded-xl border text-center font-semibold transition-all ${
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

                {/* Nhập số tiền khác */}
                <div className="space-y-1.5">
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
                      placeholder="Nhập số tiền khác (VD: 150000)"
                      className={`w-full bg-slate-50 dark:bg-slate-800/80 border p-2.5 rounded-xl text-slate-900 dark:text-slate-100 tabular-nums text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                        amountError
                          ? 'border-rose-500 focus:ring-rose-500'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    />
                    <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400">
                      ₫
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
                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-xs space-y-1 text-slate-600 dark:text-slate-400">
                      <div className="flex justify-between">
                        <span>Số dư hiện tại:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {formatVND(balanceRounded)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Số tiền nạp:</span>
                        <span className="font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                          +{formatVND(sandboxAmount || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-700/60 pt-1 text-slate-900 dark:text-slate-100 font-bold">
                        <span>Số dư sau khi duyệt:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {formatVND(balanceRounded + Number(sandboxAmount || 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  data-testid="sandbox-submit-btn"
                  disabled={creatingOrder || Boolean(amountError)}
                  className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-sky-600/20"
                >
                  {creatingOrder ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>ĐANG MỞ CỔNG THANH TOÁN...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>NẠP TIỀN NGAY • {formatVND(sandboxAmount || 0)}</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* CỘT PHẢI (7/12): LỊCH SỬ BIẾN ĐỘNG SỐ DƯ & SỔ CÁI THANH TOÁN */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                      Lịch Sử Giao Dịch Ví
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Tổng số {filteredTransactions.length} giao dịch được ghi nhận trong sổ cái
                    </p>
                  </div>

                  <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
                    {[
                      { key: 'ALL', label: 'Tất cả', count: transactions.length },
                      { key: 'TOPUP', label: 'Nạp tiền', count: topupTxsCount },
                      { key: 'CHARGE_FEE', label: 'Cước sạc', count: chargeTxsCount },
                      {
                        key: 'PENALTY',
                        label: 'Phí giữ chỗ',
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
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                            isSelected
                              ? tab.highlight
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'bg-sky-600 text-white shadow-sm'
                              : tab.highlight && tab.count > 0
                              ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                              isSelected
                                ? 'bg-black/20 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bảng Danh Sách Giao Dịch */}
                <div className="overflow-x-auto">
                  {filteredTransactions.length === 0 ? (
                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-16">
                      Không có giao dịch nào được ghi nhận cho bộ lọc này.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {currentTransactions.map((tx) => {
                        const isCredit = tx.transaction_type === 'TOPUP';
                        const isPenalty = isPenaltyTransaction(tx);
                        const amountNum = Number(tx.amount);
                        const status = String(tx.status || 'SUCCESS').toUpperCase();
                        const isCancelled = status === 'CANCELLED';
                        const isFailed = status === 'FAILED';
                        const isPending = status === 'PENDING';

                        const targetLink = isCredit
                          ? '/wallet'
                          : isPenalty
                          ? `/reservations?highlight=${tx.reference_id || tx.id}`
                          : `/session/${tx.reference_id || tx.id}`;

                        const isTopupType = isCredit || isCancelled || isFailed || isPending;

                        return (
                          <div
                            key={tx.id}
                            className={`py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 px-2 rounded-xl transition-colors ${
                              isCancelled ? 'opacity-75' : ''
                            }`}
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                  isCancelled
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                                    : isFailed
                                    ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                                    : isPending
                                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                                    : isCredit
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                                    : isPenalty
                                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {isCancelled ? (
                                  <XCircle className="w-4 h-4 text-slate-400" />
                                ) : isFailed ? (
                                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                                ) : isPending ? (
                                  <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
                                ) : isCredit ? (
                                  <ArrowDownLeft className="w-4 h-4" />
                                ) : isPenalty ? (
                                  <Clock className="w-4 h-4" />
                                ) : (
                                  <ArrowUpRight className="w-4 h-4" />
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center space-x-2">
                                  <span
                                    className={`text-xs font-bold truncate ${
                                      isCancelled
                                        ? 'line-through text-slate-500'
                                        : 'text-slate-900 dark:text-slate-100'
                                    }`}
                                  >
                                    {isCredit
                                      ? 'Nạp tiền vào ví'
                                      : isPenalty
                                      ? 'Phí giữ chỗ quá hạn'
                                      : 'Cước sạc xe điện'}
                                  </span>

                                  {isCancelled && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700">
                                      ĐÃ HỦY
                                    </span>
                                  )}
                                  {isFailed && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                                      TỪ CHỐI
                                    </span>
                                  )}
                                  {isPending && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                      CHỜ DUYỆT
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {tx.note || `Mã tham chiếu: #${tx.reference_id || tx.id}`} &bull;{' '}
                                  {formatVNDateTime(tx.created_at)}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div
                                className={`text-sm font-extrabold tabular-nums ${
                                  isCancelled
                                    ? 'line-through text-slate-400'
                                    : isFailed
                                    ? 'line-through text-rose-500'
                                    : isPending
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : isCredit
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : isPenalty
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {isCancelled ? '±' : isCredit ? '+' : '-'}
                                {formatVND(Math.abs(amountNum))}
                              </div>
                              {isTopupType ? (
                                <button
                                  type="button"
                                  onClick={() => setFlowInspectionOrder(tx.rawOrder || tx)}
                                  className="inline-flex items-center text-[10px] text-sky-600 hover:text-sky-700 font-semibold mt-0.5 cursor-pointer"
                                >
                                  <span>Chi tiết</span>
                                  <ChevronRight className="w-3 h-3 ml-0.5" />
                                </button>
                              ) : (
                                <Link
                                  to={targetLink}
                                  className="inline-flex items-center text-[10px] text-sky-600 hover:text-sky-700 font-semibold mt-0.5"
                                >
                                  <span>Chi tiết</span>
                                  <ChevronRight className="w-3 h-3 ml-0.5" />
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Phân trang */}
                {filteredTransactions.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3 flex items-center justify-between text-xs text-slate-500">
                    <div>
                      Trang {currentPage} / {totalPages}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                        className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                      >
                        Trước
                      </button>
                      <button
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                        className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                      >
                        Sau
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
          MODAL CỔNG THANH TOÁN (CHO TÀI XẾ QUÉT MÃ / ĐIỀN THÔNG TIN NẠP)
         ============================================================================ */}
      {sandboxCheckout && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-xl w-full rounded-2xl shadow-2xl overflow-hidden my-auto animate-scaleUp">
            {/* Header Cổng Thanh Toán */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-base tracking-tight">CỔNG THANH TOÁN EV-PAY</h3>
                    <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      BẢO MẬT SSL 256-BIT
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Đơn hàng #<span data-testid="checkout-order-code">{sandboxCheckout.orderCode}</span> &bull; Hết hạn sau:{' '}
                    <span className="text-amber-400 font-mono font-bold">
                      {formatCountdown(checkoutCountdown)}
                    </span>
                  </p>
                </div>
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

            {/* 1. MÀN HÌNH NẠP TIỀN THÀNH CÔNG (TỰ ĐỘNG 100%, KHÔNG CẦN CHỜ DUYỆT) */}
            {checkoutStep === 'SUCCESS' ? (
              <div className="p-8 text-center space-y-5 animate-scaleUp">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <div>
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>TỰ ĐỘNG XÁC NHẬN QUA SEPAY</span>
                  </span>
                  <h4 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                    Nạp Tiền Thành Công!
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    Hệ thống đã nhận được tiền từ ngân hàng và tự động cộng trực tiếp vào ví của bạn.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs space-y-2 max-w-sm mx-auto">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Mã giao dịch:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      #{successOrderInfo?.order_code || sandboxCheckout.orderCode}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Số tiền nạp:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      +{formatVND(successOrderInfo?.amount || sandboxCheckout.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700/60 text-slate-500">
                    <span>Số dư ví hiện tại:</span>
                    <span className="font-extrabold text-sky-600 dark:text-sky-400">
                      {formatVND(wallet?.balance || 0)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSandboxCheckout(null);
                    setCheckoutStep('INPUT');
                  }}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-600/20"
                >
                  HOÀN TẤT &amp; VỀ VÍ CỦA TÔI
                </button>
              </div>
            ) : checkoutStep === 'CHECKING' ? (
              /* 2. MÀN HÌNH ĐANG KIỂM TRA WEBHOOK SEPAY TỰ ĐỘNG */
              <div className="p-8 text-center space-y-5 animate-scaleUp">
                <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-sky-500/20 animate-ping" />
                  <div className="relative w-14 h-14 bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 rounded-full flex items-center justify-center shadow-md">
                    <RefreshCw className="w-7 h-7 animate-spin" />
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Đang Kiểm Tra Biến Động Số Dư SePay...
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    Hệ thống đang tự động đối soát giao dịch chuyển khoản. Tiền sẽ được cộng tức thì ngay khi ngân hàng xác nhận (còn <strong className="text-sky-600 dark:text-sky-400 font-mono">{checkingSecondsLeft}s</strong>)...
                  </p>
                </div>

                <div className="p-3 bg-sky-50 dark:bg-sky-950/30 rounded-xl border border-sky-200 dark:border-sky-800/50 text-[11px] text-sky-700 dark:text-sky-300 max-w-sm mx-auto flex items-center justify-center space-x-2">
                  <Radio className="w-4 h-4 text-sky-500 animate-pulse shrink-0" />
                  <span>Đang mở cổng lắng nghe Webhook ngân hàng thời gian thực...</span>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={processingGatewayAction}
                      onClick={handleOpenSepayGateway}
                      className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Mở Lại Trang SePay</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckoutStep('INPUT')}
                      className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Xem Mã VietQR</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={processingGatewayAction}
                      onClick={() => handleCancelTopupOrder(sandboxCheckout.orderCode)}
                      className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:text-slate-400 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-colors flex items-center justify-center space-x-1"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Hủy Đơn Nạp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutStep('TIMEOUT_OR_ERROR');
                        setSubmittedOrderInfo({
                          orderCode: sandboxCheckout.orderCode,
                          amount: sandboxCheckout.amount,
                          channelName: 'Chuyển khoản VietQR',
                        });
                      }}
                      className="py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-semibold transition-colors flex items-center justify-center space-x-1"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Chờ Admin Duyệt</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : checkoutStep === 'TIMEOUT_OR_ERROR' || submittedOrderInfo ? (
              /* 3. MÀN HÌNH CHỜ ADMIN DUYỆT THỦ CÔNG (CHỈ KHI LỖI HỆ THỐNG HOẶC TREO CHỜ WEBHOOK) */
              <div className="p-8 text-center space-y-4 animate-scaleUp">
                <div className="w-14 h-14 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <Clock className="w-8 h-8" />
                </div>

                <div>
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    <span>CHỜ ĐỐI SOÁT THỦ CÔNG</span>
                  </span>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-2">
                    Giao Dịch Đang Chờ Quản Trị Viên Duyệt
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    Mã đơn: <strong className="font-mono text-slate-900 dark:text-slate-100">#{sandboxCheckout?.orderCode || submittedOrderInfo?.orderCode}</strong> &bull; Số tiền:{' '}
                    <strong className="text-sky-600 dark:text-sky-400">{formatVND(sandboxCheckout?.amount || submittedOrderInfo?.amount || 0)}</strong>
                  </p>
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-left text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
                  <div className="font-bold flex items-center space-x-1.5">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Hệ thống ngân hàng đang bị trễ hoặc chưa nhận được Webhook</span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    Hệ thống chưa nhận được tín hiệu xác nhận tự động từ ngân hàng (có thể do nghẽn mạng ngân hàng hoặc sai cú pháp). Đơn nạp đã được chuyển sang hàng đợi để Admin &amp; Chủ trạm đối soát thủ công. Bạn không cần chuyển khoản lại.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSandboxCheckout(null);
                      setCheckoutStep('INPUT');
                    }}
                    className="flex-1 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-sky-600/20"
                  >
                    ĐÃ HIỂU &amp; VỀ VÍ CỦA TÔI
                  </button>
                  <button
                    type="button"
                    disabled={processingGatewayAction}
                    onClick={() =>
                      handleCancelTopupOrder(
                        sandboxCheckout?.orderCode || submittedOrderInfo?.orderCode
                      )
                    }
                    className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:text-slate-300 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-300 font-bold text-xs transition-colors"
                  >
                    HỦY ĐƠN
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Thanh tóm tắt thanh toán */}
                <div className="bg-slate-50 dark:bg-slate-800/60 px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="text-slate-600 dark:text-slate-400">
                    Tài xế:{' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {user?.full_name || 'Trần Thị Bích Ngọc'}
                    </strong>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-500">Số tiền:</span>
                    <span className="text-base font-extrabold text-sky-600 dark:text-sky-400 tabular-nums">
                      {formatVND(sandboxCheckout.amount)}
                    </span>
                  </div>
                </div>

                {/* Tabs Phương Thức Thanh Toán */}
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
                          className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            isActive
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{ch.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Nội Dung Từng Phương Thức */}
                <div className="p-5 sm:p-6 space-y-5">
                  {/* 1. CHUYỂN KHOẢN VIETQR */}
                  {activeGatewayTab === 'VIETQR' && (
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <div className="flex flex-col items-center justify-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                        <div className="p-2 bg-white rounded-xl shadow-md border border-slate-200">
                          <img
                            src={vietQrUrl}
                            alt="Mã QR Chuyển khoản"
                            className="w-44 h-44 object-contain mx-auto"
                          />
                        </div>
                        <div className="mt-2 text-[10px] text-slate-500 font-medium">
                          Quét bằng app ngân hàng bất kỳ
                        </div>
                      </div>

                      <div className="space-y-2.5 w-full text-xs">
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Ngân hàng:</span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              MB Bank (Quân Đội)
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Số tài khoản:</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                                999988886666
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy('999988886666')}
                                className="p-1 text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-700 rounded transition-colors"
                              >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Chủ tài khoản:</span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              CONG TY CP EV CSMS
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Số tiền:</span>
                            <span className="font-extrabold text-sky-600 dark:text-sky-400 tabular-nums font-mono">
                              {formatVND(sandboxCheckout.amount)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 dark:border-slate-700/60">
                            <span className="text-slate-500 font-semibold">Nội dung CK:</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                                {transferContent}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(transferContent)}
                                className="p-1 text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-700 rounded transition-colors"
                              >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={processingGatewayAction}
                          onClick={handleDriverConfirmPayment}
                          className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-600/20"
                        >
                          {processingGatewayAction ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>ĐANG GỬI THÔNG TIN...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>TÔI ĐÃ CHUYỂN KHOẢN XONG</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={processingGatewayAction}
                          onClick={handleOpenSepayGateway}
                          className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-sky-600 dark:text-sky-400 font-bold text-xs uppercase tracking-wider transition-all border border-slate-200 dark:border-slate-700"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>MỞ TRANG THANH TOÁN SEPAY (PG)</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. THẺ QUỐC TẾ */}
                  {activeGatewayTab === 'CARD' && (
                    <div className="space-y-4 text-xs">
                      <div className="space-y-1">
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold">
                          Số thẻ quốc tế:
                        </label>
                        <div className="relative">
                          <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input
                            type="text"
                            value={cardForm.cardNumber}
                            onChange={handleCardNumberChange}
                            placeholder="4242 4242 4242 4242"
                            maxLength={19}
                            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 pl-9 pr-14 py-2.5 rounded-xl text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                          <span className="absolute right-3 top-2.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {getCardBrand(cardForm.cardNumber)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold">
                          Tên in trên thẻ (không dấu):
                        </label>
                        <input
                          type="text"
                          value={cardForm.cardHolder}
                          onChange={(e) =>
                            setCardForm((prev) => ({
                              ...prev,
                              cardHolder: e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="TRAN THI BICH NGOC"
                          className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-slate-900 dark:text-slate-100 font-mono text-xs uppercase focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-slate-700 dark:text-slate-300 font-semibold">
                            Ngày hết hạn:
                          </label>
                          <input
                            type="text"
                            value={cardForm.expiry}
                            onChange={handleExpiryChange}
                            placeholder="MM/YY"
                            maxLength={5}
                            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-slate-900 dark:text-slate-100 font-mono text-xs text-center focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-slate-700 dark:text-slate-300 font-semibold">
                            Mã bảo mật CVV:
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
                              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 pl-8 pr-3 py-2.5 rounded-xl text-slate-900 dark:text-slate-100 font-mono text-xs text-center focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={processingGatewayAction}
                        onClick={handleDriverConfirmPayment}
                        className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-sky-600/20"
                      >
                        <Lock className="w-4 h-4" />
                        <span>GỬI YÊU CẦU NẠP THẺ • {formatVND(sandboxCheckout.amount)}</span>
                      </button>
                    </div>
                  )}

                  {/* 3. VÍ ĐIỆN TỬ */}
                  {activeGatewayTab === 'EWALLET' && (
                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-3 gap-2.5">
                        {[
                          { id: 'MOMO', name: 'Ví MoMo', color: 'border-pink-500' },
                          { id: 'VNPAY', name: 'VNPAY-QR', color: 'border-red-500' },
                          { id: 'ZALOPAY', name: 'ZaloPay', color: 'border-blue-500' },
                        ].map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => setSelectedEwallet(w.id)}
                            className={`p-3 rounded-xl border text-center transition-all ${
                              selectedEwallet === w.id
                                ? `${w.color} bg-slate-50 dark:bg-slate-800 ring-2 ring-sky-500 font-bold`
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <Smartphone className="w-5 h-5 mx-auto mb-1 text-slate-700 dark:text-slate-300" />
                            <div className="font-bold text-slate-900 dark:text-slate-100">{w.name}</div>
                          </button>
                        ))}
                      </div>

                      <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
                        <img
                          src={vietQrUrl}
                          alt="QR Ví"
                          className="w-24 h-24 object-contain rounded-lg"
                        />
                        <div className="text-slate-600 dark:text-slate-400 text-xs space-y-1">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            Quét mã qua {selectedEwallet}
                          </div>
                          <div className="text-[11px] leading-relaxed">
                            Mở ứng dụng ví trên điện thoại của bạn, chọn &ldquo;Quét mã&rdquo; và nạp{' '}
                            <strong>{formatVND(sandboxCheckout.amount)}</strong>.
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={processingGatewayAction}
                        onClick={handleDriverConfirmPayment}
                        className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-purple-600/20"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>XÁC NHẬN ĐÃ QUÉT MÃ VÍ THÀNH CÔNG</span>
                      </button>
                    </div>
                  )}

                  {/* 4. THẺ ATM NỘI ĐỊA */}
                  {activeGatewayTab === 'ATM' && (
                    <div className="space-y-4 text-xs">
                      <div className="space-y-1.5">
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold">
                          Ngân hàng phát hành thẻ:
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {POPULAR_BANKS.map((b) => (
                            <button
                              key={b.code}
                              type="button"
                              onClick={() => setSelectedAtmBank(b.code)}
                              className={`p-2.5 rounded-xl border text-center transition-all ${
                                selectedAtmBank === b.code
                                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 ring-1 ring-sky-500 font-bold text-sky-700 dark:text-sky-300'
                                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <div className="font-extrabold text-sm">{b.logoText}</div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                {b.name}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold">
                          Số thẻ ATM Napas:
                        </label>
                        <input
                          type="text"
                          value={atmCardNumber}
                          onChange={(e) => setAtmCardNumber(e.target.value)}
                          placeholder="9704 •••• •••• ••••"
                          className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={processingGatewayAction}
                        onClick={handleDriverConfirmPayment}
                        className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-600/20"
                      >
                        <Building2 className="w-4 h-4" />
                        <span>XÁC NHẬN NẠP QUA CỔNG NAPAS</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Hidden Test Runner Elements (Bảo tồn trọn vẹn testids AC1-AC4 cho automated test) */}
            <div className="sr-only" aria-hidden="true">
              <button
                type="button"
                data-testid="sandbox-btn-success"
                onClick={handleSandboxPaySuccess}
              >
                AC1_AC2_Success
              </button>
              <button
                type="button"
                data-testid="sandbox-btn-pending-return"
                onClick={handleSandboxReturnBeforeWebhook}
              >
                AC3_Pending
              </button>
              <button
                type="button"
                data-testid="sandbox-btn-failed"
                onClick={handleSandboxPayFailed}
              >
                AC4_Failed
              </button>
              <button
                type="button"
                data-testid="sandbox-btn-cancel"
                onClick={handleSandboxCancel}
              >
                AC4_Cancelled
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận Từ Chối Đơn Nạp của Admin / Chủ Trạm */}
      {rejectingOrder && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-md w-full rounded-2xl p-6 space-y-4 shadow-2xl animate-scaleUp text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Từ Chối Đơn Nạp Tiền
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectingOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600 dark:text-slate-400">
              Bạn đang từ chối đơn nạp <strong className="font-mono text-slate-900 dark:text-slate-100">#{rejectingOrder.order_code}</strong> số tiền{' '}
              <strong className="text-rose-600">{formatVND(rejectingOrder.amount)}</strong> của tài xế{' '}
              <strong>{rejectingOrder.full_name || rejectingOrder.username}</strong>.
            </p>

            <div className="space-y-1">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                Lý do từ chối:
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập lý do từ chối..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={processingOrderId === rejectingOrder.order_code}
                onClick={handleAdminRejectConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors shadow-sm"
              >
                Xác Nhận Từ Chối
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================
          MODAL CHI TIẾT DÒNG TIỀN & TRẠNG THÁI GIAO DỊCH (SCRUM-SEPAY-FLOW)
         ============================================================================ */}
      {flowInspectionOrder && (() => {
        const orderCode =
          flowInspectionOrder.order_code ||
          flowInspectionOrder.reference_id ||
          flowInspectionOrder.id;
        const amount = Number(flowInspectionOrder.amount || 0);
        const rawStatus = String(flowInspectionOrder.status || 'SUCCESS').toUpperCase();
        const isCancelled = rawStatus === 'CANCELLED';
        const isFailed = rawStatus === 'FAILED';
        const isPending = rawStatus === 'PENDING';
        const isSuccess = rawStatus === 'SUCCESS';

        return (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden my-auto animate-scaleUp">
              {/* Header Modal */}
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30">
                    <Radio className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm tracking-wide uppercase">
                      Chi Tiết Dòng Tiền &amp; Trạng Thái
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Mã giao dịch: <span className="font-mono text-sky-300 font-semibold">#{orderCode}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFlowInspectionOrder(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Thẻ tóm tắt số tiền & Trạng thái hiện tại */}
              <div className="p-6 space-y-6">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                      Số tiền giao dịch
                    </div>
                    <div
                      className={`text-2xl font-extrabold tabular-nums mt-0.5 ${
                        isCancelled
                          ? 'line-through text-slate-400'
                          : isFailed
                          ? 'line-through text-rose-500'
                          : isPending
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {isCancelled ? '±' : isSuccess ? '+' : ''}
                      {formatVND(Math.abs(amount))}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
                      Trạng thái hiện tại
                    </div>
                    {isSuccess && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>HOÀN TẤT</span>
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                        <span>CHỜ ĐỐI SOÁT</span>
                      </span>
                    )}
                    {isCancelled && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                        <XCircle className="w-3.5 h-3.5 text-slate-500" />
                        <span>ĐÃ HỦY</span>
                      </span>
                    )}
                    {isFailed && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span>TỪ CHỐI</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* TIMELINE SƠ ĐỒ DÒNG TIỀN (3 BƯỚC MINH BẠCH) */}
                <div className="space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Tiến Trình Di Chuyển Dòng Tiền (Audit Trail):
                  </div>

                  <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                    {/* Bước 1: Khởi tạo */}
                    <div className="relative">
                      <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-4 ring-white dark:ring-slate-900 shadow-sm">
                        <Check className="w-3 h-3" />
                      </div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        1. Khởi tạo yêu cầu nạp tiền
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Đơn nạp #{orderCode} được tạo vào lúc{' '}
                        {flowInspectionOrder.created_at
                          ? formatVNDateTime(flowInspectionOrder.created_at)
                          : 'vừa xong'}.
                      </p>
                    </div>

                    {/* Bước 2: SePay & Ngân hàng */}
                    <div className="relative">
                      <div
                        className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-slate-900 shadow-sm ${
                          isSuccess
                            ? 'bg-emerald-500 text-white'
                            : isPending
                            ? 'bg-sky-500 text-white animate-pulse'
                            : isCancelled
                            ? 'bg-slate-400 text-white'
                            : 'bg-rose-500 text-white'
                        }`}
                      >
                        {isSuccess ? (
                          <Check className="w-3 h-3" />
                        ) : isPending ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : isCancelled ? (
                          <X className="w-3 h-3" />
                        ) : (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        2. Cổng thanh toán SePay &amp; Biến động số dư ngân hàng
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {isSuccess
                          ? 'Ngân hàng đã xác nhận chuyển khoản thành công và SePay phát Webhook HMAC-SHA256 chuẩn chỉ.'
                          : isPending
                          ? 'Đang chờ ngân hàng phát hiện giao dịch chuyển khoản VietQR 24/7 từ tài khoản của bạn.'
                          : isCancelled
                          ? 'Giao dịch nạp tiền đã hủy theo yêu cầu. Không phát sinh trừ tiền ngân hàng.'
                          : `Thất bại / Bị từ chối: ${
                              flowInspectionOrder.failure_reason || 'Không khớp thông tin chuyển khoản'
                            }.`}
                      </p>
                    </div>

                    {/* Bước 3: Ghi nhận số dư ví */}
                    <div className="relative">
                      <div
                        className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-slate-900 shadow-sm ${
                          isSuccess
                            ? 'bg-emerald-500 text-white'
                            : isPending
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                            : isCancelled
                            ? 'bg-slate-400 text-white'
                            : 'bg-rose-400 text-white'
                        }`}
                      >
                        {isSuccess ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Shield className="w-3 h-3" />
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        3. Ghi có số dư ví EV CSMS
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {isSuccess
                          ? 'Tiền đã được tự động cộng vào số dư ví của tài xế ngay lập tức, không qua khâu duyệt tay.'
                          : isPending
                          ? 'Sẵn sàng tự động ghi có ngay khi SePay gửi tín hiệu xác nhận hoặc Ban quản trị duyệt đối soát.'
                          : isCancelled
                          ? 'Số dư ví được bảo toàn nguyên vẹn, không phát sinh bất kỳ khoản trừ hay nợ phí nào.'
                          : 'Số dư ví không thay đổi.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Các nút tương tác cho người dùng */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                  {isPending && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isPolling}
                          onClick={async () => {
                            const res = await checkOrderStatusNow(orderCode);
                            if (res?.order) {
                              setFlowInspectionOrder(res.order);
                            }
                          }}
                          className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin' : ''}`} />
                          <span>Kiểm Tra SePay Ngay</span>
                        </button>

                        <button
                          type="button"
                          disabled={processingGatewayAction}
                          onClick={async () => {
                            try {
                              const sepayRes = await api.post('/payments/sepay/checkout-init', {
                                amount,
                                order_code: orderCode,
                              });
                              const { action_url, fields } = sepayRes.data;
                              submitSepayForm(action_url, fields);
                            } catch (err) {
                              alert('Không thể mở SePay: ' + (err.response?.data?.detail || err.message));
                            }
                          }}
                          className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Mở Lại SePay</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={processingGatewayAction}
                        onClick={() => handleCancelTopupOrder(orderCode)}
                        className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:text-slate-300 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-300 font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Hủy Yêu Cầu Nạp Tiền Này</span>
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setFlowInspectionOrder(null)}
                    className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors"
                  >
                    Đóng cửa sổ
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Hidden Table for Automated Tests */}
      <div className="sr-only" aria-hidden="true">
        {topupOrders.map((order) => (
          <div key={order.order_code} data-testid={`topup-order-row-${order.order_code}`}>
            <span>{order.order_code}</span>
            <button onClick={() => checkOrderStatusNow(order.order_code)}>Poll</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DollarSignIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
