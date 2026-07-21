# AI-Powered Conversational Form Builder with JSON Schema

A full-stack application featuring a conversational AI agent that generates and refines complex web forms based on natural language prompts, enforcing strict JSON Schema (Draft-07) contracts.

---

## 🌟 Features

- 💬 **Multi-Turn Conversational Refinement**: Refine and extend existing form schemas across multiple user prompts with automatic versioning.
- 📐 **JSON Schema (Draft-07) Standard**: Ensures structured, validated data contracts for form rendering and export.
- ⚡ **Real-time Live Form Renderer**: Dynamically renders inputs, selects, checkboxes, and required states as schemas update.
- 🔀 **Conditional Field Visibility (`x-show-when`)**: Supports custom conditional rules to show or hide fields based on other field values.
- 🔍 **Visual Version Diffing**: Highlights property additions (`+`), removals (`-`), and modifications (`~`) between schema versions.
- 🛠️ **Clarification Detection**: Detects ambiguous prompts and requests clarifying questions instead of hallucinating incomplete schemas.
- 🔄 **Server-Side Validation & Retry Engine**: Validates all generated schemas with AJV and silently retries up to 2 times upon validation failure.
- 📦 **One-Command Containerization**: Docker Compose setup orchestrating backend health checks and frontend service dependencies.
- 📤 **Export Suite**: Export JSON schemas, generated React form component code, or cURL request snippets.

---

## 🏗️ Architecture & Technology Stack

```
+-------------------------------------------------------------------+
|                        React Frontend (Vite)                      |
|  +---------------------------+  +------------------------------+  |
|  | Chat Pane                 |  | Live Form Renderer           |  |
|  | data-testid="chat-pane"   |  | data-testid="form-renderer" |  |
|  +---------------------------+  +------------------------------+  |
|  +-------------------------------------------------------------+  |
|  | Schema Diff Panel | Export Panel (JSON, React Code, cURL)   |  |
|  +-------------------------------------------------------------+  |
+----------------------------------+--------------------------------+
                                   | HTTP API (Port 8080)
                                   v
+-------------------------------------------------------------------+
|                        Node.js Express Backend                    |
|  +-------------------------------------------------------------+  |
|  | POST /api/form/generate                                     |  |
|  |  ├── Ambiguity Detector                                     |  |
|  |  ├── LLM Client (Gemini / OpenAI with structured output)    |  |
|  |  └── AJV Draft-07 Validator & Retry Mechanism (Max 2)      |  |
|  +-------------------------------------------------------------+  |
|  | GET /health (Healthcheck endpoint)                          |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

- **Frontend**: React 19, TypeScript, Vite, Custom Vanilla CSS Design System, Lucide Icons.
- **Backend**: Node.js, Express, AJV (JSON Schema Draft-07 validator), `@google/generative-ai` / OpenAI SDKs.
- **Containerization**: Docker & Docker Compose (`backend` with healthcheck and `frontend` with `depends_on`).

---

## 🚀 Quick Start (One-Command Startup)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running.

### 1. Configure Environment Variables

Copy the example environment file in the `backend/` directory:

```bash
cp backend/.env.example backend/.env
```

Set your preferred LLM API key inside `backend/.env`:

```env
API_PORT=8080
LLM_API_KEY=your_gemini_or_openai_api_key_here
```

*(Note: If no API key is provided, the backend falls back to built-in mock schema generators for local testing.)*

### 2. Start Services via Docker Compose

Run the entire application using a single command from the project root:

```bash
docker-compose up --build
```

- **Backend API**: `http://localhost:8080`
- **Frontend App**: `http://localhost:3000`

---

## 🧪 API Endpoints

### 1. Health Check

- **Endpoint**: `GET /health`
- **Response**: `200 OK`
```json
{
  "status": "healthy"
}
```

### 2. Generate / Refine Form Schema

- **Endpoint**: `POST /api/form/generate`
- **Request Body**:
```json
{
  "prompt": "Create a user registration form with email and newsletter opt-in",
  "conversationId": "optional-uuid-from-previous-turn"
}
```
- **Response**: `200 OK`
```json
{
  "formId": "3b29a1c4-...",
  "version": 1,
  "schema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
      "email": { "type": "string", "format": "email", "title": "Email Address" },
      "sendNewsletter": { "type": "boolean", "title": "Subscribe to newsletter?" },
      "emailFrequency": {
        "type": "string",
        "title": "Email Frequency",
        "enum": ["Daily", "Weekly"],
        "x-show-when": { "field": "sendNewsletter", "equals": true }
      }
    },
    "required": ["email"]
  }
}
```

### 3. Clarification Request

- **Trigger Prompt**: `"Make a form for booking a meeting room"`
- **Response**: `200 OK`
```json
{
  "status": "clarification_needed",
  "conversationId": "string",
  "questions": [
    "How many participants are expected for the meeting?",
    "Do you require audio-visual equipment?",
    "What is the date and time range for the booking?"
  ]
}
```

---

## 🛡️ Testing & Validation Retries

You can test the server-side AJV validation retry mechanism using the `mock_llm_failure` query parameter:

- **1 Simulated Failure (Succeeds after 1 retry)**:
  `POST /api/form/generate?mock_llm_failure=1` -> Status `200 OK`
- **3 Simulated Failures (Fails after exhausting retries)**:
  `POST /api/form/generate?mock_llm_failure=3` -> Status `500 Internal Server Error`

---

## 📜 License

MIT License
