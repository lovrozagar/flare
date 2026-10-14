import { afterEach, expect, it } from "vitest";
import { aligned, guardHead, kindOf } from "./head-guard.ts";

// The server's head in these cases: the charset Solid moves, Solid's markers around a script, a hydrated style.
const SERVER = '<meta charset="utf-8" data-dh="charset"><!--$--><script>1</script><!--/--><style _hk="1">p{}</style>';
const SEQUENCE = ["meta+dh", "!$", "script", "!/", "style+hk"];

function shape(): string[] {
	return [...document.head.childNodes].map(kindOf);
}

function nodes(): string[] {
	return [...document.head.childNodes].map((node) =>
		node instanceof Element ? node.outerHTML : `${node.nodeName}:${node.nodeValue ?? ""}`,
	);
}

afterEach(() => {
	document.head.innerHTML = "";
});

it("kinds", () => {
	document.head.innerHTML = `${SERVER}\n<link>`;
	expect(shape()).toEqual([...SEQUENCE, "#", "link"]);
});

// A state written before B120 has no sequence, and a head the server wrote as it is has nothing to move.
it("nothing to move", () => {
	document.head.innerHTML = SERVER;
	const before = [...document.head.childNodes];
	guardHead(document.head, undefined)();
	guardHead(document.head, SEQUENCE)();
	expect([...document.head.childNodes]).toEqual(before);
});

// Each foreign node is out while guarded, so the head is the server's shape, and back after its anchor once restored:
// a run at the start keeps its order, and one between two server nodes returns between them.
it("out and back", () => {
	document.head.innerHTML = `<style data-ext>a{}</style><!-- ext -->\n${SERVER.replace("<!--/-->", '<!--/--><meta name="ext">')}`;
	const before = nodes();
	const restore = guardHead(document.head, SEQUENCE);
	expect(shape()).toEqual(SEQUENCE);
	restore();
	expect(nodes()).toEqual(before);
});

// A foreign node of the same kind as the server node next to it may be the one matched: the guarded head still has
// the server's shape, which is all the walk reads, and the restore puts every node back in its order.
it("mimic", () => {
	document.head.innerHTML = '<meta charset="utf-8" data-dh="charset"><meta name="ext"><meta name="server"><!--$-->';
	const before = nodes();
	const restore = guardHead(document.head, ["meta+dh", "meta", "!$"]);
	expect(shape()).toEqual(["meta+dh", "meta", "!$"]);
	restore();
	expect(nodes()).toEqual(before);
});

// A server node an extension removed costs only itself: the nodes after it still match, so none of them leaves.
it("server node gone", () => {
	document.head.innerHTML = SERVER.replace("<script>1</script>", "");
	const restore = guardHead(document.head, SEQUENCE);
	expect(shape()).toEqual(["meta+dh", "!$", "!/", "style+hk"]);
	restore();
	expect(shape()).toEqual(["meta+dh", "!$", "!/", "style+hk"]);
});

// The hydrate may move or replace an anchor: a node whose anchor left the head goes to its end, and one whose anchor
// moved goes after it there.
it("anchor moved", () => {
	document.head.innerHTML = `${SERVER.replace("<!--$-->", '<meta name="a"><!--$-->').replace("<!--/-->", '<!--/--><meta name="b">')}`;
	const restore = guardHead(document.head, SEQUENCE);
	const [charset, , , close] = [...document.head.childNodes];
	document.head.append(charset as ChildNode);
	(close as ChildNode).remove();
	restore();
	expect(nodes().slice(-3)).toEqual(['<meta charset="utf-8" data-dh="charset">', '<meta name="a">', '<meta name="b">']);
});

// The alignment keeps one longest common subsequence: around a changed middle, at either end, and with nothing in
// common.
it("aligned", () => {
	expect([...aligned(["a", "x", "b", "c"], ["a", "b", "c"])].toSorted()).toEqual([0, 2, 3]);
	expect([...aligned(["x", "a", "b"], ["a", "b"])].toSorted()).toEqual([1, 2]);
	expect([...aligned(["a", "b", "x"], ["a", "b"])].toSorted()).toEqual([0, 1]);
	expect([...aligned(["a", "b", "c"], ["a", "c"])].toSorted()).toEqual([0, 2]);
	expect([...aligned(["p", "a", "q", "b", "r"], ["s", "a", "b", "t"])].toSorted()).toEqual([1, 3]);
	expect([...aligned(["a", "x", "y"], ["a", "y", "x"])].toSorted()).toEqual([0, 2]);
	expect([...aligned(["x"], [])]).toEqual([]);
	expect([...aligned([], ["a"])]).toEqual([]);
});
