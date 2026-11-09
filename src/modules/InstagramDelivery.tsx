import { text, type Row } from "../core/model";
export function InstagramDelivery({
  row,
  compact = false,
}: {
  row: Row;
  compact?: boolean;
}) {
  const state = text(row.publication_state);
  const label: Record<string, string> = {
    published: "Publicado",
    publishing: "Publicando",
    error: "Error",
  };
  return (
    <span className={"ig-delivery " + state}>
      Instagram · {label[state] || "Sin publicar"}
      {!compact && row.instagram_published_at
        ? " · " +
          new Date(text(row.instagram_published_at)).toLocaleString("es")
        : null}
      {!compact && row.publication_error
        ? " · " + text(row.publication_error)
        : null}
      {!compact &&
        /^https:\/\/(www\.)?instagram\.com\//.test(text(row.permalink)) && (
          <a href={text(row.permalink)} target="_blank" rel="noreferrer">
            Ver en Instagram
          </a>
        )}
    </span>
  );
}
