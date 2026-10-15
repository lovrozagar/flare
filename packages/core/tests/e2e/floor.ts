// The browser floor (decision B123): the client runs where the build targets, Vite 8's `baseline-widely-available`,
// Chrome and Edge 111, Firefox 114, Safari 16.4. The `node-prod-floor` project is Chromium with every API newer than
// that floor the client could touch deleted before any page script runs, so a use with no fallback fails there
// (BUGS.md 123). tests/structure/browser-floor.test.ts catches the APIs this list does not name. The versions are the
// first each engine shipped, from @mdn/browser-compat-data 8.1.5. Playwright serializes this function into the page,
// so it uses nothing from outside its own body.
export function removeAfterFloor(): void {
	const iterator: object = Object.getPrototypeOf(Object.getPrototypeOf([].values()));
	const typed: object = Object.getPrototypeOf(Uint8Array.prototype);
	const removals: [object, PropertyKey[]][] = [
		// Streams: async iteration and `from` (Chrome 124, Safari 27, BUGS.md 123).
		[ReadableStream.prototype, [Symbol.asyncIterator, "values"]],
		[ReadableStream, ["from"]],
		// URL statics: `parse` (Chrome 126, Safari 18) and `canParse` (Chrome 120, Safari 17).
		[URL, ["parse", "canParse"]],
		// Iterator helpers on every iterator, and the Iterator global (Chrome 122, Safari 18.4, Firefox 131).
		[iterator, ["map", "filter", "take", "drop", "flatMap", "reduce", "toArray", "forEach", "some", "every", "find"]],
		[globalThis, ["Iterator"]],
		// Idle callbacks (no Safari).
		[Window.prototype, ["requestIdleCallback", "cancelIdleCallback"]],
		[globalThis, ["requestIdleCallback", "cancelIdleCallback"]],
		// View transitions (Safari 18, Firefox 144; on elements, Chrome 147) and their types (Chrome 125).
		[Document.prototype, ["startViewTransition", "activeViewTransition"]],
		[Element.prototype, ["startViewTransition"]],
		[globalThis, ["ViewTransition", "ViewTransitionTypeSet"]],
		// scrollend (Chrome 114, Safari 26.2): no handler property, and the listener below stops the event.
		[Window.prototype, ["onscrollend"]],
		[Document.prototype, ["onscrollend"]],
		[Element.prototype, ["onscrollend"]],
		[HTMLElement.prototype, ["onscrollend"]],
		// The Navigation API (Chrome 102, Safari 26.2, Firefox 147).
		[Window.prototype, ["navigation"]],
		[globalThis, ["navigation", "Navigation", "NavigateEvent", "NavigationHistoryEntry", "NavigationTransition"]],
		// Promise.withResolvers (Chrome 119, Firefox 121, Safari 17.4), Promise.try (Chrome 128), and AbortSignal.any
		// (Chrome 116, Safari 17.4).
		[Promise, ["withResolvers", "try"]],
		[AbortSignal, ["any"]],
		// Set methods (Chrome 122, Safari 17, Firefox 127).
		[
			Set.prototype,
			["union", "intersection", "difference", "symmetricDifference", "isSubsetOf", "isSupersetOf", "isDisjointFrom"],
		],
		// Grouping (Chrome 117, Safari 17.4, Firefox 119) and async array building (Chrome 121, Firefox 115).
		[Object, ["groupBy"]],
		[Map, ["groupBy"]],
		[Array, ["fromAsync"]],
		// Change-array-by-copy (Firefox 115) and well-formed strings (Firefox 119).
		[Array.prototype, ["toSorted", "toReversed", "toSpliced", "with"]],
		[typed, ["toSorted", "toReversed", "with"]],
		[String.prototype, ["isWellFormed", "toWellFormed"]],
		// Element visibility (Safari 17.4), popovers (Safari 17, Firefox 125), and word segmenting (Firefox 125).
		[Element.prototype, ["checkVisibility"]],
		[HTMLElement.prototype, ["showPopover", "hidePopover", "togglePopover", "popover"]],
		[Intl, ["Segmenter"]],
	];
	for (const [target, names] of removals) for (const name of names) Reflect.deleteProperty(target, name);
	addEventListener("scrollend", (event) => event.stopImmediatePropagation(), { capture: true });
}
