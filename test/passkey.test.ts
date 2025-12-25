import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import { passkey } from "../src/lib/plugins/passkey";
import { createCookieJar, createMemorySecondaryStorage, readJson } from "./helpers";

describe("passkeys (WebAuthn)", () => {
	it("generates registration options and stores challenge in secondary storage", async () => {
		const secondaryStorage = createMemorySecondaryStorage();

		const { auth } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: false },
				secondaryStorage,
				plugins: [passkey()],
			},
			{ disableTestUser: true },
		);

		const jar = createCookieJar();
		const signUpRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "PK",
					email: "pk@example.com",
					password: "Test123456!",
				}),
			}),
		);
		jar.applySetCookie(signUpRes.headers.get("set-cookie"));
		expect(signUpRes.status).toBe(200);
		const signUpBody = await readJson<any>(signUpRes);

		const regOptions = await auth.handler(
			new Request("http://localhost:3000/api/auth/passkey/generate-registration-options", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: jar.headerValue(),
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({ name: "My Passkey" }),
			}),
		);
		expect(regOptions.status).toBe(200);
		const options = await readJson<any>(regOptions);
		expect(options.challenge).toBeTypeOf("string");

		const stored = await secondaryStorage.get(`passkey:reg:${signUpBody.user.id}`);
		expect(stored).toBeTypeOf("string");
	});

	it("fails authentication options when user has no passkeys", async () => {
		const secondaryStorage = createMemorySecondaryStorage();
		const { auth } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: false },
				secondaryStorage,
				plugins: [passkey()],
			},
			{ disableTestUser: true },
		);

		await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "NoPK",
					email: "nopk@example.com",
					password: "Test123456!",
				}),
			}),
		);

		const authOptions = await auth.handler(
			new Request("http://localhost:3000/api/auth/passkey/generate-authentication-options", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "nopk@example.com" }),
			}),
		);
		expect(authOptions.status).toBe(400);
	});

	it("returns 400 when verifying auth without a stored challenge", async () => {
		const secondaryStorage = createMemorySecondaryStorage();
		const { auth, db } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: false },
				secondaryStorage,
				plugins: [passkey()],
			},
			{ disableTestUser: true },
		);

		const signUpRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "HasPK",
					email: "haspk@example.com",
					password: "Test123456!",
				}),
			}),
		);
		expect(signUpRes.status).toBe(200);
		const { user } = (await readJson<any>(signUpRes)) as { user: { id: string } };

		const credentialId = "test-credential-id";
		await db.create({
			model: "passkey",
			data: {
				credentialId,
				publicKey: Buffer.from("public-key").toString("base64url"),
				counter: 0,
				userId: user.id,
			},
		});

		const verify = await auth.handler(
			new Request("http://localhost:3000/api/auth/passkey/verify-authentication", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					credential: {
						id: credentialId,
						rawId: credentialId,
						type: "public-key",
						response: {
							authenticatorData: "",
							clientDataJSON: "",
							signature: "",
							userHandle: null,
						},
						clientExtensionResults: {},
					},
				}),
			}),
		);
		expect(verify.status).toBe(400);
	});
});
