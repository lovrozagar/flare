import { ServerFnValidationError } from "flare/errors"
import { createServerFn } from "flare/server-fn"
import * as z from "zod"

/* echo: returns whatever input it receives */
export const echoFn = createServerFn({ method: "post", name: "echo" })
	.input<{ message: string }>((raw) => {
		const obj = raw as Record<string, unknown>
		if (typeof obj.message !== "string") throw new Error("message is required")
		return { message: obj.message }
	})
	.handler(({ input }) => ({ echo: input.message }))

/* getGreeting: GET-based server function */
export const getGreetingFn = createServerFn({ method: "get", name: "get-greeting" })
	.input<{ name: string }>((raw) => {
		const obj = raw as Record<string, unknown>
		if (typeof obj.name !== "string") throw new Error("name is required")
		return { name: obj.name }
	})
	.handler(({ input }) => ({ greeting: `Hello, ${input.name}!` }))

/* authGated: requires authentication */
export const authGatedFn = createServerFn({ method: "post", name: "auth-gated" })
	.authenticate()
	.handler(({ auth }) => {
		const a = auth as Record<string, unknown>
		return { secret: "classified", userId: a.userId }
	})

/* validatedFn: requires input validation */
export const validatedFn = createServerFn({ method: "post", name: "validated" })
	.input<{ age: number }>((raw) => {
		const obj = raw as Record<string, unknown>
		if (typeof obj.age !== "number" || obj.age < 0 || obj.age > 150) {
			throw new Error("age must be a number between 0 and 150")
		}
		return { age: obj.age }
	})
	.handler(({ input }) => ({ valid: true, years: input.age }))

/* authorizedFn: requires auth + authorization */
export const authorizedFn = createServerFn({ method: "post", name: "authorized" })
	.authenticate()
	.authorize(({ auth }) => {
		const a = auth as Record<string, unknown>
		return a.userId === "admin"
	})
	.handler(() => ({ access: "granted" }))

/* errorFn: always throws */
export const errorFn = createServerFn({ method: "post", name: "error-fn" }).handler(() => {
	throw new Error("Handler exploded")
})

/* streamCountFn: yields numbers 1..5 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const streamCountFn = createServerFn({ method: "post", name: "stream-count" }).stream(
	async function* () {
		for (let i = 1; i <= 5; i++) {
			await delay(10)
			yield i
		}
	},
)

/* streamErrorFn: yields 2 chunks then throws */
export const streamErrorFn = createServerFn({ method: "post", name: "stream-error" }).stream(
	async function* () {
		await Promise.resolve()
		yield "chunk-1"
		yield "chunk-2"
		throw new Error("stream failed")
	},
)

/* streamAuthFn: requires auth, yields greeting chunks */
export const streamAuthFn = createServerFn({ method: "post", name: "stream-auth" })
	.authenticate()
	.stream(async function* (ctx) {
		await Promise.resolve()
		const a = ctx.auth as Record<string, unknown>
		yield `Hello, ${a.userId}`
		yield "Welcome!"
	})

/* slowStreamFn: yields 5 chunks with 200ms delay each (progressive testing) */
export const slowStreamFn = createServerFn({ method: "post", name: "slow-stream" }).stream(
	async function* () {
		for (let i = 1; i <= 5; i++) {
			await delay(200)
			yield { chunk: i }
		}
	},
)

/* piggybackFn: mutation returning piggybacked demo-items + demo-count */
export const piggybackFn = createServerFn({ method: "post", name: "piggyback" })
	.input<{ value: string }>((raw) => {
		const obj = raw as Record<string, unknown>
		if (typeof obj.value !== "string") throw new Error("value is required")
		return { value: obj.value }
	})
	.handler(({ input, piggyback }) => {
		piggyback(["demo-items"], [{ id: 1, name: input.value }])
		piggyback(["demo-count"], 1)
		return { saved: true, value: input.value }
	})

/* concurrentFn: echoes {id, delay} after configurable delay */
export const concurrentFn = createServerFn({ method: "post", name: "concurrent" })
	.input<{ delay: number; id: string }>((raw) => {
		const obj = raw as Record<string, unknown>
		if (typeof obj.id !== "string") throw new Error("id is required")
		if (typeof obj.delay !== "number") throw new Error("delay is required")
		return { delay: obj.delay, id: obj.id }
	})
	.handler(async ({ input }) => {
		await delay(input.delay)
		return { id: input.id, timestamp: Date.now() }
	})

/* retryableFn: tracks per-key call counts, fails odd calls, succeeds even */
const retryCounts = new Map<string, number>()
export const retryableFn = createServerFn({ method: "post", name: "retryable" })
	.input<{ key: string }>((raw) => {
		const obj = raw as Record<string, unknown>
		return { key: typeof obj.key === "string" ? obj.key : "default" }
	})
	.handler(({ input }) => {
		const count = (retryCounts.get(input.key) ?? 0) + 1
		retryCounts.set(input.key, count)
		if (count % 2 === 1) {
			throw new Error("Transient failure")
		}
		return { attempt: count, success: true }
	})

/* revalidateCacheFn: calls ctx.revalidate to purge cached data by tags */
export const revalidateCacheFn = createServerFn({
	method: "post",
	name: "revalidate-cache",
}).handler(async (ctx) => {
	await ctx.revalidate({ tags: ["kv-test"], tiers: ["ssr"] })
	return { revalidated: true }
})

/* revalidateBothFn: purges both store + CDN tiers */
export const revalidateBothFn = createServerFn({
	method: "post",
	name: "revalidate-both",
}).handler(async (ctx) => {
	await ctx.revalidate({ tags: ["kv-test"], tiers: ["ssr", "cdn"] })
	return { revalidated: true }
})

/* ── Form E2E server functions ─────────────────────────────────────── */

/* formContactFn: Standard Schema (zod) validated contact form.
 * - "taken@test.com" triggers business-logic SFVE
 * - message "FORM_ERROR" triggers form-level refine error */
export const formContactFn = createServerFn({ method: "post", name: "form-contact" })
	.input(
		z
			.object({
				email: z.string().min(1, "Required").email("Invalid email"),
				message: z.string().min(1, "Required"),
			})
			.refine((data) => data.message !== "FORM_ERROR", {
				message: "Form-level validation failed",
			}),
	)
	.handler(async ({ input }) => {
		if (input.email === "taken@test.com") {
			throw new ServerFnValidationError({
				fieldErrors: { email: ["Email already registered"] },
				formErrors: [],
			})
		}
		await new Promise((r) => setTimeout(r, 50))
		return { sent: true }
	})

/* formUploadFn: file upload — validates file exists */
export const formUploadFn = createServerFn({ method: "post", name: "form-upload" })
	.input((raw) => {
		const obj = raw as Record<string, unknown>
		if (!(obj.avatar instanceof File) || (obj.avatar as File).size === 0) {
			throw new ServerFnValidationError({
				fieldErrors: { avatar: ["File is required"] },
				formErrors: [],
			})
		}
		return { avatar: obj.avatar as File }
	})
	.handler(({ input }) => ({ filename: input.avatar.name, size: input.avatar.size }))

/* formMultiFn: multi-value checkboxes → string[] */
export const formMultiFn = createServerFn({ method: "post", name: "form-multi" })
	.input((raw) => {
		const obj = raw as Record<string, unknown>
		const tags = obj.tags
		if (!tags || (typeof tags === "string" && tags.length === 0)) {
			throw new ServerFnValidationError({
				fieldErrors: { tags: ["Select at least one tag"] },
				formErrors: [],
			})
		}
		const tagArray = Array.isArray(tags) ? tags : [tags]
		return { tags: tagArray as string[] }
	})
	.handler(({ input }) => ({ received: input.tags }))

/* formDualAFn: { parse } protocol validator — proves non-Standard-Schema works */
export const formDualAFn = createServerFn({ method: "post", name: "form-dual-a" })
	.input({
		parse(raw: unknown): { nameA: string } {
			const obj = raw as Record<string, unknown>
			if (typeof obj.nameA !== "string" || obj.nameA.length === 0) {
				throw new ServerFnValidationError({
					fieldErrors: { nameA: ["Required"] },
					formErrors: [],
				})
			}
			return { nameA: obj.nameA }
		},
	})
	.handler(({ input }) => ({ formA: input.nameA }))

/* formDualBFn: manual function validator — proves function validators work */
export const formDualBFn = createServerFn({ method: "post", name: "form-dual-b" })
	.input((raw) => {
		const obj = raw as Record<string, unknown>
		if (typeof obj.nameB !== "string" || obj.nameB.length === 0) {
			throw new ServerFnValidationError({
				fieldErrors: { nameB: ["Required"] },
				formErrors: [],
			})
		}
		return { nameB: obj.nameB as string }
	})
	.handler(({ input }) => ({ formB: input.nameB }))

/* formAuthFn: manual function validator + authenticate — proves auth + validation */
export const formAuthFn = createServerFn({ method: "post", name: "form-auth" })
	.authenticate()
	.input((raw) => {
		const obj = raw as Record<string, unknown>
		if (typeof obj.note !== "string" || obj.note.length === 0) {
			throw new ServerFnValidationError({
				fieldErrors: { note: ["Required"] },
				formErrors: [],
			})
		}
		return { note: obj.note as string }
	})
	.handler(({ auth, input }) => {
		const a = auth as Record<string, unknown>
		return { note: input.note, userId: a.userId }
	})
