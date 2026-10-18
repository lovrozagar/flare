import { userById, type Role } from "./db.ts"

// The session is a signed cookie, `dash.session=<user id>.<version>.<signature>`, under the app's path (B146). The
// signature is HMAC-SHA256 over the id and the version, with Web Crypto, so every runtime verifies it the same way.
export const SESSION_COOKIE = "dash.session"
const PATH = "/app"

// The secret comes from the env. Unset, as in the e2e boots, the app uses this one.
const TEST_SECRET = "dashboard-test-secret-not-for-production"

export type Session = { userId: string; email: string; name: string; workspaceId: string; role: Role }

const encoder = new TextEncoder()
const keys = new Map<string, Promise<CryptoKey>>()

function keyFor(secret: string): Promise<CryptoKey> {
	const known = keys.get(secret)
	if (known !== undefined) return known
	const key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
		"verify",
	])
	keys.set(secret, key)
	return key
}

export function secretOf(env: unknown): string {
	const value: unknown = Reflect.get(Object(env), "SESSION_SECRET")
	return typeof value === "string" && value !== "" ? value : TEST_SECRET
}

function toBase64Url(bytes: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "")
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
	try {
		const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"))
		return Uint8Array.from(binary, (char) => char.charCodeAt(0))
	} catch {
		return undefined
	}
}

async function sign(secret: string, payload: string): Promise<string> {
	return toBase64Url(await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(payload)))
}

function cookieValue(request: Request): string | undefined {
	for (const part of (request.headers.get("cookie") ?? "").split(";")) {
		const [name, value] = part.trim().split("=")
		if (name === SESSION_COOKIE && value !== undefined && value !== "") return value
	}
	return undefined
}

// The session a request carries, or null: no cookie, a bad signature, an unknown user, or a version that was ended.
export async function sessionOf(request: Request, env: unknown): Promise<Session | null> {
	const value = cookieValue(request)
	const [id, version, signature] = value?.split(".") ?? []
	if (id === undefined || version === undefined || signature === undefined) return null
	const bytes = fromBase64Url(signature)
	if (bytes === undefined) return null
	const valid = await crypto.subtle.verify(
		"HMAC",
		await keyFor(secretOf(env)),
		bytes,
		encoder.encode(`${id}.${version}`),
	)
	const user = valid ? userById(id) : undefined
	if (user === undefined || String(user.version) !== version) return null
	return { userId: user.id, email: user.email, name: user.name, workspaceId: user.workspaceId, role: user.role }
}

export async function sessionCookie(env: unknown, userId: string, version: number): Promise<string> {
	const payload = `${userId}.${version}`
	return `${SESSION_COOKIE}=${payload}.${await sign(secretOf(env), payload)}; Path=${PATH}; HttpOnly; SameSite=Lax`
}

export const CLEAR_SESSION = `${SESSION_COOKIE}=; Path=${PATH}; HttpOnly; SameSite=Lax; Max-Age=0`
