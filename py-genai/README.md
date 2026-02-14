# Python GenAI Application

A Python-powered GenAI app you can run locally using your favorite LLM — just follow the guide to get started.

## Environment Variables

The application uses the following environment variables:

### Docker Desktop AI Integration (Recommended)
When using Docker Desktop with AI models:
- `LLAMA_URL`: Automatically injected by Docker Desktop (AI model endpoint)
- `LLAMA_MODEL`: Automatically injected by Docker Desktop (model name)
- `PORT`: The port to run the application on (default: 8081 for local, 8080 in Docker)
- `LOG_LEVEL`: Set the logging level (default: "INFO")
- `DEBUG`: Set to "true" to enable debug mode (default: "false")

### Legacy Configuration
For custom LLM endpoints:
- `LLM_BASE_URL`: The base URL of the LLM API (fallback if LLAMA_URL not set)
- `LLM_MODEL_NAME`: The model name to use (fallback if LLAMA_MODEL not set)

## API Endpoints

- `GET /`: Web interface for the chat application
- `POST /api/chat`: Send a message to the AI and get a response
- `GET /health`: Health check endpoint
- `GET /api/docs`: API documentation

## Running the Application

### Using Docker Compose

```bash
docker-compose up python-genai
```

### Running Locally

```bash
cd py-genai
pip install -r requirements.txt
python app.py
```
