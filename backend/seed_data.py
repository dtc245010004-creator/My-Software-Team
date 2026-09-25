import os
import sys
import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal

# Đảm bảo đường dẫn import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Cấu hình UTF-8 cho stdout trên Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.core.database import SessionLocal, engine, Base
from app.core.security import get_password_hash
import app.models  # noqa: F401
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.models.station import Station, ChargingPoint, Connector
from app.models.tariff import Tariff
from app.models.session import ChargingSession


def seed_database():
    """Script nạp dữ liệu mẫu chân thực, toàn diện phục vụ demo đồ án và bảo vệ trước hội đồng."""
    print("==================================================================")
    print("   KHỞI TẠO DỮ LIỆU MẪU CHUẨN EV CSMS (SEED DATA INITIALIZATION)   ")
    print("==================================================================")

    # 1. Dọn dẹp schema và bảng cũ để đồng bộ cấu trúc mới nhất (hỗ trợ nợ ví -1.000.000đ)
    print("[-] Đang làm sạch và tái tạo schema CSDL...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:

        # 2. Tạo Tài khoản người dùng (RBAC)
        print("[+] Đang tạo tài khoản người dùng theo chuẩn phân quyền (RBAC)...")
        users_to_create = [
            # Quản trị viên
            User(
                username="admin",
                email="admin@evcsms.vn",
                full_name="Quản Trị Viên Hệ Thống",
                password_hash=get_password_hash("AdminPass123"),
                role="ADMIN",
                is_active=True,
            ),
            # Đơn vị vận hành CPO
            User(
                username="operator",
                email="operator@evcsms.vn",
                full_name="Đơn Vị Vận Hành CPO Trung Tâm",
                password_hash=get_password_hash("OpPass123"),
                role="OPERATOR",
                is_active=True,
            ),
            User(
                username="operator_a",
                email="cpo_vinfast@evcsms.vn",
                full_name="CPO Mạng Lưới Trạm Sạc VinFast",
                password_hash=get_password_hash("OpPass123"),
                role="OPERATOR",
                is_active=True,
            ),
            # Khách hàng tài xế
            User(
                username="customer_user",
                email="driver1@gmail.com",
                full_name="Nguyễn Văn Tài (Tài xế VF8)",
                password_hash=get_password_hash("CusPass123"),
                role="CUSTOMER",
                is_active=True,
            ),
            User(
                username="driver_vip",
                email="driver_vip@gmail.com",
                full_name="Trần Thị Bích Ngọc (Tài xế VF9)",
                password_hash=get_password_hash("DriverPass123"),
                role="CUSTOMER",
                is_active=True,
            ),
            User(
                username="driver_debt",
                email="driver_debt@gmail.com",
                full_name="Lê Hoàng Nam (Tài xế VF5 - Đang nợ)",
                password_hash=get_password_hash("DriverPass123"),
                role="CUSTOMER",
                is_active=True,
            ),
        ]

        # Thêm 5 tài xế taxi điện phụ
        for i in range(1, 6):
            users_to_create.append(
                User(
                    username=f"taxi_driver_{i}",
                    email=f"taxi{i}@green-sm.vn",
                    full_name=f"Tài Xế Taxi Xanh SM #{i}",
                    password_hash=get_password_hash("Pass1234"),
                    role="CUSTOMER",
                    is_active=True,
                )
            )

        db.add_all(users_to_create)
        db.commit()

        # 3. Tạo Ví tiền điện tử (ACID Wallets)
        print("[+] Đang tạo ví tiền điện tử và nạp số dư ban đầu...")
        wallets_map = {}
        for u in users_to_create:
            if u.role == "CUSTOMER":
                if u.username == "customer_user":
                    init_balance = Decimal("250000.00")
                    is_locked = False
                elif u.username == "driver_vip":
                    init_balance = Decimal("1500000.00")
                    is_locked = False
                elif u.username == "driver_debt":
                    init_balance = Decimal("-120000.00")  # Cho nợ hợp lệ trong hạn mức -300k
                    is_locked = True
                else:
                    init_balance = Decimal(str(random.choice([150000, 300000, 450000])))
                    is_locked = False

                w = Wallet(user_id=u.id, balance=init_balance, is_debt_locked=is_locked)
                db.add(w)
                db.commit()
                wallets_map[u.id] = w

                # Ghi lịch sử giao dịch ban đầu
                if init_balance > 0:
                    tx = WalletTransaction(
                        wallet_id=w.id,
                        transaction_type="TOPUP",
                        amount=init_balance,
                        balance_after=init_balance,
                        note="Nạp số dư ban đầu qua cổng thanh toán VNPay",
                    )
                    db.add(tx)
                elif init_balance < 0:
                    tx = WalletTransaction(
                        wallet_id=w.id,
                        transaction_type="CHARGE_FEE",
                        amount=init_balance,
                        balance_after=init_balance,
                        note="Trừ cước sạc phiên trước (Ghi nợ hợp lệ)",
                    )
                    db.add(tx)
        db.commit()

        # 4. Tạo Hạ tầng Trạm sạc (3 trạm lớn Hà Nội, Đà Nẵng, TP.HCM)
        print("[+] Đang tạo hạ tầng 3 trạm sạc chiến lược (Hà Nội, Đà Nẵng, TP.HCM)...")
        cpo_op = next(u for u in users_to_create if u.username == "operator_a")

        st_hanoi = Station(
            operator_id=cpo_op.id,
            name="Trạm Sạc Vincom Center Metropolis",
            address="29 Liễu Giai, Ba Đình, Hà Nội",
            latitude=21.0313,
            longitude=105.8152,
            total_grid_capacity_kw=250.0,
            operating_hours="24/7",
            status="ACTIVE",
            is_active=True,
        )
        st_danang = Station(
            operator_id=cpo_op.id,
            name="Trạm Sạc Cầu Rồng - Sơn Trà",
            address="Võ Văn Kiệt, P. An Hải Bắc, Sơn Trà, Đà Nẵng",
            latitude=16.0601,
            longitude=108.2272,
            total_grid_capacity_kw=180.0,
            operating_hours="24/7",
            status="ACTIVE",
            is_active=True,
        )
        st_hcm = Station(
            operator_id=cpo_op.id,
            name="Trạm Sạc Landmark 81 - Central Park",
            address="720A Điện Biên Phủ, P. 22, Bình Thạnh, TP.HCM",
            latitude=10.7950,
            longitude=106.7218,
            total_grid_capacity_kw=300.0,
            operating_hours="24/7",
            status="ACTIVE",
            is_active=True,
        )
        db.add_all([st_hanoi, st_danang, st_hcm])
        db.commit()

        # 5. Tạo Biểu giá TOU (Time-of-Use)
        print("[+] Đang tạo biểu giá TOU linh hoạt theo khung giờ...")
        default_tariff = Tariff(
            station_id=None,  # Áp dụng chung toàn hệ thống
            name="Biểu Giá Điện TOU Chuẩn EV CSMS 2026",
            price_normal=Decimal("3200.00"),
            price_peak=Decimal("4500.00"),
            price_offpeak=Decimal("1800.00"),
            peak_start="09:30",
            peak_end="11:30",
            peak_start_2="17:00",
            peak_end_2="20:00",
            offpeak_start="22:00",
            offpeak_end="04:00",
            is_active=True,
        )
        db.add(default_tariff)
        db.commit()

        # 6. Tạo Trụ sạc (Charging Points) & Cổng sạc (Connectors)
        print("[+] Đang cấu hình các trụ sạc EVSE (AC 22kW, DC 60kW, DC 150kW, DC 300kW)...")
        stations_list = [st_hcm, st_hanoi, st_danang]
        all_connectors = []

        for st in stations_list:
            # Trụ 1: Siêu nhanh DC 150kW (Dual CCS2)
            cp1 = ChargingPoint(
                station_id=st.id,
                code=f"EVSE-{st.id}-01",
                vendor="ABB Terra HP",
                model="Terra-154-UL",
                max_power_kw=150.0,
                status="AVAILABLE",
                power_sharing_enabled=True,
                is_active=True,
            )
            # Trụ 2: Nhanh DC 60kW (CCS2 + Type 2)
            cp2 = ChargingPoint(
                station_id=st.id,
                code=f"EVSE-{st.id}-02",
                vendor="VinFast Power",
                model="VF-DC-60",
                max_power_kw=60.0,
                status="AVAILABLE",
                power_sharing_enabled=True,
                is_active=True,
            )
            # Trụ 3: Tiêu chuẩn AC 22kW (Dual Type 2)
            cp3 = ChargingPoint(
                station_id=st.id,
                code=f"EVSE-{st.id}-03",
                vendor="Schneider Electric",
                model="EVlink Pro AC",
                max_power_kw=22.0,
                status="AVAILABLE",
                power_sharing_enabled=False,
                is_active=True,
            )
            db.add_all([cp1, cp2, cp3])
            db.commit()

            # Thêm cổng sạc cho từng trụ
            conn_defs = [
                # Trụ 1: 2 súng CCS2
                (cp1.id, 1, "CCS2", 150.0),
                (cp1.id, 2, "CCS2", 150.0),
                # Trụ 2: 1 súng CCS2, 1 súng Type 2
                (cp2.id, 1, "CCS2", 60.0),
                (cp2.id, 2, "TYPE_2", 22.0),
                # Trụ 3: 2 súng Type 2
                (cp3.id, 1, "TYPE_2", 22.0),
                (cp3.id, 2, "TYPE_2", 22.0),
            ]

            for cp_id, num, c_type, p_max in conn_defs:
                c = Connector(
                    charging_point_id=cp_id,
                    connector_number=num,
                    connector_type=c_type,
                    max_power_kw=p_max,
                    status="AVAILABLE",
                    is_active=True,
                )
                db.add(c)
                all_connectors.append(c)

        db.commit()

        # 7. Tạo Lịch sử 60+ Phiên sạc phân bố trong 30 ngày qua
        print("[+] Đang sinh 60+ phiên sạc lịch sử phân bố chân thực trong 30 ngày...")
        now = datetime.now(timezone.utc)
        drivers_list = [u for u in users_to_create if u.role == "CUSTOMER"]

        sessions_created = 0
        for day_offset in range(30, 0, -1):
            day_time = now - timedelta(days=day_offset)
            # Mỗi ngày sinh 2 phiên sạc
            for _ in range(2):
                driver = random.choice(drivers_list)
                connector = random.choice(all_connectors)

                # Chọn khung giờ ngẫu nhiên trong ngày
                hour = random.choice([8, 10, 14, 18, 20, 23])
                sess_start = day_time.replace(hour=hour, minute=random.randint(0, 50))
                duration_minutes = random.randint(25, 75)
                sess_end = sess_start + timedelta(minutes=duration_minutes)

                # Đơn giá theo khung giờ
                if hour in [10, 18, 20]:
                    applied_price = Decimal("4500.00")  # Peak
                elif hour in [23]:
                    applied_price = Decimal("1800.00")  # Offpeak
                else:
                    applied_price = Decimal("3200.00")  # Normal

                kwh = Decimal(str(round(random.uniform(15.0, 55.0), 2)))
                amount = Decimal(str(round(kwh * applied_price, 2)))

                sess = ChargingSession(
                    user_id=driver.id,
                    connector_id=connector.id,
                    tariff_id=default_tariff.id,
                    applied_price_per_kwh=applied_price,
                    start_time=sess_start,
                    end_time=sess_end,
                    meter_start_kwh=Decimal("0.00"),
                    meter_stop_kwh=kwh,
                    total_kwh=kwh,
                    total_amount=amount,
                    current_soc=100.0,
                    status="COMPLETED",
                    stop_reason="BATTERY_FULL" if random.random() > 0.3 else "USER_STOPPED",
                    created_at=sess_start,
                )
                db.add(sess)
                sessions_created += 1

        db.commit()

        # 8. Tạo 2 Phiên sạc ĐANG HOẠT ĐỘNG (ACTIVE) để demo realtime tức thì
        print("[+] Đang tạo 2 phiên sạc ACTIVE để kiểm tra đồ thị và phụ tải trực tiếp...")
        active_driver_1 = next(u for u in users_to_create if u.username == "customer_user")
        active_driver_2 = next(u for u in users_to_create if u.username == "driver_vip")

        active_conn_1 = all_connectors[0]  # Súng 1 trụ 1 Landmark 81
        active_conn_2 = all_connectors[2]  # Súng 1 trụ 2 Landmark 81

        active_conn_1.status = "CHARGING"
        active_conn_2.status = "CHARGING"
        active_conn_1.charging_point.status = "CHARGING"
        active_conn_2.charging_point.status = "CHARGING"

        active_sess_1 = ChargingSession(
            user_id=active_driver_1.id,
            connector_id=active_conn_1.id,
            tariff_id=default_tariff.id,
            applied_price_per_kwh=Decimal("4500.00"),
            start_time=now - timedelta(minutes=15),
            meter_start_kwh=Decimal("0.00"),
            total_kwh=Decimal("14.50"),
            total_amount=Decimal("65250.00"),
            current_soc=62.5,
            status="ACTIVE",
            created_at=now - timedelta(minutes=15),
        )
        active_sess_2 = ChargingSession(
            user_id=active_driver_2.id,
            connector_id=active_conn_2.id,
            tariff_id=default_tariff.id,
            applied_price_per_kwh=Decimal("4500.00"),
            start_time=now - timedelta(minutes=8),
            meter_start_kwh=Decimal("0.00"),
            total_kwh=Decimal("8.20"),
            total_amount=Decimal("36900.00"),
            current_soc=45.0,
            status="ACTIVE",
            created_at=now - timedelta(minutes=8),
        )
        db.add_all([active_sess_1, active_sess_2])
        db.commit()

        print("==================================================================")
        print("          NẠP DỮ LIỆU MẪU THÀNH CÔNG RỰC RỠ (SUCCESS)!            ")
        print("==================================================================")
        print(f"[*] Tổng số người dùng: {len(users_to_create)} (Admin, CPO, Drivers)")
        print(f"[*] Tổng số trạm sạc:   {len(stations_list)} (Hà Nội, Đà Nẵng, TP.HCM)")
        print(f"[*] Tổng số trụ sạc:    9 trụ EVSE")
        print(f"[*] Tổng số cổng sạc:   18 cổng sạc vật lý (CCS2, Type 2)")
        print(f"[*] Tổng phiên sạc:     {sessions_created + 2} phiên ({sessions_created} hoàn thành, 2 đang sạc)")
        print("------------------------------------------------------------------")
        print("THÔNG TIN TÀI KHOẢN ĐĂNG NHẬP NHANH:")
        print("1. Quản trị viên:    admin / AdminPass123")
        print("2. Đơn vị CPO:       operator_a / OpPass123 (hoặc operator / OpPass123)")
        print("3. Khách hàng lái xe: customer_user / CusPass123 (Ví có sẵn 250,000 đ)")
        print("4. Khách hàng VIP:   driver_vip / DriverPass123 (Ví có sẵn 1,500,000 đ)")
        print("5. Khách nợ tiền:    driver_debt / DriverPass123 (Số dư -120,000 đ)")
        print("==================================================================")

    except Exception as exc:
        db.rollback()
        print(f"[!] Lỗi nạp dữ liệu: {exc}")
        raise exc
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
