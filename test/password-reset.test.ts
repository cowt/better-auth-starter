import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import { readJson } from "./helpers";

describe("password reset", () => {
	it("sends reset token and allows resetting password", async () => {
		let resetToken: string | null = null;

		const { auth } = await getTestInstance(
			{
				logger: { disabled: true },
				emailAndPassword: {
					enabled: true,
					requireEmailVerification: false,
					sendResetPassword: async ({ token }) => {
						resetToken = token;
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
					name: "Bob",
					email: "bob@example.com",
					password: "OldPassword123!",
				}),
			}),
		);
		expect(signUpRes.status).toBe(200);

		const requestRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/request-password-reset", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "bob@example.com" }),
			}),
		);
		expect(requestRes.status).toBe(200);
		expect(resetToken).toBeTypeOf("string");

		const resetRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/reset-password", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token: resetToken, newPassword: "NewPassword123!" }),
			}),
		);
		expect(resetRes.status).toBe(200);
		expect((await readJson<any>(resetRes)).status).toBe(true);

		const oldSignIn = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "bob@example.com", password: "OldPassword123!" }),
			}),
		);
		expect(oldSignIn.status).toBe(401);

		const newSignIn = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "bob@example.com", password: "NewPassword123!" }),
			}),
		);
		expect(newSignIn.status).toBe(200);
	});
});
