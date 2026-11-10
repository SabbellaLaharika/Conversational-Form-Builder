# AI-Powered Conversational Form Builder with JSON Schema

<div align="center">

[![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![JSON Schema](https://img.shields.io/badge/JSON%20Schema-Draft--07-00599c)](https://json-schema.org/)
[![Ajv](https://img.shields.io/badge/Ajv-8.12-23c48e)](https://ajv.js.org/)
[![Google Gemini](https://img.shields.io/badge/Gemini-2.5%20Flash-4285f4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Groq](https://img.shields.io/badge/Groq-gpt--oss--120b-f55036?logo=fastapi&logoColor=white)](https://groq.com/)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)

<p align="center">
  A full-stack application featuring a conversational AI agent that generates and refines complex web forms based on natural language prompts, enforcing strict JSON Schema (Draft-07) contracts.
</p>

</div>

---

## 🌟 Features

- 💬 **Multi-Turn Conversational Refinement**: Refine and extend existing form schemas across multiple user prompts with automatic turn-slicing and versioning.
- 📐 **JSON Schema (Draft-07) Standard**: Ensures structured, validated data contracts for dynamic form rendering and portable cross-platform export.
- ⚡ **Real-time Live Form Renderer**: Dynamically renders inputs, range sliders, radio buttons, dropdown selects, textareas, checkboxes, and required states as schemas update.
- 🔀 **Conditional Field Visibility (`x-show-when`)**: Evaluates primitive comparisons (`equals`, `notEquals`, `greaterThan`, `lessThan`, `in`) and composite boolean rules (`and`, `or`) in real time.
- 🔍 **Visual Version Diffing**: Highlights property additions (`+`), removals (`-`), and modifications (`~`) between schema versions in a dedicated diff panel.
- 🛠️ **Clarification Detection & Interactive Inline Q&A**: Detects ambiguous prompts and renders dedicated inline input fields for each question directly within the chat message. Users can answer questions inline and click "Build Form with Answers" to synthesize specifications and generate schemas in one step.
- 🔄 **Server-Side Validation & Self-Healing Retry Engine**: Validates all generated schemas with Ajv and injects compiler diagnostics back into the prompt for up to 2 retries upon validation failure.
- 📦 **One-Command Containerization**: Docker Compose orchestration coordinating backend health checks (`GET /health`) and frontend service dependencies (`service_healthy`).
- 📤 **Export Suite**: One-click export for raw JSON Schema files, self-contained React JSX form components, and reproducible cURL API commands.

---

## 🏗️ Architecture & Technology Stack

```mermaid
flowchart TB
    %% 1. User Layer
    User(["👤 User"]):::userNode
    User -->|"1. Submits Prompt"| ChatUI["💬 Chat Interface\n(data-testid='chat-pane')"]:::feNode

    %% 2. Backend Processing
    subgraph BackendService ["🚀 Express.js Backend Service (Port 8080)"]
        direction TB
        APIRoute["POST /api/form/generate\n(Core Schema Ingestion API)"]:::beNode
        HealthRoute["GET /health\n(Container Healthcheck Endpoint)"]:::healthNode
        AmbiguityCheck{"Ambiguous\nPrompt?"}:::guardNode
        ClarifyCard["❓ Clarification Questions Card\n(status: 'clarification_needed')"]:::guardNode
        SessionMap[("💾 In-Memory State Store\nMap<conversationId, State>")]:::storeNode
        AjvEngine["🛡️ Ajv Validator (Draft-07)\n& Self-Healing Retry Loop (Max 3 Attempts)"]:::valNode

        APIRoute --> AmbiguityCheck
        AmbiguityCheck -->|"Yes: Underspecified"| ClarifyCard
        AmbiguityCheck -->|"No: Specific"| SessionMap
        SessionMap --> AjvEngine
    end

    %% 3. Model Inference Services
    subgraph ModelLayer ["🤖 Dual-Provider LLM Services"]
        direction LR
        GeminiAPI["✨ Google Gemini API\n(gemini-2.5-flash)"]:::geminiNode
        GroqAPI["⚡ Groq API\n(gpt-oss-120b)"]:::groqNode
        OfflineGen["🧪 Hermetic Mock Generator\n(Offline Fallback Tests)"]:::mockNode
    end

    %% 4. Client Live Rendering
    subgraph FrontendUI ["⚛️ React 19 Client Rendering (Port 3000)"]
        direction TB
        FormView["📋 Live Form Renderer\n(data-testid='form-renderer-pane')"]:::renderNode
        DiffView["🔍 Schema Version Diff (+, -, ~)\n(data-testid='schema-diff-panel')"]:::renderNode
        ExportView["📤 Export Suite (JSON, React JSX, cURL)\n(data-testid='export-panel')"]:::renderNode

        FormView --> DiffView
        FormView --> ExportView
    end

    %% Compact Direct Flow (No Multi-Rank Dead Space)
    ChatUI -->|"2. HTTP POST"| APIRoute
    ClarifyCard -.->|"Prompt Guidance"| ChatUI
    AjvEngine <-->|"3. Model Inference & Feedback"| ModelLayer
    AjvEngine -->|"4. HTTP 200 OK Valid Draft-07 Schema"| FormView

    classDef userNode fill:#4338ca,stroke:#312e81,stroke-width:2px,color:#ffffff;
    classDef feNode fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#ffffff;
    classDef beNode fill:#059669,stroke:#047857,stroke-width:2px,color:#ffffff;
    classDef healthNode fill:#0d9488,stroke:#0f766e,stroke-width:2px,color:#ffffff;
    classDef guardNode fill:#d97706,stroke:#b45309,stroke-width:2px,color:#ffffff;
    classDef storeNode fill:#475569,stroke:#334155,stroke-width:2px,color:#ffffff;
    classDef valNode fill:#7c3aed,stroke:#6d28d9,stroke-width:2px,color:#ffffff;
    classDef geminiNode fill:#2563eb,stroke:#1d4ed8,stroke-width:2px,color:#ffffff;
    classDef groqNode fill:#ea580c,stroke:#c2410c,stroke-width:2px,color:#ffffff;
    classDef mockNode fill:#c2410c,stroke:#9a3412,stroke-width:2px,color:#ffffff;
    classDef renderNode fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#ffffff;
```

### Technology Breakdown

- **Frontend**: React 19, TypeScript 5, Vite, Lucide Icons, Custom Responsive CSS Design System.
- **Backend**: Node.js 18, Express 4.18, Ajv 8.12 (`ajv-formats`), `@google/generative-ai`, `uuid`.
- **Validation**: JSON Schema Draft-07 meta-schema validation via server-side Ajv.
- **Containerization**: Docker & Docker Compose (`backend` with healthcheck on `GET /health` and `frontend` with `depends_on: { backend: { condition: service_healthy } }`).

---

## 🔄 Request Lifecycle & Self-Healing Pipeline

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'primaryColor': '#eff6ff',
    'primaryTextColor': '#1e3a8a',
    'primaryBorderColor': '#3b82f6',
    'lineColor': '#2563eb',
    'secondaryColor': '#f0fdf4',
    'tertiaryColor': '#fff7ed',
    'noteBkgColor': '#fef3c7',
    'noteTextColor': '#92400e',
    'noteBorderColor': '#f59e0b',
    'actorBkg': '#dbeafe',
    'actorTextColor': '#1e40af',
    'actorBorder': '#3b82f6',
    'signalColor': '#1d4ed8',
    'signalTextColor': '#1e3a8a',
    'labelBoxBkgColor': '#eff6ff',
    'labelBoxBorderColor': '#3b82f6',
    'labelTextColor': '#1e3a8a',
    'sequenceNumberColor': '#ffffff'
  }
}}%%
sequenceDiagram
    autonumber
    actor User as 👤 User
    participant Chat as 💬 Chat Pane (:3000)
    participant API as 🚀 Express API (:8080)
    participant Store as 💾 Session Store (Map)
    participant LLM as 🤖 Model Client (Gemini / Groq)
    participant Ajv as 🛡️ Ajv Validator (Draft-07)
    participant Renderer as 📋 Form Renderer (:3000)

    User->>Chat: Enters natural language prompt
    Chat->>API: POST /api/form/generate { prompt, conversationId, version }

    rect rgb(238, 242, 255)
    Note over API: Phase 1: Ambiguity Evaluation & Prevention
    API->>API: Inspect prompt for missing domain specifics
    alt Prompt is underspecified (e.g. room booking without attendee count)
        API-->>Chat: HTTP 200 OK { status: "clarification_needed", questions: [...] }
        Chat-->>User: Renders interactive clarification question card in chat
    end
    end

    rect rgb(236, 253, 245)
    Note over API, Store: Phase 2: Context Retrieval & Version Slicing
    API->>Store: Retrieve conversation session history
    alt Historical version requested (versionNum)
        API->>API: Slice history to 2 * versionNum & load base schema
    else Latest iteration
        API->>API: Load cumulative previous schema
    end
    end

    rect rgb(254, 243, 199)
    Note over API, Ajv: Phase 3: Structured Inference & Self-Healing Retry Loop (Attempts <= 3)
    loop Attempts 1 to 3 (Initial + Up to 2 Retries)
        API->>LLM: callLLM(prompt, activeHistory, conversationId, correctiveFeedback)
        LLM-->>API: Returns raw JSON Schema object
        API->>Ajv: ajv.validateSchema(result.schema)

        alt Valid Draft-07 Schema
            Ajv-->>API: Pass (true)
            API->>Store: Persist updated message turn and append schema version
            API-->>Renderer: HTTP 200 OK { formId, version, schema }
            Renderer-->>User: Mounts reactive inputs, updates diff panel & export suite
        else Invalid Structure
            Ajv-->>API: Fail (ajv.errorsText())
            API->>API: Record compiler diagnostics in lastError
            Note over API, LLM: Self-Healing: Injects exact compiler errors into next retry prompt
        end
    end
    opt All 3 Retries Exhausted
        API-->>Chat: HTTP 500 Error { error: "Schema generation failed...", details: lastError }
        Chat-->>User: Displays diagnostic error banner
    end
    end
```

---

## 🔀 Conditional Field Visibility (`x-show-when`)

The live form renderer implements a recursive expression evaluation engine for the custom `x-show-when` JSON Schema extension property:

```mermaid
flowchart TB
    Start(["🎯 evaluateRule(rule, formData)"]):::entryNode
    Start --> CheckType{"Check Rule Structure"}:::decisionNode

    %% Left Branch: Composite Boolean Rules
    subgraph CompositeBlock ["1. Composite Boolean Rules"]
        direction TB
        AndNode["Composite 'and':\nrule.and.every(r => evaluateRule(r, formData))"]:::ruleNode
        OrNode["Composite 'or':\nrule.or.some(r => evaluateRule(r, formData))"]:::ruleNode
        CompResult["Composite Rule Outcome\n(true / false)"]:::compResNode
        AndNode --> CompResult
        OrNode --> CompResult
    end

    %% Right Branch: Primitive Field Comparison
    subgraph PrimitiveBlock ["2. Primitive Field Comparison"]
        direction TB
        Extract["Extract Field Value:\nval = formData[rule.field]"]:::fieldNode
        OpSelect{"Operator?"}:::decisionNode
        OpEq["equals / notEquals:\nval === rule.equals / val !== rule.notEquals"]:::opNode
        OpNum["greaterThan / lessThan:\nval > rule.greaterThan / val < rule.lessThan"]:::opNode
        OpIn["in (Membership):\nArray.isArray(rule.in) && rule.in.includes(val)"]:::opNode
        PrimResult["Primitive Comparison Outcome\n(true / false)"]:::primResNode

        Extract --> OpSelect
        OpSelect -->|"equals / notEquals"| OpEq
        OpSelect -->|"greaterThan / lessThan"| OpNum
        OpSelect -->|"in"| OpIn
        OpEq --> PrimResult
        OpNum --> PrimResult
        OpIn --> PrimResult
    end

    CheckType -->|"rule.and"| AndNode
    CheckType -->|"rule.or"| OrNode
    CheckType -->|"rule.field"| Extract

    %% Final Unified Decision
    DecisionCollector{"Final Evaluation Result?"}:::decisionNode
    CompResult --> DecisionCollector
    PrimResult --> DecisionCollector

    DecisionCollector -->|"true"| MountField["✅ Mount Field into DOM"]:::passNode
    DecisionCollector -->|"false"| OmitField["❌ Omit Field from DOM"]:::failNode

    classDef entryNode fill:#4338ca,stroke:#312e81,stroke-width:2px,color:#ffffff;
    classDef decisionNode fill:#d97706,stroke:#b45309,stroke-width:2px,color:#ffffff;
    classDef ruleNode fill:#0d9488,stroke:#0f766e,stroke-width:2px,color:#ffffff;
    classDef compResNode fill:#0891b2,stroke:#0e7490,stroke-width:2px,color:#ffffff;
    classDef fieldNode fill:#7c3aed,stroke:#6d28d9,stroke-width:2px,color:#ffffff;
    classDef opNode fill:#2563eb,stroke:#1d4ed8,stroke-width:2px,color:#ffffff;
    classDef primResNode fill:#4f46e5,stroke:#4338ca,stroke-width:2px,color:#ffffff;
    classDef passNode fill:#16a34a,stroke:#15803d,stroke-width:2px,color:#ffffff;
    classDef failNode fill:#dc2626,stroke:#b91c1c,stroke-width:2px,color:#ffffff;
```

### Schema Examples

#### 1. Primitive Condition
```json
{
  "sendNewsletter": {
    "type": "boolean",
    "title": "Subscribe to newsletter?"
  },
  "emailFrequency": {
    "type": "string",
    "title": "Email Frequency",
    "enum": ["Daily", "Weekly", "Monthly"],
    "x-show-when": {
      "field": "sendNewsletter",
      "equals": true
    }
  }
}
```

#### 2. Composite Nested Condition (`and` / `or`)
```json
{
  "complianceAuditTier": {
    "type": "string",
    "title": "Compliance Audit Tier",
    "enum": ["Tier 1 (Standard)", "Tier 2 (Enhanced)"],
    "x-show-when": {
      "and": [
        { "field": "requiresAudit", "equals": true },
        { "field": "employeeCount", "greaterThan": 25 }
      ]
    }
  }
}
```

---

## ⚙️ Key Design Decisions

- **JSON Schema Draft-07 as the Universal Contract**
  - *Decision*: Enforce JSON Schema Draft-07 meta-schema validation on all model responses rather than code-first validators like Zod or Yup.
  - *Rationale*: JSON Schema is declarative, language-agnostic data that can be exported, validated on any backend (Node, Python, Go), and directly parsed into UI components or OpenAPI specifications without runtime JavaScript coupling.
  - *Implementation*: `ajv.validateSchema(result.schema)` validates the schema structure server-side before persisting or sending to the frontend.
  - *Trade-offs*: Requires declarative custom extensions (`x-show-when`) for client-side conditional logic instead of arbitrary JavaScript expressions.

- **Self-Healing Feedback Retries over Blind Retries**
  - *Decision*: Inject compiler error diagnostics directly into model prompts during validation retries.
  - *Rationale*: Blind retries assume random variance will fix schema bugs. Injecting the exact compiler failure path guides the model directly to the syntax violation.
  - *Implementation*: Validation errors captured via `ajv.errorsText()` are appended to `lastError` and passed to subsequent `callLLM` attempts as user-level corrective feedback.
  - *Trade-offs*: Slightly increases input token usage on subsequent retry attempts.

- **Dual-Provider LLM Routing with Automatic Cascade**
  - *Decision*: Provide runtime model selection between Google Gemini (`gemini-2.5-flash`) and Groq (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`) with a local hermetic fallback generator.
  - *Rationale*: Prevents single-vendor vendor lock-in, shields against model rate limits or quota spikes, and guarantees that local and offline test suites execute without API keys.
  - *Implementation*: Detects API key prefix (`gsk_` for Groq, others for Gemini `gemini-2.5-flash`), featuring automatic failover to Groq upon API rate limits, and fallback to `generateMockSchema` when unset.
  - *Trade-offs*: System prompts must adhere to shared instruction standards compatible with Gemini and Groq JSON-mode contracts.

- **In-Memory Multi-Turn History with Turn Slicing**
  - *Decision*: Maintain conversation state in an in-memory `Map` with dynamic history slicing when historical versions are requested.
  - *Rationale*: Delivers sub-millisecond turn updates during evaluation without external database latency or migration overhead.
  - *Implementation*: Passing `version` slices the stored messages array via `messages.slice(0, 2 * versionNum)` and loads `baseSchema = schemas[versionNum - 1]`.
  - *Trade-offs*: Active conversations reset upon backend process restarts; production horizontal scaling requires an external store like Redis.

---

## 🚀 Quick Start (One-Command Startup)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running.
- [Node.js 18+](https://nodejs.org/) *(optional, only for running locally outside Docker)*.

### 1. Configure Environment Variables

Copy the example environment file in the `backend/` directory:

```bash
cp backend/.env.example backend/.env
```

Set your preferred LLM API key inside `backend/.env`:

```env
API_PORT=8080
# Supports Gemini (AI Studio key) or Groq (gsk_...)
LLM_API_KEY=your_api_key_here
# Optional: Dedicated Groq fallback key to prevent rate-limit interruptions
GROQ_API_KEY=gsk_your_groq_key_here
```

*(Note: The system features multi-provider auto-detection and fallback: if Gemini encounters rate limits or quota errors, it automatically falls back to Groq (`openai/gpt-oss-120b`). If no API key is provided, the backend falls back to built-in mock schema generators for offline testing.)*

### 2. Start Services via Docker Compose

Run the entire application using a single command from the project root:

```bash
docker-compose up --build
```

- **Backend API**: `http://localhost:8080`
- **Frontend App**: `http://localhost:3000`
- **Healthcheck**: `http://localhost:8080/health`

To stop containers:
```bash
docker-compose down
```

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
  "conversationId": "optional-uuid-from-previous-turn",
  "version": 1
}
```
- **Response**: `200 OK`
```json
{
  "formId": "d3b07384-d113-46bc-81bf-4b95f14e4125",
  "version": 1,
  "schema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "format": "email",
        "title": "Email Address"
      },
      "sendNewsletter": {
        "type": "boolean",
        "title": "Subscribe to newsletter?"
      },
      "emailFrequency": {
        "type": "string",
        "title": "Email Frequency",
        "enum": ["Daily", "Weekly", "Monthly"],
        "x-show-when": {
          "field": "sendNewsletter",
          "equals": true
        }
      }
    },
    "required": ["email"]
  }
}
```

### 3. Clarification Request

- **Trigger Prompt**: `"Make a form for booking a meeting room"` (or any underspecified request)
- **Response**: `200 OK`
```json
{
  "status": "clarification_needed",
  "conversationId": "7b8f9e01-2345-6789-abcd-ef0123456789",
  "questions": [
    "How many participants are expected for the meeting?",
    "Do you require audio-visual equipment?",
    "What is the date and time range for the booking?"
  ]
}
```
- **Interactive UI Handling**: The React frontend renders these questions as an interactive Q&A form card directly inside the chat message. Users enter their requirements into each input box and click **`✨ Build Form with Answers`** to synthesize the criteria and generate the schema in one click.

---

## 🛡️ Testing & Validation Retries

The backend provides a simulated failure mechanism via the `mock_llm_failure` query parameter to verify error handling without third-party API dependencies:

- **1 Simulated Failure (Succeeds after self-correction retry)**:
  ```bash
  curl -X POST "http://localhost:8080/api/form/generate?mock_llm_failure=1" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "A simple feedback form"}'
  ```
  *Result*: Attempt 1 fails validation; Attempt 2 passes. Returns `HTTP 200 OK` with valid schema.

- **3 Simulated Failures (Exhausts retries and returns diagnostic error)**:
  ```bash
  curl -X POST "http://localhost:8080/api/form/generate?mock_llm_failure=3" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "A simple feedback form"}'
  ```
  *Result*: All 3 attempts fail validation. Returns `HTTP 500 Internal Server Error`:
  ```json
  {
    "error": "Failed to generate valid schema after multiple attempts.",
    "details": "LLM output failed Draft-07 JSON Schema validation: data/type must be equal to one of the allowed values"
  }
  ```

---

## 🔮 Limitations & Future Scope

### Current Limitations
- **In-Memory Session Storage**: Active conversation state lives in backend process memory (`Map`). Restarting the container clears active sessions.
- **Single-Process State Binding**: Without external caching or sticky routing, running multiple backend replicas will cause session state mismatch across turns.
- **Automated End-to-End Test Suite**: Failure simulation and retry pathways are verified via integration parameters (`?mock_llm_failure=N`), but automated browser-level Playwright suites are not yet integrated.

### Future Scope
- **Redis Session Caching**: Migrate the `conversations` Map to Redis for persistent, distributed session management across replicated backend containers.
- **Automated Playwright Test Suite**: Add headless end-to-end browser tests verifying conversational turns, dynamic UI rendering, and conditional visibility toggles.
- **Server-Side Validation Middleware Export**: Extend the export panel to generate Express/Ajv validation middleware matching the generated form contract.
- **Multimodal Visual Ingestion**: Allow users to upload photos or PDFs of physical forms to automatically generate corresponding JSON Schema definitions.


