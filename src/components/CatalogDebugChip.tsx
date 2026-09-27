import { useCallback, useState } from "react";
import type { Language } from "../app/shared";
import type { CatalogDebug } from "../../lib/catalog-debug.ts";
import { formatCatalogDebugChip, formatCatalogDebugTitle } from "../../lib/catalog-debug.ts";

export function CatalogDebugChip({
  debug,
  lang,
}: {
  debug: CatalogDebug;
  lang: Language;
}) {
  const [copied, setCopied] = useState(false);
  const title = formatCatalogDebugTitle(debug, lang);
  const label = copied
    ? lang === "sv"
      ? "Kopierat"
      : "Copied"
    : formatCatalogDebugChip(debug, lang);

  const copyDetails = useCallback(async () => {
    const detail = formatCatalogDebugTitle(debug, lang);
    try {
      await navigator.clipboard.writeText(detail);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Tooltip still shows full detail on hover/focus.
    }
  }, [debug, lang]);

  return (
    <button
      type="button"
      className={`catalog-debug-chip catalog-debug-chip-${debug.catalogMode}`}
      title={title}
      aria-label={title}
      onClick={() => void copyDetails()}
    >
      {label}
    </button>
  );
}
