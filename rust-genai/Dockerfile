# Build stage
FROM rust:1.90 AS builder
WORKDIR /usr/src/rust-genai
# Create blank project
RUN cargo new --bin rust-genai
WORKDIR /usr/src/rust-genai/rust-genai
# Copy manifests
COPY Cargo.toml ./
# Copy source code
COPY src ./src
# Build for release
RUN cargo build --release

# Final stage
FROM debian:bookworm-slim
WORKDIR /app
# Install curl for healthcheck and ca-certificates for HTTPS
RUN apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd -m nomadicmehul
COPY --from=builder /usr/src/rust-genai/rust-genai/target/release/rust-genai .
COPY static/ ./static/
COPY templates/ ./templates/
EXPOSE 8083
USER nomadicmehul
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8083/health || exit 1
CMD ["./rust-genai"]
