import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import { createMemorySecondaryStorage, readJson } from "./helpers";

describe("rate limiting", () => {
	it("returns 429 after exceeding the limit", async () => {
		const secondaryStorage = createMemorySecondaryStorage();

		const { auth } = await getTestInstance(
			{
				secondaryStorage,
				advanced: {
					ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
					cookies: {},
				},
				rateLimit: {
					enabled: true,
					storage: "secondary-storage",
					window: 60,
					max: 1,
					customRules: {
						"/sign-in/email": { window: 60, max: 1 },
					},
				},
			},
			{ disableTestUser: true },
		);

		await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Rate",
					email: "rate@example.com",
					password: "Test123456!",
				}),
			}),
		);

		const first = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-forwarded-for": "203.0.113.1",
				},
				body: JSON.stringify({
					email: "rate@example.com",
					password: "Test123456!",
				}),
			}),
		);
		expect(first.status).toBe(200);

		const second = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-forwarded-for": "203.0.113.1",
				},
				body: JSON.stringify({
					email: "rate@example.com",
					password: "Test123456!",
				}),
			}),
		);
		expect(second.status).toBe(429);
		const body = await readJson<{ message: string }>(second);
		expect(body.message).toContain("Too many requests");
	});
});

