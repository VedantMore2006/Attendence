# Smart Attendance System: Formal Report Source

## Abstract

This report presents the design and implementation of a local-first biometric attendance platform that performs real-time face recognition using a webcam. The system addresses limitations of token-based attendance mechanisms such as manual registers, RFID cards, PIN terminals, and QR-based workflows. It combines a FastAPI backend, a lightweight static web frontend, and an on-device vision pipeline based on MediaPipe BlazeFace for detection and ArcFace embeddings for identity verification. Attendance records are stored in a local SQLite database. The implementation demonstrates sub-second scan performance for prototype-scale deployments while preserving data locality and transparency of the recognition pipeline.

## 1. Introduction

Attendance tracking is a recurring operational requirement across educational institutions and workplaces. Conventional approaches often prioritize convenience over identity integrity, enabling proxy attendance and clerical errors. Biometric systems improve authenticity by linking attendance to physiological characteristics of the individual. Among biometric modalities, face recognition offers contactless operation, low interaction friction, and compatibility with commodity cameras.

The Smart Attendance System (SAS) was developed as a transparent, open implementation of a face-recognition attendance workflow that can operate without cloud services or proprietary attendance terminals.

## 2. Problem Statement and Motivation

### 2.1 Problem Context

Traditional attendance systems exhibit one or more of the following weaknesses:
- token sharing (cards, PINs, OTP)
- manual errors and delayed processing
- hardware costs and vendor lock-in
- dependency on network or cloud infrastructure

These weaknesses are especially problematic in environments where attendance integrity and auditability are required.

### 2.2 Project Motivation

The project is motivated by three objectives:
1. Authenticating the person rather than a transferable token.
2. Running recognition and storage locally to preserve biometric data sovereignty.
3. Exposing all pipeline layers in a modifiable and auditable implementation.

## 3. Objectives

The system-level objectives are:
- real-time attendance marking from webcam frames
- user registration using multiple face samples
- robust identity matching via deep embeddings
- local persistence of identities, embeddings, and attendance logs
- auditable behavior through structured logging

## 4. System Overview

The implemented platform includes:
- frontend: static HTML/CSS/JavaScript interfaces for scan, registration, records, and statistics
- backend: FastAPI application exposing JSON APIs
- vision stack: MediaPipe detection, face crop/resize alignment, ArcFace embedding extraction
- data layer: SQLite database with relational schema

### 4.1 Operational Flow

During attendance scan, the client captures a webcam frame, submits it as base64 JPEG, and receives one of several outcomes (`marked`, `already_marked`, `no_face`, `no_match`). Matching decisions are based on cosine similarity between query and stored embeddings.

## 5. Related Design Choices

### 5.1 Face Recognition Strategy

The implementation uses deep metric learning principles through ArcFace embeddings. Instead of direct pixel comparisons, each face is mapped to a high-dimensional feature vector where same-identity samples are expected to cluster more closely than different-identity samples.

### 5.2 Detector and Embedder Selection

MediaPipe BlazeFace was selected for fast CPU detection performance and low deployment complexity. InsightFace `buffalo_l` was selected for ArcFace-based embedding quality and availability through ONNX Runtime.

### 5.3 Similarity Metric and Thresholding

Cosine similarity is used for identity matching. With L2-normalized embeddings, similarity reduces to dot product. A threshold of `0.55` is used as the acceptance boundary for match decisions in the prototype.

## 6. Methodology

### 6.1 Stage 1: Image Capture and Encoding

The browser captures a frame from a live webcam stream using the Canvas API and encodes it as JPEG data URI.

### 6.2 Stage 2: Input Decoding and Validation

The backend decodes base64 image payloads, validates content integrity, and converts bytes into OpenCV frame format.

### 6.3 Stage 3: Face Detection

MediaPipe face detection identifies one or more bounding boxes. If multiple faces are detected, the system processes the largest box as the terminal subject.

### 6.4 Stage 4: Face Alignment

The detected face region is cropped and resized to `112x112`. The current implementation does not apply landmark-based geometric warping.

### 6.5 Stage 5: Embedding Extraction

The aligned face is passed through ArcFace (`w600k_r50.onnx`) via InsightFace, producing a 512-dimensional embedding. The embedding is L2-normalized before storage and comparison.

### 6.6 Stage 6: Identity Matching

All stored embeddings are retrieved and compared against the query embedding using cosine similarity. The best score above threshold determines identity.

### 6.7 Stage 7: Attendance Policy Enforcement

If identity is accepted, attendance is marked once per user per date. Repeat scans on the same date return `already_marked`.

## 7. Architecture and Module Design

### 7.1 Frontend Layer

The frontend includes dedicated pages for:
- landing and navigation
- attendance scan
- user registration
- attendance records
- daily statistics

A shared JavaScript layer handles webcam access, frame capture, API calls, and page-specific state updates.

### 7.2 Backend Layer

The backend is organized into:
- `api/server.py`: app initialization, startup lifecycle, logging
- `api/routes.py`: endpoint definitions and orchestration logic
- `api/errors.py`: structured exception hierarchy and response handlers

### 7.3 Business Logic Layer

`attendance/attendance_service.py` encapsulates duplicate prevention and date-based attendance rules.

### 7.4 Data Access Layer

`database/models.py` defines schema initialization and CRUD operations for users, embeddings, attendance records, and query utilities.

### 7.5 Vision Layer

Vision modules include:
- `vision/detector.py`
- `vision/aligner.py`
- `vision/embedder.py`

This separation supports maintainability and model-level replacement if needed.

## 8. Database Design

The SQLite schema contains three primary tables:
- `users`
- `face_embeddings`
- `attendance`

Each user can have multiple embeddings to improve robustness across capture conditions. Embeddings are stored as binary float32 arrays (`2048` bytes each).

## 9. API Design

Representative endpoints include:
- system health and model readiness
- user creation/list/deletion
- attendance scan and manual mark
- attendance history retrieval
- daily statistics
- recent scan log extraction

The API returns structured JSON payloads and explicit status outcomes for scan results and operational errors.

## 10. Performance Characteristics

On CPU-only configurations, end-to-end scan latency is typically within approximately `300-700 ms`, with ArcFace inference as the dominant fixed compute cost at prototype scale.

Performance degradation at larger user counts is primarily attributable to full-table embedding retrieval on each scan request, followed by linear similarity computation.

## 11. Engineering Trade-offs

The implementation prioritizes operational simplicity, transparency, and local deployability over large-scale optimization:
- SQLite simplifies setup but limits concurrent write scalability.
- Crop-resize alignment is fast but less robust for extreme pose variation.
- Brute-force matching is straightforward but not optimized for very large embedding sets.
- Zero-build frontend simplifies deployment but omits framework-level tooling.

## 12. Security and Privacy Considerations

The architecture is local-first; biometric artifacts are processed and stored on the host system by default. However, the prototype currently lacks:
- authentication and authorization controls
- liveness detection against spoofed media
- TLS configuration for non-localhost browser capture contexts

These are identified as critical items for hardened deployment.

## 13. Limitations

Current limitations include:
- no anti-spoofing/liveness module
- one-face processing policy per frame (largest face)
- no landmark-based alignment
- SQLite locking constraints under concurrent writes
- fixed attendance rule (one record per day)
- no built-in export/backup workflow
- no enrollment quality scoring feedback

## 14. Future Work

### 14.1 Short-Term

- in-memory embedding cache with vectorized matching
- authentication and protected write endpoints
- HTTPS for LAN deployments
- registration quality scoring and embedding deduplication

### 14.2 Medium-Term

- ANN-based similarity search (FAISS)
- landmark-based alignment integration
- multi-face scan handling
- PostgreSQL migration for multi-terminal deployments
- passive liveness checks

### 14.3 Long-Term

- active liveness interaction flows
- multi-session attendance policies
- role-based administration and audit controls
- SIS integrations and deployment automation

## 15. Conclusion

The Smart Attendance System demonstrates that a practical biometric attendance workflow can be implemented as a local, transparent, and cost-efficient engineering system. The prototype validates real-time recognition, automatic attendance marking, and end-to-end operability using commodity hardware. While not production-hardened in its current state, the architecture provides a strong foundation for incremental improvements in security, scalability, and operational robustness.
