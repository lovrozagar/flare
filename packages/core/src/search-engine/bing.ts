/* ── Types ────────────────────────────────────────────────────────────── */

export interface BingSubmitConfig {
	apiKey: string
	siteUrl: string
	urls: string[]
}

interface SubmitResult {
	error?: string
	ok: boolean
}

/* ── Bing Webmaster URL submission ────────────────────────────────────── */

export async function submitUrlsToBing(config: BingSubmitConfig): Promise<SubmitResult> {
	const url = `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${encodeURIComponent(config.apiKey)}`

	const response = await fetch(url, {
		body: JSON.stringify({ siteUrl: config.siteUrl, urlList: config.urls }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	})

	if (!response.ok) {
		await response.body?.cancel()
		return { error: `Bing submit failed (${response.status})`, ok: false }
	}

	await response.body?.cancel()
	return { ok: true }
}
