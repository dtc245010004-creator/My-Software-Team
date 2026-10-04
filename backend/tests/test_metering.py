"""Bộ Unit Test cho module tính toán sản lượng điện năng (Task T-39)."""

import pytest

from app.services.metering import calculate_kwh


def test_metering_normal_session():
    """1. Phiên thông thường: meter_start = 12500 Wh, meter_stop = 25000 Wh -> 12.5 kWh."""
    meter_start = 12500
    meter_stop = 25000
    result = calculate_kwh(meter_start, meter_stop)
    assert result == 12.5
    assert isinstance(result, float)


def test_metering_negative_rollover_anomaly():
    """2. Phiên số đo lùi bất thường: meter_start = 20000 Wh, meter_stop = 15000 Wh -> None."""
    meter_start = 20000
    meter_stop = 15000
    result = calculate_kwh(meter_start, meter_stop)
    assert result is None


def test_metering_zero_consumption():
    """3. Phiên số đo bằng nhau (cắm rút không sạc): meter_start = 5000 Wh, meter_stop = 5000 Wh -> 0.0 kWh."""
    meter_start = 5000
    meter_stop = 5000
    result = calculate_kwh(meter_start, meter_stop)
    assert result == 0.0
    assert isinstance(result, float)


@pytest.mark.parametrize(
    "start,stop,expected",
    [
        (0, 1000, 1.0),
        (1000.5, 3500.5, 2.5),
        (100, 150, 0.05),
    ],
)
def test_metering_floating_precision(start, stop, expected):
    """Kiểm tra độ chính xác dấu phẩy động và không làm tròn."""
    result = calculate_kwh(start, stop)
    assert result == pytest.approx(expected)

