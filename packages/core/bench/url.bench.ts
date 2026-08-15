import { bench, describe } from "vitest";
import { buildUrl, resolvePathParams, serializeSearchParams } from "../src/url";

describe("resolvePathParams", () => {
	bench("simple params", () => {
		resolvePathParams("/users/[id]/posts/[postId]", { id: "42", postId: "99" });
	});

	bench("catch-all param", () => {
		resolvePathParams("/docs/[...slug]", { slug: ["api", "v2", "users"] });
	});

	bench("optional param — present", () => {
		resolvePathParams("/blog/[[category]]/page", { category: "tech" });
	});

	bench("optional param — missing", () => {
		resolvePathParams("/blog/[[category]]/page", {});
	});

	bench("mixed params", () => {
		resolvePathParams("/[locale]/docs/[...slug]", { locale: "en", slug: ["getting-started"] });
	});
});

describe("serializeSearchParams", () => {
	bench("simple key-value", () => {
		serializeSearchParams({ order: "asc", page: "1", sort: "name" });
	});

	bench("array values", () => {
		serializeSearchParams({ page: "1", tags: ["a", "b", "c"] });
	});

	bench("empty", () => {
		serializeSearchParams({});
	});
});

describe("buildUrl", () => {
	bench("path + search", () => {
		buildUrl({
			params: { id: "42" },
			search: { page: "1", tab: "posts" },
			to: "/users/[id]",
		});
	});

	bench("path only", () => {
		buildUrl({ params: {}, to: "/about" });
	});
});
