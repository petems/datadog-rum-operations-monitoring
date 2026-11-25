import { OPERATIONS, runCheckoutJourney, runOperation, type RunSettings } from './operations'

export type GeneratorSettings = RunSettings & {
  /** Operations started per minute. */
  perMinute: number
  /** Max operations in flight at once. */
  concurrency: number
  /** 'random' picks one operation per tick; 'journey' runs the full checkout per tick. */
  mode: 'random' | 'journey'
}

export class TrafficGenerator {
  private timer: ReturnType<typeof setTimeout> | undefined
  private inFlight = 0
  private onChange: () => void

  constructor(
    private getSettings: () => GeneratorSettings,
    onChange: () => void = () => {},
  ) {
    this.onChange = onChange
  }

  get running() {
    return this.timer !== undefined
  }

  get active() {
    return this.inFlight
  }

  start() {
    if (this.running) return
    this.schedule(0)
    this.onChange()
  }

  stop() {
    clearTimeout(this.timer)
    this.timer = undefined
    this.onChange()
  }

  private schedule(delay: number) {
    this.timer = setTimeout(() => this.tick(), delay)
  }

  private tick() {
    const s = this.getSettings()
    if (this.inFlight < s.concurrency) {
      this.inFlight++
      this.onChange()
      const work =
        s.mode === 'journey'
          ? runCheckoutJourney(s)
          : runOperation(OPERATIONS[Math.floor(Math.random() * OPERATIONS.length)], s)
      work.finally(() => {
        this.inFlight--
        this.onChange()
      })
    }
    // Poisson-ish arrivals: exponential inter-arrival time around the mean rate.
    const meanMs = 60_000 / Math.max(1, s.perMinute)
    const next = -Math.log(1 - Math.random()) * meanMs
    if (this.running) this.schedule(Math.min(next, meanMs * 4))
  }
}
