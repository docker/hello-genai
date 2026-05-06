# Improved Hello-GenAI Go Application

A Go-powered GenAI app you can run locally using your favorite LLM — just follow the guide to get started.

## Features

- **Structured Responses**: Markdown formatting for better readability
- **Environment Variable Validation**: Proper validation with sensible defaults
- **Caching**: In-memory response caching with TTL
- **Rate Limiting**: Based on client IP address
- **Health Check Endpoint**: Detailed system information for monitoring and orchestration
- **API Documentation**: Swagger UI for exploring and testing the API
- **Security Headers**: Protection against common web vulnerabilities
- **Dark Mode**: User preference saved in localStorage
- **Responsive Design**: Works well on mobile devices
- **Improved Error Handling**: Better error messages and logging

## Environment Variables

### Docker Desktop AI Integration (Recommended)
When using Docker Desktop with AI models:
- `LLAMA_URL`: Automatically injected by Docker Desktop (AI model endpoint)
- `LLAMA_MODEL`: Automatically injected by Docker Desktop (model name)
- `PORT`: The port to run the server on (default: 8080)
- `LOG_LEVEL`: The logging level (default: INFO)

## API Endpoints

- `GET /`: Main chat interface
- `POST /api/chat`: Chat API endpoint
- `GET /health`: Health check endpoint with detailed system information
- `GET /example`: Example of structured formatting
- `GET /api/docs`: Swagger UI for API documentation

## Running the Application

### Using Docker

```bash
docker build -t hello-genai-go .
docker run -p 8080:8080 -e LLM_BASE_URL=http://your-llm-api -e LLM_MODEL_NAME=your-model hello-genai-go
```

### Without Docker

```bash
go mod download
go run main.go
```

## Troubleshooting

### API Documentation Not Loading

If the API documentation at `/api/docs` is not loading:

1. Check if the Swagger UI is accessible at `/api/docs`
2. Verify that the Swagger JSON file is accessible at `/static/swagger.json`
3. Check browser console for any JavaScript errors

### Health Endpoint Not Working

If the health endpoint at `/health` is not returning data:

1. Check if the endpoint is accessible
2. Verify that the response is valid JSON
3. Check server logs for any errors

### Static Files Not Loading

If static files are not loading:

1. Check if the test page is accessible at `/static/test.html` [Add the test.html file if its missing]
2. Verify that the static directory is properly mounted in Docker
3. Check file permissions in the static directory

## Development

To run the application in development mode:

```bash
export LLM_BASE_URL=http://your-llm-api
export LLM_MODEL_NAME=your-model
go run main.go
```
