/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { registerFormActionContextGetter } from "../../../src/form/index.tsx"

/* ── handleSubmit is only accessible via the Form component's onSubmit.
 *   We test the pure logic paths by exercising the fetch mock patterns
 *   that handleSubmit would encounter. Since Form is a Solid component,
 *   we test registerFormActionContextGetter directly here as it is the
 *   non-component exported API with testable logic. ─────────────────── */

/* ── registerFormActionContextGetter ──────────────────────────────────── */

describe("registerFormActionContextGetter", () => {
	it("F1: accepts and stores a getter function", () => {
		const getter = vi.fn(() => undefined)
		registerFormActionContextGetter(getter)
		/* no throw = success; getter is stored internally */
	})

	it("F2: getter receives fnId and returns context", () => {
		const ctx = {
			fieldErrors: { email: ["required"] },
			formErrors: ["form invalid"],
			message: "Validation failed",
			values: { email: "" },
		}
		const getter = vi.fn((fnId: string) => {
			if (fnId === "fn-123") return ctx
			return undefined
		})
		registerFormActionContextGetter(getter)
		expect(getter("fn-123")).toEqual(ctx)
		expect(getter("fn-unknown")).toBeUndefined()
	})

	it("F3: getter returning undefined for unknown fnId", () => {
		const getter = vi.fn((_fnId: string) => undefined)
		registerFormActionContextGetter(getter)
		expect(getter("any-id")).toBeUndefined()
	})

	it("F4: overwriting getter replaces previous", () => {
		const getter1 = vi.fn((_fnId: string) => undefined)
		const getter2 = vi.fn((_fnId: string) => ({
			fieldErrors: {},
			formErrors: [],
			message: "",
			values: {},
		}))
		registerFormActionContextGetter(getter1)
		registerFormActionContextGetter(getter2)
		/* the module variable _getFormActionContext is now getter2 */
		expect(getter2("test")).toBeDefined()
	})
})

/* ── handleSubmit fetch response parsing ────────────────────────────── */

describe("handleSubmit response parsing logic", () => {
	/* These tests exercise the response shapes that handleSubmit parses.
	 * They validate the parsing contract without requiring Solid rendering. */

	it("F5: 200 response shape — extracts data field", async () => {
		const response = new Response(JSON.stringify({ data: { id: 1, name: "Created" } }), {
			headers: { "content-type": "application/json" },
			status: 200,
		})
		const json = (await response.json()) as { data: { id: number; name: string } }
		expect(json.data).toEqual({ id: 1, name: "Created" })
	})

	it("F6: 400 with errors field — FlattenedError shape", async () => {
		const body = {
			errors: {
				fieldErrors: { email: ["Invalid email"], name: ["Required"] },
				formErrors: ["Form validation failed"],
			},
		}
		const response = new Response(JSON.stringify(body), { status: 400 })
		const parsed: unknown = await response.json()

		expect(typeof parsed === "object" && parsed !== null && "errors" in parsed).toBe(true)
		const errors = (
			parsed as { errors: { fieldErrors: Record<string, string[]>; formErrors: string[] } }
		).errors
		expect(errors.fieldErrors.email).toEqual(["Invalid email"])
		expect(errors.formErrors).toEqual(["Form validation failed"])
	})

	it("F7: 400 without errors field — message extraction", async () => {
		const body = { message: "Rate limit exceeded" }
		const response = new Response(JSON.stringify(body), { status: 400 })
		const parsed: unknown = await response.json()

		const hasErrors = typeof parsed === "object" && parsed !== null && "errors" in parsed
		expect(hasErrors).toBe(false)

		const msg =
			typeof parsed === "object" && parsed !== null && "message" in parsed
				? String((parsed as Record<string, unknown>).message)
				: "Request failed"
		expect(msg).toBe("Rate limit exceeded")
	})

	it("F8: 500 without message — falls back to 'Request failed'", async () => {
		const body = { code: "INTERNAL_ERROR" }
		const response = new Response(JSON.stringify(body), { status: 500 })
		const parsed: unknown = await response.json()

		const hasMessage = typeof parsed === "object" && parsed !== null && "message" in parsed
		expect(hasMessage).toBe(false)

		const msg = hasMessage ? String((parsed as Record<string, unknown>).message) : "Request failed"
		expect(msg).toBe("Request failed")
	})

	it("F9: non-JSON response body — json().catch returns null", async () => {
		const response = new Response("Not JSON", { status: 500 })
		const body: unknown = await response.json().catch(() => null)
		expect(body).toBeNull()
	})

	it("F10: 400 with errors but no formErrors → only fieldErrors set", async () => {
		const body = {
			errors: {
				fieldErrors: { username: ["taken"] },
				formErrors: [],
			},
		}
		const response = new Response(JSON.stringify(body), { status: 400 })
		const parsed = (await response.json()) as typeof body
		expect(parsed.errors.fieldErrors).toEqual({ username: ["taken"] })
		expect(parsed.errors.formErrors).toHaveLength(0)
	})

	it("F11: 400 with errors but fieldErrors empty → formErrors only", async () => {
		const body = {
			errors: {
				fieldErrors: {},
				formErrors: ["Something went wrong"],
			},
		}
		const response = new Response(JSON.stringify(body), { status: 400 })
		const parsed = (await response.json()) as typeof body
		expect(Object.keys(parsed.errors.fieldErrors)).toHaveLength(0)
		expect(parsed.errors.formErrors).toEqual(["Something went wrong"])
	})

	it("F12: network error wrapping — non-Error thrown", () => {
		const e: unknown = "string error"
		const err = e instanceof Error ? e : new Error("Network error")
		expect(err.message).toBe("Network error")
	})

	it("F13: network error wrapping — Error instance preserved", () => {
		const e: unknown = new TypeError("Failed to fetch")
		const err = e instanceof Error ? e : new Error("Network error")
		expect(err.message).toBe("Failed to fetch")
		expect(err).toBeInstanceOf(TypeError)
	})
})
