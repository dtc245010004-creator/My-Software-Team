import math
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_user,
    get_current_user_or_driver_guest,
    require_roles,
)
from app.core.database import get_db
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.schemas.wallet import (
    AdminManualTopupRequest,
    AdminManualTopupResponse,
    PaginatedWalletTransactionsResponse,
    StandardizedWalletTransactionResponse,
    TopupRequest,
    WalletResponse,
    WalletTransactionResponse,
)
from app.services.wallet_service import admin_manual_topup, topup_wallet

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
