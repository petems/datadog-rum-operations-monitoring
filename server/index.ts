import express, { type Request, type Response } from 'express'

const app = express()
app.use(express.json())

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** Every mock endpoint honours ?latency=<ms>&errorRate=<0..1>. */
function mockEndpoint(payload: () => object) {
  return async (req: Request, res: Response) => {
    const latency = num(req.query.latency, 300, 0, 30_000)
    const errorRate = num(req.query.errorRate, 0, 0, 1)
    await sleep(latency)
    if (res.destroyed) return // client aborted (abandoned operation)
    if (Math.random() < errorRate) {
      const status = Math.random() < 0.5 ? 500 : 503
      res.status(status).json({ error: status === 500 ? 'Internal Server Error' : 'Service Unavailable' })
      return
    }
    res.json(payload())
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get(
  '/api/cart',
  mockEndpoint(() => ({
    items: [
      { sku: 'DOG-TOY-01', name: 'Squeaky bone', qty: 2, price: 4.99 },
      { sku: 'DOG-BED-07', name: 'Memory foam bed', qty: 1, price: 59.0 },
    ],
  })),
)

app.post('/api/payment', mockEndpoint(() => ({ paymentMethodId: `pm_${Math.random().toString(36).slice(2, 10)}` })))

app.post('/api/order', mockEndpoint(() => ({ orderId: `ord_${Math.random().toString(36).slice(2, 10)}` })))

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => console.log(`mock API listening on http://localhost:${port}`))
