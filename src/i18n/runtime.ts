import { derived, get, writable } from "svelte/store";
import { siteConfig } from "@/config/siteConfig";
import I18nKey from "./i18nKey";
import { i18n } from "./translation";

/** Visitor preference for interface copy only; never a content translation. */
export const UI_LOCALE_STORAGE_KEY = "shirone-ui-locale";
const defaultLocale = siteConfig.lang || "en";
const localeState = writable<string>(defaultLocale);
export const uiLocale = { subscribe: localeState.subscribe };
export const t = derived(
	uiLocale,
	(language) => (key: I18nKey) => i18n(key, language),
);

const validKeys = new Set<string>(Object.values(I18nKey));
const attributes = ["aria-label", "title", "placeholder", "alt"] as const;
const selector = [
	"[data-ui-i18n]",
	...attributes.map((attribute) => `[data-ui-i18n-${attribute}]`),
].join(",");
let initialized = false;
let disposeLanguage: (() => void) | undefined;

function selectedLocale(value: string | null): string | undefined {
	if (value === "en") return "en";
	if (value === "zh_CN" || value === "zh-CN") return "zh_CN";
	return undefined;
}

function formatCopy(
	element: HTMLElement,
	key: string,
	language: string,
): string {
	let copy = i18n(key as I18nKey, language);
	const rawParams = element.dataset.uiI18nParams;
	if (!rawParams) return copy;
	try {
		const params: unknown = JSON.parse(rawParams);
		if (!params || typeof params !== "object" || Array.isArray(params))
			return copy;
		for (const [name, value] of Object.entries(params)) {
			if (typeof value === "string" || typeof value === "number") {
				copy = copy.replaceAll(`{${name}}`, String(value));
			}
		}
	} catch {
		// Malformed optional metadata must not disable the language control.
	}
	return copy;
}

/** Only explicit system-copy bindings are updated, never arbitrary page text. */
export function applyUiLanguage(): void {
	if (typeof document === "undefined") return;
	const language = get(uiLocale);
	document.documentElement.dataset.uiLocale = language;
	document.documentElement.lang = language.replaceAll("_", "-");
	for (const element of document.querySelectorAll<HTMLElement>(selector)) {
		const key = element.dataset.uiI18n;
		if (key && validKeys.has(key)) {
			const copy = formatCopy(element, key, language);
			if (element.textContent !== copy) element.textContent = copy;
		}
		for (const attribute of attributes) {
			const attributeKey = element.getAttribute(`data-ui-i18n-${attribute}`);
			if (attributeKey && validKeys.has(attributeKey)) {
				element.setAttribute(
					attribute,
					formatCopy(element, attributeKey, language),
				);
			}
		}
	}
	const chinese = language.toLowerCase().replaceAll("-", "_") === "zh_cn";
	const labelKey = chinese
		? I18nKey.uiLanguageEnglish
		: I18nKey.uiLanguageChinese;
	const actionKey = chinese ? I18nKey.switchToEnglish : I18nKey.switchToChinese;
	for (const button of document.querySelectorAll<HTMLButtonElement>(
		"#ui-language-switch",
	)) {
		button.setAttribute("aria-pressed", String(chinese));
		button.title = i18n(actionKey, language);
		const label = button.querySelector<HTMLElement>("[data-ui-language-label]");
		if (label) label.textContent = i18n(labelKey, language);
	}
}

export function setUiLocale(language: "en" | "zh_CN"): void {
	if (typeof document !== "undefined") {
		document.documentElement.dataset.uiLocale = language;
	}
	localeState.set(language);
	try {
		localStorage.setItem(UI_LOCALE_STORAGE_KEY, language);
	} catch {
		// The in-memory preference still works in privacy/storage-blocked modes.
	}
}

/** The persistent shell initializes once and reapplies bindings after Swup. */
export function initializeUiLanguage(): void {
	if (typeof document === "undefined" || initialized) return;
	initialized = true;
	let saved: string | undefined;
	try {
		saved = selectedLocale(localStorage.getItem(UI_LOCALE_STORAGE_KEY));
	} catch {
		// Use the site language until the visitor selects another UI language.
	}
	localeState.set(saved || defaultLocale);
	const unsubscribe = localeState.subscribe(applyUiLanguage);
	const controller = new AbortController();
	const options = { signal: controller.signal };
	document.addEventListener(
		"click",
		(event) => {
			const target = event.target;
			if (
				!(target instanceof Element) ||
				!target.closest("#ui-language-switch")
			)
				return;
			setUiLocale(get(uiLocale) === "zh_CN" ? "en" : "zh_CN");
		},
		options,
	);
	for (const event of [
		"swup:content:replace",
		"swup:page:view",
		"astro:page-load",
	]) {
		document.addEventListener(event, applyUiLanguage, options);
	}
	window.addEventListener(
		"storage",
		(event) => {
			if (event.key !== UI_LOCALE_STORAGE_KEY) return;
			const value = selectedLocale(event.newValue);
			if (value) localeState.set(value);
		},
		options,
	);
	disposeLanguage = () => {
		unsubscribe();
		controller.abort();
		initialized = false;
	};
}

if (import.meta.hot) import.meta.hot.dispose(() => disposeLanguage?.());
