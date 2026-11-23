import { useEffect, useRef, useState, useId } from "react";
import { EditorContent, useEditor, useEditorState, Mark } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Underline,
  Link,
  List,
  ListOrdered,
  Unlink,
  ExternalLink,
} from "lucide-react";
import {
  contentHtml,
  linkUrl,
  plainText,
  sanitizeHtml,
  serializeHtml,
} from "./content";
import "./rich-text.css";

// An explicit unlink must survive future automatic URL detection and reopening.
const Unlinked = Mark.create({
  name: "unlinked",
  inclusive: false,
  parseHTML: () => [{ tag: 'span[data-karma-unlinked="true"]' }],
  renderHTML: () => ["span", { "data-karma-unlinked": "true" }, 0],
});

type Props = {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  rows?: number;
};
export function RichTextEditor({
  name,
  defaultValue = "",
  value,
  onChange,
  label = "Texto",
  placeholder,
  required,
  disabled,
  className = "",
  rows = 4,
}: Props) {
  const initial = useRef(value ?? defaultValue);
  const [stored, setStored] = useState(initial.current);
  const latest = useRef(stored);
  const hidden = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const urlInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const openRef = useRef(() => {});
  const editor = useEditor({
    extensions: [
      Unlinked,
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        strike: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
          defaultProtocol: "https",
          autolink: true,
          linkOnPaste: true,
          isAllowedUri: (uri) => !!linkUrl(uri),
          shouldAutoLink: (uri) => /^(https?:\/\/|www\.)/i.test(uri),
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
      }),
    ],
    content: contentHtml(initial.current),
    parseOptions: { preserveWhitespace: "full" },
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        "aria-required": String(!!required),
        "data-placeholder": placeholder || "Escribe aquí…",
        class: "karma-rich-content karma-rich-input",
      },
      transformPastedHTML: (html) => sanitizeHtml(html),
      handleClick: (_view, _pos, event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        const href = anchor && linkUrl(anchor.getAttribute("href") || "");
        if (!href) return false;
        event.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          openRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = serializeHtml(current.getHTML());
      latest.current = next;
      if (hidden.current) hidden.current.value = next;
      setStored(next);
      onChange?.(next);
    },
  });
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold"),
      italic: e?.isActive("italic"),
      underline: e?.isActive("underline"),
      link: e?.isActive("link"),
      bulletList: e?.isActive("bulletList"),
      orderedList: e?.isActive("orderedList"),
    }),
  });
  openRef.current = () => {
    if (!editor || disabled || editor.view.dom.closest("fieldset[disabled]"))
      return;
    setUrl(editor.getAttributes("link").href || "");
    setError("");
    setLinkOpen(true);
  };
  useEffect(() => {
    if (linkOpen) urlInput.current?.focus();
  }, [linkOpen]);
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  useEffect(() => {
    if (editor && value !== undefined && value !== latest.current) {
      editor.commands.setContent(contentHtml(value), {
        emitUpdate: false,
        parseOptions: { preserveWhitespace: "full" },
      });
      latest.current = value;
      setStored(value);
    }
  }, [editor, value]);
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const validate = (event: Event) => {
      if (required && !plainText(latest.current).trim()) {
        event.preventDefault();
        event.stopPropagation();
        setError("Escribe el contenido de este campo.");
        editor?.commands.focus();
      }
    };
    const reset = () => {
      editor?.commands.setContent(contentHtml(initial.current), {
        emitUpdate: false,
        parseOptions: { preserveWhitespace: "full" },
      });
      latest.current = initial.current;
      setStored(initial.current);
      onChange?.(initial.current);
      setLinkOpen(false);
      setError("");
    };
    form.addEventListener("submit", validate, true);
    form.addEventListener("reset", reset);
    return () => {
      form.removeEventListener("submit", validate, true);
      form.removeEventListener("reset", reset);
    };
  }, [editor, required]);
  function applyLink() {
    const href = linkUrl(url);
    if (!href) {
      setError("Introduce una URL https://, http:// o www. sin credenciales.");
      return;
    }
    if (!editor) return;
    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: url.trim(),
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .unsetMark("unlinked")
        .setLink({ href })
        .run();
    setLinkOpen(false);
    setError("");
  }
  const controls = [
    {
      title: "Negrita",
      key: "bold",
      Icon: Bold,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      title: "Cursiva",
      key: "italic",
      Icon: Italic,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      title: "Subrayado",
      key: "underline",
      Icon: Underline,
      run: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      title: "Enlace (⌘/Ctrl+K)",
      key: "link",
      Icon: Link,
      run: () => openRef.current(),
    },
    {
      title: "Lista con viñetas",
      key: "bulletList",
      Icon: List,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      title: "Lista numerada",
      key: "orderedList",
      Icon: ListOrdered,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
  ] as const;
  return (
    <div
      className={`karma-rich-editor ${className}`}
      data-disabled={disabled || undefined}
      style={{ "--rich-rows": rows } as React.CSSProperties}
    >
      <input ref={hidden} type="hidden" name={name} value={stored} />
      <div
        className="karma-rich-toolbar"
        role="toolbar"
        aria-label={`Formato de ${label}`}
      >
        {controls.map(({ title, key, Icon, run }) => (
          <button
            key={key}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={!!active?.[key]}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={run}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
      {linkOpen && (
        <div
          className="karma-rich-link"
          role="group"
          aria-label="Editar enlace"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setLinkOpen(false);
              editor?.commands.focus();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              applyLink();
            }
          }}
        >
          <span id={id}>Dirección del enlace</span>
          <input
            ref={urlInput}
            aria-labelledby={id}
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="https:// o www."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="karma-rich-link-actions">
            <button type="button" onClick={applyLink}>
              Aplicar
            </button>
            {active?.link && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    editor
                      ?.chain()
                      .focus()
                      .extendMarkRange("link")
                      .unsetLink()
                      .setMark("unlinked")
                      .run();
                    setLinkOpen(false);
                    setError("");
                  }}
                >
                  <Unlink size={14} /> Quitar
                </button>
                <a
                  href={
                    linkUrl(editor?.getAttributes("link").href || "") ||
                    undefined
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={14} /> Abrir
                </a>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setLinkOpen(false);
                setError("");
                editor?.commands.focus();
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </div>
  );
}
