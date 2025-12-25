import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import { twoFactor } from "better-auth/plugins";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { createCookieJar, readJson } from "./helpers";

describe("two-factor auth", () => {
	it("requires 2FA on sign-in after enabling and allows backup-code verification", async () => {
		const { auth } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: false },
				plugins: [twoFactor()],
			},
			{ disableTestUser: true },
		);

		const jar = createCookieJar();

		const signUp = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "MFA",
					email: "mfa@example.com",
					password: "Test123456!",
				}),
			}),
		);
		jar.applySetCookie(signUp.headers.get("set-cookie"));
		expect(signUp.status).toBe(200);

		const enable = await auth.handler(
			new Request("http://localhost:3000/api/auth/two-factor/enable", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: jar.headerValue(),
				},
				body: JSON.stringify({ password: "Test123456!" }),
			}),
		);
		expect(enable.status).toBe(200);
		const enableBody = await readJson<{ totpURI: string; backupCodes: string[] }>(
			enable,
		);
		expect(enableBody.totpURI).toContain("otpauth://");
		expect(enableBody.backupCodes.length).toBeGreaterThan(0);

		const otpUrl = new URL(enableBody.totpURI);
		const secretBase32 = otpUrl.searchParams.get("secret");
		expect(secretBase32).toBeTruthy();
		const digits = Number(otpUrl.searchParams.get("digits") ?? "6");
		const period = Number(otpUrl.searchParams.get("period") ?? "30");
		const secret = new TextDecoder().decode(base32.decode(secretBase32!, { loose: true }));
		const code = await createOTP(secret, { digits, period }).totp();

		const verifyEnable = await auth.handler(
			new Request("http://localhost:3000/api/auth/two-factor/verify-totp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: jar.headerValue(),
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({ code }),
			}),
		);
		jar.applySetCookie(verifyEnable.headers.get("set-cookie"));
		expect(verifyEnable.status).toBe(200);

		const signOut = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-out", {
				method: "GET",
				headers: { cookie: jar.headerValue() },
			}),
		);
		jar.applySetCookie(signOut.headers.get("set-cookie"));

		const signIn = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "mfa@example.com", password: "Test123456!" }),
			}),
		);
		jar.applySetCookie(signIn.headers.get("set-cookie"));
		expect(signIn.status).toBe(200);
		const signInBody = await readJson<any>(signIn);
		expect(signInBody.twoFactorRedirect).toBe(true);

		const verify = await auth.handler(
			new Request("http://localhost:3000/api/auth/two-factor/verify-backup-code", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: jar.headerValue(),
				},
				body: JSON.stringify({ code: enableBody.backupCodes[0], trustDevice: true }),
			}),
		);
		jar.applySetCookie(verify.headers.get("set-cookie"));
		expect(verify.status).toBe(200);
		const verifyBody = await readJson<any>(verify);
		expect(verifyBody.token).toBeTypeOf("string");

		const session = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				method: "GET",
				headers: { cookie: jar.headerValue() },
			}),
		);
		expect(session.status).toBe(200);
	});
});
