import { find } from "linkifyjs";

// Only explicitly versioned values are HTML. Legacy text (including literal tags)
// must never be interpreted as markup or rewritten merely by opening a form.
export const RICH_PREFIX = "<!--karma-rich-text:v1-->";
export function linkUrl(value: string): string | null {
  const raw = value.trim();
  if (!/^(https?:\/\/|www\.)/i.test(raw) || /[\s\u0000-\u001f\u007f]/.test(raw))
    return null;
  try {
    const url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
    return ["https:", "http:"].includes(url.protocol) &&
      url.hostname &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const allowed = new Set([
  "p",
  "br",
  "strong",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "span",
]);
const discard = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "template",
  "noscript",
]);

/** Rebuild from an allowlist: never copy arbitrary attributes or live DOM. */
export function sanitizeHtml(html: string, autolink = true): string {
  const source = new DOMParser().parseFromString(html, "text/html");
  const output = document.createElement("div");
  function copy(node: Node, parent: Node, insideLink = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || "";
      let offset = 0;
      if (autolink && !insideLink)
        for (const match of find(value)) {
          const href = linkUrl(match.value);
          if (!href) continue;
          parent.appendChild(
            document.createTextNode(value.slice(offset, match.start)),
          );
          const a = document.createElement("a");
          a.textContent = match.value;
          a.href = href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          parent.appendChild(a);
          offset = match.end;
        }
      parent.appendChild(document.createTextNode(value.slice(offset)));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const originalTag = element.tagName.toLowerCase();
    if (discard.has(originalTag)) return;
    const tag =
      (
        {
          b: "strong",
          i: "em",
          div: "p",
          h1: "p",
          h2: "p",
          h3: "p",
          blockquote: "p",
          pre: "p",
          tr: "p",
        } as Record<string, string>
      )[originalTag] || originalTag;
    const unlinked =
      tag === "span" && element.getAttribute("data-karma-unlinked") === "true";
    const href =
      tag === "a" ? linkUrl(element.getAttribute("href") || "") : null;
    if (
      !allowed.has(tag) ||
      (tag === "span" && !unlinked) ||
      (tag === "a" && (!href || insideLink))
    ) {
      element.childNodes.forEach((child) => copy(child, parent, insideLink));
      return;
    }
    const clean = document.createElement(tag);
    if (unlinked) clean.setAttribute("data-karma-unlinked", "true");
    if (href) {
      clean.setAttribute("href", href);
      clean.setAttribute("target", "_blank");
      clean.setAttribute("rel", "noopener noreferrer");
    }
    if (tag === "ol" && /^\d{1,6}$/.test(element.getAttribute("start") || ""))
      clean.setAttribute("start", element.getAttribute("start")!);
    element.childNodes.forEach((child) =>
      copy(child, clean, insideLink || tag === "a" || unlinked),
    );
    parent.appendChild(clean);
  }
  source.body.childNodes.forEach((node) => copy(node, output));
  return output.innerHTML;
}
export function contentHtml(value: string): string {
  return value.startsWith(RICH_PREFIX)
    ? sanitizeHtml(value.slice(RICH_PREFIX.length))
    : sanitizeHtml(
        `<p>${escapeText(value).replace(/\r\n|\r|\n/g, "<br>")}</p>`,
      );
}
export function plainText(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  if (!text.startsWith(RICH_PREFIX)) return text;
  const container = document.createElement("div");
  container.innerHTML = sanitizeHtml(text.slice(RICH_PREFIX.length), false);
  container.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  container.querySelectorAll("p,li").forEach((node) => node.append("\n"));
  return (container.textContent || "").replace(/\n$/, "");
}
export function serializeHtml(html: string): string {
  const clean = sanitizeHtml(html);
  return plainText(RICH_PREFIX + clean).trim() ? RICH_PREFIX + clean : "";
}
