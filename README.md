# AI-Powered Meeting Assistant & Document Analyst

A high-performance, full-stack enterprise web application designed to automate meeting workflows and document intelligence. The platform allows users to upload meeting minutes, transcripts, and corporate PDFs, utilizing a Python FastAPI backend to parse documents dynamically. Contextual intelligence and extraction are driven by the Groq inference engine using cutting-edge Large Language Models (LLMs), with transactional states and metadata securely persisted in a MongoDB cluster.

---

## 🏗️ System Architecture & Data Flow

The application is engineered with a strict separation of concerns between the user interface, backend processing pipeline, and data persistence layer.

1. **Client Layer:** A responsive frontend UI handles user authentication, multi-format file uploads (PDFs/Transcripts), and real-time prompt queries.
2. **Application Layer:** FastAPI serves asynchronous REST endpoints, manages security middleware, routes data payloads, and handles file stream extractions.
3. **Inference Layer:** The backend interacts with Groq's high-speed API to compute complex NLP tasks like summarization, action-item routing, and semantic analysis.
4. **Persistence Layer:** A document-oriented MongoDB database stores relational records of user sessions, processed document metadata, and analytical histories.

[User Browser] ──(HTTP/JSON)──> [FastAPI Backend] ──(API Calls)──> [Groq LLM Engine]
│                                │
└────────(File Upload)───────────┼───(Store Metadata)──> [MongoDB]

## 🛠️ Deep Tech Stack

### Backend Pipeline
* **Framework:** FastAPI (Python 3.10+) — Selected for its asynchronous capabilities, auto-generated OpenAPI documentation, and high-speed data validation via Pydantic v2.
* **AI Engine:** Groq SDK — Utilizing hardware-accelerated Llama-3/Mixtral models for near-zero latency inference.
* **Document Processing:** PyPDF2 / pdfplumber — For robust structural layout analysis and text stream parsing from unstructured binaries.

### Database & Security
* **Database:** MongoDB  — Handles schema-less storage for polymorphic analytical data structures.
* **Environment Security:** `python-dotenv` — Enforces strict runtime configuration isolation, keeping security keys out of version control.

### Frontend
* **Core:** HTML5, Modern CSS3 (Tailwind CSS configuration ready), and Vanilla ECMAScript 6+ for smooth asynchronous fetch/XHR communication streams.

---

## 📊 Database Schema Design (MongoDB)

The data layer uses optimized document collections to track processed operations smoothly:

### `documents` Collection
```json
{
  "_id": "ObjectId",
  "filename": "string (e.g., Q3_Review_Meeting.pdf)",
  "file_size_bytes": "int",
  "uploaded_at": "ISODate",
  "storage_path": "string",
  "status": "string (processing | completed | failed)"
}
