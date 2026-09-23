import React, { useEffect, useState } from "react";
import type { Language } from "../app/shared";
import { ArrowRight, CircleNotch, MapPin, PencilSimple, X } from "@phosphor-icons/react";

type DistrictRow = {
  name: string;
  placeCount: number;
  canonical: boolean;
};

type Props = {
  lang: Language;
  open: boolean;
  adminHeaders: (tokenOverride?: string, extraHeaders?: Record<string, string>) => Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
};

export function AdminDistrictManager({ lang, open, adminHeaders, onClose, onChanged }: Props) {
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeInto, setMergeInto] = useState("");

  const loadDistricts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/districts", { headers: adminHeaders() });
      const payload = (await response.json().catch(() => ({}))) as { districts?: DistrictRow[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte ladda stadsdelar." : "Could not load districts."));
      }
      setDistricts(payload.districts ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadDistricts();
    }
  }, [open]);

  const runDistrictAction = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/districts", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; updatedCount?: number };
      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte uppdatera stadsdelar." : "Could not update districts."));
      }
      await loadDistricts();
      onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="admin-modal admin-district-manager"
        role="dialog"
        aria-modal="true"
        aria-label={lang === "sv" ? "Hantera stadsdelar" : "Manage districts"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-modal-header">
          <h3>{lang === "sv" ? "Stadsdelar / regioner" : "Districts / regions"}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label={lang === "sv" ? "Stäng" : "Close"}>
            <X size={16} weight="bold" />
          </button>
        </header>

        <div className="admin-modal-body">
          <p className="admin-district-help">
            {lang === "sv"
              ? "Byt namn eller slå ihop stadsdelar för alla platser i D1. Nya stadsdelar kan också skrivas direkt när du lägger till eller redigerar en plats."
              : "Rename or merge districts for all places in D1. You can also type new district names when adding or editing a place."}
          </p>

          <div className="admin-district-forms">
            <section>
              <h4><PencilSimple size={14} weight="bold" /> {lang === "sv" ? "Byt namn" : "Rename"}</h4>
              <div className="admin-district-form-row">
                <input value={renameFrom} onChange={(event) => setRenameFrom(event.target.value)} placeholder={lang === "sv" ? "Från" : "From"} list="admin-district-rename-list" />
                <ArrowRight size={14} weight="bold" />
                <input value={renameTo} onChange={(event) => setRenameTo(event.target.value)} placeholder={lang === "sv" ? "Till" : "To"} />
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={busy || !renameFrom.trim() || !renameTo.trim()}
                  onClick={() => void runDistrictAction({ action: "rename", from: renameFrom, to: renameTo })}
                >
                  {lang === "sv" ? "Byt namn" : "Rename"}
                </button>
              </div>
            </section>

            <section>
              <h4><MapPin size={14} weight="bold" /> {lang === "sv" ? "Slå ihop" : "Merge"}</h4>
              <div className="admin-district-form-row">
                <input value={mergeFrom} onChange={(event) => setMergeFrom(event.target.value)} placeholder={lang === "sv" ? "Källa" : "Source"} list="admin-district-rename-list" />
                <ArrowRight size={14} weight="bold" />
                <input value={mergeInto} onChange={(event) => setMergeInto(event.target.value)} placeholder={lang === "sv" ? "Mål" : "Target"} list="admin-district-rename-list" />
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={busy || !mergeFrom.trim() || !mergeInto.trim()}
                  onClick={() => void runDistrictAction({ action: "merge", from: mergeFrom, into: mergeInto })}
                >
                  {lang === "sv" ? "Slå ihop" : "Merge"}
                </button>
              </div>
            </section>
          </div>

          <datalist id="admin-district-rename-list">
            {districts.map((district) => (
              <option key={district.name} value={district.name} />
            ))}
          </datalist>

          {loading ? (
            <div className="admin-review-empty">
              <CircleNotch size={18} className="animate-spin" />
              <span>{lang === "sv" ? "Laddar stadsdelar..." : "Loading districts..."}</span>
            </div>
          ) : (
            <div className="admin-district-table-wrap">
              <table className="admin-district-table">
                <thead>
                  <tr>
                    <th>{lang === "sv" ? "Stadsdel" : "District"}</th>
                    <th>{lang === "sv" ? "Platser" : "Places"}</th>
                    <th>{lang === "sv" ? "Kanonisk" : "Canonical"}</th>
                  </tr>
                </thead>
                <tbody>
                  {districts.map((district) => (
                    <tr key={district.name}>
                      <td>{district.name}</td>
                      <td>{district.placeCount}</td>
                      <td>{district.canonical ? (lang === "sv" ? "Ja" : "Yes") : (lang === "sv" ? "Anpassad" : "Custom")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error ? <p className="admin-modal-error">{error}</p> : null}

        <footer className="admin-modal-footer">
          <button type="button" className="admin-action-btn muted" onClick={onClose}>
            {lang === "sv" ? "Stäng" : "Close"}
          </button>
        </footer>
      </div>
    </div>
  );
}
