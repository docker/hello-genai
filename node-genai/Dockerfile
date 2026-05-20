FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Create directories if they don't exist
RUN mkdir -p views

# Expose port 8080
EXPOSE 8080

# Run the application
CMD ["node", "app.js"]