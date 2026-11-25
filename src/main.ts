import './style.css'
import { onSdkCall, rumEnabled, type SdkCall } from './rum'
import {
  OPERATIONS,
  onOperationResult,
  onOperationStart,
  runCheckoutJourney,
  runOperation,
  type Outcome,
} from './operations'
import { TrafficGenerator, type GeneratorSettings } from './generator'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

// ---------------------------------------------------------------- settings
const form = $<HTMLFormElement>('#settings')
function readSettings(): GeneratorSettings {
  const f = new FormData(form)
  const n = (k: string) => Number(f.get(k) ?? 0)
  return {
    latencyMs: n('latencyMs'),
    jitter: n('jitter') / 100,
    errorRate: n('errorRate') / 100,
    abandonRate: n('abandonRate') / 100,
    perMinute: n('perMinute'),
    concurrency: Math.max(1, n('concurrency')),
    mode: f.get('mode') === 'journey' ? 'journey' : 'random',
  }
}

// ---------------------------------------------------------------- banner
const banner = $('#banner')
if (!rumEnabled) {
  banner.hidden = false
  banner.textContent =
    'No Datadog credentials found (VITE_DD_APPLICATION_ID / VITE_DD_CLIENT_TOKEN). Running in log-only mode: ' +
    'SDK calls are shown below but nothing is sent to Datadog. Copy .env.example to .env and restart.'
}

// ---------------------------------------------------------------- counters
type Stats = { started: number; success: number; error: number; abandoned: number; other: number; totalMs: number }
const blank = (): Stats => ({ started: 0, success: 0, error: 0, abandoned: 0, other: 0, totalMs: 0 })
const stats = new Map<string, Stats>(OPERATIONS.map((o) => [o.name, blank()]))

const tbody = $('#ops-body')
for (const op of OPERATIONS) {
  const tr = document.createElement('tr')
  tr.dataset.op = op.name
  tr.innerHTML = `
    <td><code>${op.name}</code><div class="muted small">${op.description} <span class="tag">${op.method} ${op.path}</span></div></td>
    <td data-k="started"></td><td data-k="success"></td><td data-k="error"></td><td data-k="abandoned"></td>
    <td data-k="rate"></td><td data-k="avg"></td>
    <td><button data-run="${op.name}">Run once</button></td>`
  tbody.append(tr)
}

function render() {
  for (const [name, s] of stats) {
    const row = tbody.querySelector<HTMLTableRowElement>(`tr[data-op="${name}"]`)!
    const set = (k: string, v: string) => (row.querySelector(`[data-k="${k}"]`)!.textContent = v)
    const done = s.success + s.error + s.abandoned + s.other
    set('started', String(s.started))
    set('success', String(s.success))
    set('error', String(s.error))
    set('abandoned', String(s.abandoned))
    set('rate', done ? `${((s.success / done) * 100).toFixed(1)}%` : '–')
    set('avg', done ? `${Math.round(s.totalMs / done)} ms` : '–')
  }
}

onOperationStart((name) => {
  stats.get(name)!.started++
  render()
})
onOperationResult((r) => {
  const s = stats.get(r.name)!
  s[r.outcome as Outcome]++
  s.totalMs += r.durationMs
  render()
})
render()

tbody.addEventListener('click', (e) => {
  const name = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-run]')?.dataset.run
  const op = OPERATIONS.find((o) => o.name === name)
  if (op) void runOperation(op, readSettings())
})

// ---------------------------------------------------------------- generator
const toggle = $<HTMLButtonElement>('#gen-toggle')
const status = $('#gen-status')
const gen = new TrafficGenerator(readSettings, () => {
  toggle.textContent = gen.running ? 'Stop traffic generator' : 'Start traffic generator'
  toggle.classList.toggle('danger', gen.running)
  status.textContent = gen.running ? `running – ${gen.active} in flight` : gen.active ? `${gen.active} finishing…` : ''
})
toggle.addEventListener('click', () => (gen.running ? gen.stop() : gen.start()))

$('#journey').addEventListener('click', () => void runCheckoutJourney(readSettings()))
$('#reset').addEventListener('click', () => {
  for (const k of stats.keys()) stats.set(k, blank())
  render()
  log.replaceChildren()
})

// ---------------------------------------------------------------- SDK call log
const log = $('#log')
const MAX_LOG = 200
onSdkCall((c: SdkCall) => {
  const li = document.createElement('li')
  li.className = c.fn === 'failOperation' ? `fail ${c.failureReason}` : c.fn
  const time = c.at.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(c.at.getMilliseconds()).padStart(3, '0')
  const args =
    c.fn === 'addError'
      ? `new Error(${JSON.stringify(c.name)})`
      : [
          JSON.stringify(c.name),
          c.failureReason ? JSON.stringify(c.failureReason) : null,
          `{ operationKey: '${c.operationKey?.slice(0, 8)}…' }`,
        ]
          .filter(Boolean)
          .join(', ')
  li.innerHTML = `<span class="muted">${time}</span> <code>datadogRum.${c.fn}(${args})</code>`
  log.prepend(li)
  while (log.childElementCount > MAX_LOG) log.lastElementChild!.remove()
})
