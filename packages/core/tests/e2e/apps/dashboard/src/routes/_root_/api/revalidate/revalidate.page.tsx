import { createPage } from "@lovrozagar/flare"
import { revalidate } from "@lovrozagar/flare/server"
import { secretFrom } from "../../../../e2e.ts"

const encoder = new TextEncoder()

// dx/cache.md "Purge from a webhook", as written there, but for where the secret comes from (e2e.ts `secretFrom`).
// The header and the expected one are hashed to equal-length digests and compared in full, so the time taken never
// tells a caller how much of a guess matched. An unset secret matches nothing.
async function authorized(header: string | null, secret: string | undefined): Promise<boolean> {
	if (header === null || secret === undefined || secret === "") return false
	const texts = [header, `Bearer ${secret}`]
	const digests = await Promise.all(texts.map((text) => crypto.subtle.digest("SHA-256", encoder.encode(text))))
	const [left, right] = digests.map((digest) => new Uint8Array(digest))
	let difference = 0
	for (const [index, byte] of (left ?? []).entries()) difference |= byte ^ (right?.[index] ?? 0)
	return difference === 0
}

export const route = createPage("_root_/api/revalidate").response(
	async ({ request, env }) => {
		if (!(await authorized(request.headers.get("authorization"), secretFrom(env, "REVALIDATE_SECRET")))) {
			return new Response(null, { status: 401 })
		}
		const body: unknown = await request.json()
		const tags: unknown = Reflect.get(Object(body), "tags")
		if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string") || tags.length === 0) {
			return new Response(null, { status: 400 })
		}
		await revalidate({ tags })
		return new Response(null, { status: 204 })
	},
	{ methods: ["POST"] },
)
