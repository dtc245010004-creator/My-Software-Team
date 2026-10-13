/**
 * ReservationModal.jsx — Hộp thoại đặt chỗ trạm sạc.
 *
 * Props:
 *  - isOpen        {boolean}  — hiện/ẩn modal
 *  - onClose       {func}    — callback đóng modal
 *  - connector     {object}  — { id, connector_number, max_power_kw, status, charge_point_code, charge_point_id, charge_point_name, station_name }
 *  - onSuccess     {func}    — callback khi đặt chỗ thành công (nhận reservation object)
 *  - walletBalance {number}  — số dư ví hiện tại (để cảnh báo trước)
 *
 * Accesskey: Esc đóng, bấm Enter submit khi đủ điều kiện.
 * Chỉ hiển thị khi role = 'CUSTOMER'.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  X,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Zap,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CalendarClock,
  BatteryCharging,
  Info,
  Map,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import {
  buildArrivalSlots,
  formatCountdown,
  mapReservationError,
  isReservable,
  calcHoldMinutes,
} from '../utils/reservation';
import {
  createReservation,
  getMyWallet,
} from '../services/reservationApi';
import {
  MAX_RESERVATION_AHEAD_MINUTES,
  ARRIVAL_SLOT_STEP_MINUTES,
  DEFAULT_HOLD_MINUTES,
  MIN_BALANCE_FOR_RESERVATION,
  WALLET_TOPUP_ROUTE,
} from '../config/reservationConfig';

// ─── Các trạng thái của modal ───────────────────────────────────
const PHASE = {
  IDLE: 'IDLE',           // Chưa chọn giờ
  CHECKING: 'CHECKING',   // Đang kiểm tra khả dụng (mock)
  READY: 'READY',         // Đã check, sẵn sàng đặt
  SUBMITTING: 'SUBMITTING', // Đang gửi đặt chỗ
  SUCCESS: 'SUCCESS',      // Thành công
  ERROR: 'ERROR',          // Lỗi / Xung đột / Ví không đủ
};

export default function ReservationModal({
  isOpen,
  onClose,
  connector,
  onSuccess,
  walletBalance: initialWalletBalance,
}) {
  const navigate = useNavigate();
  const overlayRef = useRef(null);

  // ─── State ────────────────────────────────────────────────────
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [arrivalSlots, setArrivalSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null); // { value: ISO, label, time: Date }
  const [walletBalance, setWalletBalance] = useState(initialWalletBalance ?? null);
  const [loadingWallet, setLoadingWallet] = useState(false);

  // Kết quả
  const [confirmedReservation, setConfirmedReservation] = useState(null); // khi SUCCESS
  const [errorInfo, setErrorInfo] = useState(null); // khi ERROR
  const [suggestions, setSuggestions] = useState([]); // khi RESERVATION_CONFLICT

  // Countdown
  const [msLeft, setMsLeft] = useState(0);
  const countdownRef = useRef(null);
  const expiresAtRef = useRef(null);

  // ─── Sinh arrival slots khi modal mở ─────────────────────────
  useEffect(() => {
    if (isOpen) {
      const slots = buildArrivalSlots(new Date(), MAX_RESERVATION_AHEAD_MINUTES, ARRIVAL_SLOT_STEP_MINUTES);
      setArrivalSlots(slots);
      setPhase(PHASE.IDLE);
      setSelectedSlot(null);
      setConfirmedReservation(null);
      setErrorInfo(null);
      setSuggestions([]);
      setMsLeft(0);

      // Tải số dư ví trước
      if (initialWalletBalance === undefined || initialWalletBalance === null) {
        setLoadingWallet(true);
        getMyWallet()
          .then((w) => setWalletBalance(w.balance ?? null))
          .catch(() => setWalletBalance(null))
          .finally(() => setLoadingWallet(false));
      }
    }
  }, [isOpen, initialWalletBalance]);

  // ─── Countdown khi có reservation thành công ──────────────────
  useEffect(() => {
    if (confirmedReservation?.expires_at && phase === PHASE.SUCCESS) {
      const expiresMs = new Date(confirmedReservation.expires_at).getTime();
      expiresAtRef.current = expiresMs;

      const tick = () => {
        const remaining = expiresAtRef.current - Date.now();
        if (remaining <= 0) {
          setMsLeft(0);
          clearInterval(countdownRef.current);
        } else {
          setMsLeft(remaining);
        }
      };

      tick();
      // Cập nhật mỗi giây
      countdownRef.current = setInterval(tick, 1000);

      return () => clearInterval(countdownRef.current);
    }
    return () => {};
  }, [confirmedReservation?.expires_at, phase]);

  // ─── Dừng countdown khi tab ẩn ───────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && countdownRef.current) {
        clearInterval(countdownRef.current);
      } else if (!document.hidden && confirmedReservation?.expires_at && phase === PHASE.SUCCESS) {
        const tick = () => {
          const remaining = expiresAtRef.current - Date.now();
          setMsLeft(remaining <= 0 ? 0 : remaining);
          if (remaining <= 0) clearInterval(countdownRef.current);
        };
        countdownRef.current = setInterval(tick, 1000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [confirmedReservation?.expires_at, phase]);

  // ─── Đóng modal = cleanup ────────────────────────────────────
  const handleClose = useCallback(() => {
    clearInterval(countdownRef.current);
    setPhase(PHASE.IDLE);
    setSelectedSlot(null);
    setConfirmedReservation(null);
    setErrorInfo(null);
    setSuggestions([]);
    setMsLeft(0);
    onClose();
  }, [onClose]);

  // ─── Bấm overlay đóng ──────────────────────────────────────
  const handleOverlayClick = useCallback((e) => {
    if (e.target === overlayRef.current) handleClose();
  }, [handleClose]);

  // ─── Esc key ────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleClose]);

  // ─── Chọn slot giờ tới ──────────────────────────────────────
  const handleSlotSelect = useCallback((slot) => {
    setSelectedSlot(slot);
    setPhase(PHASE.IDLE);
    setConfirmedReservation(null);
    setErrorInfo(null);
    setSuggestions([]);
  }, []);

  // ─── Kiểm tra khả dụng (mock — backend S-48/S-49 chưa xong) ─
  const handleCheckAvailability = useCallback(async () => {
    if (!selectedSlot) return;
    setPhase(PHASE.CHECKING);

    // Simulate API delay
    await new Promise((r) => setTimeout(r, 1200));

    // Mock: kiểm tra sơ bộ client-side
    const check = isReservable(connector);
    if (!check.reservable) {
      setErrorInfo({
        code: 'CLIENT_REJECTED',
        message: check.reason || 'Cổng sạc này không thể đặt chỗ.',
      });
      setPhase(PHASE.ERROR);
      return;
    }

    // Mock: kiểm tra số dư
    if (walletBalance !== null && walletBalance < MIN_BALANCE_FOR_RESERVATION) {
      setErrorInfo({
        code: 'WALLET_BELOW_THRESHOLD',
        message: `Số dư ví hiện tại (${Number(walletBalance).toLocaleString('vi-VN')} đ) chưa đủ ngưỡng tối thiểu (${MIN_BALANCE_FOR_RESERVATION.toLocaleString('vi-VN')} đ).`,
        minBalance: MIN_BALANCE_FOR_RESERVATION,
        balance: walletBalance,
      });
      setPhase(PHASE.ERROR);
      return;
    }

    // Khả dụng → sang phase READY
    setPhase(PHASE.READY);
  }, [selectedSlot, connector, walletBalance]);

  // ─── Xác nhận đặt chỗ ──────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!selectedSlot || !connector) return;
    setPhase(PHASE.SUBMITTING);

    try {
      const payload = {
        connector_id: connector.id,
        start_time: selectedSlot.value,
        hold_minutes: DEFAULT_HOLD_MINUTES,
      };
      const result = await createReservation(payload);
      setConfirmedReservation(result);
      setPhase(PHASE.SUCCESS);
      onSuccess?.(result);
    } catch (err) {
      const mapped = mapReservationError(err);
      setErrorInfo(mapped);
      setSuggestions(mapped.suggestions || []);

      if (mapped.code === 'RESERVATION_CONFLICT') {
        setPhase(PHASE.ERROR);
      } else {
        setPhase(PHASE.ERROR);
      }
    }
  }, [selectedSlot, connector, onSuccess]);

  // ─── Đặt trụ gợi ý ──────────────────────────────────────────
  const handleBookSuggestion = useCallback(async (suggestion) => {
    // TODO: Khi backend trả expires_at thật, gọi createReservation với connector_id mới
    setSuggestions([]);
    setErrorInfo(null);
    // Mock: cập nhật connector tạm để hiện feedback
    alert('Đang đặt trụ gợi ý… (chờ backend S-48/S-49 hoàn thành)');
  }, []);

  // ─── Navigation ────────────────────────────────────────────────
  const handleGoToWallet = useCallback(() => {
    handleClose();
    navigate(WALLET_TOPUP_ROUTE);
  }, [handleClose, navigate]);

  const handleGoToMap = useCallback(() => {
    handleClose();
    navigate('/map');
  }, [handleClose, navigate]);

  // ─── Computed ─────────────────────────────────────────────────
  const holdEndTime = useMemo(() => {
    if (!selectedSlot) return null;
    const start = new Date(selectedSlot.value);
    start.setMinutes(start.getMinutes() + DEFAULT_HOLD_MINUTES);
    return start;
  }, [selectedSlot]);

  const holdEndLabel = useMemo(() => {
    if (!holdEndTime) return '';
    return holdEndTime.toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit',
      day: '2-digit', month: '2-digit',
    });
  }, [holdEndTime]);

  const countdownInfo = useMemo(() => {
    if (msLeft <= 0) return null;
    return formatCountdown(msLeft);
  }, [msLeft]);

  const canCheck = Boolean(selectedSlot && phase !== PHASE.CHECKING && phase !== PHASE.SUBMITTING);
  const canConfirm = phase === PHASE.READY && selectedSlot && !confirmedReservation;

  const isLoading = phase === PHASE.CHECKING || phase === PHASE.SUBMITTING;

  // ─── Helper render ────────────────────────────────────────────
  const renderCountdown = () => {
    if (!countdownInfo) return null;
    const urgencyColor = {
      normal: 'text-emerald-400',
      warning: 'text-amber-400',
      critical: 'text-rose-400',
      expired: 'text-slate-400',
    }[countdownInfo.urgency] || 'text-slate-300';

    return (
      <div className={`font-mono text-2xl font-black text-center ${urgencyColor} select-all`}>
        {countdownInfo.text}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────
  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reservation-modal-title"
    >
      <div
        className="bg-[#0e1422] border border-slate-700 w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-400">
              <CalendarClock className="w-4 h-4" />
            </div>
            <div>
              <h2 id="reservation-modal-title" className="text-sm font-bold text-white">
                Đặt chỗ trạm sạc
              </h2>
              <p className="text-[11px] text-slate-400">
                {connector?.station_name || 'Trạm sạc'} · Cổng #{connector?.connector_number}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body scrollable ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Thông tin trụ (static) ───────────────────────── */}
          <div className="px-5 pt-4">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-slate-800/60 rounded-xl p-2.5 text-center border border-slate-700">
                <div className="text-slate-400 mb-0.5">Trạm</div>
                <div className="text-white font-semibold truncate">{connector?.station_name || '—'}</div>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-2.5 text-center border border-slate-700">
                <div className="text-slate-400 mb-0.5">Trụ</div>
                <div className="text-white font-semibold">{connector?.charge_point_code || '—'}</div>
              </div>
              <div className="bg-slate-800/60 rounded-xl p-2.5 text-center border border-slate-700">
                <div className="text-slate-400 mb-0.5">Công suất</div>
                <div className="text-sky-400 font-semibold font-mono">
                  {connector?.max_power_kw ? `${connector.max_power_kw} kW` : '—'}
                </div>
              </div>
            </div>

            {/* Số dư ví */}
            <div className="mt-3 flex items-center justify-between bg-slate-800/40 border border-slate-700/60 rounded-xl px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-1.5 text-slate-400">
                <BatteryCharging className="w-3.5 h-3.5" />
                Số dư ví hiện tại:
              </div>
              {loadingWallet ? (
                <Skeleton variant="text" className="h-4 w-20" />
              ) : (
                <span className={`font-mono font-bold ${
                  walletBalance !== null && walletBalance < MIN_BALANCE_FOR_RESERVATION
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}>
                  {walletBalance !== null
                    ? `${Number(walletBalance).toLocaleString('vi-VN')} đ`
                    : '—'}
                </span>
              )}
            </div>
          </div>

          {/* ── PHASE: SUCCESS — Thẻ chỗ đã giữ ─────────────────── */}
          {phase === PHASE.SUCCESS && confirmedReservation && (
            <div className="px-5 py-4 space-y-3">
              {/* Card xanh thành công */}
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 text-center space-y-3">
                <div className="flex justify-center">
                  <div className="p-2.5 rounded-full bg-emerald-500/20">
                    <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                  </div>
                </div>
                <div>
                  <p className="text-emerald-400 font-bold text-sm">Đặt chỗ thành công!</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Mã đặt chỗ: <span className="font-mono font-semibold text-white">{confirmedReservation.id}</span>
                  </p>
                </div>
                <Badge variant="success" size="sm">ĐÃ GIỮ</Badge>

                {/* Countdown */}
                {countdownInfo && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-400">Thời gian giữ chỗ còn lại</p>
                    {renderCountdown()}
                    {countdownInfo.urgency === 'critical' && (
                      <p className="text-[11px] text-rose-400">⚠️ Sắp hết hạn — hãy đến trạm ngay!</p>
                    )}
                  </div>
                )}
              </div>

              {/* Thông tin chi tiết */}
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Trạm</span>
                  <span className="text-white font-medium">{confirmedReservation.station_name || connector?.station_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Trụ</span>
                  <span className="text-white font-mono">{confirmedReservation.charge_point_code || connector?.charge_point_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Cổng</span>
                  <span className="text-white">#{confirmedReservation.connector_number || connector?.connector_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Bắt đầu</span>
                  <span className="text-white">
                    {confirmedReservation.start_time
                      ? new Date(confirmedReservation.start_time).toLocaleString('vi-VN', {
                          hour: '2-digit', minute: '2-digit',
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Hết hạn</span>
                  <span className="text-white">
                    {confirmedReservation.expires_at
                      ? new Date(confirmedReservation.expires_at).toLocaleString('vi-VN', {
                          hour: '2-digit', minute: '2-digit',
                          day: '2-digit', month: '2-digit',
                        })
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Thời gian giữ</span>
                  <span className="text-white">
                    {calcHoldMinutes(confirmedReservation.start_time, confirmedReservation.expires_at)} phút
                  </span>
                </div>
              </div>

              {/* Hướng dẫn */}
              <div className="bg-sky-950/30 border border-sky-500/30 rounded-xl p-3 text-[11px] text-sky-300 space-y-1">
                <p className="font-semibold text-sky-200">📋 Hướng dẫn</p>
                <p>1. Đến trạm đúng giờ trước khi hết thời gian giữ chỗ.</p>
                <p>2. Cắm súng sạc vào xe → hệ thống sẽ tự nhận diện đặt chỗ.</p>
                <p>3. Nếu đến muộn quá 15 phút, chỗ có thể được giải phóng.</p>
              </div>

              <Button variant="primary" size="md" className="w-full" onClick={handleClose}>
                Đã hiểu
              </Button>
            </div>
          )}

          {/* ── PHASE: ERROR — Lỗi đặt chỗ ──────────────────────── */}
          {phase === PHASE.ERROR && errorInfo && (
            <div className="px-5 py-4 space-y-3">
              {/* Banner lỗi chính */}
              <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-rose-400 font-bold text-sm">
                      {errorInfo.code === 'RESERVATION_CONFLICT'
                        ? '⚠️ Trụ này vừa được người khác đặt'
                        : errorInfo.code === 'WALLET_BELOW_THRESHOLD'
                        ? '⚠️ Số dư ví không đủ'
                        : '❌ Đặt chỗ thất bại'}
                    </p>
                    <p className="text-slate-300 text-xs mt-1">{errorInfo.message}</p>

                    {/* Ví không đủ → nút nạp tiền */}
                    {errorInfo.code === 'WALLET_BELOW_THRESHOLD' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          icon={BatteryCharging}
                          onClick={handleGoToWallet}
                        >
                          Nạp tiền
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={RefreshCw}
                          onClick={handleClose}
                        >
                          Đóng
                        </Button>
                      </div>
                    )}

                    {/* S-49: Xung đột → hiện gợi ý */}
                    {errorInfo.code === 'RESERVATION_CONFLICT' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={RefreshCw}
                          onClick={() => {
                            setErrorInfo(null);
                            setPhase(PHASE.IDLE);
                            setSelectedSlot(null);
                          }}
                        >
                          Chọn giờ khác
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Map}
                          onClick={handleGoToMap}
                        >
                          Tìm trạm khác
                        </Button>
                      </div>
                    )}

                    {/* Lỗi khác */}
                    {!['RESERVATION_CONFLICT', 'WALLET_BELOW_THRESHOLD'].includes(errorInfo.code) && (
                      <div className="mt-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setErrorInfo(null);
                            setPhase(PHASE.IDLE);
                          }}
                        >
                          Thử lại
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Danh sách gợi ý trụ thay thế (S-49) */}
              {errorInfo.code === 'RESERVATION_CONFLICT' && suggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-300">🔄 Trụ trống gần đó cùng giờ:</p>
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{s.station_name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {s.charge_point_code} · Cổng #{s.connector_number}
                        </p>
                        {s.available_from && (
                          <p className="text-[11px] text-slate-500">
                            Trống từ: {new Date(s.available_from).toLocaleString('vi-VN', {
                              hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
                            })}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={CalendarClock}
                        onClick={() => handleBookSuggestion(s)}
                      >
                        Đặt trụ này
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Không có gợi ý */}
              {errorInfo.code === 'RESERVATION_CONFLICT' && suggestions.length === 0 && (
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-400 mb-2">
                    Hiện chưa có trụ trống cùng giờ.
                  </p>
                  <Button variant="secondary" size="sm" icon={Map} onClick={handleGoToMap}>
                    Quay về danh sách trạm
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── PHASE: IDLE / READY — Form chọn giờ ────────────── */}
          {![PHASE.SUCCESS, PHASE.ERROR, PHASE.CHECKING, PHASE.SUBMITTING].includes(phase) && (
            <div className="px-5 py-4 space-y-3">

              {/* Grid slot giờ tới */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Chọn giờ tới <span className="text-rose-400">*</span>
                  <span className="text-slate-500 font-normal text-[11px] ml-2">
                    (trong vòng {MAX_RESERVATION_AHEAD_MINUTES} phút, bước {ARRIVAL_SLOT_STEP_MINUTES} phút)
                  </span>
                </label>

                {arrivalSlots.length === 0 ? (
                  <Skeleton variant="rectangular" className="h-20 w-full" />
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {arrivalSlots.map((slot) => {
                      const isSelected = selectedSlot?.value === slot.value;
                      return (
                        <button
                          key={slot.value}
                          type="button"
                          onClick={() => handleSlotSelect(slot)}
                          className={`px-2 py-2 rounded-xl text-[11px] font-mono font-semibold text-left transition-all border
                            ${isSelected
                              ? 'bg-sky-600 border-sky-500 text-white shadow-md shadow-sky-600/30'
                              : 'bg-slate-800/70 border-slate-700/80 text-slate-300 hover:bg-slate-700 hover:border-slate-600'
                            }`}
                        >
                          <div className="text-xs font-bold">{slot.label.split(' - ')[0]}</div>
                          <div className="text-[10px] opacity-70">{slot.label.split(' - ')[1]}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Preview thời gian kết thúc */}
              {selectedSlot && holdEndLabel && (
                <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-xs">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-400">Dự kiến kết thúc lúc:</span>
                  <span className="text-white font-semibold font-mono">{holdEndLabel}</span>
                  <span className="text-slate-500">(+{DEFAULT_HOLD_MINUTES} phút giữ chỗ)</span>
                </div>
              )}

              {/* Cảnh báo ví yếu */}
              {walletBalance !== null && walletBalance < MIN_BALANCE_FOR_RESERVATION && (
                <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl px-3.5 py-2.5 flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-rose-400 font-semibold">Số dư ví thấp</p>
                    <p className="text-slate-400">
                      Số dư hiện tại ({Number(walletBalance).toLocaleString('vi-VN')} đ) chưa đủ đặt chỗ.
                      Cần tối thiểu {MIN_BALANCE_FOR_RESERVATION.toLocaleString('vi-VN')} đ.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={ExternalLink}
                      className="mt-1 text-rose-400 hover:text-rose-300"
                      onClick={handleGoToWallet}
                    >
                      Nạp tiền ngay
                    </Button>
                  </div>
                </div>
              )}

              {/* Nút hành động */}
              <div className="flex gap-2 pt-1">
                {/* Kiểm tra khả dụng */}
                <Button
                  variant={phase === PHASE.READY ? 'secondary' : 'outline'}
                  size="md"
                  icon={phase === PHASE.CHECKING ? Loader2 : RefreshCw}
                  loading={phase === PHASE.CHECKING}
                  disabled={!canCheck}
                  onClick={handleCheckAvailability}
                  className="flex-1"
                  title={!selectedSlot ? 'Chọn giờ tới trước' : undefined}
                >
                  {phase === PHASE.READY ? 'Chọn giờ khác' : 'Kiểm tra khả dụng'}
                </Button>

                {/* Xác nhận đặt chỗ */}
                <Button
                  variant="success"
                  size="md"
                  icon={phase === PHASE.SUBMITTING ? Loader2 : CheckCircle2}
                  loading={phase === PHASE.SUBMITTING}
                  disabled={!canConfirm}
                  onClick={handleConfirm}
                  className="flex-1"
                  title={!canConfirm ? 'Bấm "Kiểm tra khả dụng" trước' : undefined}
                >
                  Xác nhận đặt chỗ
                </Button>
              </div>

              {/* Helper text */}
              {!selectedSlot && (
                <p className="text-[11px] text-slate-500 text-center">
                  ← Chọn giờ tới trong danh sách bên trên
                </p>
              )}
            </div>
          )}

          {/* ── PHASE: CHECKING / SUBMITTING — Loading overlay ─────── */}
          {(phase === PHASE.CHECKING || phase === PHASE.SUBMITTING) && (
            <div className="px-5 py-8 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              <p className="text-sm text-slate-300 font-medium">
                {phase === PHASE.CHECKING
                  ? 'Đang kiểm tra khả dụng…'
                  : 'Đang xác nhận đặt chỗ…'}
              </p>
              <p className="text-xs text-slate-500">Vui lòng chờ trong giây lát.</p>
            </div>
          )}
        </div>

        {/* ── Footer (chỉ khi chưa success) ────────────────────── */}
        {phase !== PHASE.SUCCESS && (
          <div className="px-5 py-3 border-t border-slate-700/60 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-slate-400 hover:text-slate-200"
              onClick={handleClose}
            >
              Hủy
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
