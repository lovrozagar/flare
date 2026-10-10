import { describe, expect, it, vi } from "vitest";

vi.mock("@solidjs/web", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@solidjs/web")>();
	return { ...actual, isServer: true };
});

import { clientLazy } from "../../../src/lazy/index.tsx";

describe("clientLazy eager on the server", () => {
	it("does not start the import at factory time when isServer", () => {
		const loader = vi.fn().mockResolvedValue({ default: () => null });
		clientLazy({ eager: true, loader });
		expect(loader).not.toHaveBeenCalled();
	});
});
