import { datadogRum, type FailureReason } from '@datadog/browser-rum'

export type { FailureReason }

const env = import.meta.env
const applicationId = env.VITE_DD_APPLICATION_ID as string | undefined
const clientToken = env.VITE_DD_CLIENT_TOKEN as string | undefined

/** True when credentials are present and the SDK has been initialised. */
export const rumEnabled = Boolean(applicationId && clientToken)

if (rumEnabled) {
  datadogRum.init({
    applicationId: applicationId!,
    clientToken: clientToken!,
    site: (env.VITE_DD_SITE as string) || 'datadoghq.com',
    service: (env.VITE_DD_SERVICE as string) || 'rum-operations-demo',
    env: (env.VITE_DD_ENV as string) || 'demo',
    version: '0.1.0',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'allow',
    // Optional: forward intake requests through your own proxy (see README).
    proxy: (env.VITE_DD_PROXY as string) || undefined,
  })
}

// ---------------------------------------------------------------------------
// Event log: every SDK call is mirrored here so the UI can show it live.
// ---------------------------------------------------------------------------

export type SdkCall = {
  at: Date
  fn: 'startOperation' | 'succeedOperation' | 'failOperation' | 'addError'
  name: string
  operationKey?: string
  failureReason?: FailureReason
  context?: Record<string, unknown>
}

type Listener = (call: SdkCall) => void
const listeners = new Set<Listener>()
export const onSdkCall = (fn: Listener) => listeners.add(fn)
const emit = (call: Omit<SdkCall, 'at'>) => listeners.forEach((l) => l({ ...call, at: new Date() }))

// ---------------------------------------------------------------------------
// Thin wrappers around the RUM Operations API (Browser SDK v7).
// In v6.x these were startFeatureOperation / succeedFeatureOperation / failFeatureOperation
// and required enableExperimentalFeatures: ['feature_operation_vital'].
// ---------------------------------------------------------------------------

export function start(name: string, operationKey: string, context?: Record<string, unknown>) {
  if (rumEnabled) datadogRum.startOperation(name, { operationKey, context })
  emit({ fn: 'startOperation', name, operationKey, context })
}

export function succeed(name: string, operationKey: string, context?: Record<string, unknown>) {
  if (rumEnabled) datadogRum.succeedOperation(name, { operationKey, context })
  emit({ fn: 'succeedOperation', name, operationKey, context })
}

export function fail(
  name: string,
  failureReason: FailureReason,
  operationKey: string,
  context?: Record<string, unknown>,
) {
  if (rumEnabled) datadogRum.failOperation(name, failureReason, { operationKey, context })
  emit({ fn: 'failOperation', name, operationKey, failureReason, context })
}

export function addError(error: Error, context?: Record<string, unknown>) {
  if (rumEnabled) datadogRum.addError(error, context)
  emit({ fn: 'addError', name: error.message, context })
}
