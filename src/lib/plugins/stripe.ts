import { APIError, sessionMiddleware } from "better-auth/api";
import { createAuthEndpoint } from "better-auth/plugins";
import Stripe from "stripe";
import * as z from "zod";

let stripeClient: Stripe | null = null;
function getStripe() {
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) return null;
	if (!stripeClient) {
		stripeClient = new Stripe(key, {
			apiVersion: "2025-02-24.acacia",
		});
	}
	return stripeClient;
}

const schema = {
	user: {
		fields: {
			stripeCustomerId: {
				type: "string",
				required: false,
				index: true,
				input: false,
			},
			stripeSubscriptionId: {
				type: "string",
				required: false,
				index: true,
				input: false,
			},
			stripeSubscriptionStatus: {
				type: "string",
				required: false,
				input: false,
			},
			stripeCurrentPeriodEnd: {
				type: "date",
				required: false,
				input: false,
			},
		},
	},
} as const;

async function ensureCustomerId(ctx: any, user: any): Promise<string> {
	const stripe = getStripe();
	if (!stripe) {
		throw new APIError("BAD_REQUEST", {
			message: "Stripe is not configured (missing STRIPE_SECRET_KEY).",
		});
	}
	if (user.stripeCustomerId) return user.stripeCustomerId;

	const customer = await stripe.customers.create({
		email: user.email,
		name: user.name,
		metadata: {
			userId: user.id,
		},
	});

	const updated = await ctx.context.internalAdapter.updateUser(user.id, {
		stripeCustomerId: customer.id,
	});
	return updated.stripeCustomerId;
}

const createCheckoutBodySchema = z.object({
	priceId: z.string().optional(),
	successUrl: z.string().url().optional(),
	cancelUrl: z.string().url().optional(),
});

const createPortalBodySchema = z.object({
	returnUrl: z.string().url().optional(),
});

export const stripe = () => {
	return {
		id: "stripe",
		schema,
		init(ctx: any) {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								after: async (user: any) => {
									const stripe = getStripe();
									if (!stripe) return;
									if (user.stripeCustomerId) return;
									try {
										const customer = await stripe.customers.create({
											email: user.email,
											name: user.name,
											metadata: { userId: user.id },
										});
										await ctx.internalAdapter.updateUser(user.id, {
											stripeCustomerId: customer.id,
										});
									} catch (err) {
										ctx.logger.error("Failed to create Stripe customer", err);
									}
								},
							},
						},
					},
				},
			};
		},
		endpoints: {
			createCheckoutSession: createAuthEndpoint(
				"/stripe/create-checkout-session",
				{
					method: "POST",
					body: createCheckoutBodySchema,
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const stripe = getStripe();
					if (!stripe) {
						throw new APIError("BAD_REQUEST", {
							message: "Stripe is not configured (missing STRIPE_SECRET_KEY).",
						});
					}

					const user = ctx.context.session.user as any;
					const customerId = await ensureCustomerId(ctx, user);

					const priceId = ctx.body.priceId ?? process.env.STRIPE_PRICE_ID;
					if (!priceId) {
						throw new APIError("BAD_REQUEST", {
							message: "Missing priceId (or STRIPE_PRICE_ID).",
						});
					}

					const successUrl =
						ctx.body.successUrl ??
						process.env.STRIPE_SUCCESS_URL ??
						`${process.env.APP_WEB_URL ?? ""}/billing/success`;
					const cancelUrl =
						ctx.body.cancelUrl ??
						process.env.STRIPE_CANCEL_URL ??
						`${process.env.APP_WEB_URL ?? ""}/billing/cancel`;

					const session = await stripe.checkout.sessions.create({
						mode: "subscription",
						customer: customerId,
						line_items: [{ price: priceId, quantity: 1 }],
						success_url: successUrl,
						cancel_url: cancelUrl,
						client_reference_id: user.id,
					});

					return ctx.json({ url: session.url });
				},
			),
			createPortalSession: createAuthEndpoint(
				"/stripe/create-portal-session",
				{
					method: "POST",
					body: createPortalBodySchema,
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const stripe = getStripe();
					if (!stripe) {
						throw new APIError("BAD_REQUEST", {
							message: "Stripe is not configured (missing STRIPE_SECRET_KEY).",
						});
					}
					const user = ctx.context.session.user as any;
					const customerId = await ensureCustomerId(ctx, user);

					const returnUrl =
						ctx.body.returnUrl ??
						process.env.STRIPE_RETURN_URL ??
						`${process.env.APP_WEB_URL ?? ""}/settings/billing`;

					const portal = await stripe.billingPortal.sessions.create({
						customer: customerId,
						return_url: returnUrl,
					});

					return ctx.json({ url: portal.url });
				},
			),
		},
	} as const;
};
