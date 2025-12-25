import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import { createCookieJar, readJson } from "./helpers";

describe("session management", () => {
	it("signs in, returns session, and signs out", async () => {
		const { auth } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: false },
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

		const jar = createCookieJar();
		const signInRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json", cookie: jar.headerValue() },
				body: JSON.stringify({
					email: "alice@example.com",
					password: "Test123456!",
					callbackURL: "/",
				}),
			}),
		);
		jar.applySetCookie(signInRes.headers.get("set-cookie"));
		expect(signInRes.status).toBe(200);

		const getSessionRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				method: "GET",
				headers: { cookie: jar.headerValue() },
			}),
		);
		expect(getSessionRes.status).toBe(200);
		const session = await readJson<any>(getSessionRes);
		expect(session?.user?.email).toBe("alice@example.com");

		const signOutRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-out", {
				method: "POST",
				headers: { cookie: jar.headerValue() },
			}),
		);
		jar.applySetCookie(signOutRes.headers.get("set-cookie"));
		expect(signOutRes.status).toBe(200);

		const getSessionAfterSignOut = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				method: "GET",
				headers: { cookie: jar.headerValue() },
			}),
		);
		expect(getSessionAfterSignOut.status).toBe(200);
		expect(await getSessionAfterSignOut.json()).toBeNull();
	});
});

