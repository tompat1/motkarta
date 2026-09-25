import React, { useEffect, useState } from "react";
import { CircleNotch, PencilSimple, Plus, Trash, ImageSquare } from "@phosphor-icons/react";
import type { Language } from "../app/shared";

type AdminPhoto = {
  id: string;
  placeId: number;
  url: string;
  thumbnailUrl: string;
  caption: string;
  credit?: string | null;
};

type Props = {
  placeId: number;
  lang: Language;
  refreshKey?: number;
  adminHeaders: (tokenOverride?: string, extraHeaders?: Record<string, string>) => Record<string, string>;
};

export function AdminPhotoManager({ placeId, lang, refreshKey = 0, adminHeaders }: Props) {
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editCaption, setEditCaption] = useState("");

  const loadPhotos = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/photos?place_id=${placeId}`, { headers: adminHeaders() });
      const payload = (await response.json().catch(() => ({}))) as { photos?: AdminPhoto[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load images.");
      setPhotos(payload.photos ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load images.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPhotos();
  }, [placeId, refreshKey]);

  const savePhoto = async (photo: { photoId?: string; url: string; caption?: string }) => {
    setBusyId(photo.photoId ?? "new");
    setError(null);
    try {
      const response = await fetch("/api/admin/photos", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          placeId,
          photoId: photo.photoId,
          url: photo.url,
          caption: photo.caption,
          credit: "Admin curated",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not save image.");
      setNewUrl("");
      setNewCaption("");
      setEditingId(null);
      setEditUrl("");
      setEditCaption("");
      await loadPhotos();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save image.");
    } finally {
      setBusyId(null);
    }
  };

  const removePhoto = async (photo: AdminPhoto) => {
    if (!window.confirm(lang === "sv" ? "Ta bort bilden från platsen?" : "Remove this image from the place?")) return;
    setBusyId(photo.id);
    try {
      const response = await fetch(`/api/admin/photos?place_id=${placeId}&photo_id=${encodeURIComponent(photo.id)}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not remove image.");
      setPhotos((previous) => previous.filter((item) => item.id !== photo.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove image.");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (photo: AdminPhoto) => {
    setEditingId(photo.id);
    setEditUrl(photo.url);
    setEditCaption(photo.caption || "");
  };

  return (
    <section className="admin-photo-manager" aria-label={lang === "sv" ? "Bilder" : "Images"}>
      <div className="admin-photo-manager-head">
        <strong><ImageSquare size={15} weight="bold" /> {lang === "sv" ? "Bilder" : "Images"}</strong>
        <span>{photos.length}</span>
      </div>
      {loading ? <CircleNotch size={16} className="animate-spin" /> : null}
      {error ? <p className="admin-photo-manager-error" role="alert">{error}</p> : null}
      {!loading && !photos.length && !error ? (
        <small>{lang === "sv" ? "Inga D1-bilder ännu. Lägg till en URL nedan." : "No D1 images yet. Add a URL below."}</small>
      ) : null}
      <div className="admin-photo-manager-grid">
        {photos.map((photo) => (
          <figure
            key={photo.id}
            className={`admin-photo-manager-item${editingId === photo.id ? " is-editing" : ""}`}
          >
            <div className="admin-photo-manager-preview">
              <img src={photo.thumbnailUrl || photo.url} alt={photo.caption || "Place image"} />
            </div>
            <figcaption>
              {editingId === photo.id ? (
                <div className="admin-photo-edit-form">
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(event) => setEditUrl(event.target.value)}
                    placeholder={lang === "sv" ? "Bild-URL" : "Image URL"}
                  />
                  <input
                    type="text"
                    value={editCaption}
                    onChange={(event) => setEditCaption(event.target.value)}
                    placeholder={lang === "sv" ? "Bildtext" : "Caption"}
                  />
                  <div className="admin-photo-edit-actions">
                    <button
                      type="button"
                      onClick={() => void savePhoto({ photoId: photo.id, url: editUrl, caption: editCaption })}
                      disabled={!editUrl.trim() || busyId === photo.id}
                    >
                      {lang === "sv" ? "Spara" : "Save"}
                    </button>
                    <button type="button" className="muted" onClick={() => setEditingId(null)}>
                      {lang === "sv" ? "Avbryt" : "Cancel"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span title={photo.caption}>{photo.caption || "Untitled"}</span>
                  <div className="admin-photo-item-actions">
                    <button
                      type="button"
                      onClick={() => startEdit(photo)}
                      disabled={busyId === photo.id}
                      aria-label={lang === "sv" ? "Redigera bild" : "Edit image"}
                      title={lang === "sv" ? "Redigera bild-URL" : "Edit image URL"}
                    >
                      <PencilSimple size={13} weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removePhoto(photo)}
                      disabled={busyId === photo.id}
                      aria-label={lang === "sv" ? "Ta bort bild" : "Remove image"}
                      title={lang === "sv" ? "Ta bort bild" : "Remove image"}
                    >
                      {busyId === photo.id ? <CircleNotch size={13} className="animate-spin" /> : <Trash size={13} weight="bold" />}
                    </button>
                  </div>
                </>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      <form
        className="admin-photo-add-form"
        onSubmit={(event) => {
          event.preventDefault();
          void savePhoto({ url: newUrl, caption: newCaption });
        }}
      >
        <label>
          <span>{lang === "sv" ? "Lägg till bild-URL" : "Add image URL"}</span>
          <input
            type="url"
            value={newUrl}
            onChange={(event) => setNewUrl(event.target.value)}
            placeholder="https://example.com/venue-photo.jpg"
          />
        </label>
        <label>
          <span>{lang === "sv" ? "Bildtext (valfritt)" : "Caption (optional)"}</span>
          <input
            type="text"
            value={newCaption}
            onChange={(event) => setNewCaption(event.target.value)}
            placeholder={lang === "sv" ? "T.ex. Interiör från officiell webb" : "E.g. Interior from official website"}
          />
        </label>
        <button type="submit" disabled={!newUrl.trim() || busyId === "new"}>
          {busyId === "new" ? <CircleNotch size={14} className="animate-spin" /> : <Plus size={14} weight="bold" />}
          {lang === "sv" ? "Lägg till bild" : "Add image"}
        </button>
      </form>
    </section>
  );
}
