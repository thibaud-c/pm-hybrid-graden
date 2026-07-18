import app from './app'

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
})

console.log(`API listening on http://localhost:${process.env.PORT ?? 3000}`)
