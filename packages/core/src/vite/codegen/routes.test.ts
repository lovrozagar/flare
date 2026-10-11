import { expect, it } from "vitest";
import { generateRoutes } from "./routes.ts";

it("one route", () => {
	const source = generateRoutes(["_root_/home.page.tsx"]).source;
	expect(source).toContain('from "./_root_/home.page.tsx"');
	expect(source).toContain("export const routeTree");
	expect(source).toContain("export const layouts");
});

it("filename", () => {
	const route = generateRoutes(["_root_/home.page.tsx"]).routes[0];
	expect(route?.id).toBe("_root_");
	expect(route?.urls).toEqual(["/"]);
});

it("about", () => {
	const route = generateRoutes(["_root_/about/about.page.tsx"]).routes[0];
	expect(route?.id).toBe("_root_/about");
	expect(route?.urls).toEqual(["/about"]);
});

it("group", () => {
	const generated = generateRoutes(["_root_/(blog)/(blog).layout.tsx", "_root_/(blog)/post/post.page.tsx"]);
	expect(generated.routes[0]?.urls).toEqual(["/post"]);
	expect(generated.layouts[0]?.id).toBe("_root_/(blog)");
});

it("param", () => {
	const route = generateRoutes(["_root_/users/[id]/[id].page.tsx"]).routes[0];
	expect(route?.urls).toEqual(["/users/[id]"]);
	expect(route?.params).toEqual({ id: "string" });
});

it("catch-all", () => {
	const route = generateRoutes(["_root_/files/[...path]/[...path].page.tsx"]).routes[0];
	expect(route?.urls).toEqual(["/files/[...path]"]);
	expect(route?.params).toEqual({ path: "string[]" });
});

it("optional", () => {
	const route = generateRoutes(["_root_/optional-locale/[[locale]]/[[locale]].page.tsx"]).routes[0];
	expect(route?.urls).toEqual(["/optional-locale", "/optional-locale/<tag>"]);
	expect(route?.params).toEqual({ locale: "string | undefined" });
});

it("optional catch-all", () => {
	const route = generateRoutes(["_root_/[[...rest]]/[[...rest]].page.tsx"]).routes[0];
	expect(route?.urls).toContain("/");
	expect(route?.params).toEqual({ rest: "string[] | undefined" });
});

it("admin root", () => {
	const route = generateRoutes(["_admin_/dashboard/dashboard.page.tsx"]).routes[0];
	expect(route?.urls).toEqual(["/dashboard"]);
});

it("locale root", () => {
	const route = generateRoutes(["[locale]/_root_/about/about.page.tsx"]).routes[0];
	expect(route?.urls).toEqual(["/[locale]/about"]);
});

it("literal brackets", () => {
	const route = generateRoutes(["_root_/[_]id]/home.page.tsx"]).routes[0];
	expect(route?.urls).toEqual(["/[id]"]);
});

it("ignored", () => {
	expect(generateRoutes(["_parts/widget.tsx"]).routes).toEqual([]);
});

it("duplicate url", () => {
	const files = ["_root_/dashboard/dashboard.page.tsx", "_admin_/dashboard/dashboard.page.tsx"];
	expect(() => generateRoutes(files)).toThrow(/_root_\/dashboard\/dashboard\.page\.tsx/);
	expect(() => generateRoutes(files)).toThrow(/_admin_\/dashboard\/dashboard\.page\.tsx/);
});

it("shadow", () => {
	const files = ["_root_/files/readme/readme.page.tsx", "_root_/files/[...path]/[...path].page.tsx"];
	expect(() => generateRoutes(files)).toThrow(/readme\.page\.tsx/);
	expect(() => generateRoutes(files)).toThrow(/\[\.\.\.path\]\.page\.tsx/);
});

it("two pages", () => {
	const files = ["_root_/home.page.tsx", "_root_/index.page.tsx"];
	expect(() => generateRoutes(files)).toThrow(/home\.page\.tsx/);
	expect(() => generateRoutes(files)).toThrow(/index\.page\.tsx/);
});
