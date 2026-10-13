import { describe, it, expect } from 'vitest';
import {
  buildAuditQueryParams,
  parseAuditDetail,
  getAuditDriverInfo,
  matchesDriverFilter,
  extractDriverList,
} from './auditUtils';

describe('SCRUM-412 / SCRUM-388: auditUtils unit tests', () => {
  describe('buildAuditQueryParams', () => {
    it('tạo query params mặc định khi không truyền filters', () => {
      const params = buildAuditQueryParams();
      expect(params).toEqual({
        page: 1,
        page_size: 50,
      });
    });

    it('bổ sung đúng driver_id khi người dùng lọc theo tài xế (SCRUM-412)', () => {
      const filters = {
        chargerId: '42',
        userId: '5',
        driverId: '99',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-13T23:59:59Z',
      };
      const params = buildAuditQueryParams(filters, 2, 50);
      expect(params).toEqual({
        page: 2,
        page_size: 50,
        charger_id: '42',
        user_id: '5',
        driver_id: '99',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-13T23:59:59Z',
      });
    });

    it('bỏ qua driver_id khi giá trị rỗng hoặc khoảng trắng', () => {
      const filters = {
        driverId: '   ',
        chargerId: '',
        userId: null,
      };
      const params = buildAuditQueryParams(filters);
      expect(params).toEqual({
        page: 1,
        page_size: 50,
      });
      expect(params.driver_id).toBeUndefined();
    });
  });

  describe('parseAuditDetail', () => {
    it('trả về object rỗng với input null / undefined', () => {
      expect(parseAuditDetail(null)).toEqual({});
      expect(parseAuditDetail({})).toEqual({});
    });

    it('trích xuất object trực tiếp từ trường detail hoặc data', () => {
      const rowWithDetail = { detail: { driver_id: 12, amount: 50000 } };
      expect(parseAuditDetail(rowWithDetail)).toEqual({ driver_id: 12, amount: 50000 });

      const rowWithData = { data: { driver_id: 15, receipt_code: 'REC01' } };
      expect(parseAuditDetail(rowWithData)).toEqual({ driver_id: 15, receipt_code: 'REC01' });
    });

    it('parse chuỗi JSON an toàn', () => {
      const rowWithString = { detail: '{"driver_id": 88, "status": "SUCCESS"}' };
      expect(parseAuditDetail(rowWithString)).toEqual({ driver_id: 88, status: 'SUCCESS' });
    });

    it('xử lý chuỗi không phải JSON mà không gây throw lỗi', () => {
      const rowWithInvalid = { detail: 'plain text log detail' };
      expect(parseAuditDetail(rowWithInvalid)).toEqual({ rawText: 'plain text log detail' });
    });
  });

  describe('getAuditDriverInfo', () => {
    it('trích xuất đầy đủ thông tin giao dịch nạp tay (SCRUM-388)', () => {
      const row = {
        action: 'ADMIN_MANUAL_TOPUP',
        objectType: 'wallet',
        objectId: '10',
        detail: {
          admin_id: 1,
          driver_id: 7,
          wallet_id: 10,
          amount: '200000.00',
          balance_before: '50000.00',
          balance_after: '250000.00',
          receipt_code: 'PT-20261013-001',
          status: 'SUCCESS',
          ip: '127.0.0.1',
        },
      };

      const info = getAuditDriverInfo(row);
      expect(info.hasDriverInfo).toBe(true);
      expect(info.driverId).toBe('7');
      expect(info.walletId).toBe('10');
      expect(info.amount).toBe('200000.00');
      expect(info.receiptCode).toBe('PT-20261013-001');
      expect(info.balanceBefore).toBe('50000.00');
      expect(info.balanceAfter).toBe('250000.00');
    });

    it('trích xuất thông tin khi mở khóa đối soát ví', () => {
      const row = {
        action: 'WalletReconciliationUnlocked',
        objectType: 'wallet',
        objectId: '15',
        detail: {
          target_user_id: 12,
          reason: 'Đã giải trình khớp hóa đơn số 992',
          balance: '150000',
        },
      };

      const info = getAuditDriverInfo(row);
      expect(info.hasDriverInfo).toBe(true);
      expect(info.driverId).toBe('12');
      expect(info.walletId).toBe('15');
      expect(info.reason).toBe('Đã giải trình khớp hóa đơn số 992');
    });

    it('trả về cấu trúc mặc định khi dòng log không liên quan tài xế', () => {
      const row = {
        action: 'RESET',
        objectType: 'charging_point',
        objectId: '5',
        detail: { result: 'Accepted' },
      };

      const info = getAuditDriverInfo(row);
      expect(info.hasDriverInfo).toBe(false);
      expect(info.driverId).toBeNull();
    });
  });

  describe('matchesDriverFilter', () => {
    it('luôn trả về true khi không truyền driverFilterId', () => {
      expect(matchesDriverFilter({ action: 'RESET' }, '')).toBe(true);
      expect(matchesDriverFilter({ action: 'RESET' }, null)).toBe(true);
    });

    it('khớp chính xác driver_id trong detail', () => {
      const row = {
        detail: { driver_id: 7 },
      };
      expect(matchesDriverFilter(row, '7')).toBe(true);
      expect(matchesDriverFilter(row, 7)).toBe(true);
      expect(matchesDriverFilter(row, '8')).toBe(false);
    });

    it('khớp ví wallet_id khi tra cứu theo mã ví', () => {
      const row = {
        objectType: 'wallet',
        objectId: '25',
        detail: {},
      };
      expect(matchesDriverFilter(row, '25')).toBe(true);
      expect(matchesDriverFilter(row, '99')).toBe(false);
    });
  });

  describe('extractDriverList', () => {
    it('lọc chính xác người dùng có vai trò CUSTOMER hoặc DRIVER', () => {
      const users = [
        { id: 1, username: 'admin', full_name: 'Quản trị viên', role: 'ADMIN' },
        { id: 2, username: 'op_hn', full_name: 'Vận hành HN', role: 'OPERATOR' },
        { id: 3, username: 'driver_vip', full_name: 'Trần Văn Tài', role: 'CUSTOMER' },
        { id: 4, username: 'driver_truck', full_name: 'Lê Hoàng Xe Tải', role: 'DRIVER' },
      ];

      const drivers = extractDriverList(users);
      expect(drivers).toHaveLength(2);
      expect(drivers[0]).toEqual({
        id: 3,
        username: 'driver_vip',
        fullName: 'Trần Văn Tài',
        label: 'Trần Văn Tài (driver_vip)',
      });
      expect(drivers[1]).toEqual({
        id: 4,
        username: 'driver_truck',
        fullName: 'Lê Hoàng Xe Tải',
        label: 'Lê Hoàng Xe Tải (driver_truck)',
      });
    });

    it('fallback trả về toàn bộ người dùng nếu không ai có vai trò driver', () => {
      const users = [
        { id: 10, username: 'user1', full_name: 'Người dùng 1' },
        { id: 20, username: 'user2', full_name: '' },
      ];

      const drivers = extractDriverList(users);
      expect(drivers).toHaveLength(2);
      expect(drivers[1].label).toBe('user2');
    });

    it('trả về mảng rỗng khi danh sách null hoặc không hợp lệ', () => {
      expect(extractDriverList(null)).toEqual([]);
      expect(extractDriverList(undefined)).toEqual([]);
    });
  });
});
