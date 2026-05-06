# Build stage
FROM golang:1.20-alpine AS builder

WORKDIR /app

# Install git for dependency fetching
RUN apk add --no-cache git

# Copy go.mod first
COPY go.mod ./

# Initialize the module and download dependencies
RUN go mod tidy && go mod download

# Copy the source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Final stage
FROM alpine:3.18

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user
RUN adduser -D -g '' nomadicmehul

# Copy the binary from builder stage
COPY --from=builder /app/main .

# Copy static files and templates
COPY static/ ./static/
COPY templates/ ./templates/

# Set ownership
RUN chown -R nomadicmehul:nomadicmehul /app

# Switch to non-root user
USER nomadicmehul

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Run the application
CMD ["./main"]
