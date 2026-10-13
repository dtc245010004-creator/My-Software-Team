import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistance,
  calculateConnectorMetrics,
  filterAndSortStations,
} from './stationUtils';

describe('SCRUM-351 / SCRUM-359 / SCRUM-360: stationUtils', () => {
  const mockStations = [
    {
      id: 1,
      name: 'Trạm Sạc Hoàn Kiếm',
      address: 'Số 1 Đinh Tiên Hoàng, Hoàn Kiếm, Hà Nội',
      latitude: 21.0285,
      longitude: 105.8542,
      status: 'ACTIVE',
      is_active: true,
      charging_points: [
        {
          id: 101,
          code: 'EVSE-01',
          is_active: true,
          connectors: [
            { id: 1001, connector_type: 'CCS2', status: 'AVAILABLE', is_active: true },
            { id: 1002, connector_type: 'TYPE_2', status: 'CHARGING', is_active: true },
          ],
        },
        {
          id: 102,
          code: 'EVSE-02',
          is_active: true,
          connectors: [
            { id: 1003, connector_type: 'CCS2', status: 'AVAILABLE', is_active: true },
          ],
        },
      ],
    },
    {
      id: 2,
      name: 'Trạm Sạc Cầu Giấy',
      address: '122 Cầu Giấy, Hà Nội',
      latitude: 21.0362,
      longitude: 105.7905,
      status: 'ACTIVE',
      is_active: true,
      charging_points: [
        {
          id: 201,
          code: 'EVSE-03',
          is_active: true,
          connectors: [
            { id: 2001, connector_type: 'CCS2', status: 'CHARGING', is_active: true },
            { id: 2002, connector_type: 'CHADEMO', status: 'UNAVAILABLE', is_active: true },
          ],
        },
      ],
    },
    {
      id: 3,
      name: 'Trạm Sạc Đang Bảo Trì',
      address: 'Khu công nghiệp Bắc Thăng Long',
      latitude: 21.12,
      longitude: 105.78,
      status: 'MAINTENANCE', // Tạm ngừng / bảo trì
      is_active: true,
      charging_points: [],
    },
    {
      id: 4,
      name: 'Trạm Sạc Chưa Hoạt Động',
      address: 'Đường ven hồ Tây',
      latitude: 21.06,
      longitude: 105.82,
      status: 'ACTIVE',
      is_active: false, // Ngừng hoạt động
      charging_points: [],
    },
  ];

  describe('1. calculateConnectorMetrics (SCRUM-360)', () => {
    it('tính đúng số đầu nối rảnh trên tổng số và loại đầu nối', () => {
      const metrics = calculateConnectorMetrics(mockStations[0]);
      expect(metrics.totalConnectors).toBe(3);
      expect(metrics.availableConnectors).toBe(2);
      expect(metrics.hasAvailableConnectors).toBe(true);
      expect(metrics.connectorTypes).toContain('CCS2');
      expect(metrics.connectorTypes).toContain('TYPE_2');
    });

    it('nhận diện đúng khi trạm kín chỗ (0 đầu nối rảnh)', () => {
      const metrics = calculateConnectorMetrics(mockStations[1]);
      expect(metrics.totalConnectors).toBe(2);
      expect(metrics.availableConnectors).toBe(0);
      expect(metrics.hasAvailableConnectors).toBe(false);
      expect(metrics.connectorTypes).toContain('CCS2');
      expect(metrics.connectorTypes).toContain('CHADEMO');
    });
  });

  describe('2. Lọc trạm chưa hoạt động hoặc tạm ngừng (AC 4)', () => {
    it('loại bỏ các trạm MAINTENANCE hoặc is_active === false', () => {
      const result = filterAndSortStations(mockStations);
      const stationIds = result.map((s) => s.id);
      expect(stationIds).toContain(1);
      expect(stationIds).toContain(2);
      expect(stationIds).not.toContain(3); // Không có trạm MAINTENANCE
      expect(stationIds).not.toContain(4); // Không có trạm is_active: false
    });
  });

  describe('3. Sắp xếp theo khoảng cách tăng dần khi có GPS (SCRUM-359 AC 1)', () => {
    it('sắp xếp trạm gần người dùng nhất lên đầu tiên', () => {
      // Người dùng ở Cầu Giấy (gần Trạm Cầu Giấy hơn Trạm Hoàn Kiếm)
      const userCoords = { lat: 21.0360, lon: 105.7900 };
      const result = filterAndSortStations(mockStations, { userCoords });

      expect(result.length).toBe(2);
      expect(result[0].id).toBe(2); // Trạm Cầu Giấy gần hơn
      expect(result[1].id).toBe(1); // Trạm Hoàn Kiếm xa hơn
      expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
    });
  });

  describe('4. Tìm kiếm theo tên hoặc địa chỉ khi không có GPS (SCRUM-359 & SCRUM-360 AC 3)', () => {
    it('tìm kiếm theo tên trạm không phân biệt hoa thường khi không có GPS', () => {
      const result = filterAndSortStations(mockStations, {
        searchQuery: 'hoàn kiếm',
        userCoords: null, // Bị từ chối GPS
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(1);
    });

    it('tìm kiếm theo địa chỉ trạm khi không có GPS', () => {
      const result = filterAndSortStations(mockStations, {
        searchQuery: '122 cầu giấy',
        userCoords: null,
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(2);
    });
  });

  describe('5. Lọc theo chuẩn sạc & chỉ trạm còn đầu nối', () => {
    it('lọc trạm hỗ trợ chuẩn CHADEMO', () => {
      const result = filterAndSortStations(mockStations, {
        connectorType: 'CHADEMO',
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(2);
    });

    it('lọc chỉ hiện trạm còn đầu nối rảnh', () => {
      const result = filterAndSortStations(mockStations, {
        availableOnly: true,
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(1); // Trạm 1 có 2/3 rảnh, trạm 2 có 0/2 rảnh
    });
  });
});

