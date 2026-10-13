import React, { useState } from 'react';
import { FileSearch, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { formatVNDateTime } from '../../utils/formatTime';
import { getActionLabel } from './auditLabels';
import { getAuditDriverInfo } from '../../utils/auditUtils';

/**
 * Bảng dữ liệu phân trang phía server.
 *
 * NFR: KHÔNG lọc hoặc phân trang bằng JavaScript. Mọi thao tác đổi trang đều gửi
 * tham số phân trang từ request để tầng Database thực hiện OFFSET/LIMIT.
 */
export default function AuditTable({ rows, loading, error, page, pageSize, total, onPageChange }) {
  const [expandedId, setExpandedId] = useState(null);

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="bg-panel border border-hairline rounded-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-hairline bg-obsidian/60 flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold font-mono text-tech-white uppercase">
          Danh sách nhật ký vận hành & kiểm toán
        </h2>
        <span className="text-[11px] font-mono text-steel-gray tabular-nums">
          {total > 0 ? `${rangeStart}–${rangeEnd} / ${total} bản ghi` : '0 bản ghi'}
        </span>
      </div>

      {loading ? (
        <div className="py-16 text-center font-mono text-xs text-steel-gray" role="status">
          <span className="inline-block animate-pulse">Đang tải nhật ký vận hành...</span>
        </div>
      ) : error ? (
        <div className="py-16 text-center px-4" role="alert">
          <AlertCircle className="w-8 h-8 mx-auto text-critical-red mb-2" />
          <p className="font-mono text-xs text-critical-red">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center px-4">
          <FileSearch className="w-8 h-8 mx-auto text-steel-gray mb-2" />
          <p className="font-mono text-xs text-tech-white font-bold">
            Không tìm thấy nhật ký phù hợp
          </p>
          <p className="font-mono text-[11px] text-steel-gray mt-1">
            Hãy kiểm tra lại trụ, tài xế, người thực hiện hoặc khoảng thời gian đã chọn.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <caption className="sr-only">
              Danh sách nhật ký vận hành theo thứ tự thời điểm mới nhất
            </caption>
            <thead>
              <tr className="border-b border-hairline bg-obsidian text-steel-gray">
                <th scope="col" className="py-2.5 px-4 whitespace-nowrap">Thời điểm</th>
                <th scope="col" className="py-2.5 px-4 whitespace-nowrap">Đối tượng</th>
                <th scope="col" className="py-2.5 px-4 whitespace-nowrap">Tên trụ / Trạm / Ví</th>
                <th scope="col" className="py-2.5 px-4 whitespace-nowrap">Người thực hiện</th>
                <th scope="col" className="py-2.5 px-4 whitespace-nowrap">Hành động</th>
                <th scope="col" className="py-2.5 px-4 whitespace-nowrap">Nội dung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((row) => {
                const isExpanded = expandedId === row.id;
                const driverInfo = getAuditDriverInfo(row);
                const isWallet = row.objectType === 'wallet';

                // Diễn giải nội dung mặc định cho thao tác ví nếu chưa có description
                let rowDescription = row.description;
                if (!rowDescription && isWallet) {
                  if (driverInfo.hasDriverInfo && driverInfo.amount) {
                    rowDescription = `Nạp tay tài xế #${driverInfo.driverId} (+${Number(driverInfo.amount).toLocaleString('vi-VN')} đ)${driverInfo.receiptCode ? ` · Phiếu: ${driverInfo.receiptCode}` : ''}`;
                  } else if (driverInfo.reason) {
                    rowDescription = driverInfo.reason;
                  }
                }

                return (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-panel-hover transition-colors">
                      <td className="py-2.5 px-4 text-steel-gray whitespace-nowrap tabular-nums">
                        {formatVNDateTime(row.timestamp)}
                      </td>
                      <td className="py-2.5 px-4 text-tech-white font-bold whitespace-nowrap">
                        {row.objectCode || (isWallet ? `Ví #${row.objectId}` : '—')}
                        {driverInfo.hasDriverInfo && (
                          <span className="block text-[10px] text-purple-300 font-normal">
                            Tài xế #{driverInfo.driverId}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-steel-gray">
                        <span className="block truncate max-w-[220px]" title={row.stationName || (isWallet ? 'Ví điện tử' : '')}>
                          {row.stationName || (isWallet ? 'Ví điện tử' : '—')}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-tech-white whitespace-nowrap">
                        {row.actorName || '—'}
                        {row.actorUsername && (
                          <span className="block text-[10px] text-steel-gray">{row.actorUsername}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        {/* Nhãn trạng thái dùng cả màu sắc lẫn chữ để không phụ thuộc duy nhất vào màu */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                            row.result === 'SUCCESS'
                              ? 'bg-grid-green/20 text-grid-green'
                              : row.result === 'FAILED'
                                ? 'bg-critical-red/20 text-critical-red'
                                : 'bg-electric-cyan/20 text-electric-cyan'
                          }`}
                        >
                          {getActionLabel(row.action, row.result)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          aria-expanded={isExpanded}
                          className="text-left text-steel-gray hover:text-tech-white transition-colors max-w-[320px] truncate block"
                          title={rowDescription || 'Xem nội dung đầy đủ'}
                        >
                          {rowDescription || '—'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-obsidian/60">
                        <td colSpan={6} className="px-4 py-3">
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[11px]">
                            <div className="flex gap-2">
                              <dt className="text-steel-gray shrink-0">Mã đối tượng:</dt>
                              <dd className="text-tech-white break-all">
                                {row.objectType} #{row.objectId ?? '—'}
                              </dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="text-steel-gray shrink-0">Thời điểm (ISO UTC):</dt>
                              <dd className="text-tech-white break-all">{row.timestamp}</dd>
                            </div>
                            {row.stationName && (
                              <div className="flex gap-2">
                                <dt className="text-steel-gray shrink-0">Trạm:</dt>
                                <dd className="text-tech-white">{row.stationName}</dd>
                              </div>
                            )}
                            {/* Chi tiết liên quan đến tài xế & giao dịch ví (SCRUM-388 / SCRUM-412) */}
                            {driverInfo.hasDriverInfo && (
                              <div className="flex gap-2">
                                <dt className="text-steel-gray shrink-0">Tài xế / Chủ ví:</dt>
                                <dd className="text-purple-300 font-bold">
                                  Tài xế #{driverInfo.driverId}
                                </dd>
                              </div>
                            )}
                            {driverInfo.walletId && (
                              <div className="flex gap-2">
                                <dt className="text-steel-gray shrink-0">Mã ví điện tử:</dt>
                                <dd className="text-tech-white">Ví #{driverInfo.walletId}</dd>
                              </div>
                            )}
                            {driverInfo.amount !== null && driverInfo.amount !== undefined && (
                              <div className="flex gap-2">
                                <dt className="text-steel-gray shrink-0">Số tiền giao dịch:</dt>
                                <dd className="text-grid-green font-bold">
                                  {Number(driverInfo.amount).toLocaleString('vi-VN')} đ
                                </dd>
                              </div>
                            )}
                            {driverInfo.receiptCode && (
                              <div className="flex gap-2">
                                <dt className="text-steel-gray shrink-0">Mã phiếu thu:</dt>
                                <dd className="text-electric-cyan font-bold">{driverInfo.receiptCode}</dd>
                              </div>
                            )}
                            {driverInfo.balanceBefore !== null && driverInfo.balanceAfter !== null && (
                              <div className="flex gap-2 sm:col-span-2">
                                <dt className="text-steel-gray shrink-0">Biến động số dư:</dt>
                                <dd className="text-tech-white">
                                  {Number(driverInfo.balanceBefore).toLocaleString('vi-VN')} đ →{' '}
                                  <span className="text-electric-cyan font-bold">
                                    {Number(driverInfo.balanceAfter).toLocaleString('vi-VN')} đ
                                  </span>
                                </dd>
                              </div>
                            )}
                            {driverInfo.reason && (
                              <div className="flex gap-2 sm:col-span-2">
                                <dt className="text-steel-gray shrink-0">Lý do / Diễn giải:</dt>
                                <dd className="text-tech-white">{driverInfo.reason}</dd>
                              </div>
                            )}
                            {driverInfo.ip && (
                              <div className="flex gap-2">
                                <dt className="text-steel-gray shrink-0">Địa chỉ IP:</dt>
                                <dd className="text-steel-gray">{driverInfo.ip}</dd>
                              </div>
                            )}
                            {row.detail && (
                              <div className="flex gap-2 sm:col-span-2">
                                <dt className="text-steel-gray shrink-0">Dữ liệu thô kèm theo:</dt>
                                <dd className="text-tech-white break-all whitespace-pre-wrap">
                                  {typeof row.detail === 'object' ? JSON.stringify(row.detail, null, 2) : row.detail}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Phân trang: chỉ hiện khi có dữ liệu */}
      {total > 0 && (
        <div className="px-4 py-3 border-t border-hairline flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-mono text-steel-gray tabular-nums">
            Trang {page} / {totalPages} — hiển thị {rangeStart}–{rangeEnd} trên {total} bản ghi
            {' '}({pageSize} dòng mỗi trang)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={loading || page <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-obsidian border border-hairline text-steel-gray hover:text-tech-white hover:border-electric-cyan disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono text-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Trang trước
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={loading || page >= totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-obsidian border border-hairline text-steel-gray hover:text-tech-white hover:border-electric-cyan disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono text-xs"
            >
              Trang sau
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
