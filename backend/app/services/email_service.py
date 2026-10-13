"""Dịch vụ gửi email cảnh báo qua SMTP (SCRUM-319)."""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger("ev_csms.email")


def send_alert_email(
    to_emails: list[str],
    subject: str,
    content_html: str,
    content_text: str | None = None,
) -> bool:
    """Gửi email cảnh báo qua SMTP cấu hình từ biến môi trường.

    - Nếu SMTP_HOST rỗng (chưa cấu hình / môi trường test): Ghi log giả lập và trả về True.
    - Nếu SMTP_HOST có giá trị: Kết nối SMTP server, xác thực và gửi thư an toàn.
    - Không làm crash tiến trình gọi nếu gửi email thất bại.
    """
    valid_recipients = [e.strip() for e in to_emails if e and e.strip()]
    if not valid_recipients:
        logger.warning("Không có địa chỉ email người nhận hợp lệ.")
        return False

    if not settings.SMTP_HOST:
        logger.info(
            "[SMTP_MOCK] Đã gửi email cảnh báo tới %s: '%s'",
            valid_recipients,
            subject,
        )
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.ALERT_EMAIL_FROM
        msg["To"] = ", ".join(valid_recipients)

        text_part = MIMEText(content_text or content_html, "plain", "utf-8")
        html_part = MIMEText(content_html, "html", "utf-8")
        msg.attach(text_part)
        msg.attach(html_part)

        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10.0)
        try:
            if settings.SMTP_TLS:
                server.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.ALERT_EMAIL_FROM, valid_recipients, msg.as_string())
            logger.info(
                "Đã gửi email cảnh báo thành công qua SMTP tới %s", valid_recipients
            )
            return True
        finally:
            server.quit()
    except (smtplib.SMTPException, OSError, TimeoutError) as exc:
        logger.warning(
            "Lỗi khi gửi email cảnh báo qua SMTP (%s:%s): %s",
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            exc,
        )
        return False
