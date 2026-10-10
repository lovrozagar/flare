import { describe, expect, it } from "vitest";
import {
	authenticateTemplate,
	authorizeTemplate,
	cacheTemplate,
	effectsTemplate,
	errorRenderTemplate,
	headersTemplate,
	headTemplate,
	inputTemplate,
	loaderTemplate,
	notFoundRenderTemplate,
	preloaderTemplate,
	unauthenticatedRenderTemplate,
	unauthorizedRenderTemplate,
} from "../../../src/add/method-templates";

describe("method templates", () => {
	const indent = "\t";

	it("authenticateTemplate", () => {
		const t = authenticateTemplate(indent);
		expect(t.method).toBe("authenticate");
		expect(t.code).toContain(".authenticate()");
	});

	it("authorizeTemplate", () => {
		const t = authorizeTemplate(indent);
		expect(t.method).toBe("authorize");
		expect(t.code).toContain(".authorize(");
		expect(t.code).toContain("return true");
	});

	it("cacheTemplate with ssg", () => {
		const t = cacheTemplate(indent, { ssg: true });
		expect(t.method).toBe("cache");
		expect(t.code).toContain("ssg: true");
	});

	it("cacheTemplate with isr", () => {
		const t = cacheTemplate(indent, { isr: 60 });
		expect(t.method).toBe("cache");
		expect(t.code).toContain("revalidate: 60");
		expect(t.code).toContain("isr:");
	});

	it("effectsTemplate", () => {
		const t = effectsTemplate(indent);
		expect(t.method).toBe("effects");
		expect(t.code).toContain(".effects(");
	});

	it("errorRenderTemplate", () => {
		const t = errorRenderTemplate(indent);
		expect(t.method).toBe("errorRender");
		expect(t.code).toContain(".errorRender(");
		expect(t.code).toContain("ctx.error.message");
	});

	it("headTemplate", () => {
		const t = headTemplate(indent);
		expect(t.method).toBe("head");
		expect(t.code).toContain(".head(");
		expect(t.code).toContain("title:");
	});

	it("headersTemplate", () => {
		const t = headersTemplate(indent);
		expect(t.method).toBe("headers");
		expect(t.code).toContain(".headers(");
		expect(t.code).toContain("Cache-Control");
	});

	it("inputTemplate", () => {
		const t = inputTemplate(indent);
		expect(t.method).toBe("input");
		expect(t.code).toContain(".input(");
		expect(t.code).toContain("z.object");
	});

	it("loaderTemplate", () => {
		const t = loaderTemplate(indent);
		expect(t.method).toBe("loader");
		expect(t.code).toContain(".loader(");
		expect(t.code).toContain("return {}");
	});

	it("notFoundRenderTemplate", () => {
		const t = notFoundRenderTemplate(indent);
		expect(t.method).toBe("notFoundRender");
		expect(t.code).toContain(".notFoundRender(");
		expect(t.code).toContain("Not found");
	});

	it("preloaderTemplate", () => {
		const t = preloaderTemplate(indent);
		expect(t.method).toBe("preloader");
		expect(t.code).toContain(".preloader(");
	});

	it("unauthenticatedRenderTemplate", () => {
		const t = unauthenticatedRenderTemplate(indent);
		expect(t.method).toBe("unauthenticatedRender");
		expect(t.code).toContain(".unauthenticatedRender(");
		expect(t.code).toContain("Please sign in");
	});

	it("unauthorizedRenderTemplate", () => {
		const t = unauthorizedRenderTemplate(indent);
		expect(t.method).toBe("unauthorizedRender");
		expect(t.code).toContain(".unauthorizedRender(");
		expect(t.code).toContain("Access denied");
	});

	it("respects custom indentation", () => {
		const t = loaderTemplate("    ");
		expect(t.code).toContain("    .loader(");
	});
});
