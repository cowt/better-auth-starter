import type { AuthContext } from "better-auth";
import { captcha } from "better-auth/plugins";

type CaptchaPlugin = ReturnType<typeof captcha>;

function envList(name: string) {
	const raw = process.env[name];
	if (!raw) return undefined;
	const items = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return items.length ? items : undefined;
}

function envNumber(name: string) {
	const raw = process.env[name];
	if (!raw) return undefined;
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
}

async function isVerificationFailed(response: Response) {
	if (response.status !== 403) return false;
	try {
		const data = (await response.clone().json()) as { message?: string };
		return data?.message === "Captcha verification failed";
	} catch {
		return false;
	}
}

function pickPluginByHeader(
	request: Request,
	plugins: Record<string, CaptchaPlugin | undefined>,
) {
	const header = request.headers.get("x-captcha-provider")?.trim().toLowerCase();
	if (!header) return undefined;
	return plugins[header];
}

export function captchaProtection() {
	const endpoints =
		envList("CAPTCHA_ENDPOINTS") ?? [
			"/sign-up/email",
			"/sign-in/email",
			"/request-password-reset",
		];

	const turnstileSecret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
	const recaptchaSecret = process.env.GOOGLE_RECAPTCHA_SECRET_KEY;
	const recaptchaMinScore = envNumber("GOOGLE_RECAPTCHA_MIN_SCORE");
	const turnstileVerifyOverride =
		process.env.CLOUDFLARE_TURNSTILE_SITEVERIFY_URL_OVERRIDE;
	const recaptchaVerifyOverride =
		process.env.GOOGLE_RECAPTCHA_SITEVERIFY_URL_OVERRIDE;

	const turnstile =
		turnstileSecret?.length
			? captcha({
					provider: "cloudflare-turnstile",
					secretKey: turnstileSecret,
					endpoints,
					siteVerifyURLOverride: turnstileVerifyOverride,
				})
			: undefined;

	const recaptcha =
		recaptchaSecret?.length
			? captcha({
					provider: "google-recaptcha",
					secretKey: recaptchaSecret,
					minScore: recaptchaMinScore,
					endpoints,
					siteVerifyURLOverride: recaptchaVerifyOverride,
				})
			: undefined;

	if (!turnstile && !recaptcha) return null;
	if (turnstile && !recaptcha) return turnstile;
	if (!turnstile && recaptcha) return recaptcha;

	return {
		id: "captcha-multi",
		onRequest: async (request: Request, ctx: AuthContext) => {
			const selected = pickPluginByHeader(request, {
				"cloudflare-turnstile": turnstile,
				"google-recaptcha": recaptcha,
			});

			if (selected) {
				return await selected.onRequest(request, ctx);
			}

			const first = await turnstile.onRequest(request, ctx);
			if (!first) return;

			if (await isVerificationFailed(first.response)) {
				const second = await recaptcha.onRequest(request, ctx);
				if (!second) return;
				return second;
			}

			return first;
		},
	} as const;
}
