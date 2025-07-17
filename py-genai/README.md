# Python GenAI Application

A Python-powered GenAI app you can run locally using your favorite LLM — just follow the guide to get started.

## Environment Variables

The application uses the following environment variables:

- `LLM_BASE_URL`: The base URL of the LLM API
- `LLM_MODEL_NAME`: The model name to use
- `PORT`: The port to run the application on (default: 8081)
- `DEBUG`: Set to "true" to enable debug mode (default: "false")
- `LOG_LEVEL`: Set the logging level (default: "INFO")

## API Endpoints

- `GET /`: Web interface for the chat application
- `POST /api/chat`: Send a message to the AI and get a response
- `GET /health`: Health check endpoint
- `GET /api/docs`: API documentation

## Running the Application

### Using Docker Compose

You can run this project individually using Docker Compose:

```bash
docker compose up --build
```
```
