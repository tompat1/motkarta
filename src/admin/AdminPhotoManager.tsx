import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, CircleNotch, PencilSimple, Plus, Trash, ImageSquare, UploadSimple } from "@phosphor-icons/react";
import type { Language } from "../app/shared";
import { processImageFile } from "../components/ConciergeSuperpowerModal";
import {
  DEFAULT_PHOTO_HERO_FRAME,
  normalizePhotoHeroFrame,
  type PhotoHeroFrame,
} from "../../lib/photo-hero-frame";
import { AdminPhotoHeroEditor, type AdminPlacePreview } from "./AdminPhotoHeroEditor";

type AdminPhoto = {
  id: string;
  placeId: number;
  url: string;
  thumbnailUrl: string;
  caption: string;
  credit?: string | null;
  heroFocusX?: number;
  heroFocusY?: number;
  heroScale?: number;
  heroFit?: "contain" | "cover";
};

type Props = {
  placeId: number;
  lang: Language;
  refreshKey?: number;
  websiteUrl?: string | null;
  placePreview?: AdminPlacePreview;
  adminHeaders: (tokenOverride?: string, extraHeaders?: Record<string, string>) => Record<string, string>;
};

function frameFromPhoto(photo?: Partial<AdminPhoto> | null): PhotoHeroFrame {
  return normalizePhotoHeroFrame({
    heroFocusX: photo?.heroFocusX,
    heroFocusY: photo?.heroFocusY,
    heroScale: photo?.heroScale,
    heroFit: photo?.heroFit,
  });
}

export function AdminPhotoManager({ placeId, lang, refreshKey = 0, websiteUrl, placePreview, adminHeaders }: Props) {
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const [newDataUrl, setNewDataUrl] = useState<string | null>(null);
  const [newFrame, setNewFrame] = useState<PhotoHeroFrame>(DEFAULT_PHOTO_HERO_FRAME);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editDataUrl, setEditDataUrl] = useState<string | null>(null);
  const [editFrame, setEditFrame] = useState<PhotoHeroFrame>(DEFAULT_PHOTO_HERO_FRAME);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [scrapeCandidateMeta, setScrapeCandidateMeta] = useState<{ index: number; total: number; hasMore: boolean } | null>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

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

  const resetAddForm = () => {
    setNewUrl("");
    setNewCaption("");
    setNewDataUrl(null);
    setNewFrame(DEFAULT_PHOTO_HERO_FRAME);
  };

  const resetEditForm = () => {
    setEditingId(null);
    setEditUrl("");
    setEditCaption("");
    setEditDataUrl(null);
    setEditFrame(DEFAULT_PHOTO_HERO_FRAME);
  };

  const savePhoto = async (photo: {
    photoId?: string;
    url?: string;
    dataUrl?: string | null;
    caption?: string;
    frame?: PhotoHeroFrame;
  }) => {
    setBusyId(photo.photoId ?? "new");
    setError(null);
    try {
      const frame = normalizePhotoHeroFrame(photo.frame);
      const body: Record<string, unknown> = {
        placeId,
        photoId: photo.photoId,
        caption: photo.caption,
        credit: "Admin curated",
        heroFocusX: frame.heroFocusX,
        heroFocusY: frame.heroFocusY,
        heroScale: frame.heroScale,
        heroFit: frame.heroFit,
      };
      if (photo.dataUrl) body.dataUrl = photo.dataUrl;
      else if (photo.url) body.url = photo.url;
      else throw new Error(lang === "sv" ? "Ange en bild-URL eller ladda upp en fil." : "Provide an image URL or upload a file.");

      const response = await fetch("/api/admin/photos", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not save image.");
      resetAddForm();
      resetEditForm();
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
      if (editingId === photo.id) resetEditForm();
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
    setEditDataUrl(null);
    setEditFrame(frameFromPhoto(photo));
    setScrapeCandidateMeta(null);
  };

  const loadNextScrapedImage = async (currentUrl: string) => {
    if (!websiteUrl?.trim()) {
      setError(lang === "sv" ? "Ingen webbadress att hämta bilder från." : "No website URL to scrape images from.");
      return;
    }
    setBusyId(editingId ?? "scrape-next");
    setError(null);
    try {
      const response = await fetch("/api/admin/scrape-photo", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          placeId,
          website: websiteUrl,
          currentUrl,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        photoUrl?: string;
        candidateIndex?: number;
        totalCandidates?: number;
        hasMore?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.photoUrl) {
        throw new Error(payload.error ?? (lang === "sv" ? "Inga fler bilder hittades på webbplatsen." : "No more images found on the website."));
      }
      setEditUrl(payload.photoUrl);
      setEditDataUrl(null);
      setEditFrame(DEFAULT_PHOTO_HERO_FRAME);
      setScrapeCandidateMeta({
        index: (payload.candidateIndex ?? 0) + 1,
        total: payload.totalCandidates ?? 0,
        hasMore: Boolean(payload.hasMore),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (lang === "sv" ? "Kunde inte hämta nästa bild." : "Could not load the next image."));
    } finally {
      setBusyId(null);
    }
  };

  const handleFileSelection = async (file: File | undefined, mode: "add" | "edit") => {
    if (!file) return;
    setError(null);
    setIsProcessingUpload(true);
    try {
      const processed = await processImageFile(file);
      if (mode === "add") {
        setNewDataUrl(processed.dataUrl);
        setNewUrl("");
      } else {
        setEditDataUrl(processed.dataUrl);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (lang === "sv" ? "Kunde inte läsa bilden." : "Could not read the image."));
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const previewUrl = (photoId?: string | null) => {
    if (photoId && editingId === photoId && editDataUrl) return editDataUrl;
    if (!photoId && newDataUrl) return newDataUrl;
    if (photoId) {
      const photo = photos.find((item) => item.id === photoId);
      return photo?.thumbnailUrl || photo?.url || "";
    }
    return newUrl.trim();
  };

  const canSaveNew = Boolean(newDataUrl || newUrl.trim());
  const canSaveEdit = Boolean(editDataUrl || editUrl.trim());

  return (
    <section className="admin-photo-manager" aria-label={lang === "sv" ? "Bilder" : "Images"}>
      <div className="admin-photo-manager-head">
        <strong><ImageSquare size={15} weight="bold" /> {lang === "sv" ? "Bilder" : "Images"}</strong>
        <span>{photos.length}</span>
      </div>
      {loading ? <CircleNotch size={16} className="animate-spin" /> : null}
      {error ? <p className="admin-photo-manager-error" role="alert">{error}</p> : null}
      {!loading && !photos.length && !error ? (
        <small>{lang === "sv" ? "Inga D1-bilder ännu. Ladda upp eller lägg till en URL nedan." : "No D1 images yet. Upload or add a URL below."}</small>
      ) : null}
      <div className="admin-photo-manager-grid">
        {photos.map((photo) => (
          <figure
            key={photo.id}
            className={`admin-photo-manager-item${editingId === photo.id ? " is-editing" : ""}`}
          >
            <div className="admin-photo-manager-preview">
              <img src={editDataUrl && editingId === photo.id ? editDataUrl : (photo.thumbnailUrl || photo.url)} alt={photo.caption || "Place image"} />
            </div>
            <figcaption>
              {editingId === photo.id ? (
                <div className="admin-photo-edit-form">
                  <AdminPhotoHeroEditor
                    imageUrl={previewUrl(photo.id)}
                    frame={editFrame}
                    onFrameChange={setEditFrame}
                    placePreview={placePreview}
                    lang={lang}
                  />
                  <input
                    ref={replaceFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(event) => {
                      void handleFileSelection(event.target.files?.[0], "edit");
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="admin-photo-upload-btn"
                    onClick={() => replaceFileInputRef.current?.click()}
                    disabled={isProcessingUpload || busyId === photo.id}
                  >
                    {isProcessingUpload ? <CircleNotch size={14} className="animate-spin" /> : <UploadSimple size={14} weight="bold" />}
                    {lang === "sv" ? "Byt hero-bild" : "Replace hero image"}
                  </button>
                  {websiteUrl?.trim() ? (
                    <button
                      type="button"
                      className="admin-photo-next-scrape-btn"
                      onClick={() => void loadNextScrapedImage(editDataUrl ?? editUrl)}
                      disabled={busyId === photo.id || !(editDataUrl ?? editUrl).trim()}
                      title={lang === "sv" ? "Hämta nästa bildkandidat från webbplatsen" : "Load the next image candidate from the website"}
                    >
                      {busyId === photo.id ? <CircleNotch size={14} className="animate-spin" /> : <ArrowRight size={14} weight="bold" />}
                      {lang === "sv" ? "Nästa hämtade bild" : "Next scraped image"}
                      {scrapeCandidateMeta ? ` (${scrapeCandidateMeta.index}/${scrapeCandidateMeta.total})` : ""}
                    </button>
                  ) : null}
                  {!editDataUrl ? (
                    <input
                      type="url"
                      value={editUrl}
                      onChange={(event) => setEditUrl(event.target.value)}
                      placeholder={lang === "sv" ? "Bild-URL" : "Image URL"}
                    />
                  ) : null}
                  <input
                    type="text"
                    value={editCaption}
                    onChange={(event) => setEditCaption(event.target.value)}
                    placeholder={lang === "sv" ? "Bildtext" : "Caption"}
                  />
                  <div className="admin-photo-edit-actions">
                    <button
                      type="button"
                      onClick={() => void savePhoto({
                        photoId: photo.id,
                        url: editDataUrl ? undefined : editUrl,
                        dataUrl: editDataUrl,
                        caption: editCaption,
                        frame: editFrame,
                      })}
                      disabled={!canSaveEdit || busyId === photo.id}
                    >
                      {lang === "sv" ? "Spara" : "Save"}
                    </button>
                    <button type="button" className="muted" onClick={resetEditForm}>
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
                      title={lang === "sv" ? "Redigera hero-bild" : "Edit hero image"}
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
          void savePhoto({
            url: newDataUrl ? undefined : newUrl,
            dataUrl: newDataUrl,
            caption: newCaption,
            frame: newFrame,
          });
        }}
      >
        <label>
          <span>{lang === "sv" ? "Ladda upp hero-bild" : "Upload hero image"}</span>
          <input
            ref={addFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              void handleFileSelection(event.target.files?.[0], "add");
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="admin-photo-upload-btn"
            onClick={() => addFileInputRef.current?.click()}
            disabled={isProcessingUpload || busyId === "new"}
          >
            {isProcessingUpload ? <CircleNotch size={14} className="animate-spin" /> : <UploadSimple size={14} weight="bold" />}
            {newDataUrl
              ? (lang === "sv" ? "Bild vald — byt fil" : "Image selected — change file")
              : (lang === "sv" ? "Välj bild från enheten" : "Choose image from device")}
          </button>
        </label>
        {(newDataUrl || newUrl.trim()) ? (
          <>
            <AdminPhotoHeroEditor
              imageUrl={previewUrl(null)}
              frame={newFrame}
              onFrameChange={setNewFrame}
              placePreview={placePreview}
              lang={lang}
            />
            {websiteUrl?.trim() ? (
              <button
                type="button"
                className="admin-photo-next-scrape-btn"
                onClick={() => void loadNextScrapedImage(newDataUrl ?? newUrl)}
                disabled={busyId === "new" || !(newDataUrl ?? newUrl).trim()}
              >
                {busyId === "new" ? <CircleNotch size={14} className="animate-spin" /> : <ArrowRight size={14} weight="bold" />}
                {lang === "sv" ? "Nästa hämtade bild" : "Next scraped image"}
              </button>
            ) : null}
          </>
        ) : null}
        <label>
          <span>{lang === "sv" ? "Eller lägg till bild-URL" : "Or add image URL"}</span>
          <input
            type="url"
            value={newUrl}
            onChange={(event) => {
              setNewUrl(event.target.value);
              if (event.target.value.trim()) setNewDataUrl(null);
            }}
            placeholder="https://example.com/venue-photo.jpg"
            disabled={Boolean(newDataUrl)}
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
        <button type="submit" disabled={!canSaveNew || busyId === "new"}>
          {busyId === "new" ? <CircleNotch size={14} className="animate-spin" /> : <Plus size={14} weight="bold" />}
          {lang === "sv" ? "Lägg till hero-bild" : "Add hero image"}
        </button>
      </form>
    </section>
  );
}
