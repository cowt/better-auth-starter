import { APIError } from "better-auth/api";
import { sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { createAuthEndpoint } from "better-auth/plugins";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
	AuthenticationResponseJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/types";
import * as z from "zod";

const schema = {
	passkey: {
		fields: {
			credentialId: {
				type: "string",
				required: true,
				index: true,
			},
			publicKey: {
				type: "string",
				required: true,
				returned: false,
			},
			counter: {
				type: "number",
				required: true,
				returned: false,
			},
			transports: {
				type: "string",
				required: false,
			},
			name: {
				type: "string",
				required: false,
			},
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
				index: true,
			},
			lastUsedAt: {
				type: "date",
				required: false,
			},
		},
	},
} as const;

function base64UrlToBuffer(value: string): Uint8Array {
	return Buffer.from(value, "base64url");
}

function bufferToBase64Url(value: Uint8Array): string {
	return Buffer.from(value).toString("base64url");
}

function getRequest(ctx: any): Request {
	if (ctx?.request) return ctx.request as Request;
	throw new APIError("INTERNAL_SERVER_ERROR", { message: "request is missing" });
}

function getRpIdFromEnvOrRequest(ctx: any) {
	return (
		process.env.PASSKEY_RP_ID ??
		new URL(getRequest(ctx).url).hostname
	);
}

function getOriginFromEnvOrRequest(ctx: any) {
	const configured = process.env.PASSKEY_ORIGIN;
	if (configured) return configured;

	const originHeader = getRequest(ctx).headers.get("origin");
	if (originHeader) return originHeader;

	return new URL(getRequest(ctx).url).origin;
}

const registrationOptionsBodySchema = z.object({
	name: z.string().optional(),
});

const registrationVerifyBodySchema = z.object({
	credential: z.any(),
	name: z.string().optional(),
}) as z.ZodType<{ credential: RegistrationResponseJSON; name?: string }>;

const authenticationOptionsBodySchema = z.object({
	email: z.string().email(),
});

const authenticationVerifyBodySchema = z.object({
	credential: z.any(),
}) as z.ZodType<{ credential: AuthenticationResponseJSON }>;

export const passkey = () => {
	return {
		id: "passkey",
		schema,
		endpoints: {
			generatePasskeyRegistrationOptions: createAuthEndpoint(
				"/passkey/generate-registration-options",
				{
					method: "POST",
					body: registrationOptionsBodySchema,
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							summary: "Generate passkey registration options",
							description:
								"Generate WebAuthn registration options for the current user.",
							responses: { 200: { description: "Registration options" } },
						},
					},
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					const rpID = getRpIdFromEnvOrRequest(ctx);

					const existing = await ctx.context.adapter.findMany({
						model: "passkey",
						where: [{ field: "userId", value: user.id }],
					});

					const options = await generateRegistrationOptions({
						rpName: process.env.PASSKEY_RP_NAME ?? ctx.context.appName,
						rpID,
						userID: Buffer.from(user.id),
						userName: user.email,
						attestationType: "none",
						excludeCredentials: existing.map((p: any) => ({
							id: p.credentialId,
						})),
						authenticatorSelection: {
							userVerification: "preferred",
							residentKey: "preferred",
						},
					});

					if (!ctx.context.secondaryStorage) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message:
								"PASSKEY requires secondaryStorage (e.g. Redis) to store challenges.",
						});
					}

					await ctx.context.secondaryStorage.set(
						`passkey:reg:${user.id}`,
						JSON.stringify({
							challenge: options.challenge,
							rpID,
							origin: getOriginFromEnvOrRequest(ctx),
						}),
						5 * 60,
					);

					return ctx.json(options);
				},
			),
			verifyPasskeyRegistration: createAuthEndpoint(
				"/passkey/verify-registration",
				{
					method: "POST",
					body: registrationVerifyBodySchema,
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							summary: "Verify passkey registration",
							description:
								"Verify WebAuthn attestation response and store the passkey.",
							responses: { 200: { description: "Passkey stored" } },
						},
					},
				},
				async (ctx) => {
					if (!ctx.context.secondaryStorage) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message:
								"PASSKEY requires secondaryStorage (e.g. Redis) to store challenges.",
						});
					}

					const user = ctx.context.session.user;
					const stored = (await ctx.context.secondaryStorage.get(
						`passkey:reg:${user.id}`,
					)) as string | null;
					if (!stored) {
						throw new APIError("BAD_REQUEST", {
							message: "passkey registration challenge not found or expired",
						});
					}
					await ctx.context.secondaryStorage.delete(`passkey:reg:${user.id}`);

					const { challenge, rpID, origin } = JSON.parse(stored) as {
						challenge: string;
						rpID: string;
						origin: string;
					};

					const { credential } = ctx.body;
					let verification;
					try {
						verification = await verifyRegistrationResponse({
							response: credential,
							expectedChallenge: challenge,
							expectedOrigin: origin,
							expectedRPID: rpID,
							requireUserVerification: false,
						});
					} catch {
						throw new APIError("BAD_REQUEST", { message: "invalid attestation" });
					}

					if (!verification.verified || !verification.registrationInfo) {
						throw new APIError("BAD_REQUEST", { message: "invalid attestation" });
					}

					const { credentialID, credentialPublicKey, counter } =
						verification.registrationInfo;

					const credentialId = credentialID;
					const publicKey = bufferToBase64Url(credentialPublicKey);

					await ctx.context.adapter.create({
						model: "passkey",
						data: {
							credentialId,
							publicKey,
							counter,
							transports:
								credential.response.transports?.length
									? credential.response.transports.join(",")
									: undefined,
							name: ctx.body.name,
							userId: user.id,
							lastUsedAt: undefined,
						},
					});

					return ctx.json({ ok: true, credentialId });
				},
			),
			generatePasskeyAuthenticationOptions: createAuthEndpoint(
				"/passkey/generate-authentication-options",
				{
					method: "POST",
					body: authenticationOptionsBodySchema,
					metadata: {
						openapi: {
							summary: "Generate passkey authentication options",
							description:
								"Generate WebAuthn authentication options for a user by email.",
							responses: { 200: { description: "Authentication options" } },
						},
					},
				},
				async (ctx) => {
					const { email } = ctx.body;
					const accountInfo = await ctx.context.internalAdapter.findUserByEmail(
						email,
					);
					if (!accountInfo) {
						throw new APIError("NOT_FOUND", { message: "user not found" });
					}
					const user = accountInfo.user;

					const rpID = getRpIdFromEnvOrRequest(ctx);

					const passkeys = await ctx.context.adapter.findMany({
						model: "passkey",
						where: [{ field: "userId", value: user.id }],
					});
					if (!passkeys.length) {
						throw new APIError("BAD_REQUEST", { message: "no passkeys registered" });
					}

					const options = await generateAuthenticationOptions({
						rpID,
						userVerification: "preferred",
						allowCredentials: passkeys.map((p: any) => ({
							id: p.credentialId,
							transports: p.transports
								? (p.transports.split(",") as any)
								: void 0,
						})),
					});

					if (!ctx.context.secondaryStorage) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message:
								"PASSKEY requires secondaryStorage (e.g. Redis) to store challenges.",
						});
					}

					await ctx.context.secondaryStorage.set(
						`passkey:auth:${user.id}`,
						JSON.stringify({
							challenge: options.challenge,
							rpID,
							origin: getOriginFromEnvOrRequest(ctx),
						}),
						5 * 60,
					);

					return ctx.json(options);
				},
			),
			verifyPasskeyAuthentication: createAuthEndpoint(
				"/passkey/verify-authentication",
				{
					method: "POST",
					body: authenticationVerifyBodySchema,
					metadata: {
						openapi: {
							summary: "Verify passkey authentication",
							description:
								"Verify WebAuthn assertion response and create a Better Auth session.",
							responses: { 200: { description: "Signed in" } },
						},
					},
				},
				async (ctx) => {
					if (!ctx.context.secondaryStorage) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message:
								"PASSKEY requires secondaryStorage (e.g. Redis) to store challenges.",
						});
					}

					const { credential } = ctx.body;
					const credentialId = credential.id;

					const records = (await ctx.context.adapter.findMany({
						model: "passkey",
						where: [{ field: "credentialId", value: credentialId }],
						limit: 1,
					})) as any[];
					const record = records[0] as any;
					if (!record) {
						throw new APIError("UNAUTHORIZED", { message: "unknown passkey" });
					}

					const user = await ctx.context.internalAdapter.findUserById(record.userId);
					if (!user) {
						throw new APIError("UNAUTHORIZED", { message: "user not found" });
					}

					const stored = (await ctx.context.secondaryStorage.get(
						`passkey:auth:${user.id}`,
					)) as string | null;
					if (!stored) {
						throw new APIError("BAD_REQUEST", {
							message: "passkey auth challenge not found or expired",
						});
					}
					await ctx.context.secondaryStorage.delete(`passkey:auth:${user.id}`);

					const { challenge, rpID, origin } = JSON.parse(stored) as {
						challenge: string;
						rpID: string;
						origin: string;
					};

					let verification;
					try {
						verification = await verifyAuthenticationResponse({
							response: credential,
							expectedChallenge: challenge,
							expectedOrigin: origin,
							expectedRPID: rpID,
							requireUserVerification: false,
							authenticator: {
								credentialID: record.credentialId,
								credentialPublicKey: base64UrlToBuffer(record.publicKey),
								counter: record.counter,
							},
						});
					} catch {
						throw new APIError("UNAUTHORIZED", { message: "invalid assertion" });
					}

					if (!verification.verified) {
						throw new APIError("UNAUTHORIZED", { message: "invalid assertion" });
					}

					const session = await ctx.context.internalAdapter.createSession(user.id);
					if (!session) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "failed to create session",
						});
					}

					await ctx.context.adapter.update({
						model: "passkey",
						where: [{ field: "credentialId", value: record.credentialId }],
						update: {
							counter: verification.authenticationInfo.newCounter,
							lastUsedAt: new Date(),
						},
					});

					await setSessionCookie(ctx, { session, user });

					return ctx.json({
						token: session.token,
						user: {
							id: user.id,
							email: user.email,
							emailVerified: user.emailVerified,
							name: user.name,
							image: user.image,
							createdAt: user.createdAt,
							updatedAt: user.updatedAt,
						},
					});
				},
			),
		},
	} as const;
};
