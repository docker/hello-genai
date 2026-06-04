FROM node:20-alpine

# curl is required by the docker-compose healthcheck (not present in node:alpine)
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
COPY .npmrc .
RUN npm install

# Copy application code
COPY . .

# Create directories if they don't exist
RUN mkdir -p views

# Expose port 8080
EXPOSE 8080

# Run the application
CMD ["node", "app.js"]