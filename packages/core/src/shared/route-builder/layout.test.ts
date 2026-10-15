import { expect, it } from "vitest"
import { createLayout } from "./layout.ts"

const authorize = (): boolean => true
const preloader = (): string => "pre"
const render = (): string => "child"
const head = (): { title: string } => ({ title: "Admin" })

type Layout = ReturnType<typeof createLayout>

it("layout has no response", () => {
	const absent: "response" extends keyof Layout ? never : true = true
	const layout = createLayout("_root_")
	expect(absent).toBe(true)
	expect("response" in layout).toBe(false)
	expect(layout.render(() => "child").document).toBe(false)
})

it("layout chain", () => {
	expect(
		createLayout("_root_/admin")
			.authenticateOptional()
			.authorize(authorize)
			.preloader(preloader)
			.head(head)
			.render(render),
	).toEqual({
		_type: "layout",
		id: "_root_/admin",
		document: false,
		auth: { mode: "optional", callerData: [] },
		authorize,
		preloader,
		head,
		render,
	})
})
