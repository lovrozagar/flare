import type { FlareMiddleware } from "../middleware/index.ts";

/* ── Types ────────────────────────────────────────────────────────────── */

export interface IndexNowConfig {
	host: string;
	key: string;
	keyLocation?: string;
	urls: string[];
}

interface SubmitResult {
	error?: string;
	ok: boolean;
}

/* ── IndexNow submission ──────────────────────────────────────────────── */

const INDEXNOW_URL = "https://api.indexnow.org/indexnow";

export async function submitIndexNow(config: IndexNowConfig): Promise<SubmitResult> {
	const body: Record<string, unknown> = {
		host: config.host,
		key: config.key,
		urlList: config.urls,
	};

	if (config.keyLocation) {
		body.keyLocation = config.keyLocation;
	}

	const response = await fetch(INDEXNOW_URL, {
		body: JSON.stringify(body),
		headers: { "Content-Type": "application/json; charset=utf-8" },
		method: "POST",
	});

	if (!response.ok) {
		await response.body?.cancel();
		return { error: `IndexNow submit failed (${response.status})`, ok: false };
	}

	await response.body?.cancel();
	return { ok: true };
}

/* ── Verification middleware ──────────────────────────────────────────── */

export function indexNowVerification(key: string): FlareMiddleware {
	const path = `/${key}.txt`;

	return async (ctx) => {
		if (ctx.request.method !== "GET" || ctx.url.pathname !== path) {
			return await ctx.next();
		}

		return ctx.respond(
			new Response(key, {
				headers: { "Content-Type": "text/plain; charset=utf-8" },
				status: 200,
			}),
		);
	};
}
