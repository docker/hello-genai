FROM python:3.13-slim AS builder

WORKDIR /app

# Latest pip/setuptools/wheel — the versions bundled with the base image carry
# known CVEs (and setuptools vendors an old wheel)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.13-slim

WORKDIR /app

# Apply Debian security updates; no extra packages installed (the healthcheck
# uses Python's stdlib, so curl is not needed)
RUN apt-get update \
    && apt-get dist-upgrade -y --no-install-recommends \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Same pip/setuptools/wheel upgrade as the builder so stale, vulnerable
# dist-info metadata from the base image doesn't linger in site-packages
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

RUN adduser --disabled-password --gecos "" nomadicmehul

# Drop packages the running app never uses. perl-base (used only by adduser
# above) and tar carry unpatched CVEs in the current Debian release; nothing at
# runtime needs them, so remove them outright rather than wait for fixes.
RUN dpkg --purge --force-remove-essential --force-depends perl-base tar \
    && rm -rf /var/lib/dpkg/info/perl-base.* /var/lib/dpkg/info/tar.*

COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
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

# Deep healthcheck via stdlib (urlopen raises on the 503 the app returns when
# the configured model isn't loaded, so the container reports unhealthy).
# Generous start period covers model warm-up.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8081/health?deep=1', timeout=8)"]

CMD ["python", "app.py"]
