import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import { emailAllowDeny } from "../src/lib/plugins/email-allow-deny";

describe("email allow/deny lists", () => {
	it("blocks denied domains", async () => {
		const { auth } = await getTestInstance(
			{
				logger: { disabled: true },
				emailAndPassword: { enabled: true, requireEmailVerification: false },
				plugins: [emailAllowDeny({ denyDomains: ["blocked.test"] })],
			},
			{ disableTestUser: true },
		);

		const res = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Blocked",
					email: "user@blocked.test",
					password: "Test123456!",
				}),
			}),
		);

		expect(res.status).toBe(403);
	});

	it("enforces allowlist when configured", async () => {
		const { auth } = await getTestInstance(
			{
				logger: { disabled: true },
				emailAndPassword: { enabled: true, requireEmailVerification: false },
				plugins: [emailAllowDeny({ allowDomains: ["allowed.test"] })],
			},
			{ disableTestUser: true },
		);

		const ok = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Allowed",
					email: "user@allowed.test",
					password: "Test123456!",
				}),
			}),
		);
		expect(ok.status).toBe(200);

		const blocked = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "NotAllowed",
					email: "user@other.test",
					password: "Test123456!",
				}),
			}),
		);
		expect(blocked.status).toBe(403);
	});
});
