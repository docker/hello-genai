# Alpine (musl) base — perl-free, so it carries none of the unfixable Debian
# perl advisories; all deps resolve from musllinux wheels. Scout: 0 CVEs.
FROM python:3.12-alpine

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Apply outstanding Alpine security patches to the base image
RUN apk upgrade --no-cache

RUN pip install --no-cache-dir --upgrade pip setuptools wheel

COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

# Ship Alembic so `alembic upgrade head` / `revision` work inside the container
COPY alembic.ini ./
COPY alembic ./alembic

RUN adduser -D app && chown -R app /app
USER app

EXPOSE 8000

# API default; worker/beat/flower override the command in docker-compose
CMD ["uvicorn", "genai.main:app", "--host", "0.0.0.0", "--port", "8000"]
