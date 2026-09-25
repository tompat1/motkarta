import React, { useEffect, useState } from "react";
import { CircleNotch, Trash, ImageSquare } from "@phosphor-icons/react";
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

  const loadPhotos = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/photos?place_id=${placeId}`, { headers: adminHeaders() });
      const payload = await response.json().catch(() => ({})) as { photos?: AdminPhoto[]; error?: string };
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

  const removePhoto = async (photo: AdminPhoto) => {
    if (!window.confirm(lang === "sv" ? "Ta bort bilden från platsen?" : "Remove this image from the place?")) return;
    setBusyId(photo.id);
    try {
      const response = await fetch(`/api/admin/photos?place_id=${placeId}&photo_id=${encodeURIComponent(photo.id)}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not remove image.");
      setPhotos((previous) => previous.filter((item) => item.id !== photo.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove image.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="admin-photo-manager" aria-label={lang === "sv" ? "Bilder" : "Images"}>
      <div className="admin-photo-manager-head">
        <strong><ImageSquare size={15} weight="bold" /> {lang === "sv" ? "Bilder" : "Images"}</strong>
        <span>{photos.length}</span>
      </div>
      {loading ? <CircleNotch size={16} className="animate-spin" /> : null}
      {error ? <p className="admin-photo-manager-error" role="alert">{error}</p> : null}
      {!loading && !photos.length && !error ? <small>{lang === "sv" ? "Inga D1-bilder ännu." : "No D1 images yet."}</small> : null}
      <div className="admin-photo-manager-grid">
        {photos.map((photo) => (
          <figure key={photo.id} className="admin-photo-manager-item">
            <img src={photo.thumbnailUrl || photo.url} alt={photo.caption || "Place image"} />
            <figcaption>
              <span title={photo.caption}>{photo.caption || "Untitled"}</span>
              <button type="button" onClick={() => void removePhoto(photo)} disabled={busyId === photo.id} aria-label={lang === "sv" ? "Ta bort bild" : "Remove image"} title={lang === "sv" ? "Ta bort bild" : "Remove image"}>
                {busyId === photo.id ? <CircleNotch size={13} className="animate-spin" /> : <Trash size={13} weight="bold" />}
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
