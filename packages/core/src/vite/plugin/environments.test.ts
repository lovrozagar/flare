import { expect, it } from "vitest";
import { environmentBuild, environmentOrder } from "./environments.ts";

it("defaults", () => {
	const build = environmentBuild();
	expect(build.client).toEqual({ outDir: "dist/client", manifest: true, cssCodeSplit: false, assetsDir: "assets" });
	expect(`${build.ssr.outDir}/${build.ssr.input}`).toBe("dist/server/server.js");
});

it("assets dir", () => {
	expect(environmentBuild({ assetsBase: "/" }).client.assetsDir).toBe("assets");
	expect(() => environmentBuild({ assetsBase: "/", assetsDir: "static" })).toThrow("assets");
});

it("order", () => {
	expect(environmentOrder(true)).toEqual(["client", "ssr", "worker"]);
});

it("no worker", () => {
	expect(environmentOrder(false)).toEqual(["client", "ssr"]);
});
