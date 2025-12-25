import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import Stripe from "stripe";
import { handleStripeWebhook } from "../src/lib/stripe-webhook";
import { readJson } from "./helpers";

describe("stripe webhook", () => {
	it("updates user subscription fields by stripeCustomerId", async () => {
		const originalKey = process.env.STRIPE_SECRET_KEY;
		const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
		process.env.STRIPE_SECRET_KEY = "sk_test_123";
		process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";

		const { auth } = await getTestInstance(
			{
				emailAndPassword: { enabled: true, requireEmailVerification: false },
				user: {
					additionalFields: {
						stripeCustomerId: { type: "string", required: false, input: false },
						stripeSubscriptionId: { type: "string", required: false, input: false },
						stripeSubscriptionStatus: {
							type: "string",
							required: false,
							input: false,
						},
						stripeCurrentPeriodEnd: { type: "date", required: false, input: false },
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
					name: "Stripe",
					email: "stripe@example.com",
					password: "Test123456!",
				}),
			}),
		);
		expect(signUpRes.status).toBe(200);
		const { user } = (await readJson<any>(signUpRes)) as { user: { id: string } };

		const authContext = await auth.$context;
		await authContext.internalAdapter.updateUser(user.id, {
			stripeCustomerId: "cus_123",
		});

		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
			apiVersion: "2025-02-24.acacia",
		});

		const event: Stripe.Event = {
			id: "evt_123",
			object: "event",
			api_version: "2025-02-24.acacia",
			created: Math.floor(Date.now() / 1000),
			data: {
				object: {
					id: "sub_123",
					object: "subscription",
					customer: "cus_123",
					status: "active",
					current_period_end: Math.floor(Date.now() / 1000) + 3600,
				} as any,
			},
			livemode: false,
			pending_webhooks: 1,
			request: null,
			type: "customer.subscription.updated",
		};

		const rawBody = JSON.stringify(event);
		const signature = stripe.webhooks.generateTestHeaderString({
			payload: rawBody,
			secret: process.env.STRIPE_WEBHOOK_SECRET,
		});

		await handleStripeWebhook({
			rawBody,
			signature,
			authContext,
		});

		const updated = await authContext.internalAdapter.findUserById(user.id);
		expect((updated as any).stripeSubscriptionId).toBe("sub_123");
		expect((updated as any).stripeSubscriptionStatus).toBe("active");
		expect((updated as any).stripeCurrentPeriodEnd).toBeInstanceOf(Date);

		process.env.STRIPE_SECRET_KEY = originalKey;
		process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
	});
});

