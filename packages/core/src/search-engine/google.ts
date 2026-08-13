import { getGoogleAccessToken, type ServiceAccountCredentials } from "./google-jwt.ts"

/* ── Types ────────────────────────────────────────────────────────────── */

export interface GoogleSitemapSubmitConfig {
	credentials: ServiceAccountCredentials
	siteUrl: string
	sitemapUrl: string
}

export interface GoogleIndexingNotification {
	type: "URL_DELETED" | "URL_UPDATED"
	url: string
}

export interface GoogleIndexingConfig {
	credentials: ServiceAccountCredentials
	notifications: GoogleIndexingNotification[]
}

export interface GoogleBatchConfig {
	concurrency?: number
	credentials: ServiceAccountCredentials
	notifications: GoogleIndexingNotification[]
}

interface SubmitResult {
	error?: string
	ok: boolean
}

/* ── Sitemap submission (Search Console) ──────────────────────────────── */

const WEBMASTERS_SCOPE = "https://www.googleapis.com/auth/webmasters"

export async function submitSitemapToGoogle(
	config: GoogleSitemapSubmitConfig,
): Promise<SubmitResult> {
	const token = await getGoogleAccessToken(config.credentials, WEBMASTERS_SCOPE)
	const siteUrl = encodeURIComponent(config.siteUrl)
	const feedpath = encodeURIComponent(config.sitemapUrl)
	const url = `https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/sitemaps/${feedpath}`

	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
		method: "PUT",
	})

	if (!response.ok) {
		await response.body?.cancel()
		return { error: `Google sitemap submit failed (${response.status})`, ok: false }
	}

	await response.body?.cancel()
	return { ok: true }
}

/* ── URL notification (Indexing API) ──────────────────────────────────── */

const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing"
const INDEXING_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish"

export async function notifyGoogleIndexing(
	credentials: ServiceAccountCredentials,
	notification: GoogleIndexingNotification,
): Promise<SubmitResult> {
	const token = await getGoogleAccessToken(credentials, INDEXING_SCOPE)

	const response = await fetch(INDEXING_URL, {
		body: JSON.stringify({ type: notification.type, url: notification.url }),
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		method: "POST",
	})

	if (!response.ok) {
		await response.body?.cancel()
		return { error: `Google indexing notify failed (${response.status})`, ok: false }
	}

	await response.body?.cancel()
	return { ok: true }
}

/* ── Batch URL notification ───────────────────────────────────────────── */

const DEFAULT_CONCURRENCY = 10
const MAX_BATCH = 100

export async function batchNotifyGoogleIndexing(
	config: GoogleBatchConfig,
): Promise<{ errors: SubmitResult[]; total: number; truncated: boolean }> {
	const concurrency = config.concurrency ?? DEFAULT_CONCURRENCY
	const notifications = config.notifications.slice(0, MAX_BATCH)
	const token = await getGoogleAccessToken(config.credentials, INDEXING_SCOPE)
	const results: SubmitResult[] = []
	let idx = 0

	async function next(): Promise<void> {
		while (idx < notifications.length) {
			const current = notifications[idx]
			idx++
			if (!current) continue
			const result = await sendIndexingNotification(token, current)
			if (!result.ok) results.push(result)
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, notifications.length) }, () => next())
	await Promise.all(workers)

	return {
		errors: results,
		total: notifications.length,
		truncated: config.notifications.length > MAX_BATCH,
	}
}

async function sendIndexingNotification(
	token: string,
	notification: GoogleIndexingNotification,
): Promise<SubmitResult> {
	const response = await fetch(INDEXING_URL, {
		body: JSON.stringify({ type: notification.type, url: notification.url }),
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		method: "POST",
	})

	if (!response.ok) {
		await response.body?.cancel()
		return { error: `Google indexing notify failed (${response.status})`, ok: false }
	}

	await response.body?.cancel()
	return { ok: true }
}
