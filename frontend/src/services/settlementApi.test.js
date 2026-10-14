import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from './api';
import {
  getSettlementPeriods,
  closeSettlementPeriod,
  reopenSettlementPeriod,
} from './settlementApi';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('settlementApi service (SCRUM-408 / S-55)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSettlementPeriods', () => {
    it('gọi GET /settlement/periods và trả về mảng dữ liệu', async () => {
      const mockPeriods = [
        { id: 1, label: '2026-09', status: 'OPEN' },
        { id: 2, label: '2026-08', status: 'CLOSED' },
      ];
      api.get.mockResolvedValueOnce({ data: mockPeriods });

      const result = await getSettlementPeriods();
      expect(api.get).toHaveBeenCalledWith('/settlement/periods');
      expect(result).toEqual(mockPeriods);
    });

    it('trả về mảng rỗng nếu response.data là null hoặc undefined', async () => {
      api.get.mockResolvedValueOnce({ data: null });

      const result = await getSettlementPeriods();
      expect(result).toEqual([]);
    });
  });

  describe('closeSettlementPeriod', () => {
    it('ném lỗi nếu không truyền periodId', async () => {
      await expect(closeSettlementPeriod(null)).rejects.toThrow('Mã kỳ đối soát không hợp lệ');
      await expect(closeSettlementPeriod('')).rejects.toThrow('Mã kỳ đối soát không hợp lệ');
      expect(api.post).not.toHaveBeenCalled();
    });

    it('gọi POST /settlement/periods/{id}/close thành công', async () => {
      api.post.mockResolvedValueOnce({ data: { message: 'Đã chốt kỳ thành công' } });

      const result = await closeSettlementPeriod(10);
      expect(api.post).toHaveBeenCalledWith('/settlement/periods/10/close');
      expect(result).toEqual({ message: 'Đã chốt kỳ thành công' });
    });
  });

  describe('reopenSettlementPeriod', () => {
    it('ném lỗi nếu không truyền periodId hoặc reason rỗng', async () => {
      await expect(reopenSettlementPeriod(null, 'Lý do')).rejects.toThrow('Mã kỳ đối soát không hợp lệ');
      await expect(reopenSettlementPeriod(10, '')).rejects.toThrow('Bắt buộc phải nhập lý do mở lại kỳ');
      await expect(reopenSettlementPeriod(10, '   ')).rejects.toThrow('Bắt buộc phải nhập lý do mở lại kỳ');
      expect(api.post).not.toHaveBeenCalled();
    });

    it('gọi POST /settlement/periods/{id}/reopen với reason đã trim', async () => {
      api.post.mockResolvedValueOnce({ data: { message: 'Đã mở lại kỳ thành công' } });

      const result = await reopenSettlementPeriod(10, '  Cần điều chỉnh số liệu trạm sạc  ');
      expect(api.post).toHaveBeenCalledWith('/settlement/periods/10/reopen', {
        reason: 'Cần điều chỉnh số liệu trạm sạc',
      });
      expect(result).toEqual({ message: 'Đã mở lại kỳ thành công' });
    });
  });
});

