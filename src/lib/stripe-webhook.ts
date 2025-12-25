import Stripe from "stripe";

type HandleStripeWebhookInput = {
	rawBody: string;
	signature: string | null;
	authContext: any;
};

function getStripe() {
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) return null;
	return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

async function updateUserByCustomerId(authContext: any, customerId: string, data: any) {
	const users = await authContext.adapter.findMany({
		model: "user",
		where: [{ field: "stripeCustomerId", value: customerId }],
		limit: 1,
	});
	const user = users?.[0];
	if (!user) return;

	await authContext.adapter.update({
		model: "user",
		where: [{ field: "id", value: user.id }],
		update: data,
	});
}

export async function handleStripeWebhook(input: HandleStripeWebhookInput) {
	const stripe = getStripe();
	if (!stripe) {
		throw new Error("Stripe webhook received but STRIPE_SECRET_KEY is not set.");
	}
	const secret = process.env.STRIPE_WEBHOOK_SECRET;
	if (!secret) {
		throw new Error("Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set.");
	}
	if (!input.signature) {
		throw new Error("Missing Stripe signature header.");
	}

	const event = stripe.webhooks.constructEvent(input.rawBody, input.signature, secret);

	switch (event.type) {
		case "checkout.session.completed": {
			const session = event.data.object as Stripe.Checkout.Session;
			const customerId = session.customer as string | null;
			const subscriptionId = session.subscription as string | null;
			if (!customerId) return;
			await updateUserByCustomerId(input.authContext, customerId, {
				stripeSubscriptionId: subscriptionId,
			});
			return;
		}
		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted": {
			const subscription = event.data.object as Stripe.Subscription;
			const customerId = subscription.customer as string;
			const currentPeriodEnd = subscription.current_period_end
				? new Date(subscription.current_period_end * 1000)
				: null;
			await updateUserByCustomerId(input.authContext, customerId, {
				stripeSubscriptionId: subscription.id,
				stripeSubscriptionStatus: subscription.status,
				stripeCurrentPeriodEnd: currentPeriodEnd,
			});
			return;
		}
		default:
			return;
	}
}
