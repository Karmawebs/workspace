import { useId, useRef, useState, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import { saveTaskOrder, message, type Scope } from "./data";
import type { Row } from "./model";
import { taskOrderChanges } from "./taskOrder";
import "./task-order.css";

type Drag = { from: string; to: string; pointer: number };

export function useTaskReorder(
  all: Row[],
  visible: Row[],
  scope: Scope,
  disabled: boolean,
  onError: (error: string) => void,
) {
  const listId = useId();
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState<Drag | null>(null);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const enabled = visible.length > 1 && !disabled && !saving;

  function clear() {
    drag.current = null;
    setActive(null);
  }

  async function move(from: string, to: string) {
    if (!enabled || pending.current || from === to) return;
    const changes = taskOrderChanges(all, visible, from, to);
    if (!changes.length) return;
    pending.current = true;
    setSaving(true);
    onError("");
    try {
      await saveTaskOrder(scope, changes);
    } catch (error) {
      onError(message(error));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  function point(e: PointerEvent<HTMLButtonElement>) {
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-task-order-row]");
    return target?.dataset.taskOrderList === listId
      ? target.dataset.taskOrderRow
      : undefined;
  }

  function update(e: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointer !== e.pointerId) return;
    const to = point(e);
    if (to && current.to !== to) {
      drag.current = { ...current, to };
      setActive(drag.current);
    }
    // On a long list, keep scrolling possible while the grip owns the pointer.
    const scrolling = document.scrollingElement;
    if (scrolling && (e.clientY < 48 || e.clientY > window.innerHeight - 48)) {
      scrolling.scrollTop += e.clientY < 48 ? -24 : 24;
    }
  }

  function rowProps(row: Row) {
    const target = active && active.to === row.id && active.from !== row.id;
    const fromIndex = active
      ? visible.findIndex((item) => item.id === active.from)
      : -1;
    const toIndex = visible.findIndex((item) => item.id === row.id);
    return {
      "data-task-order-row": row.id,
      "data-task-order-list": listId,
      "data-task-order-state":
        active?.from === row.id
          ? "dragging"
          : target
            ? fromIndex < toIndex
              ? "after"
              : "before"
            : undefined,
    };
  }

  function handle(row: Row) {
    return (
      <button
        type="button"
        className="task-order-grip"
        aria-label={`Reordenar ${String(row.title || "tarea")}. Usa las flechas arriba y abajo`}
        title="Arrastra para cambiar la prioridad"
        disabled={!enabled}
        onPointerDown={(e) => {
          if (!enabled || pending.current || !e.isPrimary || e.button !== 0)
            return;
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          drag.current = { from: row.id, to: row.id, pointer: e.pointerId };
          setActive(drag.current);
        }}
        onPointerMove={update}
        onPointerUp={(e) => {
          const current = drag.current;
          if (!current || current.pointer !== e.pointerId) return;
          const to = point(e);
          clear();
          if (to) void move(current.from, to);
        }}
        onPointerCancel={clear}
        onLostPointerCapture={clear}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            clear();
            return;
          }
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const index = visible.findIndex((item) => item.id === row.id);
          const next = visible[index + (e.key === "ArrowUp" ? -1 : 1)];
          if (next) void move(row.id, next.id);
        }}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
    );
  }
  return { rowProps, handle, saving };
}
