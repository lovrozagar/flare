// dx/types.md "Maps codegen writes", one case per row, read through the package entry from the register codegen wrote
// for this app. app.test.ts compiles this file; vitest never runs it (B96, plan 25 5.2).
import { createLayout, createPage, type FlareRegister } from "@lovrozagar/flare"
import { expectTypeOf, it } from "vitest"

type Register = FlareRegister
type Has<Map, Key> = Key extends keyof Map ? true : false

it("routes", () => {
	expectTypeOf<Register["routes"]["/about"]>().toEqualTypeOf<{ params: {} }>()
	expectTypeOf<Register["routes"]["/users/[id]"]>().toEqualTypeOf<{ params: { id: string } }>()
	expectTypeOf<Register["routes"]["/opt/[[locale]]"]>().toEqualTypeOf<{ params: { locale: string | undefined } }>()
	expectTypeOf<Register["routes"]["/docs/[...path]"]>().toEqualTypeOf<{ params: { path: string[] } }>()
	// A `.response()` route, a layout, and a segment have no public URL entry.
	expectTypeOf<Has<Register["routes"], "/raw">>().toEqualTypeOf<false>()
	expectTypeOf<Has<Register["routes"], "/seg">>().toEqualTypeOf<false>()
})

it("pageIds", () => {
	expectTypeOf<"_root_/about">().toExtend<Register["pageIds"]>()
	// A `.response()` page is a target too.
	expectTypeOf<"_root_/raw">().toExtend<Register["pageIds"]>()
	expectTypeOf<"_root_/(blog)">().not.toExtend<Register["pageIds"]>()
	expectTypeOf<"_root_/seg">().not.toExtend<Register["pageIds"]>()
})

it("routeModules", () => {
	expectTypeOf<Register["routeModules"]["_root_/about"]["_type"]>().toEqualTypeOf<"page">()
	expectTypeOf<Register["routeModules"]["_root_/raw"]["_type"]>().toEqualTypeOf<"page">()
	expectTypeOf<Register["routeModules"]["_root_/(blog)"]["_type"]>().toEqualTypeOf<"layout">()
	expectTypeOf<Register["routeModules"]["_root_"]["_type"]>().toEqualTypeOf<"root">()
	expectTypeOf<Register["routeModules"]["_root_/seg"]["_type"]>().toEqualTypeOf<"segment">()
})

it("routeParents", () => {
	expectTypeOf<Register["routeParents"]["_root_/(blog)/post/[slug]"]>().toEqualTypeOf<["_root_", "_root_/(blog)"]>()
	expectTypeOf<Register["routeParents"]["_root_/about"]>().toEqualTypeOf<["_root_"]>()
	expectTypeOf<Register["routeParents"]["_root_"]>().toEqualTypeOf<[]>()
})

it("authModes", () => {
	expectTypeOf<Register["authModes"]["_root_/(blog)"]>().toEqualTypeOf<true>()
	expectTypeOf<Register["authModes"]["_root_/guest"]>().toEqualTypeOf<"optional">()
	// `.authorize()` alone seeds `"optional"`; a route with no auth method has no entry.
	expectTypeOf<Register["authModes"]["_root_/public"]>().toEqualTypeOf<"optional">()
	expectTypeOf<Has<Register["authModes"], "_root_/about">>().toEqualTypeOf<false>()
})

it("routeSearchParams", () => {
	expectTypeOf<Register["routeSearchParams"]["_root_/search"]>().toEqualTypeOf<{ q: string; page?: number }>()
	// A layout keeps its own output.
	expectTypeOf<Register["routeSearchParams"]["_root_/(blog)"]>().toEqualTypeOf<{ section: string }>()
	expectTypeOf<Has<Register["routeSearchParams"], "_root_/about">>().toEqualTypeOf<false>()
})

it("routeParams", () => {
	expectTypeOf<Register["routeParams"]["_root_/imported/[id]"]>().toEqualTypeOf<{ id: number }>()
	// A `never` output stays `never`.
	expectTypeOf<Register["routeParams"]["_root_/void/[id]"]>().toBeNever()
	expectTypeOf<Has<Register["routeParams"], "_root_/users/[id]">>().toEqualTypeOf<false>()
})

it("hasQueryClient", () => {
	expectTypeOf<Register["hasQueryClient"]>().toEqualTypeOf<true>()
})

// Every id in `routeParents`, the ids listed as parents included, is a key of `routeModules`.
it("parents closed", () => {
	type Parents = Register["routeParents"]
	expectTypeOf<keyof Parents>().toExtend<keyof Register["routeModules"]>()
	expectTypeOf<Parents[keyof Parents][number]>().toExtend<keyof Register["routeModules"]>()
})

// `"optional"` is a value in `authModes`, never an argument: `.authenticate("optional")` does not type-check on a page
// or a layout, and a caller name held in a `string` still does.
it("optional argument", () => {
	// @ts-expect-error "optional" is not a caller name
	void createPage("_root_/about").authenticate("optional")
	// @ts-expect-error "optional" is not a caller name
	void createLayout("_root_/(blog)").authenticate("optional")
	const caller: string = "optional"
	expectTypeOf(createPage("_root_/about").authenticate(caller)).toHaveProperty("loader")
})
