# 🔐 Better Auth Starter 模板（中文）

这是一个基于 Better Auth + Hono 的认证服务模板，默认提供邮箱密码登录，并集成组织/团队、MFA、Passkeys、限流、Stripe 等能力。

## ✨ 功能
- Email & Password：邮箱密码注册/登录
- Email Verification：邮箱验证（注册/登录时触发）
- Password Reset：忘记密码重置邮件
- MFA：两步验证（TOTP + 备份码）
- Organization / Teams：组织与团队、角色与权限
- Passkeys：WebAuthn 无密码登录
- Rate Limiting：对认证端点限流
- Session Management：会话管理（Redis secondaryStorage + multiSession）
- Stripe：Customer/订阅/Portal/Webhook
- CAPTCHA：官方插件（Cloudflare Turnstile / Google reCAPTCHA）

## 🚀 运行
1. 复制环境变量：
   - `cp .env.example .env`
2. 安装依赖：
   - `bun install`
3. 启动开发：
   - `bun run dev`
4. 生产构建（输出单个二进制 `./server`）：
   - `bun run build && bun run start`

## 🧪 测试
- 运行全部测试：`bun run test`
- 监听模式：`bun run test:watch`

## 🔧 环境变量
最小必需：
- `DATABASE_URL`
- `REDIS_URL`
- `BETTER_AUTH_SECRET`

推荐：
- `BETTER_AUTH_URL`：服务的公网 URL（反向代理场景很重要）
- `APP_NAME`：应用名（邮件/Passkey 展示）
- `APP_WEB_URL`：前端 URL（邀请链接等）

邮件（Resend；不配置则邮件内容打印到控制台）：
- `RESEND_API_KEY`
- `EMAIL_FROM`

邮箱黑白名单（逗号分隔，可选）：
- `EMAIL_ALLOWLIST`
- `EMAIL_ALLOW_DOMAINS`
- `EMAIL_DENYLIST`
- `EMAIL_DENY_DOMAINS`

Passkeys（可选但推荐生产开启）：
- `PASSKEY_RP_ID`
- `PASSKEY_ORIGIN`
- `PASSKEY_RP_NAME`

CAPTCHA（官方插件，可选）：
- `CLOUDFLARE_TURNSTILE_SECRET_KEY`（Turnstile）
- `GOOGLE_RECAPTCHA_SECRET_KEY`（reCAPTCHA）
- `GOOGLE_RECAPTCHA_MIN_SCORE`（v3 可选，默认 0.5）
- `CAPTCHA_ENDPOINTS`（默认保护：`/sign-up/email,/sign-in/email,/request-password-reset`）
- 可选：`CLOUDFLARE_TURNSTILE_SITEVERIFY_URL_OVERRIDE`（测试/代理）
- 可选：`GOOGLE_RECAPTCHA_SITEVERIFY_URL_OVERRIDE`（测试/代理）

Stripe（可选）：
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` / `STRIPE_RETURN_URL`

完整示例见：`./.env.example`

## 🧩 关键请求头
CAPTCHA（被保护的端点需要）：
- `x-captcha-response: <token>`
- 可选：`x-captcha-provider: cloudflare-turnstile|google-recaptcha`（当两种都启用时指定）

## 🌐 常用端点
基础：
- `GET /health`
- `GET /api/auth/reference`（OpenAPI 文档）

Passkeys：
- `POST /api/auth/passkey/generate-registration-options`（需要 session）
- `POST /api/auth/passkey/verify-registration`（需要 session）
- `POST /api/auth/passkey/generate-authentication-options`
- `POST /api/auth/passkey/verify-authentication`

Stripe：
- `POST /api/auth/stripe/create-checkout-session`（需要 session）
- `POST /api/auth/stripe/create-portal-session`（需要 session）
- `POST /api/stripe/webhook`

## 🧰 用 cURL 测试

注册（默认在 `src/lib/auth.ts` 开启了邮箱验证）：
```bash
curl -i http://localhost:3000/api/auth/sign-up/email \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  -H 'x-captcha-response: <启用验证码时必填>' \
  --data '{
    "name": "Alice",
    "email": "alice@example.com",
    "password": "Test123456!",
    "callbackURL": "/"
  }'
```

登录（验证邮箱后）：
```bash
curl -i http://localhost:3000/api/auth/sign-in/email \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  -H 'x-captcha-response: <启用验证码时必填>' \
  -c cookies.txt -b cookies.txt \
  --data '{
    "email": "alice@example.com",
    "password": "Test123456!",
    "callbackURL": "/",
    "rememberMe": true
  }'
```

获取当前 session：
```bash
curl -i http://localhost:3000/api/auth/get-session \
  -H 'Origin: http://localhost:3000' \
  -b cookies.txt
```

退出登录：
```bash
curl -i http://localhost:3000/api/auth/sign-out \
  -X POST \
  -H 'Origin: http://localhost:3000' \
  -c cookies.txt -b cookies.txt
```

## 📁 代码入口
- Better Auth 配置：`src/lib/auth.ts`
- CAPTCHA 集成：`src/lib/plugins/captcha.ts`
- 邮箱黑白名单：`src/lib/plugins/email-allow-deny.ts`
- Passkey（WebAuthn）：`src/lib/plugins/passkey.ts`
- Stripe：`src/lib/plugins/stripe.ts` + `src/lib/stripe-webhook.ts`
