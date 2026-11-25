# Datadog RUM Operations Monitoring demo

A small browser app that shows how [RUM Operations Monitoring](https://docs.datadoghq.com/real_user_monitoring/operations_monitoring/) works.
It instruments three checkout operations with the RUM Browser SDK. A built-in traffic generator then fires them at tunable
latency, error and abandon rates, so the Operations catalog, metrics and SLOs fill up with realistic data within minutes.

```
checkout.load_cart     -> GET  /api/cart
checkout.save_payment  -> POST /api/payment
checkout.place_order   -> POST /api/order
```

Each run does this:

```ts
datadogRum.startOperation(name, { operationKey, context })
// fetch(...) against the mock API
datadogRum.succeedOperation(name, { operationKey, context })            // 2xx
datadogRum.failOperation(name, 'error', { operationKey, context })      // 5xx / network error (+ addError)
datadogRum.failOperation(name, 'abandoned', { operationKey, context })  // user "gave up" (request aborted)
```

Every run gets a unique `operationKey`, so many concurrent runs of the same operation are tracked independently.

## Prerequisites

- [RUM without Limits](https://docs.datadoghq.com/real_user_monitoring/rum_without_limits/) enabled in your Datadog org
- A RUM browser application (Digital Experience → Manage Applications) to get an application ID and client token
- Node.js 20+

## Run it

```bash
cp .env.example .env     # fill in VITE_DD_APPLICATION_ID, VITE_DD_CLIENT_TOKEN, VITE_DD_SITE
npm install
npm run dev              # Vite on :5173 + mock API on :3001
```

Open http://localhost:5173. If no credentials are set, the app runs in **log-only mode**: it shows the SDK calls it would make
but sends nothing to Datadog.

### The page

- **Settings**: base latency, jitter, error rate (the mock API returns 500/503), abandon rate (the request is aborted
  partway through), operations per minute, concurrency, and the mode (one random operation per tick, or the full
  three-step checkout journey).
- **Operations table**: a "Run once" button for each operation, plus live counts of started, success, error and abandoned
  runs, success rate and average duration.
- **SDK calls**: a live log of every `startOperation` / `succeedOperation` / `failOperation` / `addError` call.

## What to look at in Datadog

| Where | What |
| --- | --- |
| RUM → Performance Monitoring → **Operations** | The catalog: volume, completion rate and failure rate for `checkout.*` |
| **RUM Explorer** | `@type:vital @operation.name:checkout.*`, then group by `@operation.status` / `@operation.failure_reason` |
| **Metrics** | `sum:rum.measure.operation{operation.name:checkout.place_order} by {operation.status,operation.failure_reason}.as_count()` |
| | `p95:rum.measure.operation.duration{operation.name:checkout.place_order}` |

Metrics can take a few minutes to appear the first time.

Things to try next:

- **Journey**: link the three operations to a "Checkout" journey in Journey Monitoring. Datadog creates a 99%
  availability SLO for each operation automatically.
- **SLO / monitor**: an availability SLO using `operation.status:success` over all operations, or a latency SLO on
  `rum.measure.operation.duration`.
- **Retention filter**: keep sessions with `@operation.status:failure` so you can open the Session Replay of a failed checkout.
- **Incident demo**: while the generator runs, raise the error rate to 50% and watch the failure rate and burn rate react.

## Notes

- This uses Browser SDK v7, where the API is `startOperation` / `succeedOperation` / `failOperation`.
  On v6.20+ the same calls are `startFeatureOperation` / `succeedFeatureOperation` / `failFeatureOperation`, and you must
  add `enableExperimentalFeatures: ['feature_operation_vital']` to `init`.
- Operation names may contain only letters, digits and `- _ . @ $`, with no whitespace.
- Operations that are started but never stopped are closed as `timeout` failures when the session expires.
- `VITE_DD_PROXY` (optional) sends intake traffic through a [proxy](https://docs.datadoghq.com/real_user_monitoring/guide/proxy-rum-data/).
  It's also handy for inspecting the raw `vital` events locally.

## Layout

```
src/rum.ts          SDK init + thin wrappers that also feed the on-page log
src/operations.ts   operation definitions, runOperation(), runCheckoutJourney()
src/generator.ts    traffic generator (Poisson-ish arrivals, concurrency cap)
src/main.ts         UI wiring
server/index.ts     Express mock API (?latency=&errorRate=)
```
