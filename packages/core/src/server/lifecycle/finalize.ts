import { statusOf } from "../../shared/errors/status.ts";
import { defaultHeaders } from "../security/defaults.ts";
import { assignPolicy } from "./policies.ts";

export type StageResult = {
	status: number;
	body: string;
	render?: "ssr";
	url?: string;
	build?: string;
	location?: string;
	run?: () => void;
};

export function finalize(stage: StageResult): Response {
	const settled = settle(stage);
	const headers = new Headers({ "cache-control": assignPolicy({ kind: "document" }) });
	if (settled.render !== undefined) headers.set("flare-render", settled.render);
	if (settled.build !== undefined) headers.set("flare-build", settled.build);
	if (settled.location !== undefined) headers.set("location", settled.location);
	if (settled.url !== undefined) copySecurity(headers, settled.url);
	return new Response(settled.body, { status: settled.status, headers });
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

function copySecurity(headers: Headers, url: string): void {
	for (const [name, value] of defaultHeaders(url)) headers.set(name, value);
}
