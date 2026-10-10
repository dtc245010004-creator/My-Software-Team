import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Save,
  AlertCircle,
  Clock,
  CheckCircle,
  RefreshCw,
  Building2,
  Calculator,
  Info,
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';
import { validateTariffPeriods, minutesToTime, timeToMinutes } from '../utils/tariffValidation';
import {
  validateNonNegativeAmount,
  validateGraceMinutes,
  simulateCost,
  formatVND,
  isFormDirty,
  DEFAULT_IDLE_FEE_MAX_MINUTES,
} from '../utils/tariffPricing';
import {
  getActiveTariffByStation,
  listStationsForOperator,
  createTariff,
  updateTariff,
  extractApiError,
} from '../services/tariffApi';

/**
 * Quản lý biểu giá sạc: periods[] + phí chiếm trụ + thời gian ân hạn.
 *
 * Props:
 *  - stationId?: number — nếu truyền, khoá dropdown chọn trạm (mặc định: tự chọn).
 */
export default function TariffForm({ stationId: forcedStationId }) {
  // --- Stations ---
  const [stations, setStations] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationsError, setStationsError] = useState('');

  // --- Trạm đang chọn ---
  const [stationId, setStationId] = useState(forcedStationId || null);
  const [activeTariffId, setActiveTariffId] = useState(null);
  const [stationSearch, setStationSearch] = useState('');

  // --- Form state ---
  const [periods, setPeriods] = useState([]);
  const [idleFee, setIdleFee] = useState('');
  const [graceMinutes, setGraceMinutes] = useState('');
  const [originalSnapshot, setOriginalSnapshot] = useState(null);

  // --- Mô phỏng ---
  const [simKwh, setSimKwh] = useState('20');
  const [simIdleMinutes, setSimIdleMinutes] = useState('30');

  // --- Trạng thái request ---
  const [isLoadingTariff, setIsLoadingTariff] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const [serverError, setServerError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // --- AbortController cho request tải biểu giá (chống race) ---
  const loadAbortRef = useRef(null);

  // ============================================================
  // 1. Tải danh sách trạm
  // ============================================================
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStationsLoading(true);
        setStationsError('');
        const list = await listStationsForOperator();
        if (cancelled) return;
        setStations(list);
        if (!forcedStationId && list.length > 0) {
          setStationId((prev) => prev || list[0].id);
        }
      } catch (err) {
        if (!cancelled) setStationsError(extractApiError(err, 'Không tải được danh sách trạm.'));
      } finally {
        if (!cancelled) setStationsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forcedStationId]);

  // ============================================================
  // 2. Tải biểu giá khi chọn trạm
  // ============================================================
  useEffect(() => {
    if (!stationId) return;
    if (loadAbortRef.current) loadAbortRef.current.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;

    (async () => {
      try {
        setIsLoadingTariff(true);
        setLoadError('');
        setSaveStatus(null);
        setSuccessMessage('');
        const t = await getActiveTariffByStation(stationId);
        if (ac.signal.aborted) return;
        if (t) {
          setActiveTariffId(t.id);
          const nextPeriods = (t.periods || []).map((p) => ({
            start: p.start_time,
            end: p.end_time,
            price: String(p.price_per_kwh),
          }));
          const nextIdle = String(t.idle_fee_per_minute ?? '0');
          const nextGrace = String(t.idle_grace_minutes ?? '0');
          setPeriods(nextPeriods);
          setIdleFee(nextIdle);
          setGraceMinutes(nextGrace);
          setOriginalSnapshot({
            periods: nextPeriods,
            idleFee: nextIdle,
            graceMinutes: nextGrace,
          });
        } else {
          setActiveTariffId(null);
          const empty = { periods: [], idleFee: '0', graceMinutes: '0' };
          setPeriods(empty.periods);
          setIdleFee(empty.idleFee);
          setGraceMinutes(empty.graceMinutes);
          setOriginalSnapshot(empty);
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        if (err.response?.status === 404) {
          setActiveTariffId(null);
          const empty = { periods: [], idleFee: '0', graceMinutes: '0' };
          setPeriods(empty.periods);
          setIdleFee(empty.idleFee);
          setGraceMinutes(empty.graceMinutes);
          setOriginalSnapshot(empty);
        } else {
          setLoadError(extractApiError(err, 'Không tải được biểu giá.'));
        }
      } finally {
        if (!ac.signal.aborted) setIsLoadingTariff(false);
      }
    })();

    return () => ac.abort();
  }, [stationId]);

  // ============================================================
  // 3. Handlers form periods
  // ============================================================
  const handleAddPeriod = () => {
    setPeriods([...periods, { start: '', end: '', price: '' }]);
    setSaveStatus(null);
  };

  const handleRemovePeriod = (index) => {
    setPeriods(periods.filter((_, i) => i !== index));
    setSaveStatus(null);
  };

  const handleChange = (index, field, value) => {
    const newPeriods = [...periods];
    newPeriods[index][field] = value;
    setPeriods(newPeriods);
    setSaveStatus(null);
  };

  // ============================================================
  // 4. Đổi trạm (có confirm nếu form bẩn)
  // ============================================================
  const currentSnapshot = useMemo(
    () => ({ periods, idleFee, graceMinutes }),
    [periods, idleFee, graceMinutes]
  );
  const dirty = isFormDirty(currentSnapshot, originalSnapshot);

  const handleStationChange = (newId) => {
    if (newId === stationId) return;
    if (dirty) {
      const ok = window.confirm(
        'Dữ liệu đã thay đổi. Vui lòng lưu trước khi rời trang.\nBạn có chắc muốn chuyển trạm và mất các thay đổi chưa lưu?'
      );
      if (!ok) return;
    }
    setStationId(Number(newId));
  };

  // ============================================================
  // 5. Validation tổng hợp
  // ============================================================
  const periodsValidation = useMemo(() => validateTariffPeriods(periods), [periods]);
  const idleFeeValidation = useMemo(
    () => validateNonNegativeAmount(idleFee, { fieldName: 'Phí chiếm trụ' }),
    [idleFee]
  );
  const graceValidation = useMemo(
    () => validateGraceMinutes(graceMinutes, { required: true }),
    [graceMinutes]
  );

  const isValid = periodsValidation.isValid && idleFeeValidation.valid && graceValidation.valid;
  const isNoStation = !stationId;

  // ============================================================
  // 6. Mô phỏng chi phí
  // ============================================================
  const simulation = useMemo(() => {
    const price = periods.find((p) => p.price !== '' && p.price !== undefined);
    const pricePerKwh = price ? Number(price.price) : 0;
    return simulateCost({
      pricePerKwh,
      idleFeePerMinute: Number(idleFee) || 0,
      graceMinutes: Number(graceMinutes) || 0,
      kwh: Number(simKwh) || 0,
      idleMinutes: Number(simIdleMinutes) || 0,
      maxMinutes: DEFAULT_IDLE_FEE_MAX_MINUTES,
    });
  }, [periods, idleFee, graceMinutes, simKwh, simIdleMinutes]);

  // ============================================================
  // 7. Lưu biểu giá
  // ============================================================
  const handleSave = useCallback(async () => {
    if (!isValid || isNoStation) return;
    setIsSaving(true);
    setSaveStatus(null);
    setServerError('');
    setSuccessMessage('');

    // periods → DTO
    const periodsDto = periods.map((p, i) => ({
      start_time: p.start,
      end_time: p.end,
      price_per_kwh: p.price,
      sort_order: i,
    }));

    // Body: dùng 3 mức TOU bằng giá trung bình hoặc dùng giá period đầu tiên
    // (TariffCreate yêu cầu 3 mức). Ở UI periods[] là nguồn chính,
    // price_normal/peak/offpeak lấy từ period tương ứng nếu có.
    const priceNormal =
      periods.find((p) => p.start && p.start <= '12:00')?.price ||
      periods[0]?.price ||
      '0';
    const pricePeak = periods[0]?.price || '0';
    const priceOffpeak = periods[0]?.price || '0';

    const body = {
      name: `Biểu giá trạm #${stationId}`,
      station_id: stationId,
      price_normal: priceNormal,
      price_peak: pricePeak,
      price_offpeak: priceOffpeak,
      idle_fee_per_minute: idleFee,
      idle_grace_minutes: Number(graceMinutes),
      periods: periodsDto,
    };

    try {
      const saved = activeTariffId
        ? await updateTariff(activeTariffId, body)
        : await createTariff(body);

      // Cập nhật state từ response backend
      setActiveTariffId(saved.id);
      const nextPeriods = (saved.periods || []).map((p) => ({
        start: p.start_time,
        end: p.end_time,
        price: String(p.price_per_kwh),
      }));
      const nextIdle = String(saved.idle_fee_per_minute ?? '0');
      const nextGrace = String(saved.idle_grace_minutes ?? '0');
      setPeriods(nextPeriods);
      setIdleFee(nextIdle);
      setGraceMinutes(nextGrace);
      setOriginalSnapshot({
        periods: nextPeriods,
        idleFee: nextIdle,
        graceMinutes: nextGrace,
      });
      setSaveStatus('success');
      setSuccessMessage(
        'Lưu thành công. Theo chính sách S-34, biểu giá mới sẽ có hiệu lực từ 00:00 ngày mai (theo giờ Việt Nam). Phiên sạc đang chạy vẫn dùng giá cũ.'
      );
    } catch (err) {
      setSaveStatus('error');
      setServerError(extractApiError(err, 'Không lưu được biểu giá.'));
    } finally {
      setIsSaving(false);
    }
  }, [isValid, isNoStation, periods, idleFee, graceMinutes, stationId, activeTariffId]);

  const handleRefresh = () => {
    if (dirty) {
      const ok = window.confirm(
        'Dữ liệu đã thay đổi. Vui lòng lưu trước khi làm mới.\nBạn có chắc muốn tải lại và mất các thay đổi chưa lưu?'
      );
      if (!ok) return;
    }
    setStationId((id) => id); // trigger re-fetch
    setSuccessMessage('');
    setSaveStatus(null);
    setServerError('');
  };

  // ============================================================
  // 8. Render
  // ============================================================
  const filteredStations = useMemo(() => {
    const q = stationSearch.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.code || '').toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q)
    );
  }, [stations, stationSearch]);

  const currentStation = stations.find((s) => s.id === stationId);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ====== HEADER ====== */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Quản lý vận hành / Biểu giá
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            Quản lý biểu giá sạc
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Thiết lập giá điện theo khung giờ, phí chiếm trụ sau khi sạc và thời gian ân hạn cho từng trạm.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={RefreshCw} onClick={handleRefresh}>
            Làm mới
          </Button>
          <Button
            icon={Save}
            onClick={handleSave}
            disabled={!isValid || isNoStation || isSaving}
            loading={isSaving}
          >
            Lưu biểu giá
          </Button>
        </div>
      </div>

      {/* ====== STATION PICKER ====== */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Chọn trạm sạc
          </h2>
        </div>

        {forcedStationId ? (
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Trạm cố định: <span className="font-mono">#{forcedStationId}</span>
          </div>
        ) : stationsLoading ? (
          <div className="space-y-2">
            <Skeleton variant="rectangular" height={40} />
            <Skeleton variant="text" />
          </div>
        ) : stationsError ? (
          <div className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{stationsError}</span>
          </div>
        ) : stations.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Chưa có trạm nào"
            description="Tài khoản hiện tại chưa được gán trạm sạc nào. Liên hệ Quản trị viên để được phân quyền."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="station-search"
                className="block text-xs font-medium text-slate-500 mb-1.5"
              >
                Tìm trạm (tên, mã, địa chỉ)
              </label>
              <input
                id="station-search"
                type="text"
                value={stationSearch}
                onChange={(e) => setStationSearch(e.target.value)}
                placeholder="VD: Vincom, ST-001, Hà Nội..."
                className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label
                htmlFor="station-select"
                className="block text-xs font-medium text-slate-500 mb-1.5"
              >
                Trạm áp dụng
              </label>
              <select
                id="station-select"
                value={stationId || ''}
                onChange={(e) => handleStationChange(e.target.value)}
                className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {filteredStations.length === 0 ? (
                  <option value="">— Không có trạm khớp —</option>
                ) : (
                  filteredStations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))
                )}
              </select>
              {currentStation && (
                <p className="mt-1.5 text-xs text-slate-500">
                  {currentStation.address || '—'}
                  {currentStation.status ? ` • Trạng thái: ${currentStation.status}` : ''}
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      {loadError && (
        <div className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {isNoStation && !stationsLoading && !stationsError && stations.length > 0 && (
        <div className="text-sm text-slate-500 italic">
          Vui lòng chọn trạm sạc để bắt đầu cấu hình biểu giá.
        </div>
      )}

      {!isNoStation && (
        <>
          {isLoadingTariff ? (
            <div className="space-y-3">
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          ) : (
            <>
              {/* ====== CARD 1: KHUNG GIỜ ====== */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Khung giờ & đơn giá điện
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Các khung giờ không chồng lấn và phải phủ kín 24 giờ.
                    </p>
                  </div>
                  <Button onClick={handleAddPeriod} size="sm" icon={Plus}>
                    Thêm khung giờ
                  </Button>
                </div>

                {periods.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="Chưa có khung giờ"
                    description="Bắt đầu bằng cách thêm khung giờ đầu tiên (VD: 00:00–06:00)."
                    actionLabel="Thêm khung giờ"
                    onAction={handleAddPeriod}
                  />
                ) : (
                  <div className="space-y-3">
                    {periods.map((period, index) => {
                      const isError = !!periodsValidation.errorsByIndex[index];
                      const startMin = timeToMinutes(period.start);
                      const endMin = timeToMinutes(period.end);
                      const isOvernight =
                        period.start && period.end && endMin < startMin;

                      return (
                        <div
                          key={index}
                          className={`p-4 rounded-xl border ${
                            isError
                              ? 'border-rose-300 bg-rose-50/50 dark:bg-rose-950/20'
                              : 'border-slate-200 bg-slate-50 dark:border-slate-700/50 dark:bg-slate-800/50'
                          }`}
                        >
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                            <div>
                              <label
                                className="block text-xs font-medium text-slate-500 mb-1.5"
                                htmlFor={`start-${index}`}
                              >
                                Giờ bắt đầu (HH:mm)
                              </label>
                              <input
                                id={`start-${index}`}
                                type="time"
                                value={period.start}
                                onChange={(e) =>
                                  handleChange(index, 'start', e.target.value)
                                }
                                className={`w-full p-2.5 text-sm border ${
                                  isError
                                    ? 'border-rose-300 focus:ring-rose-500'
                                    : 'border-slate-200 focus:ring-sky-500'
                                } rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2`}
                                aria-invalid={isError}
                              />
                            </div>
                            <div>
                              <label
                                className="block text-xs font-medium text-slate-500 mb-1.5"
                                htmlFor={`end-${index}`}
                              >
                                Giờ kết thúc (HH:mm)
                              </label>
                              <input
                                id={`end-${index}`}
                                type="time"
                                value={period.end}
                                onChange={(e) =>
                                  handleChange(index, 'end', e.target.value)
                                }
                                className={`w-full p-2.5 text-sm border ${
                                  isError
                                    ? 'border-rose-300 focus:ring-rose-500'
                                    : 'border-slate-200 focus:ring-sky-500'
                                } rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2`}
                              />
                            </div>
                            <div>
                              <label
                                className="block text-xs font-medium text-slate-500 mb-1.5"
                                htmlFor={`price-${index}`}
                              >
                                Giá (VNĐ/kWh)
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  id={`price-${index}`}
                                  type="number"
                                  min="0"
                                  step="100"
                                  value={period.price}
                                  onChange={(e) =>
                                    handleChange(index, 'price', e.target.value)
                                  }
                                  className={`w-full p-2.5 text-sm border ${
                                    isError
                                      ? 'border-rose-300 focus:ring-rose-500'
                                      : 'border-slate-200 focus:ring-sky-500'
                                  } rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2`}
                                />
                                <button
                                  onClick={() => handleRemovePeriod(index)}
                                  className="p-2.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-lg shrink-0 transition-colors"
                                  title="Xóa khung giờ"
                                  aria-label="Xóa khung giờ"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {isOvernight && !isError && (
                            <div className="mt-3 flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 px-2.5 py-1.5 rounded-lg inline-flex">
                              <Clock size={14} />
                              <span>
                                Khung giờ qua nửa đêm (hệ thống ghi nhận {period.start}–24:00 và 00:00–
                                {period.end})
                              </span>
                            </div>
                          )}

                          {isError && (
                            <div className="mt-2 text-sm text-rose-600 dark:text-rose-400 flex items-start gap-1.5 font-medium">
                              <AlertCircle size={16} className="mt-0.5 shrink-0" />
                              <span>{periodsValidation.errorsByIndex[index]}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Thanh phủ 24h */}
                {periods.length > 0 && (
                  <CoverageBar
                    validation={periodsValidation}
                    calculateCoverageStr={() => {
                      if (periodsValidation.isValid) return 'Đã phủ kín 24/24h (Hợp lệ)';
                      const totalCovered = periodsValidation.segments.reduce(
                        (acc, seg) => acc + (seg.end - seg.start),
                        0
                      );
                      const totalOverlap = periodsValidation.overlaps.reduce(
                        (acc, ov) => acc + (ov.end - ov.start),
                        0
                      );
                      const coverage = Math.max(
                        0,
                        Math.min(100, ((totalCovered - totalOverlap) / 1440) * 100)
                      );
                      return `Độ phủ: ${coverage.toFixed(1)}%`;
                    }}
                  />
                )}
              </Card>

              {/* ====== CARD 2: PHÍ CHIẾM TRỤ ====== */}
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Phí chiếm trụ sau khi sạc
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Phí chỉ phát sinh sau khi kết thúc sạc và hết thời gian ân hạn. Có trần tối đa{' '}
                  {DEFAULT_IDLE_FEE_MAX_MINUTES} phút mỗi phiên.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="idle-fee"
                      className="block text-xs font-medium text-slate-500 mb-1.5"
                    >
                      Phí chiếm trụ (VNĐ/phút)
                    </label>
                    <input
                      id="idle-fee"
                      type="number"
                      min="0"
                      step="100"
                      value={idleFee}
                      onChange={(e) => {
                        setIdleFee(e.target.value);
                        setSaveStatus(null);
                      }}
                      aria-invalid={!idleFeeValidation.valid}
                      className={`w-full p-2.5 text-sm border ${
                        !idleFeeValidation.valid
                          ? 'border-rose-300 focus:ring-rose-500'
                          : 'border-slate-200 focus:ring-sky-500'
                      } rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2`}
                    />
                    {!idleFeeValidation.valid && (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <AlertCircle size={12} />
                        {idleFeeValidation.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="grace-minutes"
                      className="block text-xs font-medium text-slate-500 mb-1.5"
                    >
                      Thời gian ân hạn (phút nguyên)
                    </label>
                    <input
                      id="grace-minutes"
                      type="number"
                      min="0"
                      step="1"
                      value={graceMinutes}
                      onChange={(e) => {
                        setGraceMinutes(e.target.value);
                        setSaveStatus(null);
                      }}
                      aria-invalid={!graceValidation.valid}
                      className={`w-full p-2.5 text-sm border ${
                        !graceValidation.valid
                          ? 'border-rose-300 focus:ring-rose-500'
                          : 'border-slate-200 focus:ring-sky-500'
                      } rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2`}
                    />
                    {!graceValidation.valid && (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <AlertCircle size={12} />
                        {graceValidation.message}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Sau khi phiên sạc kết thúc, khách hàng có{' '}
                      <span className="font-mono">{graceMinutes || 0}</span> phút để rút súng
                      trước khi bị tính phí.
                    </p>
                  </div>
                </div>
              </Card>

              {/* ====== CARD 3: MÔ PHỎNG CHI PHÍ ====== */}
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Mô phỏng chi phí
                  </h2>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-mono">
                    Minh hoạ, không phải hoá đơn thật
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label
                      htmlFor="sim-kwh"
                      className="block text-xs font-medium text-slate-500 mb-1.5"
                    >
                      Sản lượng giả định (kWh)
                    </label>
                    <input
                      id="sim-kwh"
                      type="number"
                      min="0"
                      step="0.1"
                      value={simKwh}
                      onChange={(e) => setSimKwh(e.target.value)}
                      className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sim-idle"
                      className="block text-xs font-medium text-slate-500 mb-1.5"
                    >
                      Thời gian chiếm trụ sau sạc (phút)
                    </label>
                    <input
                      id="sim-idle"
                      type="number"
                      min="0"
                      step="1"
                      value={simIdleMinutes}
                      onChange={(e) => setSimIdleMinutes(e.target.value)}
                      className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SimCell label="Tiền điện" value={formatVND(simulation.energyAmount)} />
                  <SimCell
                    label="Phút tính phí"
                    value={`${simulation.chargeableMinutes} ph`}
                  />
                  <SimCell label="Phí chiếm trụ" value={formatVND(simulation.idleAmount)} />
                  <SimCell label="Tổng dự kiến" value={formatVND(simulation.total)} accent />
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* ====== FOOTER STATUS ====== */}
      {(saveStatus || serverError || successMessage) && (
        <div className="pt-2">
          {saveStatus === 'success' && successMessage && (
            <div className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
          {saveStatus === 'error' && serverError && (
            <div className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}
        </div>
      )}

      {dirty && (
        <div className="text-xs text-amber-700 dark:text-amber-400 italic">
          Có thay đổi chưa lưu.
        </div>
      )}
    </div>
  );
}

function SimCell({ label, value, accent = false }) {
  return (
    <div
      className={`p-3 rounded-xl border ${
        accent
          ? 'border-sky-300 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
        {label}
      </div>
      <div
        className={`text-base font-semibold mt-1 ${
          accent ? 'text-sky-700 dark:text-sky-300' : 'text-slate-800 dark:text-slate-100'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function CoverageBar({ validation, calculateCoverageStr }) {
  return (
    <div className="mt-4 p-4 bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-xl">
      <div className="flex justify-between items-end mb-3">
        <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-300">
          Độ phủ 24 giờ
        </h4>
        <span
          className={`text-sm font-bold ${
            validation.isValid
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {calculateCoverageStr()}
        </span>
      </div>
      <div className="relative h-6 bg-slate-200 dark:bg-slate-700 rounded-md overflow-hidden flex w-full border border-slate-300 dark:border-slate-600">
        {validation.gaps.map((gap, i) => (
          <div
            key={`gap-${i}`}
            className="absolute h-full bg-rose-200 dark:bg-rose-900/40"
            style={{
              left: `${(gap.start / 1440) * 100}%`,
              width: `${((gap.end - gap.start) / 1440) * 100}%`,
            }}
            title={`Khoảng trống: ${minutesToTime(gap.start)} - ${minutesToTime(gap.end)}`}
          />
        ))}
        {validation.segments.map((seg, i) => (
          <div
            key={`seg-${i}`}
            className="absolute h-full bg-sky-500/80 border-r border-sky-600/50"
            style={{
              left: `${(seg.start / 1440) * 100}%`,
              width: `${((seg.end - seg.start) / 1440) * 100}%`,
            }}
            title={`Khung: ${minutesToTime(seg.start)} - ${minutesToTime(seg.end)}`}
          />
        ))}
        {validation.overlaps.map((overlap, i) => (
          <div
            key={`overlap-${i}`}
            className="absolute h-full bg-rose-500"
            style={{
              left: `${(overlap.start / 1440) * 100}%`,
              width: `${((overlap.end - overlap.start) / 1440) * 100}%`,
            }}
            title={`Chồng lấn: ${minutesToTime(overlap.start)} - ${minutesToTime(overlap.end)}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
      {validation.gaps.length > 0 && (
        <div className="mt-3 text-sm text-rose-600 dark:text-rose-400 flex items-start gap-1.5 font-medium">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            Thiếu khung giờ cho:{' '}
            {validation.gaps.map((g) => `${minutesToTime(g.start)}–${minutesToTime(g.end)}`).join(', ')}.
          </span>
        </div>
      )}
    </div>
  );
}
