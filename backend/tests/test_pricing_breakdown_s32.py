"""Bộ ca kiểm thử tính tiền phiên sạc có đáp án tính tay chi tiết (S-32).

Bao gồm các kịch bản:
- Phiên 1 khung giờ đơn giản.
- Phiên cắt qua nhiều khung giờ (S-30).
- Phiên có mốc đo đúng ranh giới hoặc cần nội suy tuyến tính.
- Phiên bắt đầu / kết thúc đúng mốc đổi giá.
- Phiên vắt qua nửa đêm (S-31), cùng hoặc khác biểu giá giữa các ngày.
- Phiên dài hơn 24 giờ.
- Kiểm tra quy tắc làm tròn từng đoạn rồi cộng (khác biệt so với tính trên tổng).
- Phí chiếm trụ (idle fee) theo thời gian và vắt qua nửa đêm.
- Helper assert hiển thị lỗi chi tiết đúng chuẩn format.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Callable, List

import pytest

from app.core.datetime_utils import VIETNAM_TZ

# ==============================================================================
# 1. Cấu trúc dữ liệu và Data Models
# ==============================================================================

@dataclass(frozen=True)
class MeterSample:
    """Mẫu đo công tơ tại một thời điểm."""
    timestamp: datetime  # Giờ timezone-aware (hoặc UTC)
    meter_kwh: Decimal


@dataclass(frozen=True)
class SegmentResult:
    """Chi tiết kết quả tính toán cho 1 đoạn."""
    start_time: datetime
    end_time: datetime
    kwh: Decimal
    unit_price: Decimal
    energy_amount: Decimal
    idle_hours: Decimal = Decimal("0.00")
    idle_rate_per_hour: Decimal = Decimal("0.00")
    idle_amount: Decimal = Decimal("0.00")
    total_segment_amount: Decimal = Decimal("0.00")


@dataclass(frozen=True)
class SessionBreakdown:
    """Tổng hợp hoá đơn phiên sạc gồm danh sách các đoạn."""
    segments: List[SegmentResult]
    total_kwh: Decimal
    total_energy_amount: Decimal
    total_idle_amount: Decimal
    total_amount: Decimal


# ==============================================================================
# 2. Logic nội suy & Chia đoạn độc lập phục vụ kiểm thử (Spec S-30 / S-31 / S-32)
# ==============================================================================

def interpolate_meter(
    target_dt: datetime,
    samples: List[MeterSample],
) -> Decimal:
    """
    Nội suy tuyến tính giá trị công tơ tại target_dt dựa trên danh sách samples đã sắp xếp.
    Nếu target_dt trùng khớp mẫu đo -> lấy chính xác số đo đó.
    Nếu target_dt nằm giữa 2 mẫu đo -> nội suy tuyến tính:
        kwh = kwh_1 + (kwh_2 - kwh_1) * (target_dt - t1) / (t2 - t1)
    """
    if not samples:
        return Decimal("0.00")

    # Tìm chính xác
    for s in samples:
        if s.timestamp == target_dt:
            return s.meter_kwh

    # Nếu trước mẫu đầu hoặc sau mẫu cuối
    if target_dt <= samples[0].timestamp:
        return samples[0].meter_kwh
    if target_dt >= samples[-1].timestamp:
        return samples[-1].meter_kwh

    # Tìm 2 mốc bao quanh
    for i in range(len(samples) - 1):
        s1 = samples[i]
        s2 = samples[i + 1]
        if s1.timestamp <= target_dt <= s2.timestamp:
            dt_total = Decimal(str((s2.timestamp - s1.timestamp).total_seconds()))
            if dt_total == Decimal("0"):
                return s1.meter_kwh
            dt_part = Decimal(str((target_dt - s1.timestamp).total_seconds()))
            ratio = dt_part / dt_total
            interpolated = s1.meter_kwh + (s2.meter_kwh - s1.meter_kwh) * ratio
            return interpolated.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    return samples[-1].meter_kwh


def round_vnd(val: Decimal) -> Decimal:
    """Làm tròn số tiền VNĐ đến hàng đơn vị theo chuẩn HALF_UP."""
    return val.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def calculate_session_breakdown(
    session_start: datetime,
    session_end: datetime,
    boundary_times: List[datetime],
    meter_samples: List[MeterSample],
    get_rate_func: Callable[[datetime, datetime], tuple[Decimal, Decimal, Decimal]],
    # get_rate_func(seg_start, seg_end) -> (unit_price, idle_rate_per_hour, idle_hours_in_segment)
) -> SessionBreakdown:
    """
    Chia phiên thành các đoạn nhỏ dựa trên tập boundary_times và tính tiền từng đoạn.
    Làm tròn TỪNG ĐOẠN rồi cộng tổng.
    """
    # 1. Tập hợp các mốc ranh giới nằm strictly bên trong (session_start, session_end)
    sorted_boundaries = sorted(
        {t for t in boundary_times if session_start < t < session_end}
    )
    time_nodes = [session_start] + sorted_boundaries + [session_end]

    segments: List[SegmentResult] = []
    total_kwh = Decimal("0.00")
    total_energy = Decimal("0")
    total_idle = Decimal("0")
    total_all = Decimal("0")

    for i in range(len(time_nodes) - 1):
        seg_start = time_nodes[i]
        seg_end = time_nodes[i + 1]

        kwh_start = interpolate_meter(seg_start, meter_samples)
        kwh_end = interpolate_meter(seg_end, meter_samples)
        seg_kwh = (kwh_end - kwh_start).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)

        unit_price, idle_rate, idle_hours = get_rate_func(seg_start, seg_end)

        # Tiền điện đoạn = kwh * đơn giá, làm tròn đến đồng
        seg_energy_amt = round_vnd(seg_kwh * unit_price)
        # Phí chiếm trụ đoạn = idle_hours * đơn giá giờ, làm tròn đến đồng
        seg_idle_amt = round_vnd(idle_hours * idle_rate)
        seg_total_amt = seg_energy_amt + seg_idle_amt

        segments.append(
            SegmentResult(
                start_time=seg_start,
                end_time=seg_end,
                kwh=seg_kwh,
                unit_price=unit_price,
                energy_amount=seg_energy_amt,
                idle_hours=idle_hours,
                idle_rate_per_hour=idle_rate,
                idle_amount=seg_idle_amt,
                total_segment_amount=seg_total_amt,
            )
        )

        total_kwh += seg_kwh
        total_energy += seg_energy_amt
        total_idle += seg_idle_amt
        total_all += seg_total_amt

    return SessionBreakdown(
        segments=segments,
        total_kwh=total_kwh,
        total_energy_amount=total_energy,
        total_idle_amount=total_idle,
        total_amount=total_all,
    )


# ==============================================================================
# 3. Helper kiểm chứng chuẩn hoá thông báo lỗi (SCRUM-219)
# ==============================================================================

def assert_session_breakdown_matches(
    case_name: str,
    actual: SessionBreakdown,
    expected_segments: List[dict],
    expected_total_amount: Decimal,
) -> None:
    """
    So sánh chính xác từng đoạn và tổng tiền.
    Định dạng lỗi khi lệch:
    'Ca <tên ca> | đoạn <n> (<từ> -> <đến>): kỳ vọng X đ, thực tế Y đ, chênh Z đ'
    """
    assert len(actual.segments) == len(
        expected_segments
    ), f"Ca {case_name}: Kỳ vọng {len(expected_segments)} đoạn nhưng thực tế có {len(actual.segments)} đoạn."

    for idx, (act_seg, exp_dict) in enumerate(zip(actual.segments, expected_segments), start=1):
        exp_kwh = Decimal(str(exp_dict["kwh"]))
        exp_price = Decimal(str(exp_dict["unit_price"]))
        exp_seg_amt = Decimal(str(exp_dict["total_segment_amount"]))

        start_str = act_seg.start_time.strftime("%H:%M")
        end_str = act_seg.end_time.strftime("%H:%M")

        if act_seg.total_segment_amount != exp_seg_amt:
            diff = act_seg.total_segment_amount - exp_seg_amt
            raise AssertionError(
                f"Ca {case_name} | đoạn {idx} ({start_str} -> {end_str}): "
                f"kỳ vọng {exp_seg_amt} đ, thực tế {act_seg.total_segment_amount} đ, chênh {diff} đ"
            )

        assert act_seg.kwh == exp_kwh, (
            f"Ca {case_name} | đoạn {idx} ({start_str} -> {end_str}) kwh: "
            f"kỳ vọng {exp_kwh}, thực tế {act_seg.kwh}"
        )
        assert act_seg.unit_price == exp_price, (
            f"Ca {case_name} | đoạn {idx} ({start_str} -> {end_str}) unit_price: "
            f"kỳ vọng {exp_price}, thực tế {act_seg.unit_price}"
        )

    if actual.total_amount != expected_total_amount:
        diff_total = actual.total_amount - expected_total_amount
        raise AssertionError(
            f"Ca {case_name} | Tổng phiên: "
            f"kỳ vọng {expected_total_amount} đ, thực tế {actual.total_amount} đ, chênh {diff_total} đ"
        )


# ==============================================================================
# 4. Danh mục 14 Ca kiểm thử chi tiết có đáp án tính tay từng đồng (SCRUM-211 -> 218)
# ==============================================================================

TEST_CASES_S32 = [
    # --------------------------------------------------------------------------
    # Ca 1: Phiên nằm trọn 1 khung -> 1 đoạn, tổng = kWh x đơn giá
    # Thời gian: 14:00 - 15:30 (Giờ bình thường: 3,200 đ/kWh)
    # Sản lượng: 20.0 kWh.
    # Tính tay: Đoạn 1: 20.0 x 3,200 = 64,000 đ. Tổng = 64,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC01_single_normal_window",
        "name": "Phiên trọn 1 khung bình thường",
        "start": datetime(2026, 10, 10, 14, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 10, 15, 30, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 10, 17, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 14, 0, tzinfo=VIETNAM_TZ), Decimal("100.0")),
            MeterSample(datetime(2026, 10, 10, 15, 30, tzinfo=VIETNAM_TZ), Decimal("120.0")),
        ],
        "rate_map": {
            (14, 15): (Decimal("3200"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("20.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("64000")},
        ],
        "expected_total": Decimal("64000"),
    },

    # --------------------------------------------------------------------------
    # Ca 2: Phiên 21:30 - 23:30, đổi giá lúc 22:00, có số đo đúng mốc 22:00
    # Đoạn 1 (21:30-22:00): 3,200 đ/kWh, 10.0 kWh -> 32,000 đ
    # Đoạn 2 (22:00-23:30): 2,500 đ/kWh, 30.0 kWh -> 75,000 đ
    # Tính tay: 32,000 + 75,000 = 107,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC02_boundary_with_exact_sample",
        "name": "Cắt ranh giới có số đo đúng mốc 22h",
        "start": datetime(2026, 10, 10, 21, 30, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 10, 23, 30, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 21, 30, tzinfo=VIETNAM_TZ), Decimal("50.0")),
            MeterSample(datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ), Decimal("60.0")),
            MeterSample(datetime(2026, 10, 10, 23, 30, tzinfo=VIETNAM_TZ), Decimal("90.0")),
        ],
        "rate_map": {
            (21, 22): (Decimal("3200"), Decimal("0"), Decimal("0")),
            (22, 23): (Decimal("2500"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("10.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("32000")},
            {"kwh": Decimal("30.0"), "unit_price": Decimal("2500"), "total_segment_amount": Decimal("75000")},
        ],
        "expected_total": Decimal("107000"),
    },

    # --------------------------------------------------------------------------
    # Ca 3: Phiên 21:30 - 23:30, đổi giá 22:00, KHÔNG CÓ số đo tại 22:00 (Nội suy)
    # Mẫu đo: 21:30 = 100.0 kWh, 23:30 = 140.0 kWh (tổng 40 kWh trong 120 phút = 0.3333 kWh/phút)
    # Nội suy tại 22:00 (sau 30 phút): 100.0 + 40.0 * (30/120) = 110.0 kWh.
    # Đoạn 1 (21:30-22:00): 10.0 kWh x 3,200 đ = 32,000 đ
    # Đoạn 2 (22:00-23:30): 30.0 kWh x 2,500 đ = 75,000 đ
    # Tổng = 107,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC03_boundary_interpolation",
        "name": "Nội suy tuyến tính tại ranh giới 22h",
        "start": datetime(2026, 10, 10, 21, 30, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 10, 23, 30, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 21, 30, tzinfo=VIETNAM_TZ), Decimal("100.0")),
            MeterSample(datetime(2026, 10, 10, 23, 30, tzinfo=VIETNAM_TZ), Decimal("140.0")),
        ],
        "rate_map": {
            (21, 22): (Decimal("3200"), Decimal("0"), Decimal("0")),
            (22, 23): (Decimal("2500"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("10.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("32000")},
            {"kwh": Decimal("30.0"), "unit_price": Decimal("2500"), "total_segment_amount": Decimal("75000")},
        ],
        "expected_total": Decimal("107000"),
    },

    # --------------------------------------------------------------------------
    # Ca 4: Phiên bắt đầu đúng mốc đổi giá (22:00 - 23:00) -> 1 đoạn
    # Sản lượng: 15.0 kWh x 2,500 đ = 37,500 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC04_start_at_exact_boundary",
        "name": "Bắt đầu đúng mốc đổi giá 22h",
        "start": datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ), Decimal("200.0")),
            MeterSample(datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ), Decimal("215.0")),
        ],
        "rate_map": {
            (22, 23): (Decimal("2500"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("15.0"), "unit_price": Decimal("2500"), "total_segment_amount": Decimal("37500")},
        ],
        "expected_total": Decimal("37500"),
    },

    # --------------------------------------------------------------------------
    # Ca 5: Phiên kết thúc đúng mốc đổi giá (21:00 - 22:00) -> 1 đoạn
    # Sản lượng: 20.0 kWh x 3,200 đ = 64,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC05_end_at_exact_boundary",
        "name": "Kết thúc đúng mốc đổi giá 22h",
        "start": datetime(2026, 10, 10, 21, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 21, 0, tzinfo=VIETNAM_TZ), Decimal("300.0")),
            MeterSample(datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ), Decimal("320.0")),
        ],
        "rate_map": {
            (21, 22): (Decimal("3200"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("20.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("64000")},
        ],
        "expected_total": Decimal("64000"),
    },

    # --------------------------------------------------------------------------
    # Ca 6: Phiên cắt 3 khung giờ (16:30 - 20:30)
    # Ranh giới: 17:00 (vào cao điểm), 20:00 (hết cao điểm) -> 3 đoạn:
    # Đoạn 1 (16:30-17:00, 30p): Bình thường 3,200 đ/kWh, 10.0 kWh -> 32,000 đ
    # Đoạn 2 (17:00-20:00, 180p): Cao điểm 4,500 đ/kWh, 60.0 kWh -> 270,000 đ
    # Đoạn 3 (20:00-20:30, 30p): Bình thường 3,200 đ/kWh, 10.0 kWh -> 32,000 đ
    # Tổng = 32,000 + 270,000 + 32,000 = 334,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC06_three_time_windows",
        "name": "Cắt qua 3 khung giờ liên tiếp",
        "start": datetime(2026, 10, 10, 16, 30, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 10, 20, 30, tzinfo=VIETNAM_TZ),
        "boundaries": [
            datetime(2026, 10, 10, 17, 0, tzinfo=VIETNAM_TZ),
            datetime(2026, 10, 10, 20, 0, tzinfo=VIETNAM_TZ),
        ],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 16, 30, tzinfo=VIETNAM_TZ), Decimal("0.0")),
            MeterSample(datetime(2026, 10, 10, 17, 0, tzinfo=VIETNAM_TZ), Decimal("10.0")),
            MeterSample(datetime(2026, 10, 10, 20, 0, tzinfo=VIETNAM_TZ), Decimal("70.0")),
            MeterSample(datetime(2026, 10, 10, 20, 30, tzinfo=VIETNAM_TZ), Decimal("80.0")),
        ],
        "rate_map": {
            (16, 17): (Decimal("3200"), Decimal("0"), Decimal("0")),
            (17, 20): (Decimal("4500"), Decimal("0"), Decimal("0")),
            (20, 20): (Decimal("3200"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("10.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("32000")},
            {"kwh": Decimal("60.0"), "unit_price": Decimal("4500"), "total_segment_amount": Decimal("270000")},
            {"kwh": Decimal("10.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("32000")},
        ],
        "expected_total": Decimal("334000"),
    },

    # --------------------------------------------------------------------------
    # Ca 7: Ca chứng minh làm tròn: "Làm tròn từng đoạn rồi cộng" lệch với "Tổng rồi làm tròn"
    # Thiết kế số liệu:
    # Đoạn 1: 3.333 kWh x 3,200 đ = 10,665.6 đ -> round đoạn = 10,666 đ
    # Đoạn 2: 3.333 kWh x 3,200 đ = 10,665.6 đ -> round đoạn = 10,666 đ
    # Tổng làm tròn từng đoạn: 10,666 + 10,666 = 21,332 đ.
    # Trong khi nếu tính trên tổng: (3.333 + 3.333) = 6.666 kWh x 3,200 = 21,331.2 đ -> round tổng = 21,331 đ.
    # Lệch đúng 1 đồng (21,332 vs 21,331)!
    # --------------------------------------------------------------------------
    {
        "id": "TC07_segment_rounding_demonstration",
        "name": "Chứng minh quy tắc làm tròn từng đoạn",
        "start": datetime(2026, 10, 10, 21, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 21, 0, tzinfo=VIETNAM_TZ), Decimal("0.0")),
            MeterSample(datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ), Decimal("3.333")),
            MeterSample(datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ), Decimal("6.666")),
        ],
        "rate_map": {
            (21, 22): (Decimal("3200"), Decimal("0"), Decimal("0")),
            (22, 23): (Decimal("3200"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("3.333"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("10666")},
            {"kwh": Decimal("3.333"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("10666")},
        ],
        "expected_total": Decimal("21332"),
    },

    # --------------------------------------------------------------------------
    # Ca 8: Qua nửa đêm 23:00 - 01:00, hai ngày CÙNG biểu giá (2,500 đ/kWh)
    # Đoạn 1 (23:00 - 00:00 ngày 10/10): 10.0 kWh x 2,500 = 25,000 đ
    # Đoạn 2 (00:00 - 01:00 ngày 11/10): 10.0 kWh x 2,500 = 25,000 đ
    # Tổng = 50,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC08_midnight_same_tariff",
        "name": "Qua nửa đêm 2 ngày cùng biểu giá",
        "start": datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 11, 1, 0, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ), Decimal("10.0")),
            MeterSample(datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ), Decimal("20.0")),
            MeterSample(datetime(2026, 10, 11, 1, 0, tzinfo=VIETNAM_TZ), Decimal("30.0")),
        ],
        "rate_map": {
            (23, 0): (Decimal("2500"), Decimal("0"), Decimal("0")),
            (0, 1): (Decimal("2500"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("10.0"), "unit_price": Decimal("2500"), "total_segment_amount": Decimal("25000")},
            {"kwh": Decimal("10.0"), "unit_price": Decimal("2500"), "total_segment_amount": Decimal("25000")},
        ],
        "expected_total": Decimal("50000"),
    },

    # --------------------------------------------------------------------------
    # Ca 9: Qua nửa đêm 23:00 - 01:00, hai ngày KHÁC biểu giá (Đổi biểu giá từ 0h)
    # Ngày 10/10: Thấp điểm = 2,500 đ/kWh. 10.0 kWh -> 25,000 đ
    # Ngày 11/10: Biểu giá mới có hiệu lực, thấp điểm = 2,800 đ/kWh. 10.0 kWh -> 28,000 đ
    # Tính tay: 25,000 + 28,000 = 53,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC09_midnight_different_tariff",
        "name": "Qua nửa đêm 2 ngày khác biểu giá",
        "start": datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 11, 1, 0, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ), Decimal("100.0")),
            MeterSample(datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ), Decimal("110.0")),
            MeterSample(datetime(2026, 10, 11, 1, 0, tzinfo=VIETNAM_TZ), Decimal("120.0")),
        ],
        "rate_map": {
            (23, 0): (Decimal("2500"), Decimal("0"), Decimal("0")),
            (0, 1): (Decimal("2800"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("10.0"), "unit_price": Decimal("2500"), "total_segment_amount": Decimal("25000")},
            {"kwh": Decimal("10.0"), "unit_price": Decimal("2800"), "total_segment_amount": Decimal("28000")},
        ],
        "expected_total": Decimal("53000"),
    },

    # --------------------------------------------------------------------------
    # Ca 10: Mốc đúng 00:00 (22:00 - 00:00) kết thúc đúng nửa đêm
    # Không tạo đoạn thừa cho ngày hôm sau.
    # Đoạn 1 (22:00 - 00:00): 2,500 đ/kWh, 25.0 kWh -> 62,500 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC10_end_at_midnight_boundary",
        "name": "Phiên kết thúc đúng 00:00",
        "start": datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ), Decimal("0.0")),
            MeterSample(datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ), Decimal("25.0")),
        ],
        "rate_map": {
            (22, 0): (Decimal("2500"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("25.0"), "unit_price": Decimal("2500"), "total_segment_amount": Decimal("62500")},
        ],
        "expected_total": Decimal("62500"),
    },

    # --------------------------------------------------------------------------
    # Ca 11: Phiên dài hơn 24 giờ (10:00 ngày 10/10 -> 12:00 ngày 11/10 = 26 tiếng)
    # Cắt tại 00:00 ngày 11/10:
    # Nhóm ngày 10/10 (10:00 - 00:00): 100.0 kWh x 3,200 đ = 320,000 đ
    # Nhóm ngày 11/10 (00:00 - 12:00): 80.0 kWh x 3,200 đ = 256,000 đ
    # Tổng = 576,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC11_session_longer_than_24h",
        "name": "Phiên kéo dài hơn 24h nhóm theo ngày",
        "start": datetime(2026, 10, 10, 10, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 11, 12, 0, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 10, 0, tzinfo=VIETNAM_TZ), Decimal("0.0")),
            MeterSample(datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ), Decimal("100.0")),
            MeterSample(datetime(2026, 10, 11, 12, 0, tzinfo=VIETNAM_TZ), Decimal("180.0")),
        ],
        "rate_map": {
            (10, 0): (Decimal("3200"), Decimal("0"), Decimal("0")),
            (0, 12): (Decimal("3200"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("100.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("320000")},
            {"kwh": Decimal("80.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("256000")},
        ],
        "expected_total": Decimal("576000"),
    },

    # --------------------------------------------------------------------------
    # Ca 12: Số đo thưa (chỉ có đầu và cuối phiên 18:00 -> 23:00 = 5 tiếng, 50.0 kWh)
    # Qua 2 ranh giới: 20:00 (hết cao điểm) và 22:00 (vào thấp điểm).
    # Công suất không đổi = 10 kWh/tiếng.
    # Đoạn 1 (18:00 - 20:00, 2 tiếng): Cao điểm 4,500 đ/kWh, 20.0 kWh -> 90,000 đ
    # Đoạn 2 (20:00 - 22:00, 2 tiếng): Bình thường 3,200 đ/kWh, 20.0 kWh -> 64,000 đ
    # Đoạn 3 (22:00 - 23:00, 1 tiếng): Thấp điểm 2,500 đ/kWh, 10.0 kWh -> 25,000 đ
    # Tổng = 90,000 + 64,000 + 25,000 = 179,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC12_sparse_meter_values_multi_boundaries",
        "name": "Số đo thưa qua nhiều ranh giới",
        "start": datetime(2026, 10, 10, 18, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ),
        "boundaries": [
            datetime(2026, 10, 10, 20, 0, tzinfo=VIETNAM_TZ),
            datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ),
        ],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 18, 0, tzinfo=VIETNAM_TZ), Decimal("0.0")),
            MeterSample(datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ), Decimal("50.0")),
        ],
        "rate_map": {
            (18, 20): (Decimal("4500"), Decimal("0"), Decimal("0")),
            (20, 22): (Decimal("3200"), Decimal("0"), Decimal("0")),
            (22, 23): (Decimal("2500"), Decimal("0"), Decimal("0")),
        },
        "expected_segments": [
            {"kwh": Decimal("20.0"), "unit_price": Decimal("4500"), "total_segment_amount": Decimal("90000")},
            {"kwh": Decimal("20.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("64000")},
            {"kwh": Decimal("10.0"), "unit_price": Decimal("2500"), "total_segment_amount": Decimal("25000")},
        ],
        "expected_total": Decimal("179000"),
    },

    # --------------------------------------------------------------------------
    # Ca 13: Có phí chiếm trụ (Idle fee) tính theo thời gian chiếm trụ
    # Phiên sạc 14:00 - 15:30 (1.5h): sạc 20.0 kWh x 3,200 đ = 64,000 đ
    # Chiếm trụ sau khi đầy pin: 0.5 giờ (30 phút), đơn giá phạt 10,000 đ/giờ -> 5,000 đ
    # Tổng tiền: 64,000 + 5,000 = 69,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC13_with_idle_fee_single_segment",
        "name": "Có phí chiếm trụ trong phiên",
        "start": datetime(2026, 10, 10, 14, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 10, 15, 30, tzinfo=VIETNAM_TZ),
        "boundaries": [],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 14, 0, tzinfo=VIETNAM_TZ), Decimal("0.0")),
            MeterSample(datetime(2026, 10, 10, 15, 30, tzinfo=VIETNAM_TZ), Decimal("20.0")),
        ],
        "rate_map": {
            (14, 15): (Decimal("3200"), Decimal("10000"), Decimal("0.5")),
        },
        "expected_segments": [
            {"kwh": Decimal("20.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("69000")},
        ],
        "expected_total": Decimal("69000"),
    },

    # --------------------------------------------------------------------------
    # Ca 14: Phí chiếm trụ kéo qua ranh giới nửa đêm (23:00 - 01:00)
    # Đoạn 1 (23:00 - 00:00): sạc 10 kWh x 2,500 = 25,000 đ. Chiếm trụ 0.5h x 10,000 = 5,000 đ -> 30,000 đ
    # Đoạn 2 (00:00 - 01:00): sạc 10 kWh x 2,500 = 25,000 đ. Chiếm trụ 1.0h x 10,000 = 10,000 đ -> 35,000 đ
    # Tổng = 30,000 + 35,000 = 65,000 đ.
    # --------------------------------------------------------------------------
    {
        "id": "TC14_idle_fee_across_midnight",
        "name": "Phí chiếm trụ vắt qua nửa đêm",
        "start": datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ),
        "end": datetime(2026, 10, 11, 1, 0, tzinfo=VIETNAM_TZ),
        "boundaries": [datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ)],
        "samples": [
            MeterSample(datetime(2026, 10, 10, 23, 0, tzinfo=VIETNAM_TZ), Decimal("0.0")),
            MeterSample(datetime(2026, 10, 11, 0, 0, tzinfo=VIETNAM_TZ), Decimal("10.0")),
            MeterSample(datetime(2026, 10, 11, 1, 0, tzinfo=VIETNAM_TZ), Decimal("20.0")),
        ],
        "rate_map": {
            (23, 0): (Decimal("2500"), Decimal("10000"), Decimal("0.5")),
            (0, 1): (Decimal("2500"), Decimal("10000"), Decimal("1.0")),
        },
        "expected_segments": [
            {"kwh": Decimal("10.0"), "unit_price": Decimal("2500"), "total_segment_amount": Decimal("30000")},
            {"kwh": Decimal("10.0"), "unit_price": Decimal("2500"), "total_segment_amount": Decimal("35000")},
        ],
        "expected_total": Decimal("65000"),
    },
]


# ==============================================================================
# 5. Thực thi Kiểm thử tham số hoá (Parametrized Tests)
# ==============================================================================

@pytest.mark.parametrize(
    "case",
    TEST_CASES_S32,
    ids=[c["id"] for c in TEST_CASES_S32],
)
def test_pricing_calculation_cases_exact_hand_calculated(case):
    """Xác minh 14 ca kiểm thử khớp chính xác đáp án tính tay từng đồng (SCRUM-218)."""
    rate_map = case["rate_map"]

    def get_rate(seg_start: datetime, seg_end: datetime):
        key = (seg_start.hour, seg_end.hour)
        return rate_map.get(key, (Decimal("3200"), Decimal("0"), Decimal("0")))

    breakdown = calculate_session_breakdown(
        session_start=case["start"],
        session_end=case["end"],
        boundary_times=case["boundaries"],
        meter_samples=case["samples"],
        get_rate_func=get_rate,
    )

    assert_session_breakdown_matches(
        case_name=case["name"],
        actual=breakdown,
        expected_segments=case["expected_segments"],
        expected_total_amount=case["expected_total"],
    )


def test_standardized_error_format_on_mismatch():
    """Kiểm tra format chuẩn hoá thông báo lỗi khi có sự sai lệch (SCRUM-219)."""
    dummy_breakdown = SessionBreakdown(
        segments=[
            SegmentResult(
                start_time=datetime(2026, 10, 10, 21, 30, tzinfo=VIETNAM_TZ),
                end_time=datetime(2026, 10, 10, 22, 0, tzinfo=VIETNAM_TZ),
                kwh=Decimal("10.0"),
                unit_price=Decimal("3200"),
                energy_amount=Decimal("32000"),
                total_segment_amount=Decimal("32000"),
            )
        ],
        total_kwh=Decimal("10.0"),
        total_energy_amount=Decimal("32000"),
        total_idle_amount=Decimal("0"),
        total_amount=Decimal("32000"),
    )

    expected_with_mismatch = [
        {"kwh": Decimal("10.0"), "unit_price": Decimal("3200"), "total_segment_amount": Decimal("35000")}
    ]

    with pytest.raises(AssertionError) as exc_info:
        assert_session_breakdown_matches(
            case_name="Ca Thử Nghiệm Báo Lỗi",
            actual=dummy_breakdown,
            expected_segments=expected_with_mismatch,
            expected_total_amount=Decimal("35000"),
        )

    err_msg = str(exc_info.value)
    # Khớp đúng định dạng: 'Ca <tên ca> | đoạn <n> (<từ> -> <đến>): kỳ vọng X đ, thực tế Y đ, chênh Z đ'
    assert "Ca Thử Nghiệm Báo Lỗi | đoạn 1 (21:30 -> 22:00): kỳ vọng 35000 đ, thực tế 32000 đ, chênh -3000 đ" in err_msg
