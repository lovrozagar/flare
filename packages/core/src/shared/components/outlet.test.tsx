import { expect, it } from "vitest";
import { Outlet } from "./outlet.tsx";

it("page", () => {
	expect(Outlet({ children: "Home" })).toBe("Home");
});
