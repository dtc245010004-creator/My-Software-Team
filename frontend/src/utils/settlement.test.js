import { describe, it, expect } from 'vitest';
import {
  canClose,
  canReopen,
  validateReopenReason,
  describeBlockingSession,
  formatPeriodRange,
  mapSettlementError,
} from './settlement';

describe('settlement utils - SCRUM-408 / S-55', () => {
  describe('canClose', () => {
    it('cho phép ACCOUNTANT và ADMIN chốt kỳ khi kỳ đang MỞ (OPEN)', () => {
      const openPeriod = { id: 1, status: 'OPEN', label: '2026-09' };
      expect(canClose(openPeriod, 'ACCOUNTANT')).toBe(true);
      expect(canClose(openPeriod, 'ADMIN')).toBe(true);
    });

    it('từ chối khi vai trò không phải ACCOUNTANT hoặc ADMIN', () => {
      const openPeriod = { id: 1, status: 'OPEN' };
      expect(canClose(openPeriod, 'OPERATOR')).toBe(false);
      expect(canClose(openPeriod, 'CUSTOMER')).toBe(false);
      expect(canClose(openPeriod, 'CPO')).toBe(false);
      expect(canClose(openPeriod, null)).toBe(false);
    });

    it('từ chối khi kỳ không ở trạng thái OPEN', () => {
      const closedPeriod = { id: 1, status: 'CLOSED' };
      expect(canClose(closedPeriod, 'ACCOUNTANT')).toBe(false);
      expect(canClose(closedPeriod, 'ADMIN')).toBe(false);

      const draftPeriod = { id: 2, status: 'DRAFT' };
      expect(canClose(draftPeriod, 'ADMIN')).toBe(false);
    });

    it('xử lý an toàn khi period là null hoặc undefined', () => {
      expect(canClose(null, 'ADMIN')).toBe(false);
      expect(canClose(undefined, 'ACCOUNTANT')).toBe(false);
    });
  });

  describe('canReopen', () => {
    it('chỉ cho phép ADMIN mở lại kỳ khi kỳ đã ĐÃ CHỐT (CLOSED)', () => {
      const closedPeriod = { id: 1, status: 'CLOSED' };
      expect(canReopen(closedPeriod, 'ADMIN')).toBe(true);
    });

    it('từ chối ACCOUNTANT hoặc các vai trò khác mở lại kỳ', () => {
      const closedPeriod = { id: 1, status: 'CLOSED' };
      expect(canReopen(closedPeriod, 'ACCOUNTANT')).toBe(false);
      expect(canReopen(closedPeriod, 'OPERATOR')).toBe(false);
      expect(canReopen(closedPeriod, 'CUSTOMER')).toBe(false);
    });

    it('từ chối khi kỳ chưa chốt (đang OPEN)', () => {
      const openPeriod = { id: 1, status: 'OPEN' };
      expect(canReopen(openPeriod, 'ADMIN')).toBe(false);
    });

    it('xử lý an toàn khi period hoặc role rỗng', () => {
      expect(canReopen(null, 'ADMIN')).toBe(false);
      expect(canReopen({ status: 'CLOSED' }, null)).toBe(false);
    });
  });

  describe('validateReopenReason', () => {
    it('báo lỗi khi lý do rỗng hoặc chỉ toàn khoảng trắng', () => {
      expect(validateReopenReason('')).toEqual({
        valid: false,
        error: 'Bắt buộc phải nhập lý do mở lại kỳ.',
        reason: '',
      });
      expect(validateReopenReason('   \n\t  ')).toEqual({
        valid: false,
        error: 'Bắt buộc phải nhập lý do mở lại kỳ.',
        reason: '',
      });
      expect(validateReopenReason(null)).toEqual({
        valid: false,
        error: 'Bắt buộc phải nhập lý do mở lại kỳ.',
        reason: '',
      });
    });

    it('báo lỗi khi lý do ngắn hơn 10 ký tự', () => {
      const result = validateReopenReason('Ngắn');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ít nhất 10 ký tự');
      expect(result.reason).toBe('Ngắn');
    });

    it('báo lỗi khi lý do vượt quá 500 ký tự', () => {
      const longReason = 'A'.repeat(501);
      const result = validateReopenReason(longReason);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('vượt quá 500 ký tự');
    });

    it('hợp lệ và trim đúng khi lý do đủ độ dài', () => {
      const reason = '  Cần điều chỉnh đối soát cho trạm Quận 7 do sai số liệu đồng hồ  ';
      const result = validateReopenReason(reason);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.reason).toBe(
        'Cần điều chỉnh đối soát cho trạm Quận 7 do sai số liệu đồng hồ'
      );
    });
  });

  describe('describeBlockingSession', () => {
    it('chuẩn hóa đầy đủ các trường của phiên chặn chốt', () => {
      const session = {
        session_id: 1042,
        charge_point_code: 'CP-Q7-01',
        started_at: '2026-09-15T08:30:00Z',
        reason: 'Mất tín hiệu OCPP giữa chừng',
      };
      const desc = describeBlockingSession(session);
      expect(desc.id).toBe(1042);
      expect(desc.chargePointCode).toBe('CP-Q7-01');
      expect(desc.startedAtFormatted).not.toBe('N/A');
      expect(desc.reason).toBe('Mất tín hiệu OCPP giữa chừng');
    });

    it('hỗ trợ các tên trường thay thế (id, charger_code, start_time, stop_reason)', () => {
      const session = {
        id: 999,
        charger_code: 'CHARGER-09',
        start_time: '2026-09-10T10:00:00Z',
        stop_reason: 'Ngắt điện đột ngột',
      };
      const desc = describeBlockingSession(session);
      expect(desc.id).toBe(999);
      expect(desc.chargePointCode).toBe('CHARGER-09');
      expect(desc.reason).toBe('Ngắt điện đột ngột');
    });

    it('trả về giá trị an toàn khi dữ liệu phiên không hợp lệ', () => {
      const desc = describeBlockingSession(null);
      expect(desc.id).toBe('N/A');
      expect(desc.chargePointCode).toBe('Không xác định');
      expect(desc.startedAtFormatted).toBe('N/A');
      expect(desc.reason).toBe('Phiên bất thường chưa xử lý');
    });
  });

  describe('formatPeriodRange', () => {
    it('định dạng đầy đủ từ ngày đến ngày', () => {
      const period = { from: '2026-09-01T00:00:00Z', to: '2026-09-30T23:59:59Z' };
      const range = formatPeriodRange(period);
      expect(range).toContain('Từ');
      expect(range).toContain('đến');
    });

    it('xử lý khi chỉ có from hoặc chỉ có to', () => {
      expect(formatPeriodRange({ from: '2026-09-01T00:00:00Z' })).toContain('Từ');
      expect(formatPeriodRange({ to: '2026-09-30T23:59:59Z' })).toContain('Đến');
    });

    it('xử lý an toàn khi period rỗng', () => {
      expect(formatPeriodRange(null)).toBe('Không xác định');
      expect(formatPeriodRange({})).toBe('Thời gian chưa xác định');
    });
  });

  describe('mapSettlementError', () => {
    it('nhận diện lỗi 409 BLOCKED_BY_ABNORMAL_SESSIONS và trích xuất danh sách phiên chặn', () => {
      const error = {
        response: {
          status: 409,
          data: {
            code: 'BLOCKED_BY_ABNORMAL_SESSIONS',
            detail: 'Còn 2 phiên bất thường chưa xử lý.',
            sessions: [
              { session_id: 1, charge_point_code: 'CP-1', reason: 'Lỗi A' },
              { session_id: 2, charge_point_code: 'CP-2', reason: 'Lỗi B' },
            ],
          },
        },
      };

      const result = mapSettlementError(error);
      expect(result.isBlocked).toBe(true);
      expect(result.code).toBe('BLOCKED_BY_ABNORMAL_SESSIONS');
      expect(result.message).toBe('Còn 2 phiên bất thường chưa xử lý.');
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].session_id).toBe(1);
    });

    it('nhận diện lỗi 404 hoặc 501 thông báo chức năng chưa sẵn sàng', () => {
      const err404 = { response: { status: 404, data: {} } };
      expect(mapSettlementError(err404).message).toBe(
        'Chức năng chưa sẵn sàng (backend chưa triển khai).'
      );

      const err501 = { response: { status: 501, data: {} } };
      expect(mapSettlementError(err501).message).toBe(
        'Chức năng chưa sẵn sàng (backend chưa triển khai).'
      );
    });

    it('xử lý lỗi 401, 403, 422, 500 với thông báo tiếng Việt', () => {
      expect(mapSettlementError({ response: { status: 401, data: {} } }).message).toContain(
        'Phiên đăng nhập đã hết hạn'
      );
      expect(mapSettlementError({ response: { status: 403, data: {} } }).message).toContain(
        'không có quyền'
      );
      expect(mapSettlementError({ response: { status: 422, data: { detail: 'Lý do bắt buộc' } } }).message).toBe(
        'Lý do bắt buộc'
      );
      expect(mapSettlementError({ response: { status: 500, data: {} } }).message).toContain(
        'Máy chủ đang gặp sự cố'
      );
    });

    it('xử lý lỗi mất kết nối mạng', () => {
      const netError = { request: {} };
      expect(mapSettlementError(netError).message).toContain(
        'Không thể kết nối đến máy chủ'
      );
    });
  });
});

