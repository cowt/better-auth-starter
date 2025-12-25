import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import { multiSession } from "better-auth/plugins";
import { createCookieJar, readJson } from "./helpers";

describe("multi-session", () => {
	it("lists and revokes device sessions", async () => {
		const { auth } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: false },
				plugins: [multiSession({ maximumSessions: 10 })],
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

		const listRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/multi-session/list-device-sessions", {
				method: "GET",
				headers: { cookie: jar.headerValue() },
			}),
		);
		expect(listRes.status).toBe(200);
		const sessions = await readJson<any[]>(listRes);
		expect(sessions.length).toBeGreaterThan(0);
		expect(sessions[0]?.user?.email).toBe("alice@example.com");

		const sessionToken = sessions[0]?.session?.token;
		expect(typeof sessionToken).toBe("string");

		const revokeRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/multi-session/revoke", {
				method: "POST",
				headers: { "content-type": "application/json", cookie: jar.headerValue() },
				body: JSON.stringify({ sessionToken }),
			}),
		);
		jar.applySetCookie(revokeRes.headers.get("set-cookie"));
		expect(revokeRes.status).toBe(200);
		expect(await revokeRes.json()).toEqual({ status: true });

		const getSessionAfterRevoke = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				method: "GET",
				headers: { cookie: jar.headerValue() },
			}),
		);
		expect(getSessionAfterRevoke.status).toBe(200);
		expect(await getSessionAfterRevoke.json()).toBeNull();
	});
});

