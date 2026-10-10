import { describe, expect, it } from "vitest";
import { layoutTemplate, pageTemplate, resourceTemplates, serverFnTemplate } from "../../src/templates";

describe("pageTemplate", () => {
	it("generates page with capitalized label", () => {
		const result = pageTemplate("about");
		expect(result).toContain("createPage");
		expect(result).toContain("About");
		expect(result).toContain(".render");
	});

	it("produces valid JSX", () => {
		const result = pageTemplate("dashboard");
		expect(result).toContain("<div>Dashboard</div>");
	});
});

describe("layoutTemplate", () => {
	it("generates layout with children outlet", () => {
		const result = layoutTemplate("admin");
		expect(result).toContain("createLayout");
		expect(result).toContain("ctx.children");
		expect(result).toContain(".render");
	});
});

describe("resourceTemplates", () => {
	it("generates list and detail pages", () => {
		const result = resourceTemplates("products");
		expect(result.routes).toHaveLength(2);
		expect(result.routes[0]?.path).toBe("products.page.tsx");
		expect(result.routes[1]?.path).toBe("[id]/product-detail.page.tsx");
		expect(result.serverFn).toBeNull();
	});

	it("singularizes correctly", () => {
		const result = resourceTemplates("categories");
		expect(result.routes[1]?.path).toBe("[id]/category-detail.page.tsx");
		expect(result.routes[1]?.content).toContain("Category Detail");
	});

	it("handles -ses singularization", () => {
		const result = resourceTemplates("addresses");
		expect(result.routes[1]?.content).toContain("Address Detail");
	});

	it("handles words ending in -ches", () => {
		const result = resourceTemplates("batches");
		expect(result.routes[1]?.content).toContain("Batch Detail");
	});

	it("handles words ending in -shes", () => {
		const result = resourceTemplates("dishes");
		expect(result.routes[1]?.content).toContain("Dish Detail");
	});

	it("generates CRUD with --crud flag", () => {
		const result = resourceTemplates("orders", true);
		expect(result.routes).toHaveLength(4);
		expect(result.routes[2]?.path).toBe("new/order-new.page.tsx");
		expect(result.routes[3]?.path).toBe("[id]/edit/order-edit.page.tsx");
		expect(result.serverFn).not.toBeNull();
	});

	it("CRUD server fn has correct methods", () => {
		const result = resourceTemplates("products", true);
		expect(result.serverFn?.content).toContain("getProducts");
		expect(result.serverFn?.content).toContain("getProduct");
		expect(result.serverFn?.content).toContain("createProduct");
		expect(result.serverFn?.content).toContain("updateProduct");
		expect(result.serverFn?.content).toContain("deleteProduct");
	});

	it("includes customize hints", () => {
		const result = resourceTemplates("users");
		expect(result.routes[0]?.customize).toContainEqual(expect.objectContaining({ method: "loader" }));
	});

	it("does not singularize 'ss' words", () => {
		const result = resourceTemplates("access");
		expect(result.routes[1]?.content).toContain("Access Detail");
	});
});

describe("serverFnTemplate", () => {
	it("generates server function", () => {
		const result = serverFnTemplate("fetchUsers");
		expect(result).toContain("createServerFn");
		expect(result).toContain("fetchUsers");
		expect(result).toContain(".handler");
	});
});
