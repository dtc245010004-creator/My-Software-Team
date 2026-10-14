"""EV CSMS Backend Application Package."""

import os
import sys

# Đảm bảo standard library và site-packages không bị mất nếu sys.path bị ghi đè cục bộ
for _prefix in dict.fromkeys([sys.prefix, sys.base_prefix]):
    for _sub in ("Lib", "Lib/site-packages", "lib", "lib/site-packages", "DLLs"):
        _p = os.path.join(_prefix, _sub)
        if os.path.exists(_p) and _p not in sys.path:
            sys.path.append(_p)

# Hỗ trợ cả 2 ngữ cảnh import: import backend.app... và import app...
if __name__ == "backend.app" and "app" not in sys.modules:
    sys.modules["app"] = sys.modules[__name__]

__version__ = "1.0.0"
