import { Hono } from 'hono'
import { auth } from './lib/auth'
import { logger } from 'hono/logger'
import { handleStripeWebhook } from './lib/stripe-webhook'
const app = new Hono()

app.use(logger())

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  })
})

app.post("/api/stripe/webhook", async (c) => {
	const rawBody = await c.req.raw.text();
	const signature = c.req.raw.headers.get("stripe-signature");
	const authCtx = await auth.$context;
	await handleStripeWebhook({
		rawBody,
		signature,
		authContext: authCtx,
	});
	return c.json({ received: true });
});

/**
 * Better Auth routes, see docs before changing
 * @link https://better-auth.com/docs
 */
app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

export default app
