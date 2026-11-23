import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { RichTextEditor } from "../../src/components/rich-text/RichTextEditor";
import { RichText } from "../../src/components/rich-text/RichText";
import "../../src/tokens.css";
import "../../src/styles.css";
function Fixture() {
  const [saved, setSaved] = useState(
    localStorage.getItem("rich-qa") ||
      "  Texto antiguo <b>literal</b>\nwww.example.com  ",
  );
  const [editing, setEditing] = useState(true);
  return (
    <main style={{ maxWidth: 760, margin: "20px auto", padding: 16 }}>
      <h1>Texto de proyecto</h1>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const next = String(new FormData(e.currentTarget).get("body"));
            localStorage.setItem("rich-qa", next);
            setSaved(next);
            setEditing(false);
          }}
        >
          <RichTextEditor
            name="body"
            label="Descripción"
            required
            defaultValue={saved}
          />
          <button>Guardar</button>
        </form>
      ) : (
        <>
          <RichText value={saved} />
          <button onClick={() => setEditing(true)}>Editar</button>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
