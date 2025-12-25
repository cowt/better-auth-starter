import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import { createAccessControl, organization } from "better-auth/plugins";
import { createCookieJar, readJson } from "./helpers";

describe("organization / teams", () => {
	it("creates an organization and a team", async () => {
		const ac = createAccessControl({
			organization: ["update", "delete"],
			member: ["create", "update", "delete"],
			invitation: ["create", "cancel"],
			team: ["create", "update", "delete"],
			billing: ["read", "manage"],
		} as const);

		const roles = {
			owner: ac.newRole({
				organization: ["update", "delete"],
				member: ["create", "update", "delete"],
				invitation: ["create", "cancel"],
				team: ["create", "update", "delete"],
				billing: ["read", "manage"],
			}),
			member: ac.newRole({
				billing: ["read"],
			}),
		};

		const { auth } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: false },
				plugins: [
					organization({
						teams: { enabled: true, defaultTeam: { enabled: true } },
						ac,
						roles,
					}),
				],
			},
			{ disableTestUser: true },
		);

		const jar = createCookieJar();
		const signUp = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Owner",
					email: "owner@example.com",
					password: "Test123456!",
				}),
			}),
		);
		jar.applySetCookie(signUp.headers.get("set-cookie"));
		expect(signUp.status).toBe(200);

		const createOrg = await auth.handler(
			new Request("http://localhost:3000/api/auth/organization/create", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: jar.headerValue(),
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					name: "Acme Inc",
					slug: "acme",
				}),
			}),
		);
		expect(createOrg.status).toBe(200);
		const org = await readJson<any>(createOrg);
		expect(org.slug).toBe("acme");

		const createTeam = await auth.handler(
			new Request("http://localhost:3000/api/auth/organization/create-team", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: jar.headerValue(),
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({ name: "Engineering" }),
			}),
		);
		expect(createTeam.status).toBe(200);
		const team = await readJson<any>(createTeam);
		expect(team.name).toBe("Engineering");

		const perm = await auth.handler(
			new Request("http://localhost:3000/api/auth/organization/has-permission", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: jar.headerValue(),
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					permissions: { billing: ["manage"] },
				}),
			}),
		);
		expect(perm.status).toBe(200);
		const permBody = await readJson<{ success: boolean }>(perm);
		expect(permBody.success).toBe(true);
	});
});

