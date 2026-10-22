import { describe, it, expect } from 'vitest';
import {
  RESERVATION_STATUS,
  DEFAULT_NO_SHOW_FEE,
  getReservationStatusMeta,
  formatReservationFee,
  isPenaltyTransaction,
  calculateRemainingHoldTime,
  filterReservations,
} from './reservationUtils';

describe('SCRUM-378: reservationUtils unit tests', () => {
  describe('getReservationStatusMeta', () => {
    it('nhận diện đúng trạng thái EXPIRED với badge và mô tả cảnh báo quá hạn', () => {
      const meta = getReservationStatusMeta('EXPIRED');
      expect(meta.key).toBe('EXPIRED');
      expect(meta.label).toBe('Quá hạn');
      expect(meta.isOverdue).toBe(true);
      expect(meta.badgeClass).toContain('text-critical-red');
      expect(meta.description).toContain('Quá giờ giữ chỗ không tới');
    });

    it('tương thích với các biến thể trạng thái OVERDUE và CANCELLED_NO_SHOW', () => {
      const meta1 = getReservationStatusMeta('OVERDUE');
      expect(meta1.key).toBe('EXPIRED');
      expect(meta1.isOverdue).toBe(true);

      const meta2 = getReservationStatusMeta('CANCELLED_NO_SHOW');
      expect(meta2.key).toBe('EXPIRED');
      expect(meta2.isOverdue).toBe(true);
    });

    it('nhận diện đúng trạng thái ACTIVE đang giữ chỗ', () => {
      const meta = getReservationStatusMeta('ACTIVE');
      expect(meta.key).toBe('ACTIVE');
      expect(meta.label).toBe('Đang giữ chỗ');
      expect(meta.isOverdue).toBe(false);
    });

    it('tương thích với các biến thể ACTIVE như HOLDING, PENDING, CONFIRMED', () => {
      ['HOLDING', 'PENDING', 'CONFIRMED'].forEach((st) => {
        const meta = getReservationStatusMeta(st);
        expect(meta.key).toBe('ACTIVE');
        expect(meta.label).toBe('Đang giữ chỗ');
        expect(meta.isOverdue).toBe(false);
      });
    });

    it('nhận diện đúng trạng thái COMPLETED và CANCELLED', () => {
      const metaComp = getReservationStatusMeta('COMPLETED');
      expect(metaComp.key).toBe('COMPLETED');
      expect(metaComp.label).toBe('Hoàn thành');

      const metaCanc = getReservationStatusMeta('CANCELLED');
      expect(metaCanc.key).toBe('CANCELLED');
      expect(metaCanc.label).toBe('Đã hủy');

      const metaCanc2 = getReservationStatusMeta('CANCELED');
      expect(metaCanc2.key).toBe('CANCELLED');
      expect(metaCanc2.label).toBe('Đã hủy');
    });
  });

  describe('formatReservationFee', () => {
    it('khi trạng thái là EXPIRED, hiển thị phí phạt có dấu trừ và ghi chú trừ ví', () => {
      const res = { status: 'EXPIRED', no_show_fee: 25000 };
      const fee = formatReservationFee(res);
      expect(fee.amount).toBe(25000);
      expect(fee.formatted).toBe('-25.000 đ');
      expect(fee.isPenalty).toBe(true);
      expect(fee.note).toContain('Đã trừ vào ví điện tử');
    });

    it('dùng DEFAULT_NO_SHOW_FEE (20.000 đ) khi không có cấu hình phí riêng', () => {
      const res = { status: 'EXPIRED' };
      const fee = formatReservationFee(res);
      expect(fee.amount).toBe(DEFAULT_NO_SHOW_FEE);
      expect(fee.formatted).toBe('-20.000 đ');
      expect(fee.isPenalty).toBe(true);
    });

    it('khi khách đã cắm súng đúng giờ (COMPLETED), không tính phí (0 đ)', () => {
      const res = { status: 'COMPLETED', no_show_fee: 20000 };
      const fee = formatReservationFee(res);
      expect(fee.amount).toBe(0);
      expect(fee.formatted).toBe('0 đ');
      expect(fee.isPenalty).toBe(false);
      expect(fee.note).toContain('Miễn phí giữ chỗ');
    });

    it('khi khách chủ động hủy trước hạn (CANCELLED), miễn phí (0 đ)', () => {
      const res = { status: 'CANCELLED' };
      const fee = formatReservationFee(res);
      expect(fee.amount).toBe(0);
      expect(fee.formatted).toBe('0 đ');
      expect(fee.isPenalty).toBe(false);
    });
  });

  describe('isPenaltyTransaction', () => {
    it('nhận diện đúng các loại giao dịch ví phạt quá hạn / không đến', () => {
      expect(isPenaltyTransaction({ transaction_type: 'NO_SHOW_PENALTY' })).toBe(true);
      expect(isPenaltyTransaction({ transaction_type: 'HOLD_FEE' })).toBe(true);
      expect(isPenaltyTransaction({ reference_type: 'RESERVATION' })).toBe(true);
      expect(isPenaltyTransaction({ reference_id: 'res_12345' })).toBe(true);
      expect(isPenaltyTransaction({ note: 'Trừ phí giữ chỗ quá hạn không tới nhận trụ' })).toBe(true);
    });

    it('không nhầm lẫn với các giao dịch nạp tiền hoặc sạc pin thông thường', () => {
      expect(isPenaltyTransaction({ transaction_type: 'TOPUP', note: 'Nạp tiền ví' })).toBe(false);
      expect(isPenaltyTransaction({ transaction_type: 'CHARGE_FEE', note: 'Thanh toán phiên sạc #12' })).toBe(false);
      expect(isPenaltyTransaction(null)).toBe(false);
    });
  });

  describe('calculateRemainingHoldTime', () => {
    it('báo hết hạn khi thời điểm hiện tại vượt quá validUntil', () => {
      const past = new Date('2026-10-13T10:00:00Z');
      const now = new Date('2026-10-13T10:05:00Z');
      const res = calculateRemainingHoldTime(past, now);
      expect(res.isExpired).toBe(true);
      expect(res.text).toBe('Đã quá hạn');
    });

    it('tính chính xác số phút và giây còn lại khi đang giữ chỗ', () => {
      const future = new Date('2026-10-13T10:15:00Z');
      const now = new Date('2026-10-13T10:05:30Z');
      const res = calculateRemainingHoldTime(future, now);
      expect(res.isExpired).toBe(false);
      expect(res.minutes).toBe(9);
      expect(res.seconds).toBe(30);
      expect(res.text).toBe('Còn 09:30');
    });
  });

  describe('filterReservations', () => {
    const list = [
      { id: 1, reservation_code: 'RES-01', status: 'ACTIVE', station_name: 'Trạm VinFast Thảo Điền' },
      { id: 2, reservation_code: 'RES-02', status: 'EXPIRED', station_name: 'Trạm Quận 1' },
      { id: 3, reservation_code: 'RES-03', status: 'COMPLETED', station_name: 'Trạm Landmark 81' },
    ];

    it('lọc theo tab EXPIRED chỉ trả về các lượt đặt chỗ quá hạn', () => {
      const filtered = filterReservations(list, 'EXPIRED');
      expect(filtered.length).toBe(1);
      expect(filtered[0].reservation_code).toBe('RES-02');
    });

    it('lọc theo từ khóa tìm kiếm tên trạm', () => {
      const filtered = filterReservations(list, 'ALL', 'Thảo Điền');
      expect(filtered.length).toBe(1);
      expect(filtered[0].reservation_code).toBe('RES-01');
    });
  });
});

