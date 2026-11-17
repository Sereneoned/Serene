import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	parseMarkdownImageAlt,
	rehypeMarkdownImages,
} from "../src/plugins/rehype-markdown-images.mjs";
import { siteMarkdownProcessor } from "../src/utils/markdown-processor.mjs";
import {
	applyInlineSpanStyle,
	applyLinePrefix,
	applyWrapSyntax,
	extractMarkdownImages,
	formatMarkdownImage,
	insertMarkdownImageAtCursor,
	moveMarkdownImageParagraph,
	removeMarkdownImageAt,
	renderRichPreviewHtml,
	updateMarkdownImageAt,
} from "../src/utils/rich-text-editor.ts";

describe("rich-text-editor helpers", () => {
	test("applies and toggles inline wrap syntax such as bold", () => {
		const wrapped = applyWrapSyntax("hello world", 6, 11, "**", "**");
		assert.equal(wrapped.value, "hello **world**");
		assert.equal(wrapped.selectionStart, 8);
		assert.equal(wrapped.selectionEnd, 13);

		const unwrapped = applyWrapSyntax(
			wrapped.value,
			wrapped.selectionStart,
			wrapped.selectionEnd,
			"**",
			"**",
		);
		assert.equal(unwrapped.value, "hello world");
		assert.equal(unwrapped.selectionStart, 6);
		assert.equal(unwrapped.selectionEnd, 11);
	});

	test("applies and merges font-size and color without nesting spans", () => {
		const step1 = applyInlineSpanStyle("今天天气真好", 2, 4, {
			fontSize: "22px",
		});
		assert.equal(
			step1.value,
			'今天<span style="font-size: 22px">天气</span>真好',
		);

		const step2 = applyInlineSpanStyle(
			step1.value,
			step1.selectionStart,
			step1.selectionEnd,
			{ color: "#e11d48" },
		);
		assert.equal(
			step2.value,
			'今天<span style="font-size: 22px; color: #e11d48">天气</span>真好',
		);

		// Clear color back while keeping font-size
		const step3 = applyInlineSpanStyle(
			step2.value,
			step2.selectionStart,
			step2.selectionEnd,
			{ color: null },
		);
		assert.equal(
			step3.value,
			'今天<span style="font-size: 22px">天气</span>真好',
		);

		// Clear remaining font-size unwraps span completely
		const step4 = applyInlineSpanStyle(
			step3.value,
			step3.selectionStart,
			step3.selectionEnd,
			{ fontSize: null },
		);
		assert.equal(step4.value, "今天天气真好");
	});

	test("inserts images at cursor position and updates width, alignment, and paragraph order", () => {
		const initial = "第一段\n\n第三段";
		const inserted = insertMarkdownImageAtCursor(initial, 3, 3, {
			src: "/images/moments/demo/photo.webp",
			alt: "晚霞",
			width: 60,
			align: "left",
		});
		assert.equal(
			inserted.value,
			"第一段\n\n![晚霞 w-60% align-left](/images/moments/demo/photo.webp)\n\n第三段",
		);

		const imgs = extractMarkdownImages(inserted.value);
		assert.equal(imgs.length, 1);
		assert.equal(imgs[0].width, 60);
		assert.equal(imgs[0].align, "left");
		assert.equal(imgs[0].paragraphIndex, 1);

		const resized = updateMarkdownImageAt(inserted.value, imgs[0], {
			width: 40,
			align: "right",
		});
		assert.match(resized, /!\[晚霞 w-40% align-right\]/);

		const imgsAfterResize = extractMarkdownImages(resized);
		const movedDown = moveMarkdownImageParagraph(
			resized,
			imgsAfterResize[0],
			"down",
		);
		assert.equal(
			movedDown,
			"第一段\n\n第三段\n\n![晚霞 w-40% align-right](/images/moments/demo/photo.webp)",
		);

		const movedUp = moveMarkdownImageParagraph(
			movedDown,
			extractMarkdownImages(movedDown)[0],
			"up",
		);
		assert.equal(movedUp, resized);

		const removed = removeMarkdownImageAt(
			movedUp,
			extractMarkdownImages(movedUp)[0],
		);
		assert.equal(removed, "第一段\n\n第三段");
	});

	test("formats line prefixes and sanitizes rich preview HTML", () => {
		const quoted = applyLinePrefix("第一行\n第二行", 0, 7, "> ");
		assert.equal(quoted.value, "> 第一行\n> 第二行");
		assert.equal(
			formatMarkdownImage({ src: "/img.webp", alt: "pic", width: 100 }),
			"![pic](/img.webp)",
		);

		const html = renderRichPreviewHtml(
			'<script>alert(1)</script><span style="font-size: 20px; color: #e11d48; position: fixed">**粗红字**</span>\n\n![图 w-50% align-left](/images/a.webp)',
			(src) => `/Serene${src}`,
		);
		assert.doesNotMatch(html, /<script>/);
		assert.doesNotMatch(html, /position:\s*fixed/);
		assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
		assert.match(
			html,
			/<span style="font-size: 20px; color: #e11d48"><strong>粗红字<\/strong><\/span>/,
		);
		assert.match(html, /src="\/Serene\/images\/a\.webp"/);
		assert.match(html, /width: 50%/);
		assert.match(html, /margin-left: 0; margin-right: auto/);
	});

	test("rehypeMarkdownImages prefixes base subpath, decodes Unicode filenames, and handles align tokens", async () => {
		assert.deepEqual(parseMarkdownImageAlt("Demo w-55% align-right"), {
			alt: "Demo",
			width: 55,
			align: "right",
		});

		const renderer = await siteMarkdownProcessor.createRenderer({});
		const { code } = await renderer.render(
			"![屏幕截图 w-60% align-left](/images/posts/如何进行科学上网-mwka6u07.webp)",
		);
		assert.match(
			code,
			/class="markdown-image-figure markdown-image-figure--left"/,
		);
		assert.match(code, /src="\/Serene\/images\/posts\//);
		assert.match(code, /width: 60%/);
		assert.match(code, /margin-left: 0; margin-right: auto/);
		assert.match(code, /width="1108"/);
		assert.match(code, /height="897"/);
		assert.equal(typeof rehypeMarkdownImages, "function");
	});
});
