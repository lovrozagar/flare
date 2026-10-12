import type { JSX } from "@solidjs/web";

export type SegmentCache = { cdn: { maxAge: string } };

export type SegmentRender = (props: { children: JSX.Element }) => JSX.Element;

// `_type` names the kind for the generated register, which keeps a segment out of `to` (dx/types.md).
export type SegmentRecord<Id extends string = string> = {
	readonly _type: "segment";
	id: Id;
	cache: SegmentCache;
	render: SegmentRender;
};

export type SegmentBuilder<Id extends string = string> = {
	id: Id;
	render: SegmentRender;
	cache: (config: SegmentCache) => SegmentRecord<Id>;
};

function render(props: { children: JSX.Element }): JSX.Element {
	return props.children;
}

export function createPathSegment<Id extends string>(id: Id): SegmentBuilder<Id> {
	return {
		id,
		render,
		cache(config: SegmentCache): SegmentRecord<Id> {
			return { _type: "segment", id, cache: config, render };
		},
	};
}
