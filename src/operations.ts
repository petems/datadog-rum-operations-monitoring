import { addError, fail, start, succeed, type FailureReason } from './rum'

export type OperationDef = {
  /** Operation name: letters, digits and - _ . @ $ only, no whitespace. */
  name: string
  label: string
  description: string
  method: 'GET' | 'POST'
  path: string
}

export const OPERATIONS: OperationDef[] = [
  {
    name: 'checkout.load_cart',
    label: 'Load cart',
    description: 'The user opens their cart; it must load with items.',
    method: 'GET',
    path: '/api/cart',
  },
  {
    name: 'checkout.save_payment',
    label: 'Save payment method',
    description: 'The user saves a card for this order.',
    method: 'POST',
    path: '/api/payment',
  },
  {
    name: 'checkout.place_order',
    label: 'Place order',
    description: 'The user clicks "Pay"; an order must be created.',
    method: 'POST',
    path: '/api/order',
  },
]

export type RunSettings = {
  /** Base server latency in ms. */
  latencyMs: number
  /** 0..1, applied as +/- fraction of latencyMs. */
  jitter: number
  /** 0..1 chance the mock API returns a 5xx. */
  errorRate: number
  /** 0..1 chance the user "gives up" before the request completes. */
  abandonRate: number
}

export type Outcome = 'success' | FailureReason

export type OperationResult = {
  name: string
  operationKey: string
  outcome: Outcome
  durationMs: number
}

type Listener = (r: OperationResult) => void
type StartListener = (name: string) => void
const resultListeners = new Set<Listener>()
const startListeners = new Set<StartListener>()
export const onOperationResult = (fn: Listener) => resultListeners.add(fn)
export const onOperationStart = (fn: StartListener) => startListeners.add(fn)

let attemptCounter = 0

/**
 * Runs one operation end to end:
 *   startOperation -> fetch -> succeedOperation | failOperation('error' | 'abandoned')
 * Each run gets a unique operationKey so concurrent runs of the same operation
 * are tracked independently.
 */
export async function runOperation(op: OperationDef, settings: RunSettings): Promise<OperationResult> {
  const operationKey = crypto.randomUUID()
  const jitterFactor = 1 + (Math.random() * 2 - 1) * settings.jitter
  const latency = Math.max(0, Math.round(settings.latencyMs * jitterFactor))
  const willAbandon = Math.random() < settings.abandonRate
  const context = { attempt: ++attemptCounter, simulated_latency_ms: latency }

  const t0 = performance.now()
  start(op.name, operationKey, context)
  startListeners.forEach((l) => l(op.name))

  const controller = new AbortController()
  let abandonTimer: ReturnType<typeof setTimeout> | undefined
  if (willAbandon) {
    // The user navigates away / closes the modal partway through the request.
    abandonTimer = setTimeout(() => controller.abort(), latency * (0.2 + Math.random() * 0.6))
  }

  let outcome: Outcome
  try {
    const qs = new URLSearchParams({ latency: String(latency), errorRate: String(settings.errorRate) })
    const res = await fetch(`${op.path}?${qs}`, {
      method: op.method,
      signal: controller.signal,
      headers: op.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: op.method === 'POST' ? JSON.stringify({ operationKey }) : undefined,
    })
    if (!res.ok) throw new Error(`${op.method} ${op.path} failed with ${res.status}`)
    await res.json()
    succeed(op.name, operationKey, context)
    outcome = 'success'
  } catch (err) {
    if (controller.signal.aborted) {
      fail(op.name, 'abandoned', operationKey, context)
      outcome = 'abandoned'
    } else {
      const error = err instanceof Error ? err : new Error(String(err))
      addError(error, { operation: op.name, operationKey })
      fail(op.name, 'error', operationKey, { ...context, error_message: error.message })
      outcome = 'error'
    }
  } finally {
    clearTimeout(abandonTimer)
  }

  const result = { name: op.name, operationKey, outcome, durationMs: performance.now() - t0 }
  resultListeners.forEach((l) => l(result))
  return result
}

/** Runs the three checkout operations in order, stopping at the first failure (a journey). */
export async function runCheckoutJourney(settings: RunSettings): Promise<OperationResult[]> {
  const results: OperationResult[] = []
  for (const op of OPERATIONS) {
    const r = await runOperation(op, settings)
    results.push(r)
    if (r.outcome !== 'success') break
  }
  return results
}
