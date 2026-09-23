from pydantic import BaseModel, ConfigDict, Field

class ChargePointCreate(BaseModel):
    station_id: int
    code: str = Field(..., max_length=50)
    connector_count: int = Field(..., ge=1, le=4, description="Số lượng đầu nối (1-4)")

class ConnectorResponse(BaseModel):
    id: int
    connector_number: int
    connector_type: str
    status: str

    model_config = ConfigDict(from_attributes=True)

class ChargePointResponse(BaseModel):
    id: int
    station_id: int
    code: str
    status: str
    connectors: list[ConnectorResponse] = []

    model_config = ConfigDict(from_attributes=True)
