FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
RUN uv pip install --system --no-cache \
    "google-genai>=2.30.1" \
    "fastapi>=0.115.0" \
    "uvicorn[standard]>=0.30.0" \
    "pydantic>=2.9.0" \
    "websockets>=13.0" \
    "httpx>=0.27.0" \
    "python-dotenv>=1.0.1"

COPY app ./app
COPY data ./data
COPY static ./static
COPY scripts ./scripts

EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
