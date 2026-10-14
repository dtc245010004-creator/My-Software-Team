import { describe, it, expect, vi } from 'vitest';
import {
  mapErasureStatus,
  canSubmitRequest,
  canApprove,
  canReject,
  validateRejectReason,
  mapErasureError,
  createSingleFlightHandler,
  formatCurrencyVND,
} from './dataErasure';

describe('dataErasure utils (SCRUM-418)', () => {
  describe('mapErasureStatus', () => {
    it('ánh xạ đúng trạng thái PENDING sang Chờ duyệt (warning)', () => {
      const res = mapErasureStatus('PENDING');
      expect(res.label).toBe('Chờ duyệt');
      expect(res.variant).toBe('warning');
      expect(res.description).toContain('Quản trị viên');
    });

    it('ánh xạ đúng trạng thái APPROVED sang Đã duyệt (primary)', () => {
      const res = mapErasureStatus('APPROVED');
      expect(res.label).toBe('Đã duyệt (Đang xử lý)');
      expect(res.variant).toBe('primary');
      expect(res.description).toContain('ẩn danh hóa');
    });

    it('ánh xạ đúng trạng thái REJECTED sang Đã từ chối (danger)', () => {
      const res = mapErasureStatus('REJECTED');
      expect(res.label).toBe('Đã từ chối');
      expect(res.variant).toBe('danger');
      expect(res.description).toContain('từ chối');
    });

    it('ánh xạ đúng trạng thái COMPLETED sang Đã hoàn tất (success)', () => {
      const res = mapErasureStatus('COMPLETED');
      expect(res.label).toBe('Đã hoàn tất');
      expect(res.variant).toBe('success');
      expect(res.description).toContain('an toàn');
    });

    it('trả về mặc định cho trạng thái không xác định', () => {
      const res = mapErasureStatus('UNKNOWN_STATUS');
      expect(res.label).toBe('UNKNOWN_STATUS');
      expect(res.variant).toBe('neutral');
    });
  });

  describe('canSubmitRequest', () => {
    it('cho phép gửi nếu chưa có yêu cầu và số dư ví bằng 0', () => {
      expect(canSubmitRequest(null, { balance: 0 })).toBe(true);
      expect(canSubmitRequest(null, null)).toBe(true);
    });

    it('cho phép gửi nếu yêu cầu trước đó đã bị REJECTED và ví không có số dư dương', () => {
      expect(canSubmitRequest({ status: 'REJECTED' }, { balance: 0 })).toBe(true);
      expect(canSubmitRequest({ status: 'REJECTED' }, { balance: -50000 })).toBe(true);
    });

    it('chặn gửi nếu đã có yêu cầu PENDING hoặc APPROVED', () => {
      expect(canSubmitRequest({ status: 'PENDING' }, { balance: 0 })).toBe(false);
      expect(canSubmitRequest({ status: 'APPROVED' }, { balance: 0 })).toBe(false);
    });

    it('chặn gửi nếu số dư ví lớn hơn 0', () => {
      expect(canSubmitRequest(null, { balance: 150000 })).toBe(false);
      expect(canSubmitRequest({ status: 'REJECTED' }, { balance: 10000 })).toBe(false);
    });
  });

  describe('canApprove', () => {
    it('cho phép ADMIN duyệt yêu cầu PENDING khi số dư ví <= 0', () => {
      const req = { status: 'PENDING', wallet_balance: 0 };
      expect(canApprove(req, 'ADMIN')).toBe(true);

      const reqZero = { status: 'PENDING', wallet_balance: -20000 };
      expect(canApprove(reqZero, 'ADMIN')).toBe(true);
    });

    it('chặn người không phải ADMIN duyệt', () => {
      const req = { status: 'PENDING', wallet_balance: 0 };
      expect(canApprove(req, 'OPERATOR')).toBe(false);
      expect(canApprove(req, 'ACCOUNTANT')).toBe(false);
      expect(canApprove(req, 'CUSTOMER')).toBe(false);
      expect(canApprove(req, null)).toBe(false);
    });

    it('chặn duyệt nếu yêu cầu không ở trạng thái PENDING', () => {
      expect(canApprove({ status: 'APPROVED', wallet_balance: 0 }, 'ADMIN')).toBe(false);
      expect(canApprove({ status: 'REJECTED', wallet_balance: 0 }, 'ADMIN')).toBe(false);
      expect(canApprove({ status: 'COMPLETED', wallet_balance: 0 }, 'ADMIN')).toBe(false);
    });

    it('chặn duyệt nếu ví tài xế còn số dư dương', () => {
      const reqWithBalance = { status: 'PENDING', wallet_balance: 50000 };
      expect(canApprove(reqWithBalance, 'ADMIN')).toBe(false);
    });
  });

  describe('canReject', () => {
    it('cho phép ADMIN từ chối yêu cầu PENDING', () => {
      const req = { status: 'PENDING' };
      expect(canReject(req, 'ADMIN')).toBe(true);
    });

    it('chặn người không phải ADMIN từ chối', () => {
      const req = { status: 'PENDING' };
      expect(canReject(req, 'OPERATOR')).toBe(false);
      expect(canReject(req, 'ACCOUNTANT')).toBe(false);
      expect(canReject(req, 'CUSTOMER')).toBe(false);
    });

    it('chặn từ chối nếu yêu cầu đã duyệt hoặc đã từ chối trước đó', () => {
      expect(canReject({ status: 'APPROVED' }, 'ADMIN')).toBe(false);
      expect(canReject({ status: 'REJECTED' }, 'ADMIN')).toBe(false);
      expect(canReject({ status: 'COMPLETED' }, 'ADMIN')).toBe(false);
    });
  });

  describe('validateRejectReason', () => {
    it('báo lỗi khi lý do rỗng hoặc chỉ toàn khoảng trắng', () => {
      expect(validateRejectReason('').valid).toBe(false);
      expect(validateRejectReason('   ').valid).toBe(false);
      expect(validateRejectReason(null).valid).toBe(false);
    });

    it('báo lỗi khi lý do ngắn hơn 10 ký tự', () => {
      const res = validateRejectReason('Ngắn quá');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('ít nhất 10 ký tự');
    });

    it('báo lỗi khi lý do dài quá 500 ký tự', () => {
      const longText = 'a'.repeat(501);
      const res = validateRejectReason(longText);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('vượt quá 500 ký tự');
    });

    it('chấp nhận lý do hợp lệ từ 10 đến 500 ký tự và trim khoảng trắng', () => {
      const validText = '   Tài khoản đang có giao dịch khiếu nại chưa xử lý xong   ';
      const res = validateRejectReason(validText);
      expect(res.valid).toBe(true);
      expect(res.error).toBeNull();
      expect(res.reason).toBe('Tài khoản đang có giao dịch khiếu nại chưa xử lý xong');
    });
  });

  describe('mapErasureError', () => {
    it('nhận diện mã lỗi REQUEST_ALREADY_EXISTS', () => {
      const err = {
        response: {
          status: 409,
          data: { code: 'REQUEST_ALREADY_EXISTS', detail: 'Đã có yêu cầu đang chờ xử lý' },
        },
      };
      const res = mapErasureError(err);
      expect(res.code).toBe('REQUEST_ALREADY_EXISTS');
      expect(res.message).toBe('Đã có yêu cầu đang chờ xử lý');
    });

    it('nhận diện mã lỗi WALLET_HAS_BALANCE kèm số dư', () => {
      const err = {
        response: {
          status: 409,
          data: {
            code: 'WALLET_HAS_BALANCE',
            detail: 'Ví tài xế còn tiền',
            balance: 120000,
          },
        },
      };
      const res = mapErasureError(err);
      expect(res.code).toBe('WALLET_HAS_BALANCE');
      expect(res.balance).toBe(120000);
      expect(res.message).toContain('Ví tài xế còn');
    });

    it('nhận diện mã lỗi PERIOD_LOCKED của S-55', () => {
      const err = {
        response: {
          status: 409,
          data: {
            code: 'PERIOD_LOCKED',
            detail: 'Kỳ đối soát đã chốt',
          },
        },
      };
      const res = mapErasureError(err);
      expect(res.code).toBe('PERIOD_LOCKED');
      expect(res.message).toContain('Kỳ đối soát đã chốt');
    });

    it('nhận diện lỗi 401, 403, 422, 500', () => {
      expect(mapErasureError({ response: { status: 401 } }).message).toContain('Phiên đăng nhập đã hết hạn');
      expect(mapErasureError({ response: { status: 403, data: { detail: 'Cấm truy cập' } } }).message).toBe('Cấm truy cập');
      expect(mapErasureError({ response: { status: 422, data: { detail: 'Dữ liệu sai' } } }).message).toBe('Dữ liệu sai');
      expect(mapErasureError({ response: { status: 500 } }).message).toContain('Máy chủ đang gặp sự cố');
    });

    it('nhận diện lỗi 404 hoặc 501 thông báo chức năng chưa sẵn sàng', () => {
      expect(mapErasureError({ response: { status: 404 } }).message).toBe('Chức năng chưa sẵn sàng (backend chưa triển khai).');
      expect(mapErasureError({ response: { status: 501 } }).message).toBe('Chức năng chưa sẵn sàng (backend chưa triển khai).');
    });

    it('nhận diện lỗi mất kết nối mạng', () => {
      expect(mapErasureError({ request: {} }).message).toContain('Không thể kết nối đến máy chủ');
    });
  });

  describe('createSingleFlightHandler (chống bấm đôi)', () => {
    it('chặn gọi hàm lần 2 khi lần 1 đang chạy', async () => {
      let resolveFirst;
      const slowFn = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      });

      const guarded = createSingleFlightHandler(slowFn);

      const p1 = guarded();
      const p2 = guarded(); // Lời gọi thứ hai khi p1 đang pending

      expect(slowFn).toHaveBeenCalledTimes(1);

      resolveFirst('done');
      await p1;
      await p2;

      // Sau khi p1 kết thúc, gọi tiếp sẽ được phép
      const p3 = guarded();
      expect(slowFn).toHaveBeenCalledTimes(2);
      resolveFirst('done-again');
      await p3;
    });
  });

  describe('formatCurrencyVND', () => {
    it('định dạng tiền tệ theo chuẩn VND', () => {
      expect(formatCurrencyVND(100000)).toContain('100.000');
      expect(formatCurrencyVND(0)).toContain('0');
      expect(formatCurrencyVND('invalid')).toBe('0 ₫');
    });
  });
});
