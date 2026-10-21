import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Save,
  AlertCircle,
  Clock,
  CheckCircle,
  MapPin,
  Zap,
  Coins,
  Sparkles,
  ExternalLink,
  X,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import Button from './ui/Button';
import api from '../services/api';
import { validateTariffPeriods, minutesToTime, timeToMinutes } from '../utils/tariffValidation';
import { getTariff, saveTariff, TARIFF_PRESETS } from '../services/tariffApi';

export const DEFAULT_DEMO_STATIONS = [
  { id: 1, name: 'Trạm Sạc VinFast Thảo Điền', address: '12 Quốc Hương, Thảo Điền, TP. Thủ Đức, TP.HCM', total_grid_capacity_kw: 250 },
  { id: 2, name: 'Trạm Sạc Landmark 81', address: '720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP.HCM', total_grid_capacity_kw: 300 },
  { id: 3, name: 'Trạm Sạc Phố Đi Bộ Nguyễn Huệ', address: 'Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM', total_grid_capacity_kw: 150 },
  { id: 5, name: 'Trạm Sạc Thái Nguyên Central', address: 'Đường Lương Ngọc Quyến, TP. Thái Nguyên', total_grid_capacity_kw: 180 },
  { id: 7, name: 'Trạm Sạc Đại Học CNTT & TT (ICTU)', address: 'Đường Z115, Quyết Thắng, TP. Thái Nguyên', total_grid_capacity_kw: 120 },
];

export default function TariffForm({
  stationId: propStationId,
  isModal = false,
  onClose = null,
  onSaved = null,
  stationName: propStationName,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Xác định stationId ban đầu từ props hoặc từ URL search parameter
  const initialStationId = useMemo(() => {
    if (propStationId !== undefined && propStationId !== null) {
      return Number(propStationId);
    }
    const paramId = searchParams.get('stationId');
    return paramId ? Number(paramId) : 1;
  }, [propStationId, searchParams]);

  const [selectedStationId, setSelectedStationId] = useState(initialStationId);
  const [stations, setStations] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(true);

  const [periods, setPeriods] = useState([]);
  const [idleFeePerMinute, setIdleFeePerMinute] = useState(3000);
  const [idleGraceMinutes, setIdleGraceMinutes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const [serverError, setServerError] = useState('');

  // 1. Tải danh sách các trạm sạc cho bộ chọn trạm
  useEffect(() => {
    let isMounted = true;
    setStationsLoading(true);
    api.get('/stations')
      .then((res) => {
        if (!isMounted) return;
        if (Array.isArray(res.data) && res.data.length > 0) {
          setStations(res.data);
        } else {
          setStations(DEFAULT_DEMO_STATIONS);
        }
      })
      .catch(() => {
        if (isMounted) setStations(DEFAULT_DEMO_STATIONS);
      })
      .finally(() => {
        if (isMounted) setStationsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Cập nhật selectedStationId nếu propStationId thay đổi
  useEffect(() => {
    if (propStationId !== undefined && propStationId !== null) {
      setSelectedStationId(Number(propStationId));
    }
  }, [propStationId]);

  // Tìm đối tượng trạm đang được chọn
  const currentStation = useMemo(() => {
    return (
      stations.find((s) => Number(s.id) === Number(selectedStationId)) || {
        id: selectedStationId,
        name: propStationName || `Trạm Sạc #${selectedStationId}`,
        address: 'Địa bàn vận hành EV CSMS',
        total_grid_capacity_kw: 150,
      }
    );
  }, [stations, selectedStationId, propStationName]);

  // 2. Nạp cấu hình biểu giá cho trạm đã chọn
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setSaveStatus(null);
    setServerError('');

    getTariff(selectedStationId)
      .then((data) => {
        if (!isMounted) return;
        if (data && Array.isArray(data.periods)) {
          setPeriods(data.periods);
        } else {
          setPeriods([]);
        }
        if (data && data.idle_fee_per_minute !== undefined) {
          setIdleFeePerMinute(Number(data.idle_fee_per_minute));
        } else {
          setIdleFeePerMinute(3000);
        }
        if (data && data.idle_grace_minutes !== undefined) {
          setIdleGraceMinutes(Number(data.idle_grace_minutes));
        } else {
          setIdleGraceMinutes(0);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Lỗi tải biểu giá trạm:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedStationId]);

  // Xử lý đổi trạm từ Dropdown
  const handleStationChange = (newId) => {
    const numId = Number(newId);
    setSelectedStationId(numId);
    if (!isModal) {
      setSearchParams({ stationId: numId });
    }
  };

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

  // Áp dụng mẫu biểu giá định sẵn
  const handleApplyPreset = (preset) => {
    if (!preset || !preset.periods) return;
    setPeriods(preset.periods.map((p) => ({ ...p })));
    setSaveStatus(null);
  };

  const validation = validateTariffPeriods(periods);

  const handleSave = async () => {
    if (!validation.isValid) return;

    setIsSaving(true);
    setSaveStatus(null);
    setServerError('');

    try {
      await saveTariff(selectedStationId, {
        periods,
        idle_fee_per_minute: Number(idleFeePerMinute) || 3000,
        idle_grace_minutes: Number(idleGraceMinutes) || 0,
      });
      setSaveStatus('success');
      if (typeof onSaved === 'function') {
        onSaved({
          stationId: selectedStationId,
          periods,
          idle_fee_per_minute: Number(idleFeePerMinute) || 3000,
          idle_grace_minutes: Number(idleGraceMinutes) || 0,
        });
      }
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (error) {
      setSaveStatus('error');
      setServerError(error.message || 'Lỗi khi lưu biểu giá từ máy chủ');
    } finally {
      setIsSaving(false);
    }
  };

  const totalCovered =
    validation.segments.reduce((acc, seg) => acc + (seg.end - seg.start), 0) -
    validation.overlaps.reduce((acc, overlap) => acc + (overlap.end - overlap.start), 0);
  const coveragePercentage = Math.min(100, Math.max(0, (totalCovered / 1440) * 100));

  const calculateCoverageStr = () => {
    if (validation.isValid) return 'Đã phủ kín 24/24h (Hợp lệ)';
    return `Độ phủ: ${coveragePercentage.toFixed(1)}%`;
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 dark:bg-[#151D2A] max-w-4xl mx-auto space-y-6">
      {/* Tiêu đề & Nút đóng modal nếu có */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 rounded-lg">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Khai Báo Biểu Giá Cho Từng Trạm Sạc (Tariff)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thiết lập giá điện theo khung giờ linh hoạt (TOU) độc lập cho từng trạm sạc.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {!isModal && (
            <button
              type="button"
              onClick={() => navigate('/stations')}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Xem danh sách trạm</span>
            </button>
          )}

          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* BỘ CHỌN TRẠM SẠC (STATION SELECTOR) */}
      <div className="bg-slate-50 dark:bg-[#0B0F17] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <label
              htmlFor="station-select-dropdown"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5"
            >
              Chọn Trạm Sạc Cần Áp Dụng Biểu Giá
            </label>
            <div className="relative">
              <select
                id="station-select-dropdown"
                data-testid="station-tariff-selector"
                disabled={isModal && propStationId !== undefined}
                value={selectedStationId}
                onChange={(e) => handleStationChange(e.target.value)}
                className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2.5 pr-10 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    ST-{st.id}: {st.name} ({st.address || 'Hệ thống EV CSMS'})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Thông tin trạm đang được cấu hình */}
        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center space-x-1.5 font-medium text-slate-900 dark:text-slate-200">
            <MapPin className="w-3.5 h-3.5 text-emerald-500" />
            <span>{currentStation.name}</span>
          </div>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span>{currentStation.address}</span>
          {currentStation.total_grid_capacity_kw && (
            <>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <div className="flex items-center space-x-1 text-sky-500 font-mono">
                <Zap className="w-3.5 h-3.5" />
                <span>Nguồn lưới: {currentStation.total_grid_capacity_kw} kW</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MẪU BIỂU GIÁ NHANH (PRESET TEMPLATES) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Mẫu biểu giá mẫu sẵn có (Click để áp dụng nhanh):</span>
          </span>
          <Button onClick={handleAddPeriod} className="flex items-center gap-1.5 text-xs py-1.5 px-3">
            <Plus size={16} /> Thêm khung giờ
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {TARIFF_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleApplyPreset(preset)}
              className="text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 hover:bg-emerald-50/50 dark:bg-slate-900/40 dark:hover:bg-emerald-950/20 hover:border-emerald-300 dark:hover:border-emerald-800/60 transition-all group"
            >
              <div className="flex items-center justify-between font-semibold text-xs text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                <span>{preset.name}</span>
                <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">
                  {preset.periods.length} khung
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                {preset.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* DANH SÁCH CÁC KHUNG GIỜ CỦA TRẠM */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Cấu Hình Khung Giờ Biểu Giá (Bắt buộc phủ kín 24/24 giờ)
        </h3>

        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-slate-500 space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-xs font-mono">Đang tải biểu giá trạm ST-{selectedStationId}...</span>
          </div>
        ) : periods.length === 0 ? (
          <div className="text-center p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 text-xs">
            Trạm này chưa có biểu giá riêng. Bấm "Thêm khung giờ" hoặc chọn 1 mẫu sẵn ở trên.
          </div>
        ) : (
          <div className="space-y-3">
            {periods.map((period, index) => {
              const isError = !!validation.errorsByIndex[index];
              const startMin = timeToMinutes(period.start);
              const endMin = timeToMinutes(period.end);
              const isOvernight = period.start && period.end && endMin < startMin;

              return (
                <div
                  key={index}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isError
                      ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20'
                      : 'border-slate-200 bg-slate-50 dark:border-slate-700/50 dark:bg-slate-800/50'
                  }`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div>
                      <label
                        className="block text-xs font-medium text-slate-500 mb-1"
                        htmlFor={`start-${index}`}
                      >
                        Giờ bắt đầu (HH:mm)
                      </label>
                      <input
                        id={`start-${index}`}
                        type="time"
                        value={period.start}
                        onChange={(e) => handleChange(index, 'start', e.target.value)}
                        className={`w-full p-2 text-sm border ${
                          isError ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-emerald-500'
                        } rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2`}
                        aria-invalid={isError}
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs font-medium text-slate-500 mb-1"
                        htmlFor={`end-${index}`}
                      >
                        Giờ kết thúc (HH:mm)
                      </label>
                      <input
                        id={`end-${index}`}
                        type="time"
                        value={period.end}
                        onChange={(e) => handleChange(index, 'end', e.target.value)}
                        className={`w-full p-2 text-sm border ${
                          isError ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-emerald-500'
                        } rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2`}
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs font-medium text-slate-500 mb-1"
                        htmlFor={`price-${index}`}
                      >
                        Đơn giá (VND/kWh)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id={`price-${index}`}
                          type="number"
                          min="0"
                          placeholder="Ví dụ: 3200"
                          value={period.price}
                          onChange={(e) => handleChange(index, 'price', e.target.value)}
                          className={`w-full p-2 text-sm border ${
                            isError ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-emerald-500'
                          } rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 font-mono`}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePeriod(index)}
                          className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg flex-shrink-0 transition-colors"
                          title="Xóa khung giờ này"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {isOvernight && !isError && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 px-2.5 py-1 rounded-md inline-flex font-mono">
                      <Clock size={13} />
                      <span>
                        Khung giờ qua nửa đêm: tự động chia thành {period.start}–24:00 và 00:00–{period.end}
                      </span>
                    </div>
                  )}

                  {isError && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5 font-medium">
                      <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                      <span>{validation.errorsByIndex[index]}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* THANH TÓM TẮT ĐỘ PHỦ 24 GIỜ */}
      <div className="p-4 bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
        <div className="flex justify-between items-end">
          <div className="space-y-0.5">
            <h4 className="font-semibold text-xs text-slate-700 dark:text-slate-300">
              Độ Phủ 24 Giờ của Trạm "{currentStation.name}"
            </h4>
            <p className="text-[11px] text-slate-500">
              Khung giờ hợp lệ phải liên tục, không chồng lấn và lấp kín 24h.
            </p>
          </div>
          <span
            className={`text-xs font-bold font-mono ${
              validation.isValid
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {calculateCoverageStr()}
          </span>
        </div>

        <div className="relative h-6 bg-slate-200 dark:bg-slate-700 rounded-md overflow-hidden flex w-full border border-slate-300 dark:border-slate-600">
          {/* Render gaps */}
          {validation.gaps.map((gap, i) => (
            <div
              key={`gap-${i}`}
              className="absolute h-full bg-red-300/80 dark:bg-red-900/60"
              style={{
                left: `${(gap.start / 1440) * 100}%`,
                width: `${((gap.end - gap.start) / 1440) * 100}%`,
              }}
              title={`Khoảng trống thiếu giá: ${minutesToTime(gap.start)} - ${minutesToTime(gap.end)}`}
            />
          ))}

          {/* Render valid segments */}
          {validation.segments.map((seg, i) => (
            <div
              key={`seg-${i}`}
              className="absolute h-full bg-emerald-500/80 border-r border-emerald-600/50"
              style={{
                left: `${(seg.start / 1440) * 100}%`,
                width: `${((seg.end - seg.start) / 1440) * 100}%`,
              }}
              title={`Khung hợp lệ: ${minutesToTime(seg.start)} - ${minutesToTime(seg.end)}`}
            />
          ))}

          {/* Render overlaps */}
          {validation.overlaps.map((overlap, i) => (
            <div
              key={`overlap-${i}`}
              className="absolute h-full bg-red-600"
              style={{
                left: `${(overlap.start / 1440) * 100}%`,
                width: `${((overlap.end - overlap.start) / 1440) * 100}%`,
              }}
              title={`Chồng lấn giờ: ${minutesToTime(overlap.start)} - ${minutesToTime(overlap.end)}`}
            />
          ))}
        </div>

        {/* Trục mốc thời gian 24h */}
        <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-0.5">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>

        {validation.gaps.length > 0 && (
          <div className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5 font-medium pt-1">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>
              Thiếu khung giờ cho khoảng: {validation.gaps.map((g) => `${minutesToTime(g.start)}–${minutesToTime(g.end)}`).join(', ')}.
            </span>
          </div>
        )}
      </div>

      {/* CẤU HÌNH PHÍ ĐỖ XE / PHẠT KHÔNG RÚT SẠC SAU KHI ĐẦY 100% */}
      <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Biểu Phí Đỗ Xe / Phạt Chiếm Trụ (Khi Xe Sạc Đầy 100% Không Rút Sạc)
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Áp dụng tự động trừ vào ví tài xế khi pin xe đã đạt 100% nhưng tài xế chưa rút súng sạc để nhường trụ cho xe khác.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label htmlFor="idle-fee-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Đơn giá phạt quá giờ (VNĐ / phút)
            </label>
            <div className="relative">
              <input
                id="idle-fee-input"
                data-testid="idle-fee-input"
                type="number"
                min="0"
                step="500"
                value={idleFeePerMinute}
                onChange={(e) => setIdleFeePerMinute(Number(e.target.value))}
                className="w-full p-2.5 text-sm font-mono font-bold text-amber-700 dark:text-amber-400 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="3000"
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400 font-sans">
                VNĐ / phút
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Mặc định: 3.000 VNĐ / phút (Tương đương 180.000 VNĐ / giờ).
            </p>
          </div>

          <div>
            <label htmlFor="idle-grace-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Thời gian ân hạn miễn phí (Phút)
            </label>
            <div className="relative">
              <input
                id="idle-grace-input"
                data-testid="idle-grace-input"
                type="number"
                min="0"
                max="60"
                value={idleGraceMinutes}
                onChange={(e) => setIdleGraceMinutes(Number(e.target.value))}
                className="w-full p-2.5 text-sm font-mono font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="0"
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400 font-sans">
                Phút
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Thời gian chờ tài xế rút sạc trước khi bắt đầu tính phí phạt (0 = tính ngay lập tức).
            </p>
          </div>
        </div>
      </div>

      {/* VÙNG THAO TÁC / LƯU BIỂU GIÁ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3">
          <Button
            onClick={handleSave}
            disabled={!validation.isValid || periods.length === 0 || isSaving}
            className="min-w-[150px] bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
            icon={Save}
          >
            {isSaving ? 'Đang lưu...' : `Lưu biểu giá trạm ST-${selectedStationId}`}
          </Button>

          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              Hủy bỏ
            </button>
          )}
        </div>

        <div>
          {saveStatus === 'success' && (
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 text-xs font-bold animate-in fade-in">
              <CheckCircle size={16} /> Đã lưu thành công biểu giá cho {currentStation.name}!
            </span>
          )}

          {saveStatus === 'error' && (
            <span className="text-red-600 dark:text-red-400 flex items-center gap-1.5 text-xs font-bold animate-in fade-in">
              <AlertCircle size={16} /> {serverError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
