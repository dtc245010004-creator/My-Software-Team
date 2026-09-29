import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.schemas.ai import (
    AIAskResponse,
    PredictiveMaintenanceResponse,
    PricingAdviceResponse,
    SmartChargingResponse,
)
from app.services.fallback_service import FallbackService

logger = logging.getLogger("ev_csms.ai_service")

# Khởi tạo Google Gemini nếu có thư viện
try:
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    genai = None
    HAS_GENAI = False


# Cache kết quả điều phối gần nhất theo station_id
latest_smart_charging_cache: Dict[int, SmartChargingResponse] = {}


class AIService:
    """Dịch vụ AI thông minh (Dual-Loop Slow Loop: Gemini AI, tự động Fallback sang Heuristic khi có sự cố)."""

    @classmethod
    def _is_gemini_available(cls) -> bool:
        """Kiểm tra Gemini API Key có sẵn sàng và hợp lệ không."""
        return bool(HAS_GENAI and settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())

    @classmethod
    async def get_smart_charging(
        cls,
        station_id: int,
        grid_capacity_kw: float,
        active_requests: List[Dict[str, Any]],
    ) -> SmartChargingResponse:
        """Điều phối công suất trạm sạc: Thử gọi Gemini AI để tối ưu; nếu lỗi hoặc timeout 5s -> Heuristic."""
        # 1. Luôn tính toán Heuristic sẵn sàng làm baseline
        heuristic_res = FallbackService.calculate_load_balancing_heuristic(
            station_id=station_id,
            grid_capacity_kw=grid_capacity_kw,
            active_requests=active_requests,
        )

        if not cls._is_gemini_available() or not active_requests:
            latest_smart_charging_cache[station_id] = heuristic_res
            return heuristic_res

        # 2. Thử gọi Gemini AI với timeout 5.0 giây
        try:
            prompt = (
                f"Bạn là chuyên gia điều phối lưới điện trạm sạc xe điện thông minh (EV Smart Charging Load Balancer).\n"
                f"Thông số trạm sạc: ID={station_id}, Tổng công suất lưới an toàn: {heuristic_res.grid_limit_kw} kW.\n"
                f"Danh sách xe đang sạc và công suất yêu cầu:\n"
                f"{json.dumps(active_requests, ensure_ascii=False)}\n\n"
                f"Yêu cầu:\n"
                f"1. Tổng công suất phân bổ không được vượt quá {heuristic_res.grid_limit_kw} kW.\n"
                f"2. Ưu tiên xe có SoC thấp hơn.\n"
                f"3. Trả về DUY NHẤT một chuỗi JSON hợp lệ không markdown với format:\n"
                f'{{"recommendations": ["chuỗi giải thích 1", "chuỗi giải thích 2"]}}\n'
            )

            async def _call_gemini():
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel(settings.AI_MODEL_NAME)
                response = await asyncio.to_thread(model.generate_content, prompt)
                return response.text

            raw_text = await asyncio.wait_for(_call_gemini(), timeout=5.0)
            cleaned_text = raw_text.strip().replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned_text)

            recommendations = parsed.get("recommendations", heuristic_res.recommendations)

            result = SmartChargingResponse(
                station_id=heuristic_res.station_id,
                grid_limit_kw=heuristic_res.grid_limit_kw,
                total_requested_kw=heuristic_res.total_requested_kw,
                total_allocated_kw=heuristic_res.total_allocated_kw,
                allocations=heuristic_res.allocations,
                recommendations=recommendations,
                source="GEMINI_AI",
                is_fallback=False,
            )
            latest_smart_charging_cache[station_id] = result
            return result

        except Exception as exc:
            logger.warning(f"Gemini Smart Charging gặp sự cố ({exc!r}), chuyển sang Heuristic Fallback.")
            latest_smart_charging_cache[station_id] = heuristic_res
            return heuristic_res

    @classmethod
    async def get_predictive_maintenance(
        cls,
        charger_id: int,
        charger_code: str,
        telemetry_history: List[Dict[str, Any]],
    ) -> PredictiveMaintenanceResponse:
        """Dự báo bảo trì trụ sạc: Thử gọi Gemini AI; nếu lỗi hoặc timeout 5s -> Heuristic."""
        heuristic_res = FallbackService.calculate_maintenance_heuristic(
            charger_id=charger_id,
            charger_code=charger_code,
            telemetry_history=telemetry_history,
        )

        if not cls._is_gemini_available() or not telemetry_history:
            return heuristic_res

        try:
            prompt = (
                f"Bạn là hệ thống AI dự báo bảo trì kỹ thuật trụ sạc xe điện (EV Predictive Maintenance).\n"
                f"Thiết bị: Charger ID={charger_id}, Mã={charger_code}.\n"
                f"Nhiệt độ đỉnh: {heuristic_res.max_temperature}°C, Nhiệt độ TB: {heuristic_res.avg_temperature}°C.\n"
                f"Độ ổn định điện áp: {heuristic_res.voltage_stability_pct}%.\n"
                f"Đánh giá Heuristic ban đầu: Mức độ rủi ro={heuristic_res.risk_level}, Điểm sức khỏe={heuristic_res.health_score}.\n\n"
                f"Yêu cầu:\n"
                f"Đưa ra khuyến nghị kỹ thuật chuyên sâu bằng tiếng Việt.\n"
                f"Trả về DUY NHẤT một chuỗi JSON hợp lệ không markdown với format:\n"
                f'{{"recommended_action": "hướng dẫn bảo trì cụ thể", "risk_level": "{heuristic_res.risk_level}"}}\n'
            )

            async def _call_gemini():
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel(settings.AI_MODEL_NAME)
                response = await asyncio.to_thread(model.generate_content, prompt)
                return response.text

            raw_text = await asyncio.wait_for(_call_gemini(), timeout=5.0)
            cleaned = raw_text.strip().replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)

            action = parsed.get("recommended_action", heuristic_res.recommended_action)

            return PredictiveMaintenanceResponse(
                charger_id=charger_id,
                charger_code=charger_code,
                risk_level=heuristic_res.risk_level,
                health_score=heuristic_res.health_score,
                thermal_trend=heuristic_res.thermal_trend,
                avg_temperature=heuristic_res.avg_temperature,
                max_temperature=heuristic_res.max_temperature,
                voltage_stability_pct=heuristic_res.voltage_stability_pct,
                recommended_action=action,
                source="GEMINI_AI",
                is_fallback=False,
            )

        except Exception as exc:
            logger.warning(f"Gemini Maintenance gặp sự cố ({exc!r}), chuyển sang Heuristic Fallback.")
            return heuristic_res

    @classmethod
    async def get_pricing_advice(
        cls,
        station_id: int,
        current_tariff_id: Optional[int],
        price_peak: float,
        price_normal: float,
        price_offpeak: float,
        occupancy_peak_pct: float,
        occupancy_offpeak_pct: float,
    ) -> PricingAdviceResponse:
        """Tư vấn tối ưu hóa biểu giá trạm sạc: Thử gọi Gemini AI; nếu lỗi -> Heuristic."""
        heuristic_res = FallbackService.calculate_pricing_advice_heuristic(
            station_id=station_id,
            current_tariff_id=current_tariff_id,
            price_peak=price_peak,
            price_normal=price_normal,
            price_offpeak=price_offpeak,
            occupancy_peak_pct=occupancy_peak_pct,
            occupancy_offpeak_pct=occupancy_offpeak_pct,
        )

        if not cls._is_gemini_available():
            return heuristic_res

        try:
            prompt = (
                f"Bạn là chuyên gia tư vấn chiến lược định giá doanh thu trạm sạc xe điện (Dynamic Pricing Advisor).\n"
                f"Trạm sạc ID={station_id}.\n"
                f"Biểu giá hiện tại (VND/kWh): Cao điểm={price_peak:,.0f}, Bình thường={price_normal:,.0f}, Thấp điểm={price_offpeak:,.0f}.\n"
                f"Tỷ lệ lấp đầy thực tế 7 ngày qua: Cao điểm={occupancy_peak_pct:.1f}%, Thấp điểm={occupancy_offpeak_pct:.1f}%.\n"
                f"Khuyến nghị Heuristic: {heuristic_res.reasoning}\n\n"
                f"Yêu cầu:\n"
                f"Đưa ra phân tích kinh tế ngắn gọn (tối đa 2 câu) giải thích lý do nên hoặc không nên đổi giá.\n"
                f"Trả về DUY NHẤT một chuỗi JSON hợp lệ không markdown với format:\n"
                f'{{"reasoning": "lời giải thích chuyên sâu"}}\n'
            )

            async def _call_gemini():
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel(settings.AI_MODEL_NAME)
                response = await asyncio.to_thread(model.generate_content, prompt)
                return response.text

            raw_text = await asyncio.wait_for(_call_gemini(), timeout=5.0)
            cleaned = raw_text.strip().replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)

            reasoning = parsed.get("reasoning", heuristic_res.reasoning)

            return PricingAdviceResponse(
                station_id=station_id,
                current_tariff_id=current_tariff_id,
                occupancy_peak_pct=heuristic_res.occupancy_peak_pct,
                occupancy_offpeak_pct=heuristic_res.occupancy_offpeak_pct,
                adjustments=heuristic_res.adjustments,
                reasoning=reasoning,
                source="GEMINI_AI",
                is_fallback=False,
            )

        except Exception as exc:
            logger.warning(f"Gemini Pricing Advice gặp sự cố ({exc!r}), chuyển sang Heuristic Fallback.")
            return heuristic_res

    @classmethod
    async def ask_advisor(
        cls,
        question: str,
        basic_stats: Dict[str, Any],
    ) -> AIAskResponse:
        """Hỏi đáp NLP tự do với AI: Sử dụng Gemini grounded dữ liệu thực tế từ DB; nếu lỗi -> Heuristic."""
        fallback_res = FallbackService.get_fallback_ai_ask(
            question=question,
            basic_stats=basic_stats,
        )

        if not cls._is_gemini_available():
            return fallback_res

        try:
            prompt = (
                f"Bạn là trợ lý AI thông minh quản lý hệ thống mạng lưới trạm sạc xe điện EV CSMS.\n"
                f"Dữ liệu vận hành thực tế hệ thống hiện tại:\n"
                f"- Doanh thu 7 ngày gần nhất: {basic_stats.get('revenue_7days', 0):,} VND\n"
                f"- Tổng số phiên sạc: {basic_stats.get('total_sessions', 0)}\n"
                f"- Tỷ lệ lấp đầy trạm trung bình: {basic_stats.get('avg_occupancy', 0)}%\n"
                f"- Số cảnh báo lỗi thiết bị cần bảo trì: {basic_stats.get('open_maintenance_alerts', 0)}\n\n"
                f"Câu hỏi của người quản trị: \"{question}\"\n\n"
                f"Quy tắc trả lời:\n"
                f"1. Trả lời trực tiếp, chính xác, súc tích bằng tiếng Việt.\n"
                f"2. Bám sát dữ liệu vận hành thực tế được cung cấp ở trên.\n"
                f"3. Đóng vai trò cố vấn chuyên nghiệp, không suy diễn thông tin tài chính sai lệch.\n"
            )

            async def _call_gemini():
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel(settings.AI_MODEL_NAME)
                response = await asyncio.to_thread(model.generate_content, prompt)
                return response.text

            raw_text = await asyncio.wait_for(_call_gemini(), timeout=5.0)

            return AIAskResponse(
                question=question,
                answer=raw_text.strip(),
                source="GEMINI_AI",
                is_fallback=False,
                basic_stats=basic_stats,
            )

        except Exception as exc:
            logger.warning(f"Gemini Ask gặp sự cố ({exc!r}), chuyển sang Heuristic Fallback.")
            return fallback_res
