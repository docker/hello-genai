FROM python:3.11-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

RUN adduser --disabled-password --gecos "" nomadicmehul

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

RUN mkdir -p templates static/css static/js static/images routes services data \
    && chown -R nomadicmehul:nomadicmehul /app

COPY app.py config.py extensions.py requirements.txt ./
COPY routes/ routes/
COPY services/ services/
COPY templates/ templates/
COPY static/ static/

USER nomadicmehul

EXPOSE 8081

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Deep healthcheck: reports unhealthy (HTTP 503) unless the configured model is
# actually loaded on the backend. Generous start period covers model warm-up.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f "http://localhost:8081/health?deep=1" || exit 1

CMD ["python", "app.py"]
