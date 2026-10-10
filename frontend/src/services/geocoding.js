import axios from 'axios';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

/**
 * Gọi geocode địa danh qua Nominatim OpenStreetMap (giới hạn Việt Nam, tiếng Việt)
 * Có cơ chế tự động fallback thử lại với chuỗi ngắn hơn nếu không tìm thấy.
 *
 * @param {string} fullQuery Chuỗi địa chỉ đầy đủ (ví dụ: "720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP. Hồ Chí Minh, Việt Nam")
 * @param {Array<string>} [fallbackQueries] Danh sách các chuỗi rút ngắn thử lại theo thứ tự
 * @returns {Promise<{ lat: number, lon: number, displayName: string } | null>}
 */
export async function geocode(fullQuery, fallbackQueries = []) {
  if (!fullQuery || !fullQuery.trim()) return null;

  const queries = [fullQuery.trim(), ...fallbackQueries.map((q) => q?.trim()).filter(Boolean)];

  for (const query of queries) {
    try {
      const res = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
        params: {
          q: query,
          format: 'json',
          countrycodes: 'vn',
          limit: 1,
          'accept-language': 'vi',
        },
        headers: {
          Accept: 'application/json',
        },
      });

      if (res.data && res.data.length > 0) {
        const item = res.data[0];
        return {
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          displayName: item.display_name,
        };
      }
    } catch (err) {
      console.warn(`[Geocoding] Lỗi tra cứu cho query "${query}":`, err.message);
    }
  }

  return null;
}

/**
 * Tra cứu ngược tọa độ GPS thành địa chỉ văn bản gợi ý (Reverse Geocoding)
 *
 * @param {number} lat Vĩ độ
 * @param {number} lon Kinh độ
 * @returns {Promise<string | null>}
 */
export async function reverseGeocode(lat, lon) {
  if (lat == null || lon == null) return null;

  try {
    const res = await axios.get(`${NOMINATIM_BASE_URL}/reverse`, {
      params: {
        lat: lat,
        lon: lon,
        format: 'json',
        'accept-language': 'vi',
      },
      headers: {
        Accept: 'application/json',
      },
    });

    if (res.data && res.data.display_name) {
      return res.data.display_name;
    }
  } catch (err) {
    console.warn('[Geocoding] Lỗi reverse geocode:', err.message);
  }

  return null;
}
