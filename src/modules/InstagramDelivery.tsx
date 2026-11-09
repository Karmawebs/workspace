import { mainState, deliveryLabels } from "./socialContent";
import { text, type Row } from "../core/model";
export function InstagramDelivery({
  row,
  compact = false,
}: {
  row: Row;
  compact?: boolean;
}) {
  const state = mainState(row);
  return (
    <span className={"ig-delivery " + state}>
      <strong>{deliveryLabels[state]}</strong>
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
