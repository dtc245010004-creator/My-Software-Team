from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from app.core.datetime_utils import VIETNAM_TZ
from app.core.security import create_access_token, get_password_hash
from app.models.meter_value import MeterValue
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.services.pricing_engine import (
    calculate_session_pricing,
    interpolate_kwh_linear,
)


@pytest.fixture
def standard_tariff():
    """Biểu giá TOU chuẩn EV CSMS."""
    return Tariff(
        id=1,
        name="Biểu giá TOU Chuẩn",
        price_normal=Decimal("3200.00"),
        price_peak=Decimal("4500.00"),
        price_offpeak=Decimal("2500.00"),
        peak_start="09:30",
        peak_end="11:30",
        peak_start_2="17:00",
        peak_end_2="20:00",
        offpeak_start="22:00",
        offpeak_end="04:00",
        is_active=True,
    )


# ==============================================================================
# 1. STORY S-30: CHIA ĐOẠN KHUNG GIỜ VÀ NỘI SUY TUYẾN TÍNH
# ==============================================================================


def test_s30_ac12_single_time_slot(standard_tariff):
    """
    AC 1.2: Phiên nằm trọn trong một khung giá:
    - Kết quả chỉ có đúng 1 đoạn.
    - Tổng tiền = Số kWh * Đơn giá.
    - co_noi_suy = False.
    """
    # Khung giờ bình thường: 14:00 -> 15:30 (nằm trong khoảng 11:30 - 17:00 NORMAL 3200 VND)
    start_dt = datetime(2026, 10, 8, 14, 0, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 8, 15, 30, 0, tzinfo=VIETNAM_TZ)

    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("10.000"),
        meter_stop_kwh=Decimal("25.000"),
        tariff_schedule=standard_tariff,
    )

    assert res["tong_kwh"] == "15.000"
    # 15 kWh * 3200 VND = 48000 VND
    assert res["tong_tien"] == 48000
    assert res["quy_tac_lam_tron"] == "Làm tròn từng đoạn rồi cộng"
    assert len(res["nhom_theo_ngay"]) == 1

    day_group = res["nhom_theo_ngay"][0]
    assert day_group["ngay"] == "2026-10-08"
    assert day_group["tong_kwh_ngay"] == "15.000"
    assert day_group["tong_tien_ngay"] == 48000
    assert len(day_group["cac_doan"]) == 1

    seg = day_group["cac_doan"][0]
    assert seg["tu_gio"] == start_dt.isoformat()
    assert seg["den_gio"] == stop_dt.isoformat()
    assert seg["so_kwh"] == "15.000"
    assert seg["don_gia"] == 3200
    assert seg["thanh_tien"] == 48000
    assert seg["co_noi_suy"] is False


def test_s30_ac11_segmentation_with_linear_interpolation(standard_tariff):
    """
    AC 1.1: Phiên sạc từ 21:30 đến 23:30, khung giá đổi lúc 22:00:
    - Chia làm 2 đoạn: [21:30 - 22:00] (NORMAL: 3200) và [22:00 - 23:30] (OFFPEAK: 2500).
    - Không có số đo lúc 22:00 -> Nội suy tuyến tính:
      Tổng thời gian = 120 phút. Đoạn 1 = 30 phút (25%), Đoạn 2 = 90 phút (75%).
      Tổng kWh = 20 kWh (từ 0.000 đến 20.000).
      kWh tại 22:00 = 0 + 20 * (30 / 120) = 5.000 kWh.
    - co_noi_suy = True.
    """
    start_dt = datetime(2026, 10, 8, 21, 30, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 8, 23, 30, 0, tzinfo=VIETNAM_TZ)

    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("0.000"),
        meter_stop_kwh=Decimal("20.000"),
        tariff_schedule=standard_tariff,
    )

    assert res["tong_kwh"] == "20.000"
    assert len(res["nhom_theo_ngay"]) == 1

    segs = res["nhom_theo_ngay"][0]["cac_doan"]
    assert len(segs) == 2

    # Đoạn 1: 21:30 - 22:00 (Normal 3200)
    seg1 = segs[0]
    assert seg1["tu_gio"] == "2026-10-08T21:30:00+07:00"
    assert seg1["den_gio"] == "2026-10-08T22:00:00+07:00"
    assert seg1["so_kwh"] == "5.000"
    assert seg1["don_gia"] == 3200
    assert seg1["thanh_tien"] == 16000  # 5 * 3200
    assert seg1["co_noi_suy"] is True

    # Đoạn 2: 22:00 - 23:30 (Offpeak 2500)
    seg2 = segs[1]
    assert seg2["tu_gio"] == "2026-10-08T22:00:00+07:00"
    assert seg2["den_gio"] == "2026-10-08T23:30:00+07:00"
    assert seg2["so_kwh"] == "15.000"
    assert seg2["don_gia"] == 2500
    assert seg2["thanh_tien"] == 37500  # 15 * 2500
    assert seg2["co_noi_suy"] is True

    # Tổng tiền = 16000 + 37500 = 53500
    assert res["tong_tien"] == 53500


def test_s30_ac11_segmentation_with_exact_boundary_reading(standard_tariff):
    """
    AC 1.1: Phiên sạc cắt qua ranh giới 22:00 nhưng CÓ số đo thực tế đúng mốc 22:00:
    - Không cần nội suy (lấy trực tiếp số đo thực tế tại 22:00).
    - co_noi_suy = False.
    """
    start_dt = datetime(2026, 10, 8, 21, 30, 0, tzinfo=VIETNAM_TZ)
    boundary_dt = datetime(2026, 10, 8, 22, 0, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 8, 23, 30, 0, tzinfo=VIETNAM_TZ)

    # Giả sử đồng hồ thực tế ghi nhận lúc 22:00 xe đã nạp được 6.5 kWh (thay vì 5.0 kWh nếu nội suy đều)
    readings = [(boundary_dt, Decimal("6.500"))]

    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("0.000"),
        meter_stop_kwh=Decimal("20.000"),
        tariff_schedule=standard_tariff,
        meter_readings=readings,
    )

    segs = res["nhom_theo_ngay"][0]["cac_doan"]
    assert len(segs) == 2

    seg1 = segs[0]
    assert seg1["so_kwh"] == "6.500"
    assert seg1["don_gia"] == 3200
    assert seg1["thanh_tien"] == 20800  # 6.5 * 3200
    assert seg1["co_noi_suy"] is False

    seg2 = segs[1]
    assert seg2["so_kwh"] == "13.500"  # 20.0 - 6.5
    assert seg2["don_gia"] == 2500
    assert seg2["thanh_tien"] == 33750  # 13.5 * 2500
    assert seg2["co_noi_suy"] is False

    assert res["tong_tien"] == 20800 + 33750


def test_s30_ac13_rounding_per_segment_rule():
    """
    AC 1.3: Quy tắc làm tròn từng đoạn rồi cộng lại (Round each segment, then sum).
    Trường hợp tổng các đoạn sau làm tròn lệch với tổng tính gộp trên cả phiên.
    """
    # Tạo biểu giá 2 đoạn:
    # 00:00 - 12:00: 3333 VND/kWh
    # 12:00 - 24:00: 3333 VND/kWh
    custom_slots = [
        ("00:00", "12:00", Decimal("3500")),
        ("12:00", "24:00", Decimal("3500")),
    ]

    start_dt = datetime(2026, 10, 8, 10, 0, 0, tzinfo=VIETNAM_TZ)
    boundary_dt = datetime(2026, 10, 8, 12, 0, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 8, 14, 0, 0, tzinfo=VIETNAM_TZ)

    # Đoạn 1: 0.150 kWh * 3333 = 499.95 VND -> làm tròn = 500 VND
    # Đoạn 2: 0.150 kWh * 3333 = 499.95 VND -> làm tròn = 500 VND
    # Tổng từng đoạn: 500 + 500 = 1000 VND
    # Nếu tính gộp: (0.150 + 0.150) * 3333 = 0.300 * 3333 = 999.90 VND -> làm tròn = 1000 VND
    # Để tạo độ lệch 1 đồng rõ rệt:
    # Đoạn 1: 0.135 kWh * 3333 = 449.955 VND -> 450 VND
    # Đoạn 2: 0.135 kWh * 3333 = 449.955 VND -> 450 VND
    # Tổng đoạn = 450 + 450 = 900 VND
    # Tính gộp: 0.270 * 3333 = 899.91 VND -> 900 VND.
    # Hãy thử:
    # Đoạn 1: 1.0004 kWh * 3500 = 3501.4 VND -> 3501
    # Đoạn 2: 1.0004 kWh * 3500 = 3501.4 VND -> 3501
    # Tổng từng đoạn = 3501 + 3501 = 7002 VND
    # Nếu tính gộp: 2.0008 kWh * 3500 = 7002.8 VND -> 7003 VND (LỆCH 1 ĐỒNG!)
    readings = [
        (start_dt, Decimal("0.0000")),
        (boundary_dt, Decimal("1.0004")),
        (stop_dt, Decimal("2.0008")),
    ]

    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("0.0000"),
        meter_stop_kwh=Decimal("2.0008"),
        tariff_schedule=custom_slots,
        meter_readings=readings,
    )

    segs = res["nhom_theo_ngay"][0]["cac_doan"]
    assert segs[0]["thanh_tien"] == 3501
    assert segs[1]["thanh_tien"] == 3501
    assert res["tong_tien"] == 7002  # Khớp với 3501 + 3501, KHÔNG phải 7003
    assert res["quy_tac_lam_tron"] == "Làm tròn từng đoạn rồi cộng"


# ==============================================================================
# 2. STORY S-31: PHIÊN QUA NỬA ĐÊM VÀ PHIÊN KÉO DÀI HƠN 24 GIỜ
# ==============================================================================


def test_s31_ac21_session_crossing_midnight_different_daily_tariffs():
    """
    AC 2.1: Phiên từ 23:00 tới 01:00 (cắt qua mốc 00:00:00 theo múi giờ trạm):
    - Phần trước 0h tính theo biểu giá ngày hôm trước.
    - Phần sau 0h tính theo biểu giá ngày hôm sau.
    - Hoạt động chính xác kể cả khi biểu giá giữa hai ngày khác nhau.
    """
    start_dt = datetime(2026, 10, 8, 23, 0, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 9, 1, 30, 0, tzinfo=VIETNAM_TZ)

    # Ngày 1: Đơn giá đêm là 3500 VND/kWh
    # Ngày 2: Đơn giá đêm tăng lên 3570 VND/kWh
    daily_tariffs = {
        date(2026, 10, 8): [("00:00", "24:00", Decimal("3500"))],
        date(2026, 10, 9): [("00:00", "24:00", Decimal("3570"))],
    }

    # Tổng thời gian: 2.5 giờ (150 phút).
    # 23:00 -> 00:00: 60 phút (40%). 00:00 -> 01:30: 90 phút (60%).
    # Nếu dùng số đo có sẵn tại 00:00:
    boundary_midnight = datetime(2026, 10, 9, 0, 0, 0, tzinfo=VIETNAM_TZ)
    readings = [(boundary_midnight, Decimal("12.000"))]

    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("0.000"),
        meter_stop_kwh=Decimal("32.450"),
        tariff_schedule=daily_tariffs,
        meter_readings=readings,
    )

    assert res["tong_kwh"] == "32.450"
    assert len(res["nhom_theo_ngay"]) == 2

    # Nhóm ngày 1 (2026-10-08)
    day1 = res["nhom_theo_ngay"][0]
    assert day1["ngay"] == "2026-10-08"
    assert day1["tong_kwh_ngay"] == "12.000"
    assert day1["tong_tien_ngay"] == 42000  # 12.000 * 3500 = 42000
    assert len(day1["cac_doan"]) == 1
    assert day1["cac_doan"][0]["don_gia"] == 3500
    assert day1["cac_doan"][0]["thanh_tien"] == 42000
    assert day1["cac_doan"][0]["co_noi_suy"] is False

    # Nhóm ngày 2 (2026-10-09)
    day2 = res["nhom_theo_ngay"][1]
    assert day2["ngay"] == "2026-10-09"
    assert day2["tong_kwh_ngay"] == "20.450"  # 32.450 - 12.000
    assert day2["tong_tien_ngay"] == 73007  # 20.450 * 3570 = 73006.5 -> 73007
    assert len(day2["cac_doan"]) == 1
    assert day2["cac_doan"][0]["don_gia"] == 3570
    assert day2["cac_doan"][0]["thanh_tien"] == 73007
    assert day2["cac_doan"][0]["co_noi_suy"] is False

    assert res["tong_tien"] == 42000 + 73007


def test_s31_ac21_midnight_interpolation_without_midnight_reading():
    """
    AC 2.1: Phiên qua nửa đêm không có số đo tại 00:00:00 -> phải nội suy tại ranh giới 00:00:00.
    """
    start_dt = datetime(2026, 10, 8, 23, 0, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 9, 1, 0, 0, tzinfo=VIETNAM_TZ)

    # Biểu giá phẳng 3000 VND
    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("0.000"),
        meter_stop_kwh=Decimal("20.000"),
        tariff_schedule=Decimal("3000"),
    )

    # Tổng 2 tiếng: 1 tiếng ngày 8 (10 kWh), 1 tiếng ngày 9 (10 kWh)
    assert res["tong_kwh"] == "20.000"
    assert len(res["nhom_theo_ngay"]) == 2

    day1_seg = res["nhom_theo_ngay"][0]["cac_doan"][0]
    assert day1_seg["so_kwh"] == "10.000"
    assert day1_seg["thanh_tien"] == 30000
    assert day1_seg["co_noi_suy"] is True  # Mốc 00:00 được nội suy

    day2_seg = res["nhom_theo_ngay"][1]["cac_doan"][0]
    assert day2_seg["so_kwh"] == "10.000"
    assert day2_seg["thanh_tien"] == 30000
    assert day2_seg["co_noi_suy"] is True  # Mốc 00:00 được nội suy


def test_s31_ac22_session_longer_than_24_hours():
    """
    AC 2.2: Phiên kéo dài hơn 24 giờ (ví dụ 36 giờ):
    - Mỗi ngày phải là một nhóm đoạn riêng.
    - Dữ liệu hóa đơn trả về gom nhóm theo từng ngày.
    """
    start_dt = datetime(2026, 10, 7, 12, 0, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 9, 0, 0, 0, tzinfo=VIETNAM_TZ)  # 36 giờ (12h ngày 7, 24h ngày 8)

    # Biểu giá 3000 VND
    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("100.000"),
        meter_stop_kwh=Decimal("136.000"),  # 36 kWh, đều 1 kWh/h
        tariff_schedule=Decimal("3000"),
    )

    assert res["tong_kwh"] == "36.000"
    assert res["tong_tien"] == 36 * 3000
    assert len(res["nhom_theo_ngay"]) == 2

    day7 = res["nhom_theo_ngay"][0]
    assert day7["ngay"] == "2026-10-07"
    assert day7["tong_kwh_ngay"] == "12.000"  # 12:00 -> 00:00
    assert day7["tong_tien_ngay"] == 36000

    day8 = res["nhom_theo_ngay"][1]
    assert day8["ngay"] == "2026-10-08"
    assert day8["tong_kwh_ngay"] == "24.000"  # 00:00 -> 00:00 ngày 9
    assert day8["tong_tien_ngay"] == 72000


def test_station_timezone_not_utc(standard_tariff):
    """
    NFR S-31: Mọi phép chia theo ngày và ranh giới nửa đêm PHẢI DÙNG MÚI GIỜ CỦA TRẠM.
    Nếu dùng UTC, mốc nửa đêm sẽ bị lệch 7 tiếng.
    """
    # 23:30 giờ VN = 16:30 giờ UTC.
    # 00:30 giờ VN ngày hôm sau = 17:30 giờ UTC ngày hôm trước.
    # Nếu tính theo UTC, cả phiên nằm trọn trong ngày hôm trước!
    # Nhưng theo múi giờ trạm (Asia/Ho_Chi_Minh), phiên phải bị chia làm 2 ngày!
    dt_vn_start = datetime(2026, 10, 8, 23, 30, 0, tzinfo=VIETNAM_TZ)
    dt_vn_stop = datetime(2026, 10, 9, 0, 30, 0, tzinfo=VIETNAM_TZ)

    # Truyền datetime dạng UTC tương đương
    dt_utc_start = dt_vn_start.astimezone(timezone.utc)
    dt_utc_stop = dt_vn_stop.astimezone(timezone.utc)

    res = calculate_session_pricing(
        start_time=dt_utc_start,
        stop_time=dt_utc_stop,
        meter_start_kwh=Decimal("0.000"),
        meter_stop_kwh=Decimal("10.000"),
        tariff_schedule=standard_tariff,
        station_tz=VIETNAM_TZ,
    )

    # Bắt buộc phải có 2 ngày: 2026-10-08 và 2026-10-09
    assert len(res["nhom_theo_ngay"]) == 2
    assert res["nhom_theo_ngay"][0]["ngay"] == "2026-10-08"
    assert res["nhom_theo_ngay"][1]["ngay"] == "2026-10-09"


def test_zero_kwh_and_zero_duration(standard_tariff):
    """Kiểm tra trường hợp biên: thời gian sạc 0 giây hoặc điện năng tiêu thụ bằng 0."""
    start_dt = datetime(2026, 10, 8, 10, 0, 0, tzinfo=VIETNAM_TZ)

    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=start_dt,
        meter_start_kwh=Decimal("50.000"),
        meter_stop_kwh=Decimal("50.000"),
        tariff_schedule=standard_tariff,
    )

    assert res["tong_kwh"] == "0.000"
    assert res["tong_tien"] == 0
    assert len(res["nhom_theo_ngay"]) == 1
    assert res["nhom_theo_ngay"][0]["tong_kwh_ngay"] == "0.000"
    assert res["nhom_theo_ngay"][0]["tong_tien_ngay"] == 0


def test_linear_interpolation_helper():
    """Kiểm tra hàm helper interpolate_kwh_linear độc lập."""
    t0 = datetime(2026, 10, 8, 10, 0, 0, tzinfo=VIETNAM_TZ)
    t1 = datetime(2026, 10, 8, 11, 0, 0, tzinfo=VIETNAM_TZ)
    points = [(t0, Decimal("10.000")), (t1, Decimal("20.000"))]

    # Mốc giữa 10:30
    t_mid = datetime(2026, 10, 8, 10, 30, 0, tzinfo=VIETNAM_TZ)
    kwh, interpolated = interpolate_kwh_linear(t_mid, points)
    assert kwh == Decimal("15.000")
    assert interpolated is True

    # Mốc trùng 10:00
    kwh_exact, interpolated_exact = interpolate_kwh_linear(t0, points)
    assert kwh_exact == Decimal("10.000")
    assert interpolated_exact is False


def test_multiple_time_slots_in_single_day(standard_tariff):
    """Phiên cắt qua nhiều khung giờ liên tiếp trong ngày: 09:00 -> 12:00 (3 đoạn: NORMAL -> PEAK -> NORMAL)."""
    start_dt = datetime(2026, 10, 8, 9, 0, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 8, 12, 0, 0, tzinfo=VIETNAM_TZ)

    # 3 tiếng = 180 phút, nạp 30.000 kWh (10 kWh/tiếng)
    # Đoạn 1: 09:00 -> 09:30 (30p = 5 kWh, NORMAL 3200) -> 16000
    # Đoạn 2: 09:30 -> 11:30 (120p = 20 kWh, PEAK 4500) -> 90000
    # Đoạn 3: 11:30 -> 12:00 (30p = 5 kWh, NORMAL 3200) -> 16000
    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("0.000"),
        meter_stop_kwh=Decimal("30.000"),
        tariff_schedule=standard_tariff,
    )

    assert res["tong_kwh"] == "30.000"
    assert res["tong_tien"] == 16000 + 90000 + 16000  # 122000
    segs = res["nhom_theo_ngay"][0]["cac_doan"]
    assert len(segs) == 3

    assert segs[0]["don_gia"] == 3200
    assert segs[0]["so_kwh"] == "5.000"
    assert segs[0]["thanh_tien"] == 16000

    assert segs[1]["don_gia"] == 4500
    assert segs[1]["so_kwh"] == "20.000"
    assert segs[1]["thanh_tien"] == 90000

    assert segs[2]["don_gia"] == 3200
    assert segs[2]["so_kwh"] == "5.000"
    assert segs[2]["thanh_tien"] == 16000


def test_dict_readings_and_dict_tariff():
    """Hỗ trợ cấu hình biểu giá và readings dạng dict."""
    tariff_dict = {
        "price_normal": 3200,
        "price_peak": 4500,
        "price_offpeak": 2500,
        "peak_start": "09:30",
        "peak_end": "11:30",
        "peak_start_2": "17:00",
        "peak_end_2": "20:00",
        "offpeak_start": "22:00",
        "offpeak_end": "04:00",
    }
    start_dt = datetime(2026, 10, 8, 21, 30, 0, tzinfo=VIETNAM_TZ)
    boundary_dt = datetime(2026, 10, 8, 22, 0, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 8, 23, 30, 0, tzinfo=VIETNAM_TZ)

    dict_readings = [
        {"timestamp": boundary_dt, "kwh": Decimal("8.000")}
    ]

    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=0,
        meter_stop_kwh=20,
        tariff_schedule=tariff_dict,
        meter_readings=dict_readings,
    )

    assert res["tong_kwh"] == "20.000"
    segs = res["nhom_theo_ngay"][0]["cac_doan"]
    assert len(segs) == 2
    assert segs[0]["so_kwh"] == "8.000"
    assert segs[0]["co_noi_suy"] is False
    assert segs[1]["so_kwh"] == "12.000"
    assert segs[1]["co_noi_suy"] is False


def test_pure_function_idempotency_nfr_s30(standard_tariff):
    """NFR S-30: Thuật toán là hàm thuần, gọi nhiều lần với cùng input cho ra kết quả đồng nhất."""
    start_dt = datetime(2026, 10, 8, 21, 30, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 9, 1, 30, 0, tzinfo=VIETNAM_TZ)

    res1 = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("10.000"),
        meter_stop_kwh=Decimal("40.000"),
        tariff_schedule=standard_tariff,
    )
    res2 = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("10.000"),
        meter_stop_kwh=Decimal("40.000"),
        tariff_schedule=standard_tariff,
    )

    assert res1 == res2


def test_output_contract_structure_compliance(standard_tariff):
    """Kiểm tra cấu trúc JSON hóa đơn đúng 100% hợp đồng dữ liệu đầu ra (S-30, S-31)."""
    start_dt = datetime(2026, 10, 8, 23, 0, 0, tzinfo=VIETNAM_TZ)
    stop_dt = datetime(2026, 10, 9, 1, 30, 0, tzinfo=VIETNAM_TZ)

    res = calculate_session_pricing(
        start_time=start_dt,
        stop_time=stop_dt,
        meter_start_kwh=Decimal("0.000"),
        meter_stop_kwh=Decimal("32.450"),
        tariff_schedule=standard_tariff,
        session_id="SESS-20261008-001",
    )

    # Root contract - English fields
    assert res["session_id"] == "SESS-20261008-001"
    assert res["timezone"] == "Asia/Ho_Chi_Minh"
    assert res["total_energy_kwh"] == "32.4500"
    assert isinstance(res["total_amount"], int)
    assert res["currency"] == "VND"
    assert res["rounding_rule"] == "ROUND_EACH_SEGMENT"
    assert "Tổng tiền được tính bằng cách làm tròn từng đoạn" in res["rounding_note"]
    assert isinstance(res["daily_groups"], list)

    # Root contract - Backward-compatible Vietnamese fields
    assert res["tong_kwh"] == "32.450"
    assert res["tong_tien"] == res["total_amount"]
    assert res["quy_tac_lam_tron"] == "Làm tròn từng đoạn rồi cộng"
    assert res["nhom_theo_ngay"] == res["daily_groups"]

    # Daily groups contract
    assert len(res["daily_groups"]) == 2
    for day_group in res["daily_groups"]:
        assert "date" in day_group and isinstance(day_group["date"], str)
        assert "daily_energy_kwh" in day_group and isinstance(day_group["daily_energy_kwh"], str)
        assert "daily_total_amount" in day_group and isinstance(day_group["daily_total_amount"], int)
        assert "segments" in day_group and isinstance(day_group["segments"], list)

        # Vietnamese synonyms in daily group
        assert day_group["ngay"] == day_group["date"]
        assert day_group["tong_tien_ngay"] == day_group["daily_total_amount"]
        assert day_group["tong_kwh_ngay"] == day_group["daily_energy_kwh"][:6]
        assert day_group["cac_doan"] == day_group["segments"]

        for seg in day_group["segments"]:
            assert "segment_index" in seg and isinstance(seg["segment_index"], int)
            assert "start_time" in seg and isinstance(seg["start_time"], str)
            assert "end_time" in seg and isinstance(seg["end_time"], str)
            assert "energy_kwh" in seg and isinstance(seg["energy_kwh"], str)
            assert "unit_price" in seg and isinstance(seg["unit_price"], (int, float))
            assert "raw_amount" in seg and isinstance(seg["raw_amount"], str)
            assert "rounded_amount" in seg and isinstance(seg["rounded_amount"], int)
            assert "is_interpolated" in seg and isinstance(seg["is_interpolated"], bool)

            # Vietnamese synonyms in segment
            assert seg["tu_gio"] == seg["start_time"]
            assert seg["den_gio"] == seg["end_time"]
            assert seg["so_kwh"] == seg["energy_kwh"][:6]
            assert seg["don_gia"] == seg["unit_price"]
            assert seg["thanh_tien"] == seg["rounded_amount"]
            assert seg["co_noi_suy"] == seg["is_interpolated"]


# ==============================================================================
# 4. KIỂM THỬ TÍCH HỢP ENDPOINT HÓA ĐƠN: GET /api/v1/sessions/{session_id}/invoice
# ==============================================================================


@pytest.fixture
def invoice_api_setup(db_session, standard_tariff):
    """Thiết lập CSDL để kiểm thử API hóa đơn chia đoạn."""
    db_session.add(standard_tariff)
    db_session.commit()

    admin = User(
        username="admin_invoice",
        email="admin_inv@test.com",
        password_hash=get_password_hash("Secret123"),
        role="ADMIN",
        is_active=True,
    )
    op = User(
        username="op_invoice",
        email="op_inv@test.com",
        password_hash=get_password_hash("Secret123"),
        role="OPERATOR",
        is_active=True,
    )
    op_other = User(
        username="op_other_invoice",
        email="op_other_inv@test.com",
        password_hash=get_password_hash("Secret123"),
        role="OPERATOR",
        is_active=True,
    )
    driver1 = User(
        username="driver_inv_1",
        email="driver1_inv@test.com",
        password_hash=get_password_hash("Secret123"),
        role="CUSTOMER",
        is_active=True,
    )
    driver2 = User(
        username="driver_inv_2",
        email="driver2_inv@test.com",
        password_hash=get_password_hash("Secret123"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([admin, op, op_other, driver1, driver2])
    db_session.commit()

    station = Station(
        operator_id=op.id,
        name="Trạm Thử Nghiệm Hóa Đơn S-30",
        address="123 Nguyễn Huệ, Q1, TP.HCM",
        latitude=10.7769,
        longitude=106.7009,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station)
    db_session.commit()

    cp = ChargingPoint(
        station_id=station.id,
        code="CP-INV-01",
        vendor="VinFast",
        model="VF-60",
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    conn = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        connector_type="CCS2",
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(conn)
    db_session.commit()

    # Session qua nửa đêm từ 23:00 ngày 2026-10-08 đến 01:30 ngày 2026-10-09 (theo giờ Việt Nam)
    start_dt = datetime(2026, 10, 8, 23, 0, 0, tzinfo=VIETNAM_TZ).astimezone(
        timezone.utc
    )
    end_dt = datetime(2026, 10, 9, 1, 30, 0, tzinfo=VIETNAM_TZ).astimezone(
        timezone.utc
    )

    session = ChargingSession(
        user_id=driver1.id,
        connector_id=conn.id,
        tariff_id=standard_tariff.id,
        applied_price_per_kwh=Decimal("2500.00"),
        start_time=start_dt,
        end_time=end_dt,
        meter_start_kwh=Decimal("0.000"),
        meter_stop_kwh=Decimal("32.450"),
        total_kwh=Decimal("32.450"),
        total_amount=Decimal("81125.00"),
        status="COMPLETED",
    )
    db_session.add(session)
    db_session.commit()

    h_admin = {
        "Authorization": f"Bearer {create_access_token({'sub': str(admin.id), 'role': admin.role})}"
    }
    h_op = {
        "Authorization": f"Bearer {create_access_token({'sub': str(op.id), 'role': op.role})}"
    }
    h_op_other = {
        "Authorization": f"Bearer {create_access_token({'sub': str(op_other.id), 'role': op_other.role})}"
    }
    h_driver1 = {
        "Authorization": f"Bearer {create_access_token({'sub': str(driver1.id), 'role': driver1.role})}"
    }
    h_driver2 = {
        "Authorization": f"Bearer {create_access_token({'sub': str(driver2.id), 'role': driver2.role})}"
    }

    return {
        "admin": admin,
        "op": op,
        "op_other": op_other,
        "driver1": driver1,
        "driver2": driver2,
        "station": station,
        "connector": conn,
        "session": session,
        "h_admin": h_admin,
        "h_op": h_op,
        "h_op_other": h_op_other,
        "h_driver1": h_driver1,
        "h_driver2": h_driver2,
    }


def test_api_get_session_invoice_success_admin(client, invoice_api_setup):
    """Admin tra cứu chi tiết hóa đơn: Thành công 200 và khớp đầy đủ contract."""
    sess_id = invoice_api_setup["session"].id
    headers = invoice_api_setup["h_admin"]

    resp = client.get(f"/api/v1/sessions/{sess_id}/invoice", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["session_id"] == f"SESS-{sess_id}"
    assert data["timezone"] == "Asia/Ho_Chi_Minh"
    assert data["currency"] == "VND"
    assert data["rounding_rule"] == "ROUND_EACH_SEGMENT"
    assert data["total_energy_kwh"] == "32.4500"
    assert data["total_amount"] > 0
    assert len(data["daily_groups"]) == 2
    assert data["daily_groups"][0]["date"] == "2026-10-08"
    assert data["daily_groups"][1]["date"] == "2026-10-09"


def test_api_get_session_invoice_success_customer_owner(client, invoice_api_setup):
    """Tài xế chủ phiên tra cứu hóa đơn của chính mình: Thành công 200."""
    sess_id = invoice_api_setup["session"].id
    headers = invoice_api_setup["h_driver1"]

    resp = client.get(f"/api/v1/sessions/{sess_id}/invoice", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["session_id"] == f"SESS-{sess_id}"


def test_api_get_session_invoice_idor_forbidden(client, invoice_api_setup):
    """Tài xế khác truy cập hóa đơn của tài xế 1 (IDOR Guard): Bị chặn 403 Forbidden."""
    sess_id = invoice_api_setup["session"].id
    headers = invoice_api_setup["h_driver2"]

    resp = client.get(f"/api/v1/sessions/{sess_id}/invoice", headers=headers)
    assert resp.status_code == 403
    assert "Bạn không có quyền xem thông tin hóa đơn" in resp.json()["detail"]


def test_api_get_session_invoice_operator_rbac(client, invoice_api_setup):
    """Chủ trạm sở hữu trạm sạc được xem (200), chủ trạm khác bị chặn (403)."""
    sess_id = invoice_api_setup["session"].id

    # Chủ trạm sở hữu trạm -> 200 OK
    resp_owner = client.get(
        f"/api/v1/sessions/{sess_id}/invoice", headers=invoice_api_setup["h_op"]
    )
    assert resp_owner.status_code == 200

    # Chủ trạm khác -> 403 Forbidden
    resp_other = client.get(
        f"/api/v1/sessions/{sess_id}/invoice", headers=invoice_api_setup["h_op_other"]
    )
    assert resp_other.status_code == 403


def test_api_get_session_invoice_not_found(client, invoice_api_setup):
    """Phiên sạc không tồn tại -> 404 Not Found."""
    headers = invoice_api_setup["h_admin"]
    resp = client.get("/api/v1/sessions/999999/invoice", headers=headers)
    assert resp.status_code == 404


def test_api_get_session_invoice_with_meter_values(
    client, db_session, invoice_api_setup
):
    """
    Phiên sạc có bản ghi MeterValue thực tế ở mốc nửa đêm (00:00:00).
    Kiểm tra hệ thống sử dụng số đo thực tế thay vì nội suy tuyến tính (is_interpolated = False).
    """
    session = invoice_api_setup["session"]

    # Thêm số đo MeterValue thực tế tại đúng 00:00:00 ngày 2026-10-09 (theo giờ Việt Nam)
    midnight_dt = datetime(2026, 10, 9, 0, 0, 0, tzinfo=VIETNAM_TZ).astimezone(
        timezone.utc
    )
    mv = MeterValue(
        session_id=session.id,
        measurand="Energy.Active.Import.Register",
        value=Decimal("12000.00"),  # 12,000 Wh = 12.000 kWh
        unit="Wh",
        recorded_at=midnight_dt,
    )
    db_session.add(mv)
    db_session.commit()

    resp = client.get(
        f"/api/v1/sessions/{session.id}/invoice", headers=invoice_api_setup["h_driver1"]
    )
    assert resp.status_code == 200

    data = resp.json()
    day1_group = data["daily_groups"][0]
    seg1 = day1_group["segments"][0]
    assert seg1["energy_kwh"] == "12.0000"
    assert seg1["is_interpolated"] is False


\n