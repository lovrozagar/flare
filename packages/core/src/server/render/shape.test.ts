import { expect, it } from "vitest";
import { shapeDocument } from "./shape.ts";

function withEnv(nodeEnv: string, run: () => void): void {
	const previous = process.env.NODE_ENV;
	process.env.NODE_ENV = nodeEnv;
	try {
		run();
	} finally {
		process.env.NODE_ENV = previous;
	}
}

it("prod document-less", () => {
	withEnv("production", () => {
		const result = shapeDocument("<div>x</div>");
		expect(result.status).toBe(500);
		expect(result.body).toBe("Internal Server Error");
		expect(shapeDocument("<html><div>").status).toBe(500);
		expect(shapeDocument("<html><body></body>").status).toBe(200);
	});
});

it("dev document-less", () => {
	withEnv("development", () => {
		const result = shapeDocument("<div>x</div>");
		expect(result.status).toBe(200);
		expect(result.body).toBe("<div>x</div>");
	});
});
