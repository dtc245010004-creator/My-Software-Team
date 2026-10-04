"""Module tính toán sản lượng điện năng (kWh) phục vụ giao dịch và đối soát (Task T-39)."""

from typing import Union


def calculate_kwh(
    meter_start_wh: Union[int, float],
    meter_stop_wh: Union[int, float],
) -> Union[float, None]:
    """Tính sản lượng điện tiêu thụ (kWh) từ số đo công tơ ban đầu và kết thúc (Wh).

    Công thức: (meter_stop_wh - meter_start_wh) / 1000.0
    - Nếu meter_stop_wh < meter_start_wh (số đo lùi bất thường): Trả về None.
    - Không làm tròn số ở bước này để bảo toàn độ chính xác dấu phẩy động cho các module tính cước sau này.
    """
    if meter_stop_wh < meter_start_wh:
        return None
    return (float(meter_stop_wh) - float(meter_start_wh)) / 1000.0

