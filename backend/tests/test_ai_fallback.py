import asyncio
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.core.security import create_access_token, get_password_hash
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.services.fallback_service import FallbackService
from app.services.scheduler_service import calculate_and_broadcast_smart_charging


class TestHeuristicEngine:
    """Kiểm thử độc lập bộ quy tắc Heuristic (Fast Loop & Fallback)."""

    def test_smart_charging_safe_grid(self):
        """Khi tổng công suất yêu cầu <= 95% công suất lưới, cấp đủ 100%."""
        grid_capacity = 100.0  # limit = 95.0 kW
        requests = [
            {"connector_id": 1, "soc": 20.0, "requested_power_kw": 30.0},
            {"connector_id": 2, "soc": 60.0, "requested_power_kw": 30.0},
            {"connector_id": 3, "soc": 90.0, "requested_power_kw": 20.0},
        ]  # Tổng yêu cầu = 80.0 kW <= 95.0 kW

        res = FallbackService.calculate_load_balancing_heuristic(
            station_id=1,
            grid_capacity_kw=grid_capacity,
            active_requests=requests,
        )

        assert res.source == "HEURISTIC_FALLBACK"
        assert res.is_fallback is True
        assert res.grid_limit_kw == 95.0
        assert res.total_requested_kw == 80.0
        assert res.total_allocated_kw == 80.0
        assert len(res.allocations) == 3
        # Cả 3 cổng nhận đủ
        assert res.allocations[0].allocated_power_kw == 30.0
        assert res.allocations[1].allocated_power_kw == 30.0
        assert res.allocations[2].allocated_power_kw == 20.0

    def test_smart_charging_overload_weighted_fair_sharing(self):
        """Khi tổng yêu cầu > công suất lưới, điều phối theo trọng số SoC."""
        grid_capacity = 100.0  # limit = 95.0 kW
        requests = [
            {"connector_id": 1, "soc": 30.0, "requested_power_kw": 60.0},  # w = 1.2
            {"connector_id": 2, "soc": 70.0, "requested_power_kw": 60.0},  # w = 1.0
            {"connector_id": 3, "soc": 85.0, "requested_power_kw": 60.0},  # w = 0.6
        ]  # Tổng yêu cầu = 180.0 kW > 95.0 kW

        res = FallbackService.calculate_load_balancing_heuristic(
            station_id=1,
            grid_capacity_kw=grid_capacity,
            active_requests=requests,
        )

        assert res.source == "HEURISTIC_FALLBACK"
        assert res.is_fallback is True
        assert res.grid_limit_kw == 95.0
        assert res.total_requested_kw == 180.0
        assert res.total_allocated_kw <= 95.0  # Tuyệt đối không vượt ngưỡng lưới

        # Xe pin thấp nhất (30%) phải nhận nhiều công suất nhất
        alloc_1 = res.allocations[0].allocated_power_kw
        alloc_2 = res.allocations[1].allocated_power_kw
        alloc_3 = res.allocations[2].allocated_power_kw

        assert alloc_1 > alloc_2 > alloc_3
        assert res.allocations[0].weight == 1.2
        assert res.allocations[1].weight == 1.0
        assert res.allocations[2].weight == 0.6

    def test_smart_charging_empty_requests(self):
        """Khi trạm không có phiên sạc nào."""
        res = FallbackService.calculate_load_balancing_heuristic(
            station_id=1,
            grid_capacity_kw=100.0,
            active_requests=[],
        )
        assert res.total_requested_kw == 0.0
        assert res.total_allocated_kw == 0.0
        assert len(res.allocations) == 0

    def test_predictive_maintenance_critical_temp(self):
        """Nhiệt độ > 85°C -> CRITICAL."""
        telemetry = [
            {"temperature_c": 60.0, "voltage_v": 230.0},
            {"temperature_c": 75.0, "voltage_v": 228.0},
            {"temperature_c": 88.0, "voltage_v": 225.0},
        ]
        res = FallbackService.calculate_maintenance_heuristic(
            charger_id=1,
            charger_code="CP-01",
            telemetry_history=telemetry,
        )

        assert res.risk_level == "CRITICAL"
        assert res.max_temperature == 88.0
        assert res.health_score < 50.0
        assert "khẩn cấp" in res.recommended_action.lower()

    def test_predictive_maintenance_high_voltage_drop(self):
        """Sụt áp > 10% -> HIGH."""
        telemetry = [
            {"temperature_c": 50.0, "voltage_v": 230.0},
            {"temperature_c": 52.0, "voltage_drop_pct": 12.5},  # > 10%
        ]
        res = FallbackService.calculate_maintenance_heuristic(
            charger_id=2,
            charger_code="CP-02",
            telemetry_history=telemetry,
        )

        assert res.risk_level == "HIGH"
        assert "cảnh báo quá nhiệt hoặc sụt áp" in res.recommended_action.lower()

    def test_predictive_maintenance_medium_temp(self):
        """65°C < T <= 75°C -> MEDIUM."""
        telemetry = [
            {"temperature_c": 68.0, "voltage_v": 230.0},
            {"temperature_c": 70.0, "voltage_v": 229.0},
        ]
        res = FallbackService.calculate_maintenance_heuristic(
            charger_id=3,
            charger_code="CP-03",
            telemetry_history=telemetry,
        )

        assert res.risk_level == "MEDIUM"

    def test_predictive_maintenance_normal(self):
        """Nhiệt độ <= 65°C, điện áp ổn định -> NORMAL."""
        telemetry = [
            {"temperature_c": 42.0, "voltage_v": 230.0},
            {"temperature_c": 44.0, "voltage_v": 230.0},
        ]
        res = FallbackService.calculate_maintenance_heuristic(
            charger_id=4,
            charger_code="CP-04",
            telemetry_history=telemetry,
        )

        assert res.risk_level == "NORMAL"
        assert res.health_score == 100.0

    def test_predictive_maintenance_thermal_trend(self):
        """Kiểm tra nhận diện xu hướng nhiệt độ tăng dần."""
        telemetry = [
            {"temperature_c": 45.0},
            {"temperature_c": 46.0},
            {"temperature_c": 47.0},
            {"temperature_c": 52.0},
            {"temperature_c": 55.0},
            {"temperature_c": 58.0},
        ]  # avg cũ ~46.0, avg mới ~55.0, diff = +9.0 > +2.0
        res = FallbackService.calculate_maintenance_heuristic(
            charger_id=5,
            charger_code="CP-05",
            telemetry_history=telemetry,
        )

        assert res.thermal_trend == "increasing"

    def test_dynamic_pricing_advice_trigger_shift(self):
        """Cao điểm > 80% và chênh lệch >= 30% -> Đề xuất tăng cao điểm 15%, giảm thấp điểm 10%."""
        res = FallbackService.calculate_pricing_advice_heuristic(
            station_id=1,
            current_tariff_id=10,
            price_peak=4000.0,
            price_normal=3000.0,
            price_offpeak=2000.0,
            occupancy_peak_pct=85.0,
            occupancy_offpeak_pct=25.0,
        )

        assert res.source == "HEURISTIC_FALLBACK"
        assert res.is_fallback is True
        assert len(res.adjustments) == 3

        peak_item = next(it for it in res.adjustments if it.time_slot == "PEAK")
        offpeak_item = next(it for it in res.adjustments if it.time_slot == "OFFPEAK")
        normal_item = next(it for it in res.adjustments if it.time_slot == "NORMAL")

        assert peak_item.change_pct == 15.0
        assert peak_item.suggested_price == 4600.0  # 4000 * 1.15
        assert offpeak_item.change_pct == -10.0
        assert offpeak_item.suggested_price == 1800.0  # 2000 * 0.9
        assert normal_item.change_pct == 0.0

    def test_dynamic_pricing_advice_keep_current(self):
        """Không đủ chênh lệch -> Giữ nguyên biểu giá."""
        res = FallbackService.calculate_pricing_advice_heuristic(
            station_id=1,
            current_tariff_id=10,
            price_peak=4000.0,
            price_normal=3000.0,
            price_offpeak=2000.0,
            occupancy_peak_pct=70.0,
            occupancy_offpeak_pct=50.0,
        )

        peak_item = next(it for it in res.adjustments if it.time_slot == "PEAK")
        assert peak_item.change_pct == 0.0
        assert "giữ nguyên" in res.reasoning.lower()

    def test_fallback_ai_ask(self):
        """Hỏi đáp AI khi ngoại tuyến -> Trả về basic stats từ DB."""
        stats = {
            "revenue_7days": 12500000,
            "total_sessions": 85,
            "avg_occupancy": 64.5,
            "open_maintenance_alerts": 1,
        }
        res = FallbackService.get_fallback_ai_ask(
            question="Doanh thu tuần này thế nào?",
            basic_stats=stats,
        )

        assert res.is_fallback is True
        assert res.source == "HEURISTIC_FALLBACK"
        assert "12,500,000" in res.answer
        assert res.basic_stats["total_sessions"] == 85


# --- FIXTURES DÀNH CHO INTEGRATION TESTS ---

@pytest.fixture
def ai_test_data(db_session):
    """Thiết lập môi trường dữ liệu: Users, Station, Charger, Connectors, Tariff."""
    admin = User(
        username="ai_admin",
        email="ai_admin@test.com",
        password_hash=get_password_hash("AdminPass123"),
        role="ADMIN",
        is_active=True,
    )
    op_a = User(
        username="ai_op_a",
        email="ai_opa@test.com",
        password_hash=get_password_hash("OpPass123"),
        role="OPERATOR",
        is_active=True,
    )
    op_b = User(
        username="ai_op_b",
        email="ai_opb@test.com",
        password_hash=get_password_hash("OpPass123"),
        role="OPERATOR",
        is_active=True,
    )
    customer = User(
        username="ai_cus",
        email="ai_cus@test.com",
        password_hash=get_password_hash("CusPass123"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([admin, op_a, op_b, customer])
    db_session.commit()

    # Trạm của Operator A
    station_a = Station(
        operator_id=op_a.id,
        name="Trạm Sạc AI Test A",
        address="100 Đường AI, Q1",
        latitude=10.7769,
        longitude=106.7009,
        total_grid_capacity_kw=80.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station_a)
    db_session.commit()

    charger_a = ChargingPoint(
        station_id=station_a.id,
        code="CP-AI-01",
        vendor="ABB",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(charger_a)
    db_session.commit()

    conn_a1 = Connector(
        charging_point_id=charger_a.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    conn_a2 = Connector(
        charging_point_id=charger_a.id,
        connector_number=2,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add_all([conn_a1, conn_a2])

    # Biểu giá trạm A
    tariff_a = Tariff(
        station_id=station_a.id,
        name="Biểu Giá Trạm A",
        price_normal=Decimal("3000.00"),
        price_peak=Decimal("4500.00"),
        price_offpeak=Decimal("2000.00"),
        is_active=True,
    )
    db_session.add(tariff_a)
    db_session.commit()

    return {
        "admin": admin,
        "op_a": op_a,
        "op_b": op_b,
        "customer": customer,
        "station_a": station_a,
        "charger_a": charger_a,
        "conn_a1": conn_a1,
        "conn_a2": conn_a2,
        "tariff_a": tariff_a,
        "token_admin": create_access_token({"sub": str(admin.id), "role": admin.role}),
        "token_op_a": create_access_token({"sub": str(op_a.id), "role": op_a.role}),
        "token_op_b": create_access_token({"sub": str(op_b.id), "role": op_b.role}),
        "token_customer": create_access_token({"sub": str(customer.id), "role": customer.role}),
    }


class TestAIEndpointsAndRBAC:
    """Kiểm thử tích hợp các Endpoint AI: RBAC, IDOR và Heuristic Fallback."""

    def test_customer_forbidden_on_all_ai_endpoints(self, client, ai_test_data):
        """Khách hàng (CUSTOMER) bị cấm 403 Forbidden trên toàn bộ endpoint AI."""
        headers = {"Authorization": f"Bearer {ai_test_data['token_customer']}"}
        st_id = ai_test_data["station_a"].id
        cp_id = ai_test_data["charger_a"].id

        # 1. Smart Charging
        res1 = client.post(f"/api/v1/ai/smart-charging/{st_id}", headers=headers)
        assert res1.status_code == 403

        # 2. Predictive Maintenance
        res2 = client.post(f"/api/v1/ai/predictive-maintenance/{cp_id}", headers=headers)
        assert res2.status_code == 403

        # 3. Dynamic Pricing Advice
        res3 = client.post(f"/api/v1/ai/pricing-advice/{st_id}", headers=headers)
        assert res3.status_code == 403

        # 4. Ask Advisor
        res4 = client.post("/api/v1/ai/ask", json={"question": "Chào AI"}, headers=headers)
        assert res4.status_code == 403

    def test_operator_idor_forbidden(self, client, ai_test_data):
        """Operator B can thiệp tài nguyên của Operator A -> Bị chặn 403 Forbidden."""
        headers_b = {"Authorization": f"Bearer {ai_test_data['token_op_b']}"}
        st_id = ai_test_data["station_a"].id
        cp_id = ai_test_data["charger_a"].id

        # Operator B gọi smart charging trạm A
        res1 = client.post(f"/api/v1/ai/smart-charging/{st_id}", headers=headers_b)
        assert res1.status_code == 403

        # Operator B gọi bảo trì trụ sạc của trạm A
        res2 = client.post(f"/api/v1/ai/predictive-maintenance/{cp_id}", headers=headers_b)
        assert res2.status_code == 403

        # Operator B gọi tư vấn giá trạm A
        res3 = client.post(f"/api/v1/ai/pricing-advice/{st_id}", headers=headers_b)
        assert res3.status_code == 403

    def test_operator_a_smart_charging_success(self, client, ai_test_data):
        """Operator A gọi smart charging cho trạm của mình -> 200 OK, Heuristic Fallback khi không có API key."""
        headers_a = {"Authorization": f"Bearer {ai_test_data['token_op_a']}"}
        st_id = ai_test_data["station_a"].id

        res = client.post(f"/api/v1/ai/smart-charging/{st_id}", headers=headers_a)
        assert res.status_code == 200
        data = res.json()
        assert data["station_id"] == st_id
        assert data["grid_limit_kw"] == 76.0  # 80 * 0.95
        assert data["source"] == "HEURISTIC_FALLBACK"
        assert data["is_fallback"] is True

    def test_operator_a_predictive_maintenance_success(self, client, ai_test_data):
        """Operator A gọi dự báo bảo trì cho trụ sạc của mình -> 200 OK."""
        headers_a = {"Authorization": f"Bearer {ai_test_data['token_op_a']}"}
        cp_id = ai_test_data["charger_a"].id

        res = client.post(f"/api/v1/ai/predictive-maintenance/{cp_id}", headers=headers_a)
        assert res.status_code == 200
        data = res.json()
        assert data["charger_id"] == cp_id
        assert data["risk_level"] == "NORMAL"
        assert data["health_score"] >= 90.0
        assert data["is_fallback"] is True

    def test_operator_a_pricing_advice_success(self, client, ai_test_data):
        """Operator A gọi tư vấn giá -> 200 OK, điều chỉnh theo tỷ lệ lấp đầy."""
        headers_a = {"Authorization": f"Bearer {ai_test_data['token_op_a']}"}
        st_id = ai_test_data["station_a"].id

        # Gọi kèm query params mock tỷ lệ lấp đầy
        res = client.post(
            f"/api/v1/ai/pricing-advice/{st_id}?peak_occupancy=88.0&offpeak_occupancy=20.0",
            headers=headers_a,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["station_id"] == st_id
        assert data["occupancy_peak_pct"] == 88.0
        assert data["is_fallback"] is True

        # Đã kích hoạt điều chỉnh: tăng cao điểm +15%, giảm thấp điểm -10%
        peak_adj = next(a for a in data["adjustments"] if a["time_slot"] == "PEAK")
        assert peak_adj["change_pct"] == 15.0

    def test_operator_ask_advisor_fallback_success(self, client, ai_test_data):
        """Hỏi đáp AI khi ngoại tuyến -> Trả về 200 OK kèm basic_stats, is_fallback=True."""
        headers_a = {"Authorization": f"Bearer {ai_test_data['token_op_a']}"}

        res = client.post(
            "/api/v1/ai/ask",
            json={"question": "Tình hình kinh doanh hiện tại thế nào?"},
            headers=headers_a,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["is_fallback"] is True
        assert data["source"] == "HEURISTIC_FALLBACK"
        assert "basic_stats" in data
        assert data["basic_stats"] is not None

    def test_admin_has_full_access(self, client, ai_test_data):
        """Admin có quyền truy cập tất cả tài nguyên mà không bị chặn IDOR."""
        headers_admin = {"Authorization": f"Bearer {ai_test_data['token_admin']}"}
        st_id = ai_test_data["station_a"].id
        cp_id = ai_test_data["charger_a"].id

        res_sc = client.post(f"/api/v1/ai/smart-charging/{st_id}", headers=headers_admin)
        assert res_sc.status_code == 200

        res_pm = client.post(f"/api/v1/ai/predictive-maintenance/{cp_id}", headers=headers_admin)
        assert res_pm.status_code == 200


class TestGeminiMockAndGracefulDegradation:
    """Kiểm thử tích hợp Gemini AI với Mock: Thành công & Tự động phục hồi khi lỗi."""

    @pytest.mark.anyio
    async def test_gemini_smart_charging_success_mock(self, client, ai_test_data):
        """Khi Gemini AI phản hồi JSON hợp lệ -> Trả về source='GEMINI_AI', is_fallback=False."""
        from app.services.ai_service import AIService

        mock_response = MagicMock()
        mock_response.text = '{"recommendations": ["Gemini AI: Khuyến nghị phân bổ tải tối ưu 100%"]}'

        with patch("app.services.ai_service.settings.GEMINI_API_KEY", "valid_mock_key"), \
             patch("app.services.ai_service.HAS_GENAI", True), \
             patch("google.generativeai.GenerativeModel.generate_content", return_value=mock_response):

            res = await AIService.get_smart_charging(
                station_id=ai_test_data["station_a"].id,
                grid_capacity_kw=80.0,
                active_requests=[
                    {"connector_id": 1, "soc": 30.0, "requested_power_kw": 30.0},
                ],
            )

            assert res.source == "GEMINI_AI"
            assert res.is_fallback is False
            assert "Gemini AI" in res.recommendations[0]

    @pytest.mark.anyio
    async def test_gemini_timeout_or_error_graceful_fallback(self, client, ai_test_data):
        """Khi Gemini AI gặp lỗi (Exception, Timeout, 429) -> Tự động Fallback Heuristic, không ném 500."""
        from app.services.ai_service import AIService

        with patch("app.services.ai_service.settings.GEMINI_API_KEY", "valid_mock_key"), \
             patch("app.services.ai_service.HAS_GENAI", True), \
             patch("google.generativeai.GenerativeModel.generate_content", side_effect=RuntimeError("Gemini Quota Exceeded")):

            # Gọi smart charging
            res_sc = await AIService.get_smart_charging(
                station_id=ai_test_data["station_a"].id,
                grid_capacity_kw=80.0,
                active_requests=[
                    {"connector_id": 1, "soc": 20.0, "requested_power_kw": 30.0},
                ],
            )
            assert res_sc.source == "HEURISTIC_FALLBACK"
            assert res_sc.is_fallback is True

            # Gọi maintenance
            res_pm = await AIService.get_predictive_maintenance(
                charger_id=1,
                charger_code="CP-01",
                telemetry_history=[{"temperature_c": 50.0, "voltage_v": 230.0}],
            )
            assert res_pm.source == "HEURISTIC_FALLBACK"
            assert res_pm.is_fallback is True

            # Gọi ask advisor
            res_ask = await AIService.ask_advisor(
                question="Báo cáo tuần",
                basic_stats={"revenue_7days": 5000000},
            )
            assert res_ask.source == "HEURISTIC_FALLBACK"
            assert res_ask.is_fallback is True

    @pytest.mark.anyio
    async def test_scheduler_calculate_and_broadcast_integration(self, db_session, ai_test_data):
        """Kiểm thử hàm lõi calculate_and_broadcast_smart_charging chạy an toàn."""
        st_id = ai_test_data["station_a"].id
        res = await calculate_and_broadcast_smart_charging(
            station_id=st_id,
            db=db_session,
            use_gemini=False,
        )
        assert res is not None
        assert res.station_id == st_id
        assert res.is_fallback is True
