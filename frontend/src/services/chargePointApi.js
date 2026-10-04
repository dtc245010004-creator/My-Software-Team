import api from './api';

/**
 * Hàm gọi API khởi động lại trụ sạc (mock)
 * @param {string} chargerId - Mã trụ sạc cần khởi động lại
 * @param {AbortSignal} signal - Tín hiệu huỷ (timeout)
 * @param {string} forceMockState - Dùng để test ép trạng thái: 'success', 'offline', 'timeout', '401', '500'
 */
export const restartChargePoint = async (chargerId, signal, forceMockState = 'success') => {
  // TODO: Sau này xoá logic mock và thay bằng gọi API thực tế khi Backend hoàn thành:
  // return await api.post(`/chargers/${chargerId}/restart`, {}, { signal });

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('CanceledError'));
    }

    const timer = setTimeout(() => {
      if (signal?.aborted) return;

      switch (forceMockState) {
        case 'success':
          resolve({ data: { status: 'success', message: 'Đã gửi lệnh khởi động lại thành công.' } });
          break;
        case 'offline':
          reject({ response: { status: 409, data: { detail: 'Trụ sạc đang mất kết nối (Offline).' } } });
          break;
        case 'timeout':
          reject({ response: { status: 504, data: { detail: 'Trụ sạc không phản hồi lệnh trong thời gian quy định.' } } });
          break;
        case '401':
        case '403':
          reject({ response: { status: 403, data: { detail: 'Không đủ quyền thực hiện thao tác này.' } } });
          break;
        default:
          reject({ response: { status: 500, data: { detail: 'Lỗi máy chủ nội bộ.' } } });
      }
    }, 1500);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('CanceledError'));
    });
  });
};
