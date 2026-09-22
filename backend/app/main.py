from fastapi import FastAPI

app = FastAPI(title="CSMS Backend")


@app.get("/")
def health_check():
    """Trang chủ dùng làm health check khi triển khai staging (T-03)."""
    return {"status": "ok", "service": "csms-backend"}
