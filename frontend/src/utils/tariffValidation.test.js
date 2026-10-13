import { describe, it, expect } from 'vitest';
import {
  validateTariffPeriods,
  timeToMinutes,
  minutesToTime,
  isTimeOverlapping,
  validatePowerLimitSlots,
} from './tariffValidation';

describe('tariffValidation', () => {
  describe('timeToMinutes & minutesToTime', () => {
    it('chuyển đổi chính xác giữa giờ và phút', () => {
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('08:30')).toBe(510);
      expect(timeToMinutes('24:00')).toBe(1440);
      
      expect(minutesToTime(0)).toBe('00:00');
      expect(minutesToTime(510)).toBe('08:30');
      expect(minutesToTime(1440)).toBe('24:00');
    });
  });

  describe('validateTariffPeriods', () => {
    it('hợp lệ với 3 khung giờ phủ kín 24h (AC1)', () => {
      const periods = [
        { start: '00:00', end: '08:00', price: 1000 },
        { start: '08:00', end: '16:00', price: 2000 },
        { start: '16:00', end: '24:00', price: 3000 },
      ];
      const result = validateTariffPeriods(periods);
      expect(result.isValid).toBe(true);
      expect(result.gaps).toHaveLength(0);
      expect(result.overlaps).toHaveLength(0);
    });

    it('báo lỗi khi có chồng lấn (AC2)', () => {
      const periods = [
        { start: '00:00', end: '10:00', price: 1000 },
        { start: '08:00', end: '24:00', price: 2000 },
      ];
      const result = validateTariffPeriods(periods);
      expect(result.isValid).toBe(false);
      expect(result.overlaps.length).toBeGreaterThan(0);
      expect(result.errorsByIndex[1]).toContain('chồng lấn');
    });

    it('báo lỗi khi có khoảng trống (AC2)', () => {
      const periods = [
        { start: '00:00', end: '10:00', price: 1000 },
        { start: '12:00', end: '24:00', price: 2000 },
      ];
      const result = validateTariffPeriods(periods);
      expect(result.isValid).toBe(false);
      expect(result.gaps.length).toBeGreaterThan(0);
    });

    it('tự động tách khung giờ qua nửa đêm (AC3)', () => {
      const periods = [
        { start: '22:00', end: '06:00', price: 1000 },
        { start: '06:00', end: '22:00', price: 2000 },
      ];
      const result = validateTariffPeriods(periods);
      expect(result.isValid).toBe(true);
      expect(result.segments.some(s => s.isOvernight)).toBe(true);
    });
  });

  describe('SCRUM-294 / SCRUM-314: isTimeOverlapping & validatePowerLimitSlots', () => {
    it('phát hiện đúng 2 khung giờ bị đè lên nhau (08:00-10:00 và 09:00-11:00)', () => {
      expect(
        isTimeOverlapping(
          { startTime: '08:00', endTime: '10:00' },
          { startTime: '09:00', endTime: '11:00' }
        )
      ).toBe(true);

      // Hai khung giờ nối tiếp nhau (08:00-10:00 và 10:00-12:00) không bị coi là đè
      expect(
        isTimeOverlapping(
          { startTime: '08:00', endTime: '10:00' },
          { startTime: '10:00', endTime: '12:00' }
        )
      ).toBe(false);
    });

    it('validatePowerLimitSlots: bắt lỗi startTime >= endTime, maxPowerKw <= 0 và overlap', () => {
      const invalidTimeRange = validatePowerLimitSlots([
        { startTime: '12:00', endTime: '08:00', maxPowerKw: 100 },
      ]);
      expect(invalidTimeRange.isValid).toBe(false);
      expect(invalidTimeRange.errorsByIndex[0].timeRange).toBeTruthy();

      const invalidPower = validatePowerLimitSlots([
        { startTime: '08:00', endTime: '12:00', maxPowerKw: 0 },
      ]);
      expect(invalidPower.isValid).toBe(false);
      expect(invalidPower.errorsByIndex[0].maxPowerKw).toBeTruthy();

      const overlapping = validatePowerLimitSlots([
        { startTime: '08:00', endTime: '10:00', maxPowerKw: 120 },
        { startTime: '09:00', endTime: '11:00', maxPowerKw: 80 },
      ]);
      expect(overlapping.isValid).toBe(false);
      expect(overlapping.errorsByIndex[0].overlap).toBeTruthy();
      expect(overlapping.errorsByIndex[1].overlap).toBeTruthy();
    });
  });
});

// ============================================================================
// SCRUM-244: UNIT & INTEGRATION TESTS CHO NẠP TIỀN QUA CỔNG THANH TOÁN SANDBOX
// (SCRUM-242 Form Validation, SCRUM-239/240 Callback URL, SCRUM-245 Realtime Sync)
// ============================================================================
import { vi } from 'vitest';
import {
  validateTopupAmount,
  parseSandboxRedirectUrl,
  parseTopupReturnParams,
  pollTopupOrderOnce,
} from '../pages/Wallet';

describe('Sandbox Top-up Frontend Suite (SCRUM-232 / SCRUM-244)', () => {
  describe('1. validateTopupAmount (SCRUM-242)', () => {
    it('chấp nhận số tiền hợp lệ trong khoảng 10,000 - 50,000,000 VND', () => {
      expect(validateTopupAmount('10000')).toEqual({
        isValid: true,
        amount: 10000,
        error: '',
      });
      expect(validateTopupAmount(500000)).toEqual({
        isValid: true,
        amount: 500000,
        error: '',
      });
      expect(validateTopupAmount('50000000')).toEqual({
        isValid: true,
        amount: 50000000,
        error: '',
      });
    });

    it('từ chối khi để trống, số âm, số thập phân hoặc ngoài hạn mức', () => {
      expect(validateTopupAmount('').isValid).toBe(false);
      expect(validateTopupAmount(null).isValid).toBe(false);
      expect(validateTopupAmount('-50000').isValid).toBe(false);
      expect(validateTopupAmount('15000.5').isValid).toBe(false);

      const underMin = validateTopupAmount('5000');
      expect(underMin.isValid).toBe(false);
      expect(underMin.error).toContain('10');

      const overMax = validateTopupAmount('60000000');
      expect(overMax.isValid).toBe(false);
      expect(overMax.error).toContain('50');
    });
  });

  describe('2. parseSandboxRedirectUrl & parseTopupReturnParams (SCRUM-239 & SCRUM-240)', () => {
    it('trích xuất đúng order_code, amount và chữ ký HMAC từ URL cổng Sandbox', () => {
      const url =
        'https://sandbox.payment-gateway.local/checkout?amount=200000&order_code=ORDER_ABC12345&return_url=&signature=sig_hmac_256';
      const parsed = parseSandboxRedirectUrl(url);
      expect(parsed.orderCode).toBe('ORDER_ABC12345');
      expect(parsed.amount).toBe(200000);
      expect(parsed.signature).toBe('sig_hmac_256');
      expect(parsed.gatewayHost).toBe('sandbox.payment-gateway.local');
    });

    it('đảm bảo ràng buộc NFR: Return URL không bao giờ được tự ý cộng số dư ví', () => {
      const callbackSuccess = parseTopupReturnParams(
        '?order_code=ORDER_999&status=SUCCESS'
      );
      expect(callbackSuccess.hasCallback).toBe(true);
      expect(callbackSuccess.orderCode).toBe('ORDER_999');
      expect(callbackSuccess.clientHintStatus).toBe('SUCCESS');
      // NFR: Tuyệt đối không tin cậy tham số URL để tăng số dư
      expect(callbackSuccess.shouldTrustClientStatusForBalance).toBe(false);

      const callbackCancelled = parseTopupReturnParams(
        '?order_code=ORDER_888&status=CANCELLED&message=Tai+xe+huy'
      );
      expect(callbackCancelled.hasCallback).toBe(true);
      expect(callbackCancelled.clientHintStatus).toBe('CANCELLED');
      expect(callbackCancelled.clientMessage).toBe('Tai xe huy');
      expect(callbackCancelled.shouldTrustClientStatusForBalance).toBe(false);
    });
  });

  describe('3. pollTopupOrderOnce - Đồng bộ Realtime / Polling (SCRUM-245)', () => {
    it('khi đơn vẫn đang PENDING (quay về trước khi Webhook tới): giữ nguyên số dư, tiếp tục chờ', async () => {
      const onOrderUpdate = vi.fn();
      const onWebhookConfirmedSuccess = vi.fn();
      const onWebhookFailed = vi.fn();

      const res = await pollTopupOrderOnce({
        orderCode: 'ORDER_PENDING_01',
        apiGetOrderStatus: async () => ({
          order_code: 'ORDER_PENDING_01',
          amount: 100000,
          status: 'PENDING',
        }),
        onOrderUpdate,
        onWebhookConfirmedSuccess,
        onWebhookFailed,
      });

      expect(res.done).toBe(false);
      expect(res.status).toBe('PENDING');
      expect(onOrderUpdate).toHaveBeenCalledTimes(1);
      // Số dư KHÔNG được cập nhật khi chưa có Webhook thành công
      expect(onWebhookConfirmedSuccess).not.toHaveBeenCalled();
      expect(onWebhookFailed).not.toHaveBeenCalled();
    });

    it('khi Webhook xử lý xong (status chuyển sang SUCCESS): tự động kích hoạt cập nhật số dư ví', async () => {
      const onOrderUpdate = vi.fn();
      const onWebhookConfirmedSuccess = vi.fn();
      const onWebhookFailed = vi.fn();

      const res = await pollTopupOrderOnce({
        orderCode: 'ORDER_SUCCESS_02',
        apiGetOrderStatus: async () => ({
          order_code: 'ORDER_SUCCESS_02',
          amount: 250000,
          status: 'SUCCESS',
        }),
        onOrderUpdate,
        onWebhookConfirmedSuccess,
        onWebhookFailed,
      });

      expect(res.done).toBe(true);
      expect(res.status).toBe('SUCCESS');
      expect(onOrderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ order_code: 'ORDER_SUCCESS_02', status: 'SUCCESS' })
      );
      expect(onWebhookConfirmedSuccess).toHaveBeenCalledTimes(1);
      expect(onWebhookFailed).not.toHaveBeenCalled();
    });

    it('khi thanh toán thất bại hoặc hủy (FAILED / CANCELLED): báo lý do lỗi và không cộng số dư', async () => {
      const onOrderUpdate = vi.fn();
      const onWebhookConfirmedSuccess = vi.fn();
      const onWebhookFailed = vi.fn();

      const res = await pollTopupOrderOnce({
        orderCode: 'ORDER_FAIL_03',
        apiGetOrderStatus: async () => ({
          order_code: 'ORDER_FAIL_03',
          amount: 100000,
          status: 'FAILED',
          failure_reason: 'Ngân hàng từ chối giao dịch',
        }),
        onOrderUpdate,
        onWebhookConfirmedSuccess,
        onWebhookFailed,
      });

      expect(res.done).toBe(true);
      expect(res.status).toBe('FAILED');
      expect(onWebhookConfirmedSuccess).not.toHaveBeenCalled();
      expect(onWebhookFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          order_code: 'ORDER_FAIL_03',
          status: 'FAILED',
          failure_reason: 'Ngân hàng từ chối giao dịch',
        })
      );
    });
  });
});


