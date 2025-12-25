type SendEmailInput = {
	to: string;
	subject: string;
	text?: string;
	html?: string;
};

async function sendViaResend(input: Required<Pick<SendEmailInput, "to" | "subject">> &
	Pick<SendEmailInput, "text" | "html">) {
	const apiKey = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM;
	if (!apiKey || !from) return false;

	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to: input.to,
			subject: input.subject,
			text: input.text,
			html: input.html,
		}),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		console.error("Failed to send email (Resend):", res.status, body);
		return true;
	}

	return true;
}

export async function sendEmail(input: SendEmailInput) {
	const sent = await sendViaResend({
		to: input.to,
		subject: input.subject,
		text: input.text,
		html: input.html,
	});
	if (sent) return;

	console.log("Email (noop):", {
		to: input.to,
		subject: input.subject,
		text: input.text,
	});
}

