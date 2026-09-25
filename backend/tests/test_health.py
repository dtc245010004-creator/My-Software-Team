def test_health_check(client):
    """Kiểm tra endpoint /api/v1/health trả về status healthy và kết nối CSDL thành công."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
