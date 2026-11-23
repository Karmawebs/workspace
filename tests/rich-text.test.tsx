import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  contentHtml,
  plainText,
  RICH_PREFIX,
  sanitizeHtml,
  serializeHtml,
  linkUrl,
} from "../src/components/rich-text/content";
import { RichText } from "../src/components/rich-text/RichText";
import { RichTextEditor } from "../src/components/rich-text/RichTextEditor";

describe("rich text storage and security", () => {
  it("preserves legacy literal HTML, spaces and every URL without nested links", () => {
    const legacy =
      "  <b>literal</b>\nhttps://example.com/a?q=1&b=2\nwww.example.org y http://example.net.  ";
    const { container } = render(<RichText value={legacy} />);
    expect(
      plainText(RICH_PREFIX + container.firstElementChild!.innerHTML),
    ).toBe(legacy);
    expect(container.querySelectorAll("a")).toHaveLength(3);
    expect(container.querySelector("b")).toBeNull();
    const html = contentHtml(legacy);
    expect(sanitizeHtml(html)).toBe(html);
    expect(container.querySelector("a")?.getAttribute("rel")).toBe(
      "noopener noreferrer",
    );
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,bad",
    "//example.com",
    "https://user:secret@example.com",
    "https://example.com\n@evil.test",
    "file:///etc/passwd",
    "vbscript:evil",
  ])("rejects unsafe URL %s", (value) => expect(linkUrl(value)).toBeNull());
  it("keeps only permitted formatting, drops executable content and attributes", () => {
    const html = sanitizeHtml(
      '<p onclick="evil()" style="color:red"><strong>Bien</strong><img src=x onerror=evil()><script>evil()</script><svg onload=evil()></svg><a href="javascript:evil()">Texto</a><a href="https://example.com" target="_self" onclick="evil()">Roles</a></p>',
    );
    expect(html).toBe(
      '<p><strong>Bien</strong>Texto<a href="https://example.com/" target="_blank" rel="noopener noreferrer">Roles</a></p>',
    );
  });
  it("roundtrips paragraphs, breaks, lists and custom links", () => {
    const stored = serializeHtml(
      '<p><strong>Uno</strong><br><em><u>Dos</u></em></p><ol start="3"><li><p><a href="https://example.com">Roles</a></p></li></ol>',
    );
    expect(stored.startsWith(RICH_PREFIX)).toBe(true);
    expect(contentHtml(stored)).toContain('start="3"');
    expect(contentHtml(stored)).toContain(">Roles</a>");
    expect(plainText(stored)).toContain("Uno\nDos\nRoles");
    expect(serializeHtml("<p><br></p>")).toBe("");
  });
  it("respects explicit link removal after saving and reopening", () => {
    const unlinked = serializeHtml(
      '<p><span data-karma-unlinked="true">https://example.com</span></p>',
    );
    expect(contentHtml(unlinked)).not.toContain("<a");
  });
  it("resets the form and rejects empty required rich content", async () => {
    let submits = 0;
    const { container } = render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submits++;
        }}
      >
        <RichTextEditor name="body" required />
        <button>Guardar</button>
      </form>,
    );
    await screen.findByRole("textbox");
    fireEvent.submit(container.querySelector("form")!);
    expect(submits).toBe(0);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.reset(container.querySelector("form")!);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(new FormData(container.querySelector("form")!).get("body")).toBe("");
  });
  it("does not rewrite a legacy value on mount or editable-state changes", async () => {
    const legacy = "  <script>literal</script>\r\nwww.example.com  ";
    const { container, rerender } = render(
      <form>
        <RichTextEditor name="body" defaultValue={legacy} />
      </form>,
    );
    await screen.findByRole("textbox");
    rerender(
      <form>
        <RichTextEditor name="body" defaultValue={legacy} disabled />
      </form>,
    );
    expect(new FormData(container.querySelector("form")!).get("body")).toBe(
      legacy,
    );
  });
  it("handles controlled reset and both link shortcuts without submitting", async () => {
    const { rerender } = render(
      <RichTextEditor label="Nota" value="Anterior" />,
    );
    const box = await screen.findByRole("textbox", { name: "Nota" });
    fireEvent.keyDown(box, { key: "k", ctrlKey: true });
    expect(
      screen.getByRole("textbox", { name: "Dirección del enlace" }),
    ).toBeTruthy();
    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Dirección del enlace" }),
      { key: "Escape" },
    );
    fireEvent.keyDown(box, { key: "k", metaKey: true });
    expect(screen.getByRole("group", { name: "Editar enlace" })).toBeTruthy();
    rerender(<RichTextEditor label="Nota" value="" />);
    await waitFor(() => expect(box.textContent).toBe(""));
  });
});
