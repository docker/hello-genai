# Node.js GenAI Application

A Node.js-powered GenAI app you can run locally using your favorite LLM — just follow the guide to get started.

## Environment Variables

The application uses the following environment variables:

- `LLM_BASE_URL`: The base URL of the LLM API
- `LLM_MODEL_NAME`: The model name to use
- `PORT`: The port to run the application on (default: 8082)

## API Endpoints

- `GET /`: Web interface for the chat application
- `POST /api/chat`: Send a message to the AI and get a response
- `GET /health`: Health check endpoint

## Running the Application

### Using Docker Compose

You can run this project individually using Docker Compose:

```bash
docker compose up --build
```

Or run all projects together from the root directory:

```bash
cd ..
docker compose up --build
```

### Running Locally

```bash
cd node-genai
npm install
npm start
```