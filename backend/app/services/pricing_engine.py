from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Sequence
from zoneinfo import ZoneInfo

from app.core.datetime_utils import VIETNAM_TZ


@dataclass(frozen=True)
class TariffSlot:
    """Định nghĩa một khung giờ biểu giá trong ngày."""

    start_time: time
    end_time: time
    rate: Decimal
    name: str = "NORMAL"


def parse_hhmm_time(t_val: str | time) -> time:
    """Chuyển chuỗi 'HH:MM' hoặc đối tượng time thành time."""
    if isinstance(t_val, time):
        return t_val
    parts = t_val.strip().split(":")
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    if h >= 24:
        return time(23, 59, 59, 999999)
    return time(hour=h, minute=m)


def to_station_timezone(dt: datetime, station_tz: ZoneInfo | timezone) -> datetime:
    """
    Chuyển đổi datetime sang múi giờ của trạm sạc.
    Nếu dt là naive, giả định mang múi giờ UTC theo quy ước hệ thống backend.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(station_tz)


def normalize_tariff_to_slots(tariff_spec: Any) -> list[TariffSlot]:
    """
    Chuẩn hóa biểu giá đầu vào (model Tariff, dict, hoặc list slots)
    thành danh sách các TariffSlot phủ kín 24 giờ trong ngày.
    """
    # 1. Trường hợp là số đơn lẻ (Flat rate)
    if isinstance(tariff_spec, (int, float, Decimal, str)):
        try:
            flat_rate = Decimal(str(tariff_spec))
            return [
                TariffSlot(
                    start_time=time(0, 0),
                    end_time=time(23, 59, 59, 999999),
                    rate=flat_rate,
                    name="FLAT",
                )
            ]
        except (ValueError, TypeError, InvalidOperation):
            pass

    # 2. Trường hợp là danh sách các slots: [(start, end, price, name?), ...]
    if isinstance(tariff_spec, (list, tuple)):
        slots: list[TariffSlot] = []
        for item in tariff_spec:
            if isinstance(item, TariffSlot):
                slots.append(item)
            elif isinstance(item, (list, tuple)) and len(item) >= 3:
                s_t = parse_hhmm_time(item[0])
                e_t = parse_hhmm_time(item[1])
                rate = Decimal(str(item[2]))
                name = str(item[3]) if len(item) > 3 else "CUSTOM"
                slots.append(TariffSlot(start_time=s_t, end_time=e_t, rate=rate, name=name))
            elif isinstance(item, dict):
                s_t = parse_hhmm_time(item["start"])
                e_t = parse_hhmm_time(item["end"])
                rate = Decimal(str(item["rate"]))
                name = item.get("name", "CUSTOM")
                slots.append(TariffSlot(start_time=s_t, end_time=e_t, rate=rate, name=name))
        if slots:
            slots.sort(key=lambda x: x.start_time)
            return slots

    # 3. Trường hợp là đối tượng SQLAlchemy Tariff hoặc dict TOU
    # Lấy các trường giá
    def get_attr_or_key(obj: Any, key: str, default: Any = None) -> Any:
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    price_normal = Decimal(str(get_attr_or_key(tariff_spec, "price_normal", "3200.00")))
    price_peak = Decimal(str(get_attr_or_key(tariff_spec, "price_peak", "4500.00")))
    price_offpeak = Decimal(str(get_attr_or_key(tariff_spec, "price_offpeak", "2500.00")))

    # S-29 user-defined tariff periods take precedence over the retained legacy
    # peak/off-peak columns. Split any period crossing midnight for lookup.
    periods = get_attr_or_key(tariff_spec, "periods")
    if periods:
        from app.services.tariff_validation import normalize_periods

        normalized_periods = normalize_periods(periods)
        return [
            TariffSlot(
                start_time=time(
                    period.start_minute // 60,
                    period.start_minute % 60,
                ),
                end_time=(
                    time(23, 59, 59, 999999)
                    if period.end_minute == 1440
                    else time(period.end_minute // 60, period.end_minute % 60)
                ),
                rate=period.price_per_kwh,
                name="CUSTOM",
            )
            for period in normalized_periods
        ]

    peak1_s = parse_hhmm_time(get_attr_or_key(tariff_spec, "peak_start", "09:30"))
    peak1_e = parse_hhmm_time(get_attr_or_key(tariff_spec, "peak_end", "11:30"))
    peak2_s = parse_hhmm_time(get_attr_or_key(tariff_spec, "peak_start_2", "17:00"))
    peak2_e = parse_hhmm_time(get_attr_or_key(tariff_spec, "peak_end_2", "20:00"))

    off_s = parse_hhmm_time(get_attr_or_key(tariff_spec, "offpeak_start", "22:00"))
    off_e = parse_hhmm_time(get_attr_or_key(tariff_spec, "offpeak_end", "04:00"))

    # Xây dựng các slot chuẩn EV CSMS TOU (24 giờ):
    # Khung giờ thấp điểm vắt qua nửa đêm: [22:00 -> 04:00]
    # Trong một ngày:
    # 00:00 -> off_e (04:00): OFFPEAK
    # off_e (04:00) -> peak1_s (09:30): NORMAL
    # peak1_s (09:30) -> peak1_e (11:30): PEAK
    # peak1_e (11:30) -> peak2_s (17:00): NORMAL
    # peak2_s (17:00) -> peak2_e (20:00): PEAK
    # peak2_e (20:00) -> off_s (22:00): NORMAL
    # off_s (22:00) -> 23:59:59.999999: OFFPEAK
    end_of_day = time(23, 59, 59, 999999)

    slots = [
        TariffSlot(start_time=time(0, 0), end_time=off_e, rate=price_offpeak, name="OFFPEAK"),
        TariffSlot(start_time=off_e, end_time=peak1_s, rate=price_normal, name="NORMAL"),
        TariffSlot(start_time=peak1_s, end_time=peak1_e, rate=price_peak, name="PEAK"),
        TariffSlot(start_time=peak1_e, end_time=peak2_s, rate=price_normal, name="NORMAL"),
        TariffSlot(start_time=peak2_s, end_time=peak2_e, rate=price_peak, name="PEAK"),
        TariffSlot(start_time=peak2_e, end_time=off_s, rate=price_normal, name="NORMAL"),
        TariffSlot(start_time=off_s, end_time=end_of_day, rate=price_offpeak, name="OFFPEAK"),
    ]
    slots.sort(key=lambda x: x.start_time)
    return slots


def resolve_tariff_for_date(tariff_schedule: Any, target_date: date) -> list[TariffSlot]:
    """
    Xác định danh sách TariffSlot cho một ngày cụ thể (hỗ trợ đa ngày, ngày lễ/cuối tuần).
    """
    if callable(tariff_schedule):
        spec = tariff_schedule(target_date)
        return normalize_tariff_to_slots(spec)

    if isinstance(tariff_schedule, dict) and any(isinstance(k, date) for k in tariff_schedule):
        # Dictionary map date -> tariff spec
        spec = tariff_schedule.get(target_date)
        if spec is None:
            # Fallback lấy spec đầu tiên hoặc 'default'
            spec = tariff_schedule.get("default", next(iter(tariff_schedule.values())))
        return normalize_tariff_to_slots(spec)

    return normalize_tariff_to_slots(tariff_schedule)


def get_tariff_rate_at_time(slots: list[TariffSlot], check_time: time) -> Decimal:
    """Tìm đơn giá tương ứng trong danh sách TariffSlot tại thời điểm check_time."""
    for slot in slots:
        if slot.start_time <= check_time <= slot.end_time:
            return slot.rate
    if slots:
        return slots[-1].rate
    return Decimal("0.00")


def interpolate_kwh_linear(
    target_time: datetime,
    meter_points: Sequence[tuple[datetime, Decimal]],
    tolerance_seconds: float = 0.5,
) -> tuple[Decimal, bool]:
    """
    Nội suy tuyến tính (Linear Interpolation) để ước lượng số kWh tại target_time:
    kWh_ranh_gioi = kWh_1 + (kWh_2 - kWh_1) * (t_ranh_gioi - t_1) / (t_2 - t_1)

    Trả về: (kwh_estimate, co_noi_suy)
    - co_noi_suy = False nếu tìm thấy số đo thực tế trùng mốc (trong dung sai).
    - co_noi_suy = True nếu phải ước lượng qua 2 mốc kề trước và sau.
    """
    if not meter_points:
        return Decimal("0.000"), False

    # 1. Tìm xem có số đo thực tế trùng mốc hay không
    for dt_pt, kwh_pt in meter_points:
        if abs((dt_pt - target_time).total_seconds()) <= tolerance_seconds:
            return kwh_pt, False

    # 2. Tìm điểm đo gần nhất trước target_time và sau target_time
    prev_pt: tuple[datetime, Decimal] | None = None
    next_pt: tuple[datetime, Decimal] | None = None

    for dt_pt, kwh_pt in meter_points:
        if dt_pt < target_time:
            if prev_pt is None or dt_pt > prev_pt[0]:
                prev_pt = (dt_pt, kwh_pt)
        elif dt_pt > target_time:
            if next_pt is None or dt_pt < next_pt[0]:
                next_pt = (dt_pt, kwh_pt)

    if prev_pt and next_pt:
        t1, kwh1 = prev_pt
        t2, kwh2 = next_pt
        delta_total = Decimal(str((t2 - t1).total_seconds()))
        delta_target = Decimal(str((target_time - t1).total_seconds()))

        if delta_total == 0:
            return kwh1, False

        ratio = delta_target / delta_total
        interpolated_kwh = kwh1 + (kwh2 - kwh1) * ratio
        return interpolated_kwh, True

    if prev_pt:
        return prev_pt[1], True
    if next_pt:
        return next_pt[1], True

    return meter_points[0][1], False


def calculate_session_pricing(
    start_time: datetime,
    stop_time: datetime,
    meter_start_kwh: Decimal | float | int,
    meter_stop_kwh: Decimal | float | int,
    tariff_schedule: Any,
    meter_readings: list[tuple[datetime, Decimal | float | int]] | list[dict[str, Any]] | None = None,
    station_tz: ZoneInfo | timezone = VIETNAM_TZ,
    session_id: str | int | None = None,
) -> dict[str, Any]:
    """
    HÀM THUẦN (PURE FUNCTION) tính tiền phiên sạc chia đoạn:
    - S-30: Chia đoạn theo khung giờ TOU, nội suy tuyến tính tại ranh giới nếu thiếu số đo.
    - S-31: Phiên qua nửa đêm tách theo ngày trạm (Asia/Ho_Chi_Minh), gom nhóm theo ngày.
    - AC 1.3: Quy tắc làm tròn từng đoạn rồi cộng dồn ("Làm tròn từng đoạn rồi cộng").

    Đầu ra tuân thủ cấu trúc hợp đồng hóa đơn (OUTPUT INVOICE CONTRACT):
    - Đầy đủ các trường tiếng Anh chuẩn và các trường tiếng Việt đồng nghĩa.
    """
    # 1. Chuyển đổi thời gian bắt đầu và kết thúc sang múi giờ trạm
    t_start = to_station_timezone(start_time, station_tz)
    t_stop = to_station_timezone(stop_time, station_tz)

    if t_stop < t_start:
        raise ValueError("stop_time không thể nhỏ hơn start_time")

    m_start_kwh = Decimal(str(meter_start_kwh))
    m_stop_kwh = Decimal(str(meter_stop_kwh))

    # Xác định tên timezone và mã session_id chuẩn
    if isinstance(station_tz, ZoneInfo):
        tz_name = station_tz.key
    elif hasattr(station_tz, "tzname"):
        tz_name = station_tz.tzname(None) or "Asia/Ho_Chi_Minh"
    else:
        tz_name = str(station_tz)
    if tz_name.startswith("UTC+") or tz_name == "+07:00":
        tz_name = "Asia/Ho_Chi_Minh"

    if session_id is None:
        session_id_str = f"SESS-{t_start.strftime('%Y%m%d')}-001"
    elif isinstance(session_id, int):
        session_id_str = f"SESS-{session_id}"
    else:
        session_id_str = str(session_id)

    # Trường hợp phiên có thời lượng bằng 0 hoặc số kWh tiêu thụ bằng 0
    if t_start == t_stop:
        cur_date_str = t_start.strftime("%Y-%m-%d")
        daily_slots = resolve_tariff_for_date(tariff_schedule, t_start.date())
        rate = get_tariff_rate_at_time(daily_slots, t_start.time())
        don_gia_val = int(rate) if rate % 1 == 0 else float(rate)
        iso_t = t_start.isoformat()

        empty_segment = {
            "segment_index": 1,
            "start_time": iso_t,
            "end_time": iso_t,
            "energy_kwh": "0.0000",
            "unit_price": don_gia_val,
            "raw_amount": "0.00",
            "rounded_amount": 0,
            "is_interpolated": False,
            "tu_gio": iso_t,
            "den_gio": iso_t,
            "so_kwh": "0.000",
            "don_gia": don_gia_val,
            "thanh_tien": 0,
            "co_noi_suy": False,
        }

        empty_group = {
            "date": cur_date_str,
            "daily_energy_kwh": "0.0000",
            "daily_total_amount": 0,
            "segments": [empty_segment],
            "ngay": cur_date_str,
            "tong_tien_ngay": 0,
            "tong_kwh_ngay": "0.000",
            "cac_doan": [empty_segment],
        }

        return {
            "session_id": session_id_str,
            "timezone": tz_name,
            "total_energy_kwh": "0.0000",
            "total_amount": 0,
            "currency": "VND",
            "rounding_rule": "ROUND_EACH_SEGMENT",
            "rounding_note": "Tổng tiền được tính bằng cách làm tròn từng đoạn trước khi cộng, để người dùng và kế toán có thể đối chiếu.",
            "daily_groups": [empty_group],
            "tong_kwh": "0.000",
            "tong_tien": 0,
            "quy_tac_lam_tron": "Làm tròn từng đoạn rồi cộng",
            "nhom_theo_ngay": [empty_group],
        }

    # 2. Chuẩn hóa danh sách các điểm đo thực tế (Known meter points)
    known_points: list[tuple[datetime, Decimal]] = [(t_start, m_start_kwh), (t_stop, m_stop_kwh)]

    if meter_readings:
        for rd in meter_readings:
            if isinstance(rd, (list, tuple)) and len(rd) >= 2:
                rd_t = to_station_timezone(rd[0], station_tz)
                rd_k = Decimal(str(rd[1]))
                if t_start <= rd_t <= t_stop:
                    known_points.append((rd_t, rd_k))
            elif isinstance(rd, dict):
                raw_t = rd.get("timestamp") or rd.get("time")
                raw_k = rd.get("kwh") if "kwh" in rd else rd.get("meter_kwh")
                if raw_t is not None and raw_k is not None:
                    rd_t = to_station_timezone(raw_t, station_tz)
                    rd_k = Decimal(str(raw_k))
                    if t_start <= rd_t <= t_stop:
                        known_points.append((rd_t, rd_k))

    # Loại bỏ điểm trùng thời gian (ưu tiên giữ giá trị sau)
    point_dict: dict[datetime, Decimal] = {}
    for pt_t, pt_k in known_points:
        point_dict[pt_t] = pt_k
    sorted_known_points = sorted(point_dict.items(), key=lambda x: x[0])

    # 3. Xác định tất cả các mốc ranh giới (Critical Boundaries):
    # - Mốc start_time và stop_time
    # - Mốc nửa đêm 00:00:00 của các ngày chuyển giao
    # - Mốc đổi khung giờ TOU của từng ngày
    boundary_set: set[datetime] = {t_start, t_stop}

    curr_d = t_start.date()
    stop_d = t_stop.date()

    while curr_d <= stop_d:
        # Mốc ranh giới nửa đêm (00:00:00) nếu nằm giữa t_start và t_stop
        midnight_dt = datetime.combine(curr_d, time(0, 0), tzinfo=station_tz)
        if t_start < midnight_dt < t_stop:
            boundary_set.add(midnight_dt)

        # Mốc đổi khung giá TOU trong ngày curr_d
        slots = resolve_tariff_for_date(tariff_schedule, curr_d)
        for s in slots:
            if s.start_time != time(0, 0):
                slot_boundary_dt = datetime.combine(curr_d, s.start_time, tzinfo=station_tz)
                if t_start < slot_boundary_dt < t_stop:
                    boundary_set.add(slot_boundary_dt)

        curr_d += timedelta(days=1)

    sorted_boundaries = sorted(boundary_set)

    # 4. Tính toán cho từng đoạn [t_i, t_{i+1}]
    segments_raw: list[dict[str, Any]] = []

    for i in range(len(sorted_boundaries) - 1):
        seg_start = sorted_boundaries[i]
        seg_end = sorted_boundaries[i + 1]

        # Lấy kWh tại 2 đầu mốc bằng nội suy tuyến tính nếu không có số đo thực tế
        kwh_start, interp_start = interpolate_kwh_linear(seg_start, sorted_known_points)
        kwh_end, interp_end = interpolate_kwh_linear(seg_end, sorted_known_points)

        seg_kwh = max(Decimal("0.0000"), kwh_end - kwh_start)
        # AC: co_noi_suy = True nếu có ít nhất 1 mốc đầu hoặc cuối phải nội suy
        co_noi_suy = interp_start or interp_end

        # Xác định đơn giá cho đoạn này:
        # Do đoạn nằm trọn trong 1 ngày và 1 khung giờ, ta lấy điểm giữa đoạn để tra giá
        mid_time = seg_start + (seg_end - seg_start) / 2
        day_slots = resolve_tariff_for_date(tariff_schedule, seg_start.date())
        rate = get_tariff_rate_at_time(day_slots, mid_time.time())

        # AC 1.3: Làm tròn từng đoạn rồi cộng (Round each segment to integer VND)
        # Sử dụng ROUND_HALF_UP để đảm bảo chính xác đồng
        cost_decimal = seg_kwh * rate
        thanh_tien = int(cost_decimal.quantize(Decimal("1"), rounding=ROUND_HALF_UP))

        don_gia_val = int(rate) if rate % 1 == 0 else float(rate)

        segments_raw.append(
            {
                "date_key": seg_start.date(),
                "tu_gio": seg_start.isoformat(),
                "den_gio": seg_end.isoformat(),
                "so_kwh": seg_kwh,
                "don_gia": don_gia_val,
                "cost_decimal": cost_decimal,
                "thanh_tien": thanh_tien,
                "co_noi_suy": co_noi_suy,
            }
        )

    # 5. Gom nhóm theo ngày (AC 2.1 & AC 2.2)
    days_dict: dict[date, list[dict[str, Any]]] = {}
    for seg in segments_raw:
        d_key = seg["date_key"]
        if d_key not in days_dict:
            days_dict[d_key] = []
        days_dict[d_key].append(seg)

    daily_groups: list[dict[str, Any]] = []
    total_amount_all_days = 0
    total_kwh_all_days = Decimal("0.0000")
    global_seg_idx = 1

    for d_key in sorted(days_dict.keys()):
        day_segs = days_dict[d_key]
        day_amount = sum(s["thanh_tien"] for s in day_segs)
        day_kwh = sum((s["so_kwh"] for s in day_segs), Decimal("0.0000"))

        total_amount_all_days += day_amount
        total_kwh_all_days += day_kwh

        formatted_segs = []
        for s in day_segs:
            seg_dict = {
                "segment_index": global_seg_idx,
                "start_time": s["tu_gio"],
                "end_time": s["den_gio"],
                "energy_kwh": f"{s['so_kwh']:.4f}",
                "unit_price": s["don_gia"],
                "raw_amount": f"{s['cost_decimal']:.2f}",
                "rounded_amount": s["thanh_tien"],
                "is_interpolated": s["co_noi_suy"],
                "tu_gio": s["tu_gio"],
                "den_gio": s["den_gio"],
                "so_kwh": f"{s['so_kwh']:.3f}",
                "don_gia": s["don_gia"],
                "thanh_tien": s["thanh_tien"],
                "co_noi_suy": s["co_noi_suy"],
            }
            formatted_segs.append(seg_dict)
            global_seg_idx += 1

        group_dict = {
            "date": d_key.strftime("%Y-%m-%d"),
            "daily_energy_kwh": f"{day_kwh:.4f}",
            "daily_total_amount": day_amount,
            "segments": formatted_segs,
            "ngay": d_key.strftime("%Y-%m-%d"),
            "tong_tien_ngay": day_amount,
            "tong_kwh_ngay": f"{day_kwh:.3f}",
            "cac_doan": formatted_segs,
        }
        daily_groups.append(group_dict)

    return {
        "session_id": session_id_str,
        "timezone": tz_name,
        "total_energy_kwh": f"{total_kwh_all_days:.4f}",
        "total_amount": total_amount_all_days,
        "currency": "VND",
        "rounding_rule": "ROUND_EACH_SEGMENT",
        "rounding_note": "Tổng tiền được tính bằng cách làm tròn từng đoạn trước khi cộng, để người dùng và kế toán có thể đối chiếu.",
        "daily_groups": daily_groups,
        "tong_kwh": f"{total_kwh_all_days:.3f}",
        "tong_tien": total_amount_all_days,
        "quy_tac_lam_tron": "Làm tròn từng đoạn rồi cộng",
        "nhom_theo_ngay": daily_groups,
    }
