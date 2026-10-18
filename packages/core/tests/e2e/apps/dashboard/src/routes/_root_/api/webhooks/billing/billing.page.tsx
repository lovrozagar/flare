import { createPage } from "@lovrozagar/flare"
import { setPlan, signedUpUser, type Plan } from "../../../../../db.ts"

const encoder = new TextEncoder()

// The payment provider's signature: HMAC-SHA256 of the raw body under the shared secret, hex, in `x-signature`.
// `crypto.subtle.verify` compares in constant time.
async function signed(body: string, signature: string | null, secret: string | undefined): Promise<boolean> {
	if (signature === null || secret === undefined || !/^[0-9a-f]{64}$/.test(signature)) return false
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"verify",
	])
	const bytes = Uint8Array.from(signature.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16))
	return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(body))
}

// The billing provider posts a plan change from its own site. `crossOrigin` drops the Origin check for this route's
// POST, since the signature, not the Origin, proves the sender; the route reads no session (dx/builder.md response).
export const route = createPage("_root_/api/webhooks/billing").response(
	async ({ request, env }) => {
		const body = await request.text()
		if (!(await signed(body, request.headers.get("x-signature"), env.BILLING_SECRET))) {
			return new Response(null, { status: 401 })
		}
		const event: unknown = JSON.parse(body)
		const email: unknown = Reflect.get(Object(event), "email")
		const plan: unknown = Reflect.get(Object(event), "plan")
		const user = typeof email === "string" ? signedUpUser(email) : undefined
		if (user === undefined || (plan !== "free" && plan !== "pro")) return new Response(null, { status: 422 })
		setPlan(user.workspaceId, plan satisfies Plan)
		return Response.json({ workspace: user.workspaceId, plan })
	},
	{ methods: ["POST"], crossOrigin: true },
)
