FROM python:3.12-slim

# Thiết lập biến môi trường chạy Python tối ưu
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Cài đặt các gói phụ thuộc hệ thống tối thiểu nếu cần
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt dependencies Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Sao chép mã nguồn ứng dụng
COPY . .

# Mở cổng 8000
EXPOSE 8000

# Khởi chạy server FastAPI uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
