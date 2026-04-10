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

2. Start the application using Docker Compose:
   ```bash
   docker compose up
   ```

3. Open your browser and visit the following links:

   http://localhost:8080 for the GenAI Application in Go

   http://localhost:8081 for the GenAI Application in Python

   http://localhost:8082 for the GenAI Application in Node

   http://localhost:8083 for the GenAI Application in Rust

## Integration Tests

The `tests/` directory contains pytest-based integration tests that verify all service health endpoints.

### Prerequisites

- Python 3.x with `pytest` and `requests` installed
- All services running via `docker compose up -d`

### Install test dependencies

```bash
pip install pytest requests
```

### Run the tests

```bash
python -m pytest tests/test_health_endpoints.py -v
```

The test suite covers:

- **Common checks** (all 4 services): HTTP 200 status, JSON content type, `"status": "healthy"`, `timestamp` field, POST method rejection
- **Go** (port 8080): version, go_version, uptime, llm_api, memory stats
- **Python** (port 8081): llm_api status
- **Node** (port 8082): llm_endpoint, model name
- **Rust** (port 8083): minimal healthy response

## Astro (Airflow) Project

The `astro-project/` directory contains an [Astronomer](https://www.astronomer.io/) project for orchestrating workflows with Apache Airflow.

### Prerequisites

- [Astro CLI](https://www.astronomer.io/docs/astro/cli/install-cli)
- Docker Desktop running

### Setup

1. Initialize the database (first time only):
   ```bash
   cd astro-project
   astro dev start
   astro dev run db migrate
   astro dev restart
   ```

2. On subsequent starts:
   ```bash
   cd astro-project
   astro dev start
   ```

3. Access the Airflow UI at the URL shown in the terminal output (e.g. `http://localhost:<port>`).

### Included DAGs

- **example_astronauts** — Sample DAG demonstrating Airflow task orchestration

### Useful commands

```bash
astro dev run dags list          # List all DAGs
astro dev run dags trigger <id>  # Trigger a manual DAG run
astro dev logs --api-server      # View api-server logs
astro dev stop                   # Stop the Astro environment
```

## Requirements

- Docker and Docker Compose
- Python 3.x (for integration tests)
- [Astro CLI](https://www.astronomer.io/docs/astro/cli/install-cli) (for Airflow workflows)

If you're using a different LLM server configuration, you may need to modify the `.env` file.
