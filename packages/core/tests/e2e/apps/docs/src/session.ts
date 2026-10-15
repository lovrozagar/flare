// The demo session is a cookie `docs.session=<user>.<role>`. A real app verifies a signed token here.
export const SESSION_COOKIE = "docs.session"

export type Session = { user: string; role: "admin" | "reader"; callerData: readonly unknown[] }

export function sessionOf(request: Request, callerData: readonly unknown[]): Session | null {
	const header = request.headers.get("cookie") ?? ""
	for (const part of header.split(";")) {
		const [name, value] = part.trim().split("=")
		if (name !== SESSION_COOKIE || value === undefined) continue
		const [user, role] = decodeURIComponent(value).split(".")
		if (user === undefined || user === "") return null
		return { user, role: role === "admin" ? "admin" : "reader", callerData }
	}
	return null
}

export function sessionCookie(user: string, role: string): string {
	return `${SESSION_COOKIE}=${encodeURIComponent(`${user}.${role}`)}; Path=/; HttpOnly; SameSite=Lax`
}

export const CLEAR_SESSION = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
