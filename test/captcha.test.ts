import { afterEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "better-auth/test";
import { readJson } from "./helpers";

let turnstileCalls = 0;
let recaptchaCalls = 0;

const originalFetch = globalThis.fetch;

function mockCaptchaFetch() {
	vi.stubGlobal(
		"fetch",
		(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("turnstile")) {
				turnstileCalls += 1;
				return new Response(JSON.stringify({ success: false }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url.includes("recaptcha")) {
				recaptchaCalls += 1;
				return new Response(JSON.stringify({ success: true, score: 0.9 }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			return new Response(JSON.stringify({ success: false }), {
				status: 404,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch,
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
	globalThis.fetch = originalFetch;
});

describe("captcha (official plugin via wrapper)", () => {
	it("rejects when missing x-captcha-response", async () => {
		mockCaptchaFetch();
		const originalTurnstile = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
		process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "turnstile-secret";

		const { captchaProtection } = await import("../src/lib/plugins/captcha");
		const captcha = captchaProtection();

		const { auth } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: true },
				plugins: captcha ? [captcha] : [],
			},
			{ disableTestUser: true },
		);

		const res = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Alice",
					email: "alice@example.com",
					password: "Test123456!",
				}),
			}),
		);

		expect(res.status).toBe(400);
		const body = await readJson<{ message: string }>(res);
		expect(body.message).toBe("Missing CAPTCHA response");

		process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = originalTurnstile;
	});

	it("falls back to Google when Turnstile verification fails", async () => {
		mockCaptchaFetch();
		turnstileCalls = 0;
		recaptchaCalls = 0;

		const originalTurnstile = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
		const originalRecaptcha = process.env.GOOGLE_RECAPTCHA_SECRET_KEY;
		process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "turnstile-secret";
		process.env.GOOGLE_RECAPTCHA_SECRET_KEY = "recaptcha-secret";

		const { captchaProtection } = await import("../src/lib/plugins/captcha");
		const captcha = captchaProtection();

		const { auth } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: true },
				plugins: captcha ? [captcha] : [],
			},
			{ disableTestUser: true },
		);

		const res = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-captcha-response": "token",
				},
				body: JSON.stringify({
					name: "Alice",
					email: "alice@example.com",
					password: "Test123456!",
				}),
			}),
		);

		expect(res.status).toBe(200);
		expect(turnstileCalls).toBeGreaterThan(0);
		expect(recaptchaCalls).toBeGreaterThan(0);

		process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = originalTurnstile;
		process.env.GOOGLE_RECAPTCHA_SECRET_KEY = originalRecaptcha;
	});

	it("respects x-captcha-provider when both are enabled", async () => {
		mockCaptchaFetch();
		turnstileCalls = 0;
		recaptchaCalls = 0;

		const originalTurnstile = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
		const originalRecaptcha = process.env.GOOGLE_RECAPTCHA_SECRET_KEY;
		process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "turnstile-secret";
		process.env.GOOGLE_RECAPTCHA_SECRET_KEY = "recaptcha-secret";

		const { captchaProtection } = await import("../src/lib/plugins/captcha");
		const captcha = captchaProtection();

		const { auth } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: true },
				plugins: captcha ? [captcha] : [],
			},
			{ disableTestUser: true },
		);

		const res = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-captcha-response": "token",
					"x-captcha-provider": "google-recaptcha",
				},
				body: JSON.stringify({
					name: "Alice",
					email: "alice@example.com",
					password: "Test123456!",
				}),
			}),
		);

		expect(res.status).toBe(200);
		expect(recaptchaCalls).toBeGreaterThan(0);
		expect(turnstileCalls).toBe(0);

		process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = originalTurnstile;
		process.env.GOOGLE_RECAPTCHA_SECRET_KEY = originalRecaptcha;
	});
});
