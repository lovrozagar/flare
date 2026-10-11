import { expect, it } from "vitest";
import { runLoaders, type LoaderTasks } from "./run.ts";

it("order", () => {
	const seen: string[] = [];
	const tasks = {} as LoaderTasks;
	for (const name of ["validate", "authenticate", "preloader", "authorize", "loader", "head", "headers"] as const) {
		tasks[name] = () => seen.push(name);
	}
	runLoaders(tasks);
	expect(seen).toEqual(["validate", "authenticate", "preloader", "authorize", "loader", "head", "headers"]);
});
