# hello-genai

A simple chatbot web application built in Go, Python and Node.js that connects to a local LLM service (llama.cpp) to provide AI-powered responses.

## Environment Variables

The application uses the following environment variables defined in the `.env` file:

- `LLM_BASE_URL`: The base URL of the LLM API
- `LLM_MODEL_NAME`: The model name to use

To change these settings, simply edit the `.env` file in the root directory of the project.

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/docker/hello-genai
   cd hello-genai
   ```

2. Run all applications using Docker Compose:
   ```bash
   docker compose up --build
   ```

   Or run the convenience script (which also pulls the AI model):
   ```bash
   ./run.sh
   ```

3. Run individual projects:
   ```bash
   # Run only the Go application
   cd go-genai && docker compose up --build
   
   # Run only the Python application  
   cd py-genai && docker compose up --build
   
   # Run only the Node.js application
   cd node-genai && docker compose up --build
   
   # Run only the Rust application
   cd rust-genai && docker compose up --build
   ```

4. Open your browser and visit the following links:

   http://localhost:8080 for the GenAI Application in Go

   http://localhost:8081 for the GenAI Application in Python

   http://localhost:8082 for the GenAI Application in Node

   http://localhost:8083 for the GenAI Application in Rust

## Requirements

- macOS (recent version)
- Either:
  - Docker and Docker Compose (preferred)
  - Go 1.21 or later
- Local LLM server

If you're using a different LLM server configuration, you may need to modify the`.env` file.
