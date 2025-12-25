import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import { createCookieJar, readJson } from "./helpers";

describe("email verification", () => {
	it("requires verification and allows verifying via token", async () => {
		let verificationToken: string | null = null;

		const { auth } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
					requireEmailVerification: true,
				},
				emailVerification: {
					sendOnSignUp: true,
					sendOnSignIn: true,
					autoSignInAfterVerification: true,
					sendVerificationEmail: async ({ token }) => {
						verificationToken = token;
					},
				},
			},
			{ disableTestUser: true },
		);

		const signUpRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Alice",
					email: "alice@example.com",
					password: "Test123456!",
					callbackURL: "/",
				}),
			}),
		);

		expect(signUpRes.status).toBe(200);
		const signUpBody = await readJson<{ token: string | null; user: any }>(
			signUpRes,
		);
		expect(signUpBody.token).toBeNull();
		expect(signUpBody.user.emailVerified).toBe(false);
		expect(verificationToken).toBeTypeOf("string");

		const signInRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "alice@example.com",
					password: "Test123456!",
					callbackURL: "/",
				}),
			}),
		);
		expect(signInRes.status).toBe(403);

		const jar = createCookieJar();
		const verifyRes = await auth.handler(
			new Request(
				`http://localhost:3000/api/auth/verify-email?token=${encodeURIComponent(
					verificationToken!,
				)}`,
				{
					method: "GET",
					headers: { cookie: jar.headerValue() },
				},
			),
		);
		jar.applySetCookie(verifyRes.headers.get("set-cookie"));
		expect(verifyRes.status).toBe(200);

		const getSessionRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				method: "GET",
				headers: { cookie: jar.headerValue() },
			}),
		);
		expect(getSessionRes.status).toBe(200);
		const session = await readJson<any>(getSessionRes);
		expect(session.user.emailVerified).toBe(true);
	});
});

