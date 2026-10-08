import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import Button from './ui/Button';
import { validateTariffPeriods, minutesToTime, timeToMinutes } from '../utils/tariffValidation';
import { getTariff, saveTariff } from '../services/tariffApi';

export default function TariffForm({ stationId = 1 }) {
    const [periods, setPeriods] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
    const [serverError, setServerError] = useState('');

    useEffect(() => {
        getTariff(stationId).then(data => {
            if (data && data.periods) {
                setPeriods(data.periods);
            }
        }).catch(err => {
            console.error(err);
        }).finally(() => {
            setIsLoading(false);
        });
    }, [stationId]);

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

    const validation = validateTariffPeriods(periods);

    const handleSave = async () => {
        if (!validation.isValid) return;
        
        setIsSaving(true);
        setSaveStatus(null);
        
        try {
            await saveTariff(stationId, { periods });
            setSaveStatus('success');
            setTimeout(() => setSaveStatus(null), 3000);
        } catch (error) {
            setSaveStatus('error');
            setServerError(error.message || 'Lỗi khi lưu biểu giá từ server');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div className="p-4 text-gray-500">Đang tải cấu hình biểu giá...</div>;
    }

    const totalCovered = validation.segments.reduce((acc, seg) => acc + (seg.end - seg.start), 0) - 
                        validation.overlaps.reduce((acc, overlap) => acc + (overlap.end - overlap.start), 0);
    const coveragePercentage = Math.min(100, (totalCovered / 1440) * 100);

    const calculateCoverageStr = () => {
        if (validation.isValid) return "Đã phủ kín 24/24h (Hợp lệ)";
        return `Độ phủ: ${coveragePercentage.toFixed(1)}%`;
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 dark:bg-[#151D2A] max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Khai báo biểu giá linh hoạt (Tariff)</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Thiết lập các khung giờ không chồng lấn và phải phủ kín 24 giờ.
                    </p>
                </div>
                <Button onClick={handleAddPeriod} className="flex items-center gap-2">
                    <Plus size={18} /> Thêm khung giờ
                </Button>
            </div>

            {/* Danh sách khung giờ */}
            <div className="mb-6">
                {periods.length === 0 ? (
                    <div className="text-center p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-500">
                        Chưa có khung giờ nào được thiết lập. Vui lòng thêm khung giờ mới.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {periods.map((period, index) => {
                            const isError = !!validation.errorsByIndex[index];
                            const startMin = timeToMinutes(period.start);
                            const endMin = timeToMinutes(period.end);
                            const isOvernight = period.start && period.end && endMin < startMin;

                            return (
                                <div key={index} className={`p-4 rounded-xl border ${isError ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700/50 dark:bg-slate-800/50'}`}>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1.5" htmlFor={`start-${index}`}>Giờ bắt đầu (HH:mm)</label>
                                            <input 
                                                id={`start-${index}`}
                                                type="time" 
                                                value={period.start}
                                                onChange={e => handleChange(index, 'start', e.target.value)}
                                                className={`w-full p-2.5 text-sm border ${isError ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-sky-500'} rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2`}
                                                aria-invalid={isError}
                                                aria-describedby={`err-${index}`}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1.5" htmlFor={`end-${index}`}>Giờ kết thúc (HH:mm)</label>
                                            <input 
                                                id={`end-${index}`}
                                                type="time" 
                                                value={period.end}
                                                onChange={e => handleChange(index, 'end', e.target.value)}
                                                className={`w-full p-2.5 text-sm border ${isError ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-sky-500'} rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2`}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1.5" htmlFor={`price-${index}`}>Giá (VND/kWh)</label>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    id={`price-${index}`}
                                                    type="number" 
                                                    min="0"
                                                    value={period.price}
                                                    onChange={e => handleChange(index, 'price', e.target.value)}
                                                    className={`w-full p-2.5 text-sm border ${isError ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-sky-500'} rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2`}
                                                />
                                                <button 
                                                    onClick={() => handleRemovePeriod(index)}
                                                    className="p-2.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg flex-shrink-0 transition-colors"
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
                                            <span>Khung giờ qua nửa đêm (Hệ thống sẽ ghi nhận thành {period.start}–24:00 và 00:00–{period.end})</span>
                                        </div>
                                    )}

                                    {isError && (
                                        <div id={`err-${index}`} className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-start gap-1.5 font-medium">
                                            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                                            <span>{validation.errorsByIndex[index]}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Thanh tóm tắt độ phủ 24 giờ */}
            <div className="mb-6 p-5 bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="flex justify-between items-end mb-3">
                    <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-300">Độ phủ 24 giờ</h4>
                    <span className={`text-sm font-bold ${validation.isValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {calculateCoverageStr()}
                    </span>
                </div>
                
                <div className="relative h-6 bg-slate-200 dark:bg-slate-700 rounded-md overflow-hidden flex w-full border border-slate-300 dark:border-slate-600">
                    {/* Render gaps */}
                    {validation.gaps.map((gap, i) => (
                        <div 
                            key={`gap-${i}`} 
                            className="absolute h-full bg-red-200 dark:bg-red-900/40" 
                            style={{ 
                                left: `${(gap.start / 1440) * 100}%`, 
                                width: `${((gap.end - gap.start) / 1440) * 100}%` 
                            }}
                            title={`Khoảng trống: ${minutesToTime(gap.start)} - ${minutesToTime(gap.end)}`}
                        />
                    ))}
                    
                    {/* Render valid segments */}
                    {validation.segments.map((seg, i) => (
                        <div 
                            key={`seg-${i}`} 
                            className="absolute h-full bg-sky-500/80 border-r border-sky-600/50" 
                            style={{ 
                                left: `${(seg.start / 1440) * 100}%`, 
                                width: `${((seg.end - seg.start) / 1440) * 100}%` 
                            }}
                            title={`Khung: ${minutesToTime(seg.start)} - ${minutesToTime(seg.end)}`}
                        />
                    ))}

                    {/* Render overlaps on top */}
                    {validation.overlaps.map((overlap, i) => (
                        <div 
                            key={`overlap-${i}`} 
                            className="absolute h-full bg-red-500" 
                            style={{ 
                                left: `${(overlap.start / 1440) * 100}%`, 
                                width: `${((overlap.end - overlap.start) / 1440) * 100}%` 
                            }}
                            title={`Chồng lấn: ${minutesToTime(overlap.start)} - ${minutesToTime(overlap.end)}`}
                        />
                    ))}
                </div>
                
                {/* 24h Axis labels */}
                <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
                    <span>00:00</span>
                    <span>06:00</span>
                    <span>12:00</span>
                    <span>18:00</span>
                    <span>24:00</span>
                </div>

                {validation.gaps.length > 0 && (
                    <div className="mt-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-1.5 font-medium">
                        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                        <span>Thiếu khung giờ cho các khoảng: {validation.gaps.map(g => `${minutesToTime(g.start)}–${minutesToTime(g.end)}`).join(', ')}.</span>
                    </div>
                )}
            </div>

            {/* Submit area */}
            <div className="flex items-center gap-4 pt-5 border-t border-slate-200 dark:border-slate-800">
                <Button 
                    onClick={handleSave} 
                    disabled={!validation.isValid || periods.length === 0 || isSaving}
                    className="min-w-[140px]"
                    icon={Save}
                >
                    {isSaving ? 'Đang lưu...' : 'Lưu biểu giá'}
                </Button>
                
                {saveStatus === 'success' && (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 text-sm font-medium animate-in fade-in">
                        <CheckCircle size={18} /> Lưu thành công!
                    </span>
                )}
                
                {saveStatus === 'error' && (
                    <span className="text-red-600 dark:text-red-400 flex items-center gap-1.5 text-sm font-medium animate-in fade-in">
                        <AlertCircle size={18} /> {serverError}
                    </span>
                )}
            </div>
        </div>
    );
}

