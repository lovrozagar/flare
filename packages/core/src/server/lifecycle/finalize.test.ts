import { expect, it } from "vitest";
import { finalize } from "./finalize.ts";

it("only finalize builds a Response", async () => {
	const stage = { status: 201, body: "hi" };
	expect(stage).not.toBeInstanceOf(Response);
	const response = finalize(stage);
	expect(response).toBeInstanceOf(Response);
	expect(response.status).toBe(201);
	expect(await response.text()).toBe("hi");
});

it("flare-render", () => {
	const response = finalize({ status: 200, body: "<html></html>", render: "ssr" });
	expect(response.headers.get("flare-render")).toBe("ssr");
});
