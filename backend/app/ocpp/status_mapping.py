def map_ocpp_to_internal(status: str) -> str:
    mapping = {
        "Available": "AVAILABLE",
        "Preparing": "OCCUPIED",
        "Charging": "OCCUPIED",
        "SuspendedEVSE": "OCCUPIED",
        "SuspendedEV": "OCCUPIED",
        "Finishing": "OCCUPIED",
        "Reserved": "RESERVED",
        "Faulted": "FAULTED",
        "Unavailable": "FAULTED"
    }
    return mapping.get(status, "UNKNOWN")
