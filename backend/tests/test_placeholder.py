"""Placeholder test — đảm bảo pytest luôn có ít nhất 1 test thực thi
ngay cả khi các test khác bị skip do thiếu DB hoặc service."""


def test_backend_package_importable():
    """Kiểm tra thư mục app tồn tại và có thể import được."""
    import importlib

    mod = importlib.import_module("app")
    assert mod is not None
