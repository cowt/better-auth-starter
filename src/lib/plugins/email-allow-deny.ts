import { APIError } from "better-auth/api";
import { createAuthMiddleware } from "better-auth/plugins";

export type EmailAllowDenyOptions = {
	allowEmails?: string[];
	allowDomains?: string[];
	denyEmails?: string[];
	denyDomains?: string[];
};

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function getDomain(email: string) {
	const at = email.lastIndexOf("@");
	if (at === -1) return null;
	return email.slice(at + 1);
}

function toSet(values?: string[]) {
	if (!values?.length) return null;
	return new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean));
}

export const emailAllowDeny = (options?: EmailAllowDenyOptions) => {
	const allowEmails = toSet(options?.allowEmails);
	const allowDomains = toSet(options?.allowDomains);
	const denyEmails = toSet(options?.denyEmails);
	const denyDomains = toSet(options?.denyDomains);

	const allowlistEnabled = !!(allowEmails || allowDomains);
	const denylistEnabled = !!(denyEmails || denyDomains);

	return {
		id: "email-allow-deny",
		hooks: {
			before: [
				{
					matcher(ctx) {
						return (
							ctx.path === "/sign-up/email" ||
							ctx.path === "/sign-in/email" ||
							ctx.path === "/request-password-reset" ||
							ctx.path === "/send-verification-email"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!allowlistEnabled && !denylistEnabled) return;

						const emailRaw = (ctx.body as any)?.email;
						if (typeof emailRaw !== "string" || !emailRaw) return;

						const email = normalizeEmail(emailRaw);
						const domain = getDomain(email);

						if (
							(denyEmails && denyEmails.has(email)) ||
							(domain && denyDomains && denyDomains.has(domain))
						) {
							throw new APIError("FORBIDDEN", {
								message: "Email is not allowed",
							});
						}

						if (!allowlistEnabled) return;

						const allowed =
							(allowEmails && allowEmails.has(email)) ||
							(domain && allowDomains && allowDomains.has(domain));

						if (!allowed) {
							throw new APIError("FORBIDDEN", {
								message: "Email is not allowed",
							});
						}
					}),
				},
			],
		},
	} as const;
};

