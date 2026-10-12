import { statusOf } from "../../shared/errors/status.ts";
import { defaultHeaders } from "../security/defaults.ts";
import { assignPolicy } from "./policies.ts";

// `body` may be a stream or bytes: a .response() answer passes through unread (dx/server.md).
export type StageResult = {
	status: number;
	body: BodyInit | null;
	render?: "ssr";
	url?: string;
	build?: string;
	location?: string;
	run?: () => void;
	headers?: Headers;
};

export function finalize(stage: StageResult): Response {
	const settled = settle(stage);
	const headers = new Headers({ "cache-control": assignPolicy({ kind: "document" }) });
	if (settled.render !== undefined) headers.set("flare-render", settled.render);
	if (settled.build !== undefined) headers.set("flare-build", settled.build);
	if (settled.location !== undefined) headers.set("location", settled.location);
	if (settled.url !== undefined) copySecurity(headers, settled.url);
	if (settled.headers !== undefined) copyHeaders(headers, settled.headers);
	return new Response(settled.body === "" ? null : settled.body, { status: settled.status, headers });
}

function settle(stage: StageResult): StageResult {
	if (stage.run === undefined) return stage;
	try {
		stage.run();
		return stage;
	} catch (error) {
		return { ...stage, status: statusOf(error), body: "" };
	}
}

function copyHeaders(target: Headers, extra: Headers): void {
	extra.forEach((value, name) => target.set(name, value));
}

function copySecurity(headers: Headers, url: string): void {
	for (const [name, value] of defaultHeaders(url)) headers.set(name, value);
}
