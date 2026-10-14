import { expect, it } from "vitest";
import { headSequence } from "./head-sequence.ts";

// Solid's markers, a head tag, a hydrated element, Flare's script, and the title, in the order a shell writes them.
it("kinds", () => {
	const shell =
		'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" data-dh="charset"><!--$--><script nonce="n">a()</script>' +
		'<!--/--><style _hk=0001 nonce="n">p{}</style><title data-dh="title">T</title></head><body><p>x</p></body></html>';
	expect(headSequence(shell)).toEqual(["meta+dh", "!$", "script", "!/", "style+hk", "title+dh"]);
});

// A raw-text element's content is one text the parser does not split: a `<` in a script, a `</p>` in a style, and a
// head inside a title are not children.
it("raw text", () => {
	const shell =
		"<head><script>if (a < b) document.write('<div>')</script><style>p::after{content:'</p>'}</style>" +
		"<title><head></title><noscript><link rel=stylesheet href=/s.css></noscript><template><p></p></template></head>";
	expect(headSequence(shell)).toEqual(["script", "style", "title", "noscript", "template"]);
});

// A quoted `>` stays inside its value, attribute names are matched whole and in any case, and an unquoted value or a
// bare attribute reads as one.
it("attributes", () => {
	const shell =
		'<head><meta content="a > b" data-dh=x><link DATA-DH="y" _HK=2><meta data-dhf="z"><meta name=a _hk><link/ ></head>';
	expect(headSequence(shell)).toEqual(["meta+dh", "link+dh+hk", "meta", "meta+hk", "link"]);
});

// Whitespace between tags is a text node; a stray end tag adds none; the walk stops at `</head>` and ignores the body.
it("text and ends", () => {
	expect(headSequence("<html><HEAD class=x>\n <meta>  </span><!---->\n</head><body><meta></body>")).toEqual([
		"#",
		"meta",
		"#",
		"!",
		"#",
	]);
});

// A shell with no head has no sequence, and an unclosed comment, start tag, raw-text element, or head reads to the
// end.
it("unclosed", () => {
	expect(headSequence("<p>only text</p>")).toEqual([]);
	expect(headSequence("<header></header>")).toEqual([]);
	expect(headSequence("<head><!-- open")).toEqual(["! open"]);
	expect(headSequence("<head><script>never closed")).toEqual(["script"]);
	expect(headSequence("<head><meta name=a")).toEqual(["meta"]);
	expect(headSequence("<head><meta></x")).toEqual(["meta"]);
	expect(headSequence("<head><style>p{}</style")).toEqual(["style"]);
	expect(headSequence("<head><style>p{}</style x")).toEqual(["style"]);
	expect(headSequence("<head>text")).toEqual(["#"]);
});

// A `<` that opens no tag, comment, or end tag is text, and the walk moves past it: it never stalls on one.
it("stray less-than", () => {
	expect(headSequence("<head>a < b<meta>< <")).toEqual(["#", "meta", "#"]);
	expect(headSequence("<head><")).toEqual(["#"]);
	expect(headSequence('<head><meta = name="a"></head>')).toEqual(["meta"]);
});
