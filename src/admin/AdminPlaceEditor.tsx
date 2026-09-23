import React, { useEffect, useState } from "react";
import type { PlaceInput, PlaceLifecycleState } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { CircleNotch, FloppyDisk, Trash, X } from "@phosphor-icons/react";

type AdminValidationLabel = NonNullable<PlaceInput["validationLabel"]>;

export type AdminPlaceDraft = {
  id?: number;
  name: string;
  kind: string;
  area: string;
  address: string;
  website: string;
  note: string;
  latitude: number;
  longitude: number;
  lifecycleState: PlaceLifecycleState;
  validationLabel: AdminValidationLabel | null;
  cuisine: string;
};

const placeKinds = ["Restaurant", "Bakery", "Café", "Specialty coffee"];
const lifecycleOptions: PlaceLifecycleState[] = ["baseline", "candidate", "verified", "featured"];
const validationOptions: AdminValidationLabel[] = [
  "known_mainstream",
  "known_hidden_gem",
  "not_enough_evidence",
  "closed_wrong_category",
];

type Props = {
  lang: Language;
  open: boolean;
  mode: "create" | "edit";
  initial: AdminPlaceDraft;
  districts: string[];
  adminHeaders: (tokenOverride?: string, extraHeaders?: Record<string, string>) => Record<string, string>;
  onClose: () => void;
  onSaved: (candidate: Record<string, unknown>) => void;
  onDeleted?: (id: number) => void;
};

export function AdminPlaceEditor({
  lang,
  open,
  mode,
  initial,
  districts,
  adminHeaders,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [draft, setDraft] = useState<AdminPlaceDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setError(null);
    }
  }, [open, initial]);

  if (!open) return null;

  const savePlace = async () => {
    if (!draft.name.trim()) {
      setError(lang === "sv" ? "Namn krävs." : "Name is required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          action: mode === "create" ? "create_place" : "update_place",
          id: draft.id,
          name: draft.name.trim(),
          kind: draft.kind,
          area: draft.area.trim() || "Stockholm",
          address: draft.address.trim(),
          website: draft.website.trim(),
          note: draft.note.trim(),
          description: draft.note.trim(),
          latitude: draft.latitude,
          longitude: draft.longitude,
          lifecycleState: draft.lifecycleState,
          validationLabel: draft.validationLabel,
          cuisine: draft.cuisine.trim(),
          validationNotes:
            mode === "create"
              ? lang === "sv"
                ? "Skapad manuellt via admin."
                : "Created manually via admin."
              : lang === "sv"
                ? "Uppdaterad via adminredigeraren."
                : "Updated via admin editor.",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        candidate?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara platsen." : "Could not save place."));
      }
      onSaved(payload.candidate ?? { id: draft.id, name: draft.name });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  };

  const deletePlace = async () => {
    if (!draft.id || !onDeleted) return;
    const confirmed = window.confirm(
      lang === "sv"
        ? `Radera ${draft.name} permanent från D1? Detta kan inte ångras.`
        : `Permanently delete ${draft.name} from D1? This cannot be undone.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          action: "delete_place",
          id: draft.id,
          validationNotes:
            lang === "sv" ? "Permanent radering via adminredigeraren." : "Permanent deletion via admin editor.",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte radera platsen." : "Could not delete place."));
      }
      onDeleted(draft.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="admin-modal admin-place-editor"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? (lang === "sv" ? "Ny plats" : "New place") : (lang === "sv" ? "Redigera plats" : "Edit place")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-modal-header">
          <h3>{mode === "create" ? (lang === "sv" ? "Lägg till plats" : "Add place") : (lang === "sv" ? "Redigera plats" : "Edit place")}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label={lang === "sv" ? "Stäng" : "Close"}>
            <X size={16} weight="bold" />
          </button>
        </header>

        <div className="admin-modal-body admin-place-editor-grid">
          <label>
            {lang === "sv" ? "Namn" : "Name"}
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            {lang === "sv" ? "Typ" : "Kind"}
            <select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}>
              {placeKinds.map((kind) => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label>
            {lang === "sv" ? "Stadsdel" : "District"}
            <input
              list="admin-district-options"
              value={draft.area}
              onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))}
            />
            <datalist id="admin-district-options">
              {districts.map((district) => (
                <option key={district} value={district} />
              ))}
            </datalist>
          </label>
          <label>
            {lang === "sv" ? "Adress" : "Address"}
            <input value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} />
          </label>
          <label>
            {lang === "sv" ? "Webbplats" : "Website"}
            <input type="url" value={draft.website} onChange={(event) => setDraft((current) => ({ ...current, website: event.target.value }))} />
          </label>
          <label>
            {lang === "sv" ? "Kök / tagg" : "Cuisine / tag"}
            <input value={draft.cuisine} onChange={(event) => setDraft((current) => ({ ...current, cuisine: event.target.value }))} />
          </label>
          <label>
            Lat
            <input
              type="number"
              step="0.000001"
              value={draft.latitude}
              onChange={(event) => setDraft((current) => ({ ...current, latitude: Number(event.target.value) }))}
            />
          </label>
          <label>
            Lng
            <input
              type="number"
              step="0.000001"
              value={draft.longitude}
              onChange={(event) => setDraft((current) => ({ ...current, longitude: Number(event.target.value) }))}
            />
          </label>
          <label>
            {lang === "sv" ? "Livscykel" : "Lifecycle"}
            <select
              value={draft.lifecycleState}
              onChange={(event) => setDraft((current) => ({ ...current, lifecycleState: event.target.value as PlaceLifecycleState }))}
            >
              {lifecycleOptions.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </label>
          <label>
            {lang === "sv" ? "Valideringsetikett" : "Validation label"}
            <select
              value={draft.validationLabel ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  validationLabel: event.target.value ? (event.target.value as AdminValidationLabel) : null,
                }))
              }
            >
              <option value="">{lang === "sv" ? "— Ingen —" : "— None —"}</option>
              {validationOptions.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </label>
          <label className="admin-place-editor-note">
            {lang === "sv" ? "Beskrivning / notering" : "Description / note"}
            <textarea
              rows={3}
              value={draft.note}
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            />
          </label>
        </div>

        {error ? <p className="admin-modal-error">{error}</p> : null}

        <footer className="admin-modal-footer">
          {mode === "edit" && onDeleted ? (
            <button type="button" className="admin-action-btn danger" disabled={busy} onClick={() => void deletePlace()}>
              <Trash size={14} weight="bold" />
              {lang === "sv" ? "Radera" : "Delete"}
            </button>
          ) : null}
          <button type="button" className="admin-action-btn muted" disabled={busy} onClick={onClose}>
            {lang === "sv" ? "Avbryt" : "Cancel"}
          </button>
          <button type="button" className="admin-action-btn primary" disabled={busy} onClick={() => void savePlace()}>
            {busy ? <CircleNotch size={14} className="animate-spin" /> : <FloppyDisk size={14} weight="bold" />}
            {lang === "sv" ? "Spara" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function emptyPlaceDraft(): AdminPlaceDraft {
  return {
    name: "",
    kind: "Restaurant",
    area: "Södermalm",
    address: "",
    website: "",
    note: "",
    latitude: 59.3293,
    longitude: 18.0686,
    lifecycleState: "verified",
    validationLabel: null,
    cuisine: "",
  };
}

export function candidateToPlaceDraft(candidate: {
  id: number;
  name: string;
  kind: string;
  area: string;
  address: string | null;
  website: string | null;
  note: string;
  latitude?: number | null;
  longitude?: number | null;
  lifecycleState: PlaceLifecycleState;
  validationLabel: AdminValidationLabel | null;
}): AdminPlaceDraft {
  return {
    id: candidate.id,
    name: candidate.name,
    kind: candidate.kind,
    area: candidate.area,
    address: candidate.address ?? "",
    website: candidate.website ?? "",
    note: candidate.note ?? "",
    latitude: candidate.latitude ?? 59.3293,
    longitude: candidate.longitude ?? 18.0686,
    lifecycleState: candidate.lifecycleState,
    validationLabel: candidate.validationLabel,
    cuisine: "",
  };
}
