# 🔐 Better Auth Starter Template

This template provides a simple, ready-to-use authentication server as a starting point for your app. Build your own reliable auth server while maintaining full ownership of your data without proprietary restrictions.

中文说明：`README.zh-CN.md`

## ✨ Features
- 📧 Email and password login and registration
- ✅ Email verification + password reset (email callbacks)
- 🔐 Multi-factor authentication (TOTP + backup codes)
- 🏢 Organizations + teams (roles & permissions)
- 🔑 Passkeys (WebAuthn)
- 🛡️ Rate limiting on auth endpoints
- 💳 Stripe (customer + checkout/portal endpoints + webhook)
- 🩺 Healthcheck endpoint
- 📚 OpenAPI plugin enabled
- 💾 Session storage in Redis
- ⚡ Built with Hono.js for lightning-fast performance
- 📦 Compiles to a single Bun binary for easy deployment

## 🔧 Setup

Required environment variables:
- `REDIS_URL` - Connection string for Redis
- `DATABASE_URL` - Connection string for your database
- `BETTER_AUTH_SECRET` - Secret key for encryption and security
Optional (recommended) environment variables:
- `BETTER_AUTH_URL` - Public base URL of this auth server (helps behind proxies)
- `APP_NAME` - App name shown in emails and passkey prompts
- `APP_WEB_URL` - Public URL of your frontend (used for invitation links)

Email (Resend; otherwise emails are logged to console):
- `RESEND_API_KEY`
- `EMAIL_FROM`

Email allow/deny lists:
- `EMAIL_ALLOWLIST` - Comma-separated emails (e.g. `a@x.com,b@y.com`)
- `EMAIL_ALLOW_DOMAINS` - Comma-separated domains (e.g. `company.com,company.org`)
- `EMAIL_DENYLIST` - Comma-separated emails
- `EMAIL_DENY_DOMAINS` - Comma-separated domains

Passkeys (WebAuthn):
- `PASSKEY_RP_ID` - e.g. `example.com` (defaults to request hostname)
- `PASSKEY_ORIGIN` - e.g. `https://example.com` (defaults to request origin)
- `PASSKEY_RP_NAME` - Display name (defaults to `APP_NAME`)

Captcha (official Better Auth plugin):
- Header: `x-captcha-response: <token>` (required on protected endpoints)
- Optional header: `x-captcha-provider: cloudflare-turnstile|google-recaptcha` (when both are enabled)
- `CAPTCHA_ENDPOINTS` - Comma-separated Better Auth endpoint paths to protect (defaults: `/sign-up/email,/sign-in/email,/request-password-reset`)
- Cloudflare Turnstile: `CLOUDFLARE_TURNSTILE_SECRET_KEY`
- Optional: `CLOUDFLARE_TURNSTILE_SITEVERIFY_URL_OVERRIDE` (for testing/proxies)
- Google reCAPTCHA: `GOOGLE_RECAPTCHA_SECRET_KEY`
- `GOOGLE_RECAPTCHA_MIN_SCORE` - Optional (reCAPTCHA v3), default plugin behavior is `0.5`
- Optional: `GOOGLE_RECAPTCHA_SITEVERIFY_URL_OVERRIDE` (for testing/proxies)

Stripe:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID` - Default subscription price for checkout
- `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` - Optional checkout redirects
- `STRIPE_RETURN_URL` - Optional billing portal return URL

## 💡 Considerations
- 🔄 I strongly encourage **FORKING THIS REPO** and modifying the config to suit your needs, add other providers, email sending, etc.
- 🗄️ You can use the same DB for your app and this auth server, just be careful with the migrations. This enables you to directly interact with the users and auth tables from your main application.
- 🔌 You can use the endpoints directly or use better-auth on the client side and [set the base URL in the config file (highly recommended)](https://www.better-auth.com/docs/installation#create-client-instance).
- 📚 For complete documentation, visit [Better Auth Docs](https://www.better-auth.com).

## 🚀 Getting Started

### Railway Template (recommended)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/VOQsdL?referralCode=4ArgSI)

(If you aren't hosting on Railway or aren't using the Railpack builder you can safely delete the `railpack.json` file)

### Self host
1. Clone or fork this repository
2. Set up the required environment variables
3. Install the dependencies with `bun install`
4. Run the server with `bun run dev` (development) or `bun run build` (production)
5. Connect your application

### Main Endpoints
- `GET /health` - Check the health of the server
- `GET /api/auth/reference` - Scalar docs for all of the OpenAPI endpoints
- `POST /api/auth/sign-out` - Logout a user
- `POST /api/auth/sign-up/email` - Register a new user
```
{
  "name": "",
  "email": "",
  "password": "",
  "callbackURL": ""
}
```
- `POST /api/auth/sign-in/email` - Login a user
```
{
  "email": "",
  "password": "",
  "callbackURL": "",
  "rememberMe": ""
}
```
- `POST /api/auth/passkey/generate-registration-options` - Create passkey (requires session)
- `POST /api/auth/passkey/verify-registration` - Save passkey (requires session)
- `POST /api/auth/passkey/generate-authentication-options` - Passkey login options (by email)
- `POST /api/auth/passkey/verify-authentication` - Passkey login (sets session cookie)
- `POST /api/auth/stripe/create-checkout-session` - Start Stripe checkout (requires session)
- `POST /api/auth/stripe/create-portal-session` - Open billing portal (requires session)
- `POST /api/stripe/webhook` - Stripe webhook (raw body + signature)

### Testing
- Run all tests: `bun run test`
- Watch mode: `bun run test:watch`

### cURL Examples

Sign up (email verification is required by default in `src/lib/auth.ts`):
```bash
curl -i http://localhost:3000/api/auth/sign-up/email \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  -H 'x-captcha-response: <token-if-captcha-enabled>' \
  --data '{
    "name": "Alice",
    "email": "alice@example.com",
    "password": "Test123456!",
    "callbackURL": "/"
  }'
```

Sign in (after verifying email):
```bash
curl -i http://localhost:3000/api/auth/sign-in/email \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  -H 'x-captcha-response: <token-if-captcha-enabled>' \
  -c cookies.txt -b cookies.txt \
  --data '{
    "email": "alice@example.com",
    "password": "Test123456!",
    "callbackURL": "/",
    "rememberMe": true
  }'
```

Get current session:
```bash
curl -i http://localhost:3000/api/auth/get-session \
  -H 'Origin: http://localhost:3000' \
  -b cookies.txt
```

Sign out:
```bash
curl -i http://localhost:3000/api/auth/sign-out \
  -X POST \
  -H 'Origin: http://localhost:3000' \
  -c cookies.txt -b cookies.txt
```

## ✨ Soon
- Admin panel
