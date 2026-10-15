import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_user,
    get_current_user_or_driver_guest,
    require_roles,
)
from app.core.config import settings
from app.core.database import get_db
from app.models.payment import TopupOrder
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.schemas.wallet import (
    AdminManualTopupRequest,
    AdminManualTopupResponse,
    PaginatedWalletTransactionsResponse,
    RevenueDayData,
    RevenueSummaryResponse,
    RevenueTimeframeStats,
    StandardizedWalletTransactionResponse,
    TopupOrderRejectRequest,
    TopupOrderResponse,
    TopupOrderReviewResponse,
    TopupOrderStatusResponse,
    TopupRequest,
    WalletReconciliationUnlockRequest,
    WalletResponse,
    WalletTransactionResponse,
)
from app.services.payment_service import build_payment_url
from app.services.station_service import get_accessible_station_ids
from app.services.wallet_service import (
    admin_manual_topup,
    topup_wallet,
    unlock_wallet_reconciliation,
)

router = APIRouter(prefix="/wallet", tags=["Ví điện tử & Giao dịch (Wallet)"])


@router.post(
    "/admin/topup",
    response_model=AdminManualTopupResponse,
    summary="Admin nạp tay vào ví tài xế (SCRUM-246, SCRUM-247, SCRUM-250)",
)
def manual_topup_by_admin(
    payload: AdminManualTopupRequest,
    request: Request,
    current_admin: User = Depends(require_roles(["ADMIN"])),
    db: Session = Depends(get_db),
):
    """
    S-36 (Admin nạp tay):
    - Chỉ người dùng có vai trò ADMIN mới được phép thực hiện (SCRUM-250, 401 nếu chưa login, 403 nếu không đủ quyền).
    - Khóa bi quan, nạp tiền và cập nhật số dư (SCRUM-246).
    - Chống nạp trùng qua mã phiếu thu (SCRUM-247, 409 Conflict).
    - Ghi audit log tự động (SCRUM-248).
    - Tạo bút toán sổ cái bất biến (SCRUM-249).
    """
    client_ip = request.client.host if request.client else None
    wallet, tx = admin_manual_topup(
        db=db,
        admin_id=current_admin.id,
        amount=payload.amount,
        receipt_code=payload.receipt_code,
        driver_id=payload.driver_id,
        wallet_id=payload.wallet_id,
        note=payload.note,
        client_ip=client_ip,
    )
    return AdminManualTopupResponse(
        transaction_id=tx.id,
        wallet_id=wallet.id,
        new_balance=wallet.balance,
        receipt_code=tx.receipt_code or "",
        created_at=tx.created_at,
    )


@router.get(
    "/balance",
    response_model=WalletResponse,
    summary="Xem số dư ví của tài xế đang đăng nhập (SCRUM-279, SCRUM-277)",
)
def get_driver_wallet_balance(
    driver_id: int | None = Query(
        None, description="Mã tài xế (nếu truyền khác token sẽ bị chặn 403)"
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    S-40 (SCRUM-279, SCRUM-277):
    - Chỉ tài xế đăng nhập mới xem được ví của chính mình (401 nếu chưa đăng nhập).
    - Chặn IDOR: nếu truyền driver_id khác với user hiện tại trong token -> trả 403 Forbidden.
    """
    if driver_id is not None and driver_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập ví của tài xế khác.",
        )

    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not wallet:
        wallet = Wallet(
            user_id=current_user.id, balance=Decimal("0.00"), is_debt_locked=False
        )
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet


@router.get(
    "/history",
    response_model=PaginatedWalletTransactionsResponse,
    summary="Xem lịch sử giao dịch ví phân trang 50 dòng (SCRUM-280, SCRUM-281)",
)
def get_driver_wallet_history(
    page: int = Query(1, ge=1, description="Số thứ tự trang (>= 1)"),
    driver_id: int | None = Query(
        None, description="Mã tài xế (nếu truyền khác token sẽ bị chặn 403)"
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    S-40 (SCRUM-280, SCRUM-281):
    - Chuẩn hóa dữ liệu: số tiền có dấu +/-, balance_after, reference_type + reference_id.
    - Không lộ thông tin nội bộ của admin (created_by_id).
    - Phân trang cố định đúng 50 dòng/trang (page size = 50).
    - Sắp xếp ổn định: created_at DESC, id DESC.
    """
    if driver_id is not None and driver_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập ví của tài xế khác.",
        )

    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not wallet:
        return PaginatedWalletTransactionsResponse(
            items=[],
            total=0,
            page=page,
            page_size=50,
            total_pages=0,
        )

    page_size = 50
    offset = (page - 1) * page_size

    query = db.query(WalletTransaction).filter(WalletTransaction.wallet_id == wallet.id)
    total = query.count()
    total_pages = math.ceil(total / page_size) if total > 0 else 0

    records = (
        query.order_by(WalletTransaction.created_at.desc(), WalletTransaction.id.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = [
        StandardizedWalletTransactionResponse(
            id=tx.id,
            transaction_type=tx.transaction_type,
            amount=tx.amount,
            balance_after=tx.balance_after,
            created_at=tx.created_at,
            note=tx.note,
            reference_type=tx.reference_type,
            reference_id=tx.receipt_code if tx.reference_type == "MANUAL_TOPUP" else tx.reference_id,
        )
        for tx in records
    ]

    return PaginatedWalletTransactionsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/me",
    response_model=WalletResponse,
    summary="Xem số dư ví điện tử và lịch sử biến động số dư của tôi (Tài xế không cần đăng nhập)",
)
def get_my_wallet(
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not wallet:
        # Tự động khởi tạo ví điện tử 0 VND nếu người dùng chưa có (Self-healing)
        wallet = Wallet(
            user_id=current_user.id, balance=Decimal("0.00"), is_debt_locked=False
        )
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet


@router.get(
    "/transactions",
    response_model=list[WalletTransactionResponse],
    summary="Xem danh sách lịch sử biến động số dư ví của tôi",
)
def get_my_wallet_transactions(
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not wallet:
        return []
    transactions = (
        db.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.id.desc())
        .limit(50)
        .all()
    )
    return transactions


@router.post(
    "/topup",
    response_model=WalletResponse,
    summary="Nạp tiền vào ví điện tử (Giao dịch ACID, hỗ trợ tài xế không cần đăng nhập)",
)
def topup_my_wallet(
    topup_in: TopupRequest,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """
    Nạp tiền vào ví:
    - Nếu có ghi tên người nạp (full_name), cập nhật vào hồ sơ người dùng.
    - Bắt đầu Transaction, khóa bi quan.
    - Tăng số dư, mở khóa nợ nếu số dư >= 0.
    - Lưu bản ghi WalletTransaction loại TOPUP.
    """
    if topup_in.full_name and topup_in.full_name.strip():
        current_user.full_name = topup_in.full_name.strip()
        db.add(current_user)
        db.commit()
        db.refresh(current_user)

    note_text = (
        topup_in.note
        or f"Nạp tiền ví chuyển khoản QR ({current_user.full_name or 'Tài xế'})"
    )

    wallet = topup_wallet(
        db=db,
        user_id=current_user.id,
        amount=topup_in.amount,
        note=note_text,
    )
    return wallet


@router.post(
    "/topup-requests",
    response_model=TopupOrderResponse,
    summary="Tạo giao dịch nạp tiền trạng thái chờ và chuyển hướng sang cổng sandbox",
)
def create_topup_request(
    topup_in: TopupRequest,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    amount_int = int(topup_in.amount)
    if amount_int < settings.TOPUP_MIN_AMOUNT or amount_int > settings.TOPUP_MAX_AMOUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount must be between {settings.TOPUP_MIN_AMOUNT} and {settings.TOPUP_MAX_AMOUNT}",
        )

    order_code = f"ORDER_{uuid.uuid4().hex[:8].upper()}"

    order = TopupOrder(
        user_id=current_user.id,
        order_code=order_code,
        amount=topup_in.amount,
        status="PENDING",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    redirect_url = build_payment_url(order_code=order_code, amount=amount_int)

    return TopupOrderResponse(order_id=order_code, redirect_url=redirect_url)


@router.get(
    "/topup-requests",
    response_model=list[TopupOrderStatusResponse],
    summary="Xem danh sách các giao dịch nạp tiền qua cổng Sandbox của tôi (SCRUM-245)",
)
def list_my_topup_requests(
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(TopupOrder)
        .filter(TopupOrder.user_id == current_user.id)
        .order_by(TopupOrder.created_at.desc(), TopupOrder.id.desc())
        .limit(20)
        .all()
    )
    return orders


@router.get(
    "/topup-requests/{order_code}",
    response_model=TopupOrderStatusResponse,
    summary="Polling kiểm tra trạng thái giao dịch nạp tiền",
)
def get_topup_request_status(
    order_code: str,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    order = db.query(TopupOrder).filter(TopupOrder.order_code == order_code).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Topup order not found"
        )

    # Phân quyền: Chỉ user tạo giao dịch mới được xem
    if order.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this order",
        )

    return order


@router.post(
    "/topup-requests/{order_code}/cancel",
    response_model=TopupOrderStatusResponse,
    summary="Hủy yêu cầu nạp tiền đang chờ duyệt",
)
def cancel_my_topup_request(
    order_code: str,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    order = db.query(TopupOrder).filter(TopupOrder.order_code == order_code).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Topup order not found"
        )
    if order.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this order",
        )
    if order.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel order with status {order.status}",
        )
    order.status = "CANCELLED"
    order.failure_reason = "Người dùng tự hủy yêu cầu nạp tiền"
    db.add(order)
    db.commit()
    db.refresh(order)
    return order



@router.post(
    "/admin/{wallet_id}/reconciliation/unlock",
    response_model=WalletResponse,
    summary="Admin mở khóa giao dịch ví sau khi xử lý lệch sổ cái",
)
def unlock_wallet_reconciliation_lock(
    wallet_id: int,
    request: WalletReconciliationUnlockRequest,
    current_user: User = Depends(require_roles(["ADMIN"])),
    db: Session = Depends(get_db),
):
    return unlock_wallet_reconciliation(
        db,
        wallet_id,
        admin_user_id=current_user.id,
        reason=request.reason,
    )


from app.api.v1.endpoints.payments import WebhookPayload, payment_webhook  # noqa: E402


@router.post("/webhook", summary="Webhook nạp ví từ cổng thanh toán (Alias)")
async def wallet_webhook(
    request: Request,
    payload: WebhookPayload,
    db: Session = Depends(get_db),
):
    return await payment_webhook(request=request, payload=payload, db=db)


@router.get(
    "/admin/pending-topups",
    response_model=list[TopupOrderReviewResponse],
    summary="Danh sách yêu cầu nạp tiền cần phê duyệt (Dành cho Admin, Chủ trạm CPO, Kế toán)",
)
def get_pending_topups_for_admin(
    status_filter: str | None = Query(
        None, description="Lọc trạng thái: ALL, PENDING, SUCCESS, FAILED"
    ),
    current_admin: User = Depends(
        require_roles(["ADMIN", "CPO", "ACCOUNTANT", "OPERATOR"])
    ),
    db: Session = Depends(get_db),
):
    query = (
        db.query(TopupOrder, User)
        .join(User, TopupOrder.user_id == User.id)
        .order_by(TopupOrder.created_at.desc(), TopupOrder.id.desc())
    )
    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(TopupOrder.status == status_filter.upper())

    results = query.limit(100).all()

    out = []
    for order, user in results:
        out.append(
            TopupOrderReviewResponse(
                id=order.id,
                user_id=order.user_id,
                username=user.username,
                full_name=user.full_name or user.username,
                email=user.email,
                order_code=order.order_code,
                amount=order.amount,
                status=order.status,
                failure_reason=order.failure_reason,
                created_at=order.created_at,
                updated_at=order.updated_at,
            )
        )
    return out


@router.post(
    "/admin/topup/{order_code}/approve",
    summary="Phê duyệt yêu cầu nạp tiền vào ví tài xế (Admin & Chủ trạm CPO)",
)
def approve_topup_order(
    order_code: str,
    current_admin: User = Depends(
        require_roles(["ADMIN", "CPO", "ACCOUNTANT", "OPERATOR"])
    ),
    db: Session = Depends(get_db),
):
    order = (
        db.query(TopupOrder)
        .filter(TopupOrder.order_code == order_code)
        .with_for_update()
        .first()
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn nạp tiền #{order_code}",
        )

    if order.status == "SUCCESS":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đơn nạp #{order_code} đã được phê duyệt trước đó.",
        )

    if order.status in ["FAILED", "CANCELLED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đơn nạp #{order_code} đã ở trạng thái kết thúc ({order.status}).",
        )

    order.status = "SUCCESS"
    order.failure_reason = None
    db.add(order)

    note = f"Phê duyệt nạp tiền #{order.order_code} bởi {current_admin.full_name or current_admin.username} ({current_admin.role})"
    wallet = topup_wallet(
        db=db,
        user_id=order.user_id,
        amount=order.amount,
        note=note,
        reference_id=order.order_code,
        reference_type="TOPUP",
        auto_commit=False,
    )
    db.commit()
    db.refresh(order)

    return {
        "status": "SUCCESS",
        "message": f"Đã phê duyệt thành công +{int(order.amount):,} VND cho tài xế.",
        "order_code": order.order_code,
        "new_balance": float(wallet.balance),
    }


@router.post(
    "/admin/topup/{order_code}/reject",
    summary="Từ chối yêu cầu nạp tiền (Admin & Chủ trạm CPO)",
)
def reject_topup_order(
    order_code: str,
    payload: TopupOrderRejectRequest,
    current_admin: User = Depends(
        require_roles(["ADMIN", "CPO", "ACCOUNTANT", "OPERATOR"])
    ),
    db: Session = Depends(get_db),
):
    order = (
        db.query(TopupOrder)
        .filter(TopupOrder.order_code == order_code)
        .with_for_update()
        .first()
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn nạp tiền #{order_code}",
        )

    if order.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chỉ có thể từ chối đơn hàng đang ở trạng thái chờ duyệt (PENDING). Đơn hiện tại là {order.status}.",
        )

    reason = (
        payload.reason.strip()
        or "Ban quản trị từ chối giao dịch do không nhận được sao kê hợp lệ."
    )
    order.status = "FAILED"
    order.failure_reason = reason
    db.add(order)
    db.commit()
    db.refresh(order)

    return {
        "status": "FAILED",
        "message": f"Đã từ chối đơn nạp tiền #{order.order_code}.",
        "order_code": order.order_code,
        "reason": reason,
    }


@router.get(
    "/admin/revenue-summary",
    response_model=RevenueSummaryResponse,
    summary="Tổng hợp doanh thu hôm nay, 7 ngày và 30 ngày (Dành cho Admin, Chủ trạm CPO, Kế toán)",
)
def get_revenue_summary_for_admin(
    current_user: User = Depends(
        require_roles(["ADMIN", "CPO", "ACCOUNTANT", "OPERATOR"])
    ),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    vn_now = now + timedelta(hours=7)
    vn_today_start = vn_now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start = vn_today_start - timedelta(hours=7)
    start_7d = now - timedelta(days=7)
    start_30d = now - timedelta(days=30)

    managed_stations = []
    scope = "ALL"

    # 1. Base query cho ChargingSession & Topup
    if current_user.role in ["OPERATOR", "CPO", "ACCOUNTANT"]:
        scope = "MANAGED"
        accessible_ids = get_accessible_station_ids(current_user, db)
        if accessible_ids:
            st_records = (
                db.query(Station.name)
                .filter(Station.id.in_(accessible_ids))
                .all()
            )
            managed_stations = [s[0] for s in st_records]

        if not accessible_ids:
            sessions_query = db.query(ChargingSession).filter(ChargingSession.id == -1)
        else:
            sessions_query = (
                db.query(ChargingSession)
                .join(ChargingSession.connector)
                .join(Connector.charging_point)
                .filter(ChargingPoint.station_id.in_(accessible_ids))
            )

        # Chủ trạm và Kế toán phụ trách trạm chỉ quản lý doanh thu trạm (sạc xe), không sở hữu nạp ví nền tảng của tài xế.
        all_30d_topups = []
    else:
        # ADMIN: toàn hệ thống
        scope = "ALL"
        sessions_query = db.query(ChargingSession)
        all_30d_topups = (
            db.query(TopupOrder)
            .filter(
                TopupOrder.status == "SUCCESS",
                TopupOrder.created_at >= start_30d,
            )
            .all()
        )

    # Lấy toàn bộ sessions trong 30 ngày qua
    all_30d_sessions = (
        sessions_query.filter(ChargingSession.start_time >= start_30d).all()
    )
    valid_sessions = [
        s
        for s in all_30d_sessions
        if s.status in ("COMPLETED", "ACTIVE", "CHARGING")
    ]

    def is_after(dt_val, threshold):
        if not dt_val:
            return False
        if dt_val.tzinfo is None:
            dt_val = dt_val.replace(tzinfo=timezone.utc)
        return dt_val >= threshold

    def to_vn_date(dt_val):
        if not dt_val:
            return None
        if dt_val.tzinfo is None:
            return (dt_val + timedelta(hours=7)).date()
        return (dt_val.astimezone(timezone(timedelta(hours=7)))).date()

    # Hôm nay
    sess_today = [s for s in valid_sessions if is_after(s.start_time, today_start)]
    topups_today = [t for t in all_30d_topups if is_after(t.created_at, today_start)]

    charging_today = sum(Decimal(str(s.total_amount or 0)) for s in sess_today)
    topup_today = sum(Decimal(str(t.amount or 0)) for t in topups_today)

    today_stats = RevenueTimeframeStats(
        charging_revenue=charging_today,
        topup_revenue=topup_today,
        total_revenue=charging_today + topup_today,
        session_count=len(sess_today),
        topup_count=len(topups_today),
    )

    # 7 ngày
    sess_7d = [s for s in valid_sessions if is_after(s.start_time, start_7d)]
    topups_7d = [t for t in all_30d_topups if is_after(t.created_at, start_7d)]

    charging_7d = sum(Decimal(str(s.total_amount or 0)) for s in sess_7d)
    topup_7d = sum(Decimal(str(t.amount or 0)) for t in topups_7d)

    stats_7d = RevenueTimeframeStats(
        charging_revenue=charging_7d,
        topup_revenue=topup_7d,
        total_revenue=charging_7d + topup_7d,
        session_count=len(sess_7d),
        topup_count=len(topups_7d),
    )

    # 30 ngày
    charging_30d = sum(Decimal(str(s.total_amount or 0)) for s in valid_sessions)
    topup_30d = sum(Decimal(str(t.amount or 0)) for t in all_30d_topups)

    stats_30d = RevenueTimeframeStats(
        charging_revenue=charging_30d,
        topup_revenue=topup_30d,
        total_revenue=charging_30d + topup_30d,
        session_count=len(valid_sessions),
        topup_count=len(all_30d_topups),
    )

    # Dữ liệu biểu đồ 7 ngày
    chart_7d = []
    for i in range(6, -1, -1):
        day_date = (vn_now - timedelta(days=i)).date()
        day_label = day_date.strftime("%d/%m")
        day_sess = [s for s in valid_sessions if to_vn_date(s.start_time) == day_date]
        day_topups = [t for t in all_30d_topups if to_vn_date(t.created_at) == day_date]
        c_rev = sum(Decimal(str(s.total_amount or 0)) for s in day_sess)
        t_rev = sum(Decimal(str(t.amount or 0)) for t in day_topups)
        chart_7d.append(
            RevenueDayData(
                date=day_date.isoformat(),
                label=day_label,
                charging_revenue=c_rev,
                topup_revenue=t_rev,
                total_revenue=c_rev + t_rev,
            )
        )

    # Dữ liệu biểu đồ 30 ngày
    chart_30d = []
    for i in range(29, -1, -1):
        day_date = (vn_now - timedelta(days=i)).date()
        day_label = day_date.strftime("%d/%m")
        day_sess = [s for s in valid_sessions if to_vn_date(s.start_time) == day_date]
        day_topups = [t for t in all_30d_topups if to_vn_date(t.created_at) == day_date]
        c_rev = sum(Decimal(str(s.total_amount or 0)) for s in day_sess)
        t_rev = sum(Decimal(str(t.amount or 0)) for t in day_topups)
        chart_30d.append(
            RevenueDayData(
                date=day_date.isoformat(),
                label=day_label,
                charging_revenue=c_rev,
                topup_revenue=t_rev,
                total_revenue=c_rev + t_rev,
            )
        )

    return RevenueSummaryResponse(
        today=today_stats,
        last_7_days=stats_7d,
        last_30_days=stats_30d,
        chart_7d=chart_7d,
        chart_30d=chart_30d,
        currency="VND",
        managed_stations=managed_stations,
        scope=scope,
    )