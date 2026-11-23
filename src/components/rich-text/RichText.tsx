import { useMemo } from "react";
import { contentHtml } from "./content";
import "./rich-text.css";

export function RichText({
  value,
  className = "",
}: {
  value: unknown;
  className?: string;
}) {
  const html = useMemo(
    () => contentHtml(typeof value === "string" ? value : ""),
    [value],
  );
  return (
    <div
      className={`karma-rich-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
