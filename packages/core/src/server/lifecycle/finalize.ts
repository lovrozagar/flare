import { assignPolicy } from "./policies.ts";

export type StageResult = {
	status: number;
	body: string;
	render?: "ssr";
};

export function finalize(stage: StageResult): Response {
	const headers = new Headers({ "cache-control": assignPolicy({ kind: "document" }) });
	if (stage.render !== undefined) headers.set("flare-render", stage.render);
	return new Response(stage.body, { status: stage.status, headers });
}
