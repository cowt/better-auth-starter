import { betterAuth } from "better-auth";
import {
	createAccessControl,
	multiSession,
	openAPI,
	organization,
	twoFactor,
} from "better-auth/plugins";
import { Pool } from "pg";
import { Redis } from "ioredis"
import { sendEmail } from "./email";
import { captchaProtection } from "./plugins/captcha";
import { emailAllowDeny } from "./plugins/email-allow-deny";
import { passkey } from "./plugins/passkey";
import { stripe } from "./plugins/stripe";

const redis = new Redis(`${process.env.REDIS_URL}?family=0`)
   .on("error", (err) => {
     console.error("Redis connection error:", err)
   })
   .on("connect", () => {
     console.log("Redis connected")
   })
  .on("ready", () => {
     console.log("Redis ready")
   })

const ac = createAccessControl({
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	billing: ["read", "manage"],
} as const);

const orgRoles = {
	owner: ac.newRole({
		organization: ["update", "delete"],
		member: ["create", "update", "delete"],
		invitation: ["create", "cancel"],
		team: ["create", "update", "delete"],
		billing: ["read", "manage"],
	}),
	admin: ac.newRole({
		organization: ["update"],
		member: ["create", "update"],
		invitation: ["create", "cancel"],
		team: ["create", "update"],
		billing: ["read"],
	}),
	member: ac.newRole({
		billing: ["read"],
	}),
};

function envList(name: string) {
	const raw = process.env[name];
	if (!raw) return undefined;
	const items = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return items.length ? items : undefined;
}

const captchaPlugin = captchaProtection();

// Check better-auth docs for more info https://www.better-auth.com/docs/
export const auth = betterAuth({
	appName: process.env.APP_NAME ?? "Better Auth Starter",
	baseURL: process.env.BETTER_AUTH_URL,
	secret: process.env.BETTER_AUTH_SECRET,
	trustedOrigins: envList("TRUSTED_ORIGINS"),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url }) => {
			await sendEmail({
				to: user.email,
				subject: "Reset your password",
				text: `Reset your password: ${url}`,
				html: `<p>Reset your password:</p><p><a href="${url}">${url}</a></p>`,
			});
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await sendEmail({
				to: user.email,
				subject: "Verify your email",
				text: `Verify your email: ${url}`,
				html: `<p>Verify your email:</p><p><a href="${url}">${url}</a></p>`,
			});
		},
	},
	rateLimit: {
		enabled: true,
		storage: "secondary-storage",
		window: 10,
		max: 100,
		customRules: {
			"/sign-in/email": { window: 60, max: 20 },
			"/sign-up/email": { window: 60, max: 10 },
			"/request-password-reset": { window: 60, max: 5 },
			"/verify-email": { window: 60, max: 10 },
		},
	},
	// Session config
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	},
	// Add your plugins here
	plugins: [
		openAPI(),
		...(captchaPlugin ? [captchaPlugin] : []),
		emailAllowDeny({
			allowEmails: envList("EMAIL_ALLOWLIST"),
			allowDomains: envList("EMAIL_ALLOW_DOMAINS"),
			denyEmails: envList("EMAIL_DENYLIST"),
			denyDomains: envList("EMAIL_DENY_DOMAINS"),
		}),
		twoFactor(),
		multiSession({ maximumSessions: 10 }),
		organization({
			teams: { enabled: true, defaultTeam: { enabled: true } },
			ac,
			roles: orgRoles,
			sendInvitationEmail: async ({ email, organization, inviter, role, id }) => {
				const url = `${process.env.APP_WEB_URL ?? process.env.BETTER_AUTH_URL ?? ""}/accept-invitation?id=${id}`;
				await sendEmail({
					to: email,
					subject: `Invitation to join ${organization.name}`,
					text: `${inviter.user.name} invited you to join ${organization.name} as ${role}. Accept: ${url}`,
					html: `<p>${inviter.user.name} invited you to join <b>${organization.name}</b> as <b>${role}</b>.</p><p><a href="${url}">Accept invitation</a></p>`,
				});
			},
		}),
		passkey(),
		stripe(),
	],
	// DB config
	database: new Pool({
		connectionString: process.env.DATABASE_URL,
		log: console.log,
	}),
	// This is for the redis session storage
	secondaryStorage: {
		get: async (key) => {
			const value = await redis.get(key);
			return value ? value : null;
		},
		set: async (key, value, ttl) => {
			if (ttl) {
				await redis.set(key, value, "EX", ttl);
			} else {
				await redis.set(key, value);
			}
		},
		delete: async (key) => {
			await redis.del(key);
		},
	},
});
