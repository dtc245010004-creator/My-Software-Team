import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from './api';
import {
  getMyErasureRequest,
  submitErasureRequest,
  getMyWallet,
  getAdminErasureRequests,
  getAdminErasureRequestDetail,
  approveErasureRequest,
  rejectErasureRequest,
} from './dataErasureApi';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('dataErasureApi service (SCRUM-418)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMyErasureRequest', () => {
    it('gọi GET /me/data-erasure-requests và trả về object yêu cầu', async () => {
      const mockData = { id: 1, status: 'PENDING', requested_at: '2026-10-14T08:00:00Z' };
      api.get.mockResolvedValueOnce({ data: mockData });

      const res = await getMyErasureRequest();
      expect(api.get).toHaveBeenCalledWith('/me/data-erasure-requests');
      expect(res).toEqual(mockData);
    });

    it('trả về yêu cầu mới nhất nếu backend trả mảng các yêu cầu', async () => {
      const older = { id: 1, status: 'REJECTED', requested_at: '2026-10-10T08:00:00Z' };
      const latest = { id: 2, status: 'PENDING', requested_at: '2026-10-14T08:00:00Z' };
      api.get.mockResolvedValueOnce({ data: [older, latest] });

      const res = await getMyErasureRequest();
      expect(api.get).toHaveBeenCalledWith('/me/data-erasure-requests');
      expect(res).toEqual(latest);
    });

    it('trả về null nếu backend trả lỗi 404 (chưa từng có yêu cầu)', async () => {
      api.get.mockRejectedValueOnce({ response: { status: 404 } });

      const res = await getMyErasureRequest();
      expect(res).toBeNull();
    });

    it('ném lỗi nếu backend trả lỗi khác 404', async () => {
      api.get.mockRejectedValueOnce({ response: { status: 500 } });

      await expect(getMyErasureRequest()).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  describe('submitErasureRequest', () => {
    it('gọi POST /me/data-erasure-requests với reason đã trim', async () => {
      const mockRes = { id: 2, status: 'PENDING', requested_at: '2026-10-14T08:30:00Z' };
      api.post.mockResolvedValueOnce({ data: mockRes });

      const res = await submitErasureRequest({ reason: '  Tôi không còn sử dụng xe điện  ' });
      expect(api.post).toHaveBeenCalledWith('/me/data-erasure-requests', {
        reason: 'Tôi không còn sử dụng xe điện',
      });
      expect(res).toEqual(mockRes);
    });
  });

  describe('getMyWallet', () => {
    it('gọi GET /wallet/me và trả về thông tin ví', async () => {
      const mockWallet = { id: 10, balance: 250000, currency: 'VND' };
      api.get.mockResolvedValueOnce({ data: mockWallet });

      const res = await getMyWallet();
      expect(api.get).toHaveBeenCalledWith('/wallet/me');
      expect(res).toEqual(mockWallet);
    });
  });

  describe('getAdminErasureRequests', () => {
    it('gọi GET /admin/data-erasure-requests kèm status param', async () => {
      const mockList = [{ id: 1, driver_name: 'Nguyễn Văn A', status: 'PENDING' }];
      api.get.mockResolvedValueOnce({ data: mockList });

      const res = await getAdminErasureRequests('PENDING');
      expect(api.get).toHaveBeenCalledWith('/admin/data-erasure-requests', {
        params: { status: 'PENDING' },
      });
      expect(res).toEqual(mockList);
    });

    it('không truyền status param nếu là ALL', async () => {
      api.get.mockResolvedValueOnce({ data: [] });

      await getAdminErasureRequests('ALL');
      expect(api.get).toHaveBeenCalledWith('/admin/data-erasure-requests', {
        params: {},
      });
    });
  });

  describe('getAdminErasureRequestDetail', () => {
    it('ném lỗi nếu thiếu id', async () => {
      await expect(getAdminErasureRequestDetail(null)).rejects.toThrow('Mã yêu cầu không hợp lệ');
      expect(api.get).not.toHaveBeenCalled();
    });

    it('gọi GET /admin/data-erasure-requests/{id} thành công', async () => {
      const mockDetail = { id: 5, driver_name: 'Trần B', status: 'PENDING' };
      api.get.mockResolvedValueOnce({ data: mockDetail });

      const res = await getAdminErasureRequestDetail(5);
      expect(api.get).toHaveBeenCalledWith('/admin/data-erasure-requests/5');
      expect(res).toEqual(mockDetail);
    });
  });

  describe('approveErasureRequest', () => {
    it('ném lỗi nếu thiếu id', async () => {
      await expect(approveErasureRequest(null)).rejects.toThrow('Mã yêu cầu không hợp lệ');
      expect(api.post).not.toHaveBeenCalled();
    });

    it('gọi POST /admin/data-erasure-requests/{id}/approve với confirm_scope: true', async () => {
      api.post.mockResolvedValueOnce({ data: { message: 'Đã phê duyệt yêu cầu' } });

      const res = await approveErasureRequest(10, { confirm_scope: true });
      expect(api.post).toHaveBeenCalledWith('/admin/data-erasure-requests/10/approve', {
        confirm_scope: true,
      });
      expect(res).toEqual({ message: 'Đã phê duyệt yêu cầu' });
    });
  });

  describe('rejectErasureRequest', () => {
    it('ném lỗi nếu thiếu id hoặc reason rỗng', async () => {
      await expect(rejectErasureRequest(null, { reason: 'Lý do' })).rejects.toThrow('Mã yêu cầu không hợp lệ');
      await expect(rejectErasureRequest(10, { reason: '' })).rejects.toThrow('Bắt buộc phải nhập lý do từ chối');
      await expect(rejectErasureRequest(10, { reason: '   ' })).rejects.toThrow('Bắt buộc phải nhập lý do từ chối');
      expect(api.post).not.toHaveBeenCalled();
    });

    it('gọi POST /admin/data-erasure-requests/{id}/reject với reason đã trim', async () => {
      api.post.mockResolvedValueOnce({ data: { message: 'Đã từ chối yêu cầu' } });

      const res = await rejectErasureRequest(10, { reason: '  Hồ sơ tài xế đang bị điều tra khiếu nại  ' });
      expect(api.post).toHaveBeenCalledWith('/admin/data-erasure-requests/10/reject', {
        reason: 'Hồ sơ tài xế đang bị điều tra khiếu nại',
      });
      expect(res).toEqual({ message: 'Đã từ chối yêu cầu' });
    });
  });
});

