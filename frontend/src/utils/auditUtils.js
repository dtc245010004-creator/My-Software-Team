/**
 * Tiện ích hỗ trợ Tra cứu Nhật ký vận hành & Kiểm toán (S-27 / SCRUM-388 / SCRUM-412)
 *
 * Chức năng:
 * - Xây dựng tham số truy vấn API audit-logs chuẩn hóa (bao gồm ô lọc theo tài xế driver_id)
 * - Trích xuất thông tin tài xế / ví từ dữ liệu chi tiết của dòng nhật ký
 * - Lọc danh mục tài xế từ danh sách người dùng hệ thống
 * - Kiểm tra khớp bộ lọc tài xế
 */

/**
 * Xây dựng query params gửi lên API GET /api/v1/audit-logs
 * @param {object} filters
 * @param {string|number} [filters.chargerId]
 * @param {string|number} [filters.userId]
 * @param {string|number} [filters.driverId]
 * @param {string} [filters.from]
 * @param {string} [filters.to]
 * @param {number} [targetPage=1]
 * @param {number} [pageSize=50]
 * @returns {Record<string, any>}
 */
export function buildAuditQueryParams(filters = {}, targetPage = 1, pageSize = 50) {
  const params = {
    page: Math.max(1, Number(targetPage) || 1),
    page_size: Math.max(1, Number(pageSize) || 50),
  };

  if (filters.chargerId !== undefined && filters.chargerId !== null && String(filters.chargerId).trim() !== '') {
    params.charger_id = String(filters.chargerId).trim();
  }

  if (filters.userId !== undefined && filters.userId !== null && String(filters.userId).trim() !== '') {
    params.user_id = String(filters.userId).trim();
  }

  // SCRUM-412: Bổ sung tham số driver_id phục vụ lọc theo tài xế / chủ ví
  if (filters.driverId !== undefined && filters.driverId !== null && String(filters.driverId).trim() !== '') {
    params.driver_id = String(filters.driverId).trim();
  }

  if (filters.from && String(filters.from).trim() !== '') {
    params.from = String(filters.from).trim();
  }

  if (filters.to && String(filters.to).trim() !== '') {
    params.to = String(filters.to).trim();
  }

  return params;
}

/**
 * Trích xuất an toàn payload chi tiết (detail hoặc data) của một dòng log
 * @param {object} row
 * @returns {object}
 */
export function parseAuditDetail(row) {
  if (!row) return {};
  const raw = row.detail ?? row.data;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { rawText: raw };
    }
  }
  return {};
}

/**
 * Trích xuất thông tin liên quan đến tài xế / giao dịch ví từ một dòng nhật ký
 * @param {object} row
 * @returns {{
 *   hasDriverInfo: boolean,
 *   driverId: string|number|null,
 *   walletId: string|number|null,
 *   amount: number|string|null,
 *   receiptCode: string|null,
 *   balanceBefore: number|string|null,
 *   balanceAfter: number|string|null,
 *   reason: string|null,
 *   ip: string|null,
 * }}
 */
export function getAuditDriverInfo(row) {
  if (!row) {
    return {
      hasDriverInfo: false,
      driverId: null,
      walletId: null,
      amount: null,
      receiptCode: null,
      balanceBefore: null,
      balanceAfter: null,
      reason: null,
      ip: null,
    };
  }

  const detail = parseAuditDetail(row);

  const driverId =
    detail.driver_id ??
    detail.driverId ??
    detail.target_user_id ??
    detail.targetUserId ??
    (row.objectType === 'user' || row.objectType === 'driver' ? row.objectId : null);

  const walletId =
    detail.wallet_id ??
    detail.walletId ??
    (row.objectType === 'wallet' ? row.objectId : null);

  const amount = detail.amount ?? detail.topup_amount ?? null;
  const receiptCode = detail.receipt_code ?? detail.receiptCode ?? null;
  const balanceBefore = detail.balance_before ?? detail.balanceBefore ?? null;
  const balanceAfter = detail.balance_after ?? detail.balanceAfter ?? null;
  const reason = detail.reason ?? detail.note ?? null;
  const ip = detail.ip ?? detail.client_ip ?? null;

  const hasDriverInfo = driverId !== null && driverId !== undefined && driverId !== '';

  return {
    hasDriverInfo,
    driverId: driverId !== null ? String(driverId) : null,
    walletId: walletId !== null ? String(walletId) : null,
    amount,
    receiptCode,
    balanceBefore,
    balanceAfter,
    reason,
    ip,
  };
}

/**
 * Kiểm tra xem một dòng nhật ký có khớp với bộ lọc tài xế hay không
 * @param {object} row
 * @param {string|number|null|undefined} driverFilterId
 * @returns {boolean}
 */
export function matchesDriverFilter(row, driverFilterId) {
  if (!driverFilterId || String(driverFilterId).trim() === '') {
    return true;
  }
  if (!row) return false;

  const targetId = String(driverFilterId).trim();
  const info = getAuditDriverInfo(row);

  if (info.driverId && String(info.driverId) === targetId) {
    return true;
  }

  // Trường hợp log trực tiếp vào ví
  if (info.walletId && String(info.walletId) === targetId) {
    return true;
  }

  // Trường hợp user_id khớp (khi đối tượng là tài xế tự thao tác)
  if (row.userId && String(row.userId) === targetId) {
    return true;
  }

  return false;
}

/**
 * Trích xuất danh sách tài xế / khách hàng từ danh mục người dùng hệ thống
 * @param {Array<object>} users
 * @returns {Array<{ id: number|string, username: string, fullName: string, label: string }>}
 */
export function extractDriverList(users = []) {
  if (!Array.isArray(users)) return [];

  // Ưu tiên các tài khoản có vai trò CUSTOMER hoặc DRIVER
  const driverOnly = users.filter((u) => {
    const r = (u.role || '').toUpperCase();
    return r === 'CUSTOMER' || r === 'DRIVER';
  });

  // Nếu không phân vai trò rõ rệt, hiển thị toàn bộ người dùng
  const targetUsers = driverOnly.length > 0 ? driverOnly : users;

  return targetUsers.map((u) => {
    const fullName = u.fullName || u.full_name || '';
    const username = u.username || `User #${u.id}`;
    const label = fullName ? `${fullName} (${username})` : username;
    return {
      id: u.id,
      username,
      fullName,
      label,
    };
  });
}
