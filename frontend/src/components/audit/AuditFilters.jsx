import React from 'react';
import { Filter, Search, RotateCcw, RefreshCw, X } from 'lucide-react';
import { buildQuickRange, localInputToUtcIso, validateDateRange } from '../../utils/dateRange';

const QUICK_RANGES = [
  { label: '24 giờ qua', hours: 24 },
  { label: '7 ngày qua', hours: 24 * 7 },
  { label: '30 ngày qua', hours: 24 * 30 },
];

/**
 * Khu vực bộ lọc của màn hình Tra cứu nhật ký.
 *
 * Quy ước tách biệt hai hành vi (theo AC T-58):
 * - "Tìm kiếm" mới áp dụng bộ lọc đang chọn xuống API.
 * - "Làm mới" tải lại dữ liệu với bộ lọc ĐANG ÁP DỤNG (không đọc bộ lọc nháp).
 * - "Đặt lại" xóa bộ lọc nháp, đồng thời phát sự kiện onReset để trang gọi API
 *   lại không còn điều kiện. Nút này KHÔNG gửi lệnh Reset xuống thiết bị.
 */
export default function AuditFilters({
  chargers,
  users,
  draft,
  applied,
  onChange,
  onSearch,
  onReset,
  onRefresh,
  loading,
  errorMessage,
}) {
  const rangeCheck = validateDateRange(draft.from, draft.to);
  const hasDraftError = !rangeCheck.valid;

  const handleQuickRange = (hours) => {
    const { from, to } = buildQuickRange(hours);
    onChange({ ...draft, from, to });
  };

  const clearSingle = (field) => {
    onChange({ ...draft, [field]: '' });
  };

  return (
    <section className="bg-panel border border-hairline rounded-sm">
      <div className="px-4 py-2.5 border-b border-hairline bg-obsidian/60 flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-electric-cyan" />
        <h2 className="text-xs font-bold font-mono text-tech-white uppercase">
          Bộ lọc tra cứu
        </h2>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Bộ lọc 1 — Trụ sạc */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-charger" className="text-[11px] font-mono text-steel-gray">
            Trụ sạc
          </label>
          <div className="flex gap-1">
            <select
              id="filter-charger"
              value={draft.chargerId}
              onChange={(e) => onChange({ ...draft, chargerId: e.target.value })}
              className="flex-1 bg-obsidian border border-hairline text-tech-white rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-electric-cyan"
            >
              <option value="">Tất cả trụ sạc</option>
              {chargers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.stationName}
                </option>
              ))}
            </select>
            {draft.chargerId && (
              <button
                type="button"
                onClick={() => clearSingle('chargerId')}
                title="Xóa lựa chọn trụ sạc"
                className="px-2 bg-obsidian border border-hairline rounded text-steel-gray hover:text-tech-white hover:border-electric-cyan transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Bộ lọc 2 — Người thực hiện */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-user" className="text-[11px] font-mono text-steel-gray">
            Người thực hiện
          </label>
          <div className="flex gap-1">
            <select
              id="filter-user"
              value={draft.userId}
              onChange={(e) => onChange({ ...draft, userId: e.target.value })}
              className="flex-1 bg-obsidian border border-hairline text-tech-white rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-electric-cyan"
            >
              <option value="">Tất cả người dùng</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName || u.username} ({u.username})
                </option>
              ))}
            </select>
            {draft.userId && (
              <button
                type="button"
                onClick={() => clearSingle('userId')}
                title="Xóa lựa chọn người thực hiện"
                className="px-2 bg-obsidian border border-hairline rounded text-steel-gray hover:text-tech-white hover:border-electric-cyan transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Bộ lọc 3 — Khoảng thời gian */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-mono text-steel-gray">Khoảng thời gian</span>
          <div className="flex items-center gap-1">
            <input
              type="datetime-local"
              aria-label="Từ thời điểm"
              value={draft.fromLocal}
              onChange={(e) =>
                onChange({
                  ...draft,
                  fromLocal: e.target.value,
                  from: localInputToUtcIso(e.target.value),
                })
              }
              className="flex-1 bg-obsidian border border-hairline text-tech-white rounded px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:border-electric-cyan"
            />
            <span className="text-steel-gray text-xs">→</span>
            <input
              type="datetime-local"
              aria-label="Đến thời điểm"
              value={draft.toLocal}
              onChange={(e) =>
                onChange({
                  ...draft,
                  toLocal: e.target.value,
                  to: localInputToUtcIso(e.target.value),
                })
              }
              className="flex-1 bg-obsidian border border-hairline text-tech-white rounded px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:border-electric-cyan"
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {QUICK_RANGES.map((q) => (
              <button
                key={q.hours}
                type="button"
                onClick={() => handleQuickRange(q.hours)}
                className="px-2 py-0.5 bg-obsidian border border-hairline rounded text-[10px] font-mono text-steel-gray hover:text-tech-white hover:border-electric-cyan transition-colors"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hasDraftError && (
        <p role="alert" className="px-4 pb-2 text-[11px] font-mono text-critical-red">
          {rangeCheck.message}
        </p>
      )}

      {/* Thanh thao tác */}
      <div className="px-4 py-3 border-t border-hairline flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSearch}
          disabled={loading || hasDraftError}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-electric-cyan hover:bg-electric-cyan-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono text-xs font-bold transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          Tìm kiếm
        </button>

        <button
          type="button"
          onClick={onReset}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-obsidian border border-hairline text-steel-gray hover:text-tech-white hover:border-electric-cyan disabled:opacity-50 transition-colors font-mono text-xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Đặt lại
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Tải lại dữ liệu với bộ lọc đang áp dụng"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-obsidian border border-hairline text-steel-gray hover:text-tech-white hover:border-electric-cyan disabled:opacity-50 transition-colors font-mono text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Làm mới
        </button>

        {/* Tóm tắt điều kiện đang áp dụng (chỉ hiện sau khi tìm kiếm thành công) */}
        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
          <span className="text-steel-gray">Đang áp dụng:</span>
          {applied.chargerId ? (
            <span className="px-1.5 py-0.5 rounded bg-electric-cyan/15 text-electric-cyan border border-electric-cyan/30">
              Trụ: {applied.chargerLabel}
            </span>
          ) : (
            <span className="text-steel-gray/60">Tất cả trụ</span>
          )}
          {applied.userId ? (
            <span className="px-1.5 py-0.5 rounded bg-grid-green/15 text-grid-green border border-grid-green/30">
              Người: {applied.userLabel}
            </span>
          ) : (
            <span className="text-steel-gray/60">Tất cả người dùng</span>
          )}
          {applied.from || applied.to ? (
            <span className="px-1.5 py-0.5 rounded bg-caution-amber/15 text-caution-amber border border-caution-amber/30">
              Thời gian: {applied.from || 'không giới hạn'} → {applied.to || 'không giới hạn'}
            </span>
          ) : (
            <span className="text-steel-gray/60">Mọi khoảng thời gian</span>
          )}
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="px-4 py-2.5 border-t border-critical-red/40 bg-critical-red/10 flex items-center justify-between gap-3"
        >
          <span className="text-[11px] font-mono text-critical-red">{errorMessage}</span>
          <button
            type="button"
            onClick={onRefresh}
            className="px-2.5 py-1 rounded bg-obsidian border border-critical-red/50 text-critical-red hover:bg-critical-red/20 transition-colors text-[11px] font-mono font-bold shrink-0"
          >
            Thử lại
          </button>
        </div>
      )}
    </section>
  );
}
