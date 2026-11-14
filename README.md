# Enterprise Distributed Event-Driven Payment & Ledger Ecosystem

A production-grade distributed transaction ecosystem showcasing advanced systems engineering: event-driven architecture, ACID double-entry balance conservation, transactional outbox relays, high-resilience Webpack 5 Module Federation micro-frontends, core data structures & algorithms (DS&A), and declarative Kubernetes manifests.

---

## 1. Architectural Topology

```
+-------------------------------------------------------------------------------------------------------------------+
|                                    MICRO-FRONTEND SHELL (Webpack 5 Module Federation)                              |
|  +------------------------------+  +--------------------------------+  +---------------------------------------+  |
|  | Remote 1: Checkout MFE       |  | Remote 2: Ledger Activity MFE   |  | Remote 3: Live System Metrics MFE     |  |
|  | - Optimistic State & Rollback|  | - Live SSE / WebSocket Feed    |  | - Grafana/Prometheus Dashboard Embed  |  |
|  | - Multi-Stage Lifecycle Step |  | - Fallback Snapshot Cache      |  | - Real-time Consumer Lag & p99 Latency|  |
|  | - Offline Sync Worker Queue  |  | - Error Boundary Isolation     |  | - Chaos Injection Controls            |  |
|  +------------------------------+  +--------------------------------+  +---------------------------------------+  |
+----------------------------------------------------+--------------------------------------------------------------+
                                                     |
                                                     v (HTTPS / REST / SSE)
+-------------------------------------------------------------------------------------------------------------------+
|                                     API GATEWAY & SECURITY GUARD LAYER                                            |
|  - Token Bucket & Sliding Window Rate Limiter (Redis Sorted Sets + in-memory fallback)                            |
|  - Field-Level Envelope Encryption (KMS) & HMAC Signature Verification                                            |
|  - Bloom Filter Pre-Check for Fast-Path Idempotency                                                              |
+--------------------+-------------------------------+-------------------------------+------------------------------+
                     |                               |                               |
                     v                               v                               v
+-----------------------------+ +-----------------------------+ +---------------------------------------------------+
| 1. PAYMENT INGESTION SERVICE| |      2. LEDGER SERVICE      | |          3. NOTIFICATION & PASS SERVICE          |
| - Fast-path Redis Mutex     | | - Double-Entry Ledger Engine| | - Downstream Push & Webhook Dispatch              |
| - Protobuf Serialization    | | - Transactional Outbox      | | - Circuit Breaker & Exponential Backoff + Jitter|
| - Publishes: `payment.init` | | - Consumes: `payment.init`  | | - Dead Letter Queue (DLQ) Manager               |
| - LMAX Disruptor RingBuffer | | - Publishes: `pay.settled`  | | - Consumes: `payment.settled`                     |
+--------------+--------------+ +--------------+--------------+ +--------------------+------------------------------+
               |                               |                                     |
               +-------------------------------+-------------------------------------+
                                               |
                                               v
+-------------------------------------------------------------------------------------------------------------------+
|                                  APACHE KAFKA EVENT BACKBONE & SCHEMA REGISTRY                                    |
|  - Confluent Schema Registry (Protobuf Contracts & Backward Compatibility Enforcement)                            |
|  - Topics: `payment.init` (Partitions: 12, Key: sender_account_id)                                                |
|  - Topics: `payment.settled` (Partitions: 12, Key: sender_account_id)                                             |
|  - Topics: `payment.dlq` (Partitions: 6, Key: transaction_id)                                                     |
+----------------------------------------------+--------------------------------------------------------------------+
                                               |
                                               v
+-------------------------------------------------------------------------------------------------------------------+
|                                    4. CQRS READ & AUDIT ANALYTICS SERVICE                                         |
|  - Consumes: `payment.settled`                                                                                    |
|  - Materializes read models in memory & PostgreSQL for O(1) query performance                                     |
|  - Exposes Server-Sent Events (SSE) endpoint to Ledger Activity MFE & Checkout Stepper                            |
+-------------------------------------------------------------------------------------------------------------------+
```

---

## 2. Core Modules & Directory Structure

```
enterprise-payment-ecosystem/
├── backend/                   # Spring Boot Microservices & Shared Libraries (Gradle multi-project)
│   ├── shared/
│   │   ├── common-dsa/            # High-performance DS&A algorithms
│   │   │   ├── SlidingWindowRateLimiter.java  # Redis ZSET Lua & in-memory sliding window
│   │   │   ├── ScalableBloomFilter.java       # Fast-path MurmurHash3 idempotency filter
│   │   │   ├── FxRoutingDag.java              # Dijkstra optimal FX routes + cycle detection
│   │   │   └── RingBufferQueue.java           # LMAX Disruptor lock-free concurrency queue
│   │   └── common-events/         # Protobuf & Java event contracts
│   │       ├── PaymentInitEvent.java
│   │       ├── PaymentSettledEvent.java
│   │       └── PaymentDlqEvent.java
│   ├── services/
│   │   ├── ingestion-service/     # Port 8080: Gateway, HMAC, Bloom filter, Mutex, RingBuffer
│   │   ├── ledger-service/        # Port 8081: Double-entry ACID, Lexicographical lock, Outbox
│   │   ├── notification-service/  # Port 8082: Circuit Breaker, Exponential backoff jitter, DLQ
│   │   └── analytics-cqrs-service/# Port 8083: Materialized views, SSE endpoints (/stream)
│   ├── build.gradle               # Backend build configuration
│   ├── settings.gradle            # Backend multi-project definitions
│   └── gradlew.bat / gradlew      # Backend Gradle wrapper
├── frontend/                  # Webpack 5 Module Federation + Vite React app
│   ├── src/
│   │   ├── shell/             # Host Shell container & ErrorBoundary isolation
│   │   ├── remotes/
│   │   │   ├── checkout/      # Remote 1: Optimistic state, Stepper, Offline sync
│   │   │   ├── ledger/        # Remote 2: Live SSE feed, Double-entry inspector
│   │   │   └── metrics/       # Remote 3: Consumer lag, Latency, Chaos triggers
│   │   └── index.css          # Cyber dark glassmorphism design system
│   ├── webpack.config.shell.js
│   └── webpack.config.remotes.js
├── k8s/                       # Complete Kubernetes Manifests
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── data-stores.yaml       # PostgreSQL & Redis StatefulSets
│   ├── kafka.yaml             # Kafka, Zookeeper, Schema Registry
│   ├── apps.yaml              # 4 Microservices Deployments + HPA
│   ├── ingress.yaml           # Nginx Ingress routing
│   └── kustomization.yaml     # `kubectl apply -k k8s/`
├── docker/postgres/init.sql   # PostgreSQL DDL & Seeds
├── docker-compose.yml         # Local orchestration
├── benchmarks/k6-load-test.js # 1,000 VU load benchmark with 30% duplicate keys
└── scripts/
    ├── start-all.ps1          # Launches Docker & Microservices
    ├── chaos_injection.ps1    # Automated Toxiproxy fault injection
    └── sync-to-d-projects.ps1 # Mirroring script to D:\Projects
```

---

## 3. Core Data Structures & Algorithms (DS&A)

1. **Sliding Window Counter Rate Limiter (Redis ZSET + In-Memory)**:
   - Eliminates fixed-window boundary burst spikes.
   - Cleans stale timestamps older than `(now - window)` with `ZREMRANGEBYSCORE`.
2. **Scalable Bloom Filter for Fast-Path Idempotency**:
   - $O(k)$ set membership test with **zero false negatives**.
   - If `mightContain(key) == false`, the idempotency key is mathematically guaranteed to be new, bypassing heavy cache/database lookups.
3. **Directed Acyclic Graph (DAG) for Multi-Hop FX & Fee Routing**:
   - Uses Dijkstra's algorithm to compute the lowest-fee liquidity conversion path across multi-currency pairs.
   - Applies Kahn's topological sort to guarantee acyclic fee deduction hierarchies.
4. **Ring Buffer (LMAX Disruptor Pattern) for Lock-Free Concurrency**:
   - Power-of-two circular buffer using atomic sequence progression (`compareAndSet`), preventing synchronized lock contention and GC overhead.

---

## 4. Quick Start Guide

### Option A: Local Development (One-Click PowerShell)
To launch all Docker containers, compile the backend, launch all 4 Spring Boot microservices, and start the React frontend dev server with a single command:
```powershell
.\scripts\start-all.ps1
```
> Useful flags:
> - `.\scripts\start-all.ps1 -DockerOnly` : Start only Docker infrastructure (Kafka, Postgres, Redis, etc.)
> - `.\scripts\start-all.ps1 -BackendOnly` : Start Docker and backend microservices, skipping the frontend
> - `.\scripts\start-all.ps1 -SkipBuild` : Skip gradle rebuild for instant startup
> - `.\scripts\stop-all.ps1` : Stop all services and tear down containers cleanly

### Option B: Manual Step-by-Step
```powershell
# 1. Start infrastructure (Kafka, Schema Registry, PostgreSQL, Redis, Toxiproxy)
docker-compose up -d

# 2. Build and run backend microservices
cd backend
.\gradlew.bat build -x test

# Run individual microservices:
.\gradlew.bat :services:ingestion-service:bootRun
.\gradlew.bat :services:ledger-service:bootRun
.\gradlew.bat :services:notification-service:bootRun
.\gradlew.bat :services:analytics-cqrs-service:bootRun

# 3. Start Frontend Micro-Frontend Shell
cd ..\frontend
npm install
npm run dev
# Open http://localhost:3000 (or 3001) in your browser
```

### Option B: Kubernetes Deployment
Deploy the full stack onto any Kubernetes cluster (Minikube, Kind, EKS, GKE, AKS) with a single command:
```bash
kubectl apply -k k8s/
```

### Option C: Run Chaos Testing
```powershell
.\scripts\chaos_injection.ps1
```

---

## 5. Architectural Invariants Verified
* **Balance Conservation Invariant**: $\sum \text{Debits} = \sum \text{Credits}$ across all transactions.
* **Lexicographical Lock Ordering**: `ORDER BY id FOR UPDATE` completely eliminates distributed deadlocks on concurrent transfers ($A \to B$ and $B \to A$).
* **Optimistic Frontend Resilience**: Local balances are updated optimistically with automatic animated rollback upon failure.
