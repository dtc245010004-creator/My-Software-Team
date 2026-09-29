import math
from typing import Any, Dict, List, Optional
from app.schemas.ai import (
    AIAskResponse,
    PredictiveMaintenanceResponse,
    PricingAdjustmentItem,
    PricingAdviceResponse,
    SmartChargingAllocationItem,
    SmartChargingResponse,
)


class FallbackService:
    """Động cơ Heuristic Fallback độc lập 100%, bảo đảm hệ thống vận hành khi mất mạng/hết quota AI."""

    @staticmethod
    def calculate_load_balancing_heuristic(
        station_id: int,
        grid_capacity_kw: float,
        active_requests: List[Dict[str, Any]],
    ) -> SmartChargingResponse:
        """Thuật toán Weighted Fair Sharing theo SoC điều phối tải trạm sạc.

        Quy tắc trọng số:
        - w_i = 1.2 nếu SoC < 50% (ưu tiên xe sắp cạn pin)
        - w_i = 1.0 nếu 50% <= SoC <= 80% (tải thông thường)
        - w_i = 0.6 nếu SoC > 80% (giai đoạn CV giảm dòng)

        Công suất an toàn: P_limit = P_grid_max * 0.95
        """
        p_limit = round(grid_capacity_kw * 0.95, 2)

        if not active_requests:
            return SmartChargingResponse(
                station_id=station_id,
                grid_limit_kw=p_limit,
                total_requested_kw=0.0,
                total_allocated_kw=0.0,
                allocations=[],
                recommendations=["Trạm sạc hiện tại không có xe nào đang hoạt động."],
                source="HEURISTIC_FALLBACK",
                is_fallback=True,
            )

        # 1. Tính trọng số cho từng request
        items_with_weights = []
        total_requested = 0.0

        for req in active_requests:
            soc = float(req.get("soc", 0.0))
            p_req = float(req.get("requested_power_kw", 0.0))
            total_requested += p_req

            if soc < 50.0:
                weight = 1.2
            elif soc <= 80.0:
                weight = 1.0
            else:
                weight = 0.6

            items_with_weights.append(
                {
                    "connector_id": req.get("connector_id"),
                    "charger_id": req.get("charger_id"),
                    "charger_code": req.get("charger_code"),
                    "connector_number": req.get("connector_number"),
                    "soc": soc,
                    "requested_power_kw": p_req,
                    "weight": weight,
                    "allocated_power_kw": 0.0,
                }
            )

        total_requested = round(total_requested, 2)
        recommendations: List[str] = []

        # 2. Phân bổ công suất
        if total_requested <= p_limit:
            # Lưới điện an toàn: cấp 100% công suất yêu cầu
            for item in items_with_weights:
                item["allocated_power_kw"] = item["requested_power_kw"]
            recommendations.append(
                f"Lưới điện an toàn (tổng yêu cầu {total_requested:.1f} kW <= ngưỡng an toàn {p_limit:.1f} kW). "
                "Cấp đủ 100% công suất cho toàn bộ các trụ."
            )
        else:
            # Quá tải lưới: áp dụng Weighted Fair Sharing
            recommendations.append(
                f"Cảnh báo quá tải lưới (tổng yêu cầu {total_requested:.1f} kW > ngưỡng an toàn {p_limit:.1f} kW). "
                "Đã kích hoạt thuật toán Heuristic chia tải ưu tiên xe có SoC thấp."
            )

            denom = sum(item["weight"] * item["requested_power_kw"] for item in items_with_weights)
            if denom > 0:
                # Vòng 1: Phân bổ theo trọng số
                for item in items_with_weights:
                    share = (item["weight"] * item["requested_power_kw"]) / denom
                    calc_alloc = p_limit * share
                    item["allocated_power_kw"] = min(item["requested_power_kw"], calc_alloc)

                # Vòng 2: Phân phối phần công suất dư thừa (nếu có xe bị min() chặn)
                current_sum = sum(item["allocated_power_kw"] for item in items_with_weights)
                remaining_power = p_limit - current_sum

                if remaining_power > 0.01:
                    # Các xe chưa đạt yêu cầu
                    unmet = [it for it in items_with_weights if it["allocated_power_kw"] < it["requested_power_kw"]]
                    unmet_denom = sum(it["weight"] * it["requested_power_kw"] for it in unmet)
                    if unmet_denom > 0:
                        for it in unmet:
                            extra = remaining_power * ((it["weight"] * it["requested_power_kw"]) / unmet_denom)
                            it["allocated_power_kw"] = min(
                                it["requested_power_kw"],
                                it["allocated_power_kw"] + extra,
                            )
            else:
                for item in items_with_weights:
                    item["allocated_power_kw"] = 0.0

        # Làm tròn kết quả 2 chữ số thập phân
        allocations = []
        for it in items_with_weights:
            it["allocated_power_kw"] = round(it["allocated_power_kw"], 2)
            allocations.append(SmartChargingAllocationItem(**it))

        total_allocated = round(sum(it.allocated_power_kw for it in allocations), 2)
        # Ràng buộc bảo đảm không bao giờ vượt p_limit do làm tròn
        if total_allocated > p_limit and allocations:
            diff = round(total_allocated - p_limit, 2)
            # Trừ phần lẻ ở cổng nhận nhiều nhất
            max_item = max(allocations, key=lambda x: x.allocated_power_kw)
            max_item.allocated_power_kw = round(max_item.allocated_power_kw - diff, 2)
            total_allocated = round(sum(it.allocated_power_kw for it in allocations), 2)

        return SmartChargingResponse(
            station_id=station_id,
            grid_limit_kw=p_limit,
            total_requested_kw=total_requested,
            total_allocated_kw=total_allocated,
            allocations=allocations,
            recommendations=recommendations,
            source="HEURISTIC_FALLBACK",
            is_fallback=True,
        )

    @staticmethod
    def calculate_maintenance_heuristic(
        charger_id: int,
        charger_code: str,
        telemetry_history: List[Dict[str, Any]],
    ) -> PredictiveMaintenanceResponse:
        """Thuật toán Heuristic dự báo bảo trì và chẩn đoán sức khỏe trụ sạc."""
        if not telemetry_history:
            return PredictiveMaintenanceResponse(
                charger_id=charger_id,
                charger_code=charger_code,
                risk_level="NORMAL",
                health_score=100.0,
                thermal_trend="stable",
                avg_temperature=45.0,
                max_temperature=45.0,
                voltage_stability_pct=100.0,
                recommended_action="Chưa có bản ghi đo lường bất thường; thiết bị hoạt động bình thường.",
                source="HEURISTIC_FALLBACK",
                is_fallback=True,
            )

        temperatures = [float(rec.get("temperature_c", 45.0)) for rec in telemetry_history]
        max_temp = round(max(temperatures), 1)
        avg_temp = round(sum(temperatures) / len(temperatures), 1)

        # Tính toán sụt áp (nếu có trường voltage_drop_pct hoặc voltage_v)
        voltage_drops = []
        for rec in telemetry_history:
            if "voltage_drop_pct" in rec:
                voltage_drops.append(float(rec["voltage_drop_pct"]))
            elif "voltage_v" in rec:
                v = float(rec["voltage_v"])
                # Baseline 230V cho 1 pha, 400V cho 3 pha
                baseline = 230.0 if v <= 280.0 else 400.0
                drop = max(0.0, ((baseline - v) / baseline) * 100.0)
                voltage_drops.append(drop)
            else:
                voltage_drops.append(0.0)

        max_voltage_drop = round(max(voltage_drops), 1) if voltage_drops else 0.0
        voltage_stability = round(max(0.0, 100.0 - max_voltage_drop), 1)

        # 1. Xác định Risk Level theo ngưỡng cứng bắt buộc
        if max_temp > 85.0:
            risk_level = "CRITICAL"
            recommended_action = "Ngắt sạc khẩn cấp và cử kỹ thuật viên kiểm tra phần cứng ngay lập tức."
        elif max_temp > 75.0 or max_voltage_drop > 10.0:
            risk_level = "HIGH"
            recommended_action = "Cảnh báo quá nhiệt hoặc sụt áp cao. Khuyến nghị kiểm tra hệ thống làm mát và dây dẫn."
        elif max_temp > 65.0:
            risk_level = "MEDIUM"
            recommended_action = "Nhiệt độ vận hành tăng cao. Cần theo dõi sát thông số vận hành trong các phiên sạc kế tiếp."
        else:
            risk_level = "NORMAL"
            recommended_action = "Trụ sạc hoạt động bình thường, các thông số nằm trong giới hạn an toàn."

        # 2. Tính Health Score (0 - 100)
        temp_penalty = min(50.0, (max_temp - 45.0) * 1.5) if max_temp > 45.0 else 0.0
        voltage_penalty = min(30.0, (max_voltage_drop - 2.0) * 3.0) if max_voltage_drop > 2.0 else 0.0
        health_score = round(max(0.0, min(100.0, 100.0 - temp_penalty - voltage_penalty)), 1)

        # 3. Phân tích xu hướng nhiệt (Thermal Trend)
        if len(temperatures) >= 6:
            recent_avg = sum(temperatures[-3:]) / 3.0
            prev_avg = sum(temperatures[-6:-3]) / 3.0
            diff = recent_avg - prev_avg
            if diff > 2.0:
                thermal_trend = "increasing"
            elif diff < -2.0:
                thermal_trend = "decreasing"
            else:
                thermal_trend = "stable"
        elif len(temperatures) >= 2:
            half = len(temperatures) // 2
            prev_avg = sum(temperatures[:half]) / half
            recent_avg = sum(temperatures[half:]) / (len(temperatures) - half)
            diff = recent_avg - prev_avg
            if diff > 2.0:
                thermal_trend = "increasing"
            elif diff < -2.0:
                thermal_trend = "decreasing"
            else:
                thermal_trend = "stable"
        else:
            thermal_trend = "stable"

        return PredictiveMaintenanceResponse(
            charger_id=charger_id,
            charger_code=charger_code,
            risk_level=risk_level,
            health_score=health_score,
            thermal_trend=thermal_trend,
            avg_temperature=avg_temp,
            max_temperature=max_temp,
            voltage_stability_pct=voltage_stability,
            recommended_action=recommended_action,
            source="HEURISTIC_FALLBACK",
            is_fallback=True,
        )

    @staticmethod
    def calculate_pricing_advice_heuristic(
        station_id: int,
        current_tariff_id: Optional[int],
        price_peak: float,
        price_normal: float,
        price_offpeak: float,
        occupancy_peak_pct: float,
        occupancy_offpeak_pct: float,
    ) -> PricingAdviceResponse:
        """Thuật toán Heuristic tối ưu hóa biểu giá TOU dựa trên tỷ lệ lấp đầy theo khung giờ."""
        occupancy_peak = round(occupancy_peak_pct, 1)
        occupancy_offpeak = round(occupancy_offpeak_pct, 1)

        # Điều kiện kích hoạt điều chỉnh giá: Cao điểm > 80% VÀ chênh lệch với thấp điểm >= 30 điểm %
        if occupancy_peak > 80.0 and (occupancy_peak - occupancy_offpeak) >= 30.0:
            suggested_peak = round(price_peak * 1.15, 2)
            suggested_offpeak = round(price_offpeak * 0.90, 2)
            suggested_normal = price_normal

            adjustments = [
                PricingAdjustmentItem(
                    time_slot="PEAK",
                    current_price=price_peak,
                    suggested_price=suggested_peak,
                    change_pct=15.0,
                ),
                PricingAdjustmentItem(
                    time_slot="NORMAL",
                    current_price=price_normal,
                    suggested_price=suggested_normal,
                    change_pct=0.0,
                ),
                PricingAdjustmentItem(
                    time_slot="OFFPEAK",
                    current_price=price_offpeak,
                    suggested_price=suggested_offpeak,
                    change_pct=-10.0,
                ),
            ]
            reasoning = (
                f"Tỷ lệ lấp đầy giờ cao điểm rất cao ({occupancy_peak:.1f}%) trong khi giờ thấp điểm còn trống nhiều "
                f"({occupancy_offpeak:.1f}%). Khuyến nghị giãn tải bằng cách tăng giá cao điểm +15% và giảm giá "
                "thấp điểm -10% để khuyến khích tài xế sạc vào ban đêm."
            )
        else:
            adjustments = [
                PricingAdjustmentItem(
                    time_slot="PEAK",
                    current_price=price_peak,
                    suggested_price=price_peak,
                    change_pct=0.0,
                ),
                PricingAdjustmentItem(
                    time_slot="NORMAL",
                    current_price=price_normal,
                    suggested_price=price_normal,
                    change_pct=0.0,
                ),
                PricingAdjustmentItem(
                    time_slot="OFFPEAK",
                    current_price=price_offpeak,
                    suggested_price=price_offpeak,
                    change_pct=0.0,
                ),
            ]
            reasoning = (
                f"Tỷ lệ sử dụng giữa các khung giờ tương đối cân bằng (cao điểm: {occupancy_peak:.1f}%, thấp điểm: "
                f"{occupancy_offpeak:.1f}%) hoặc chưa đạt ngưỡng chênh lệch 30%. Khuyến nghị giữ nguyên biểu giá hiện tại."
            )

        return PricingAdviceResponse(
            station_id=station_id,
            current_tariff_id=current_tariff_id,
            occupancy_peak_pct=occupancy_peak,
            occupancy_offpeak_pct=occupancy_offpeak,
            adjustments=adjustments,
            reasoning=reasoning,
            source="HEURISTIC_FALLBACK",
            is_fallback=True,
        )

    @staticmethod
    def get_fallback_ai_ask(
        question: str,
        basic_stats: Optional[Dict[str, Any]] = None,
    ) -> AIAskResponse:
        """Cung cấp câu trả lời dự phòng khi Gemini AI ngoại tuyến hoặc lỗi API."""
        stats = basic_stats or {}
        rev = stats.get("revenue_7days", 0)
        sessions = stats.get("total_sessions", 0)
        occ = stats.get("avg_occupancy", 0.0)
        alerts = stats.get("open_maintenance_alerts", 0)

        answer = (
            f"Trợ lý AI nâng cao hiện đang bảo trì hoặc mất kết nối API. Hệ thống Heuristic tự động tổng hợp số liệu "
            f"vận hành thực tế từ cơ sở dữ liệu: Doanh thu 7 ngày gần nhất: {rev:,.0f} VND; Tổng phiên sạc: {sessions}; "
            f"Tỷ lệ lấp đầy trung bình: {occ:.1f}%; Cảnh báo bảo trì cần xử lý: {alerts}."
        )

        return AIAskResponse(
            question=question,
            answer=answer,
            source="HEURISTIC_FALLBACK",
            is_fallback=True,
            basic_stats=stats,
        )
