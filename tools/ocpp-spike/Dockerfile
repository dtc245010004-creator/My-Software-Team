FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend

WORKDIR /app
RUN pip install --no-cache-dir sqlalchemy psycopg2-binary pydantic-settings websockets pytest
COPY backend/app /app/backend/app
COPY tools/ocpp-spike /app/simulator

CMD ["python", "/app/simulator/run_simulator.py"]
