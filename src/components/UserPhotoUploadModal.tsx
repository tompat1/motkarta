import React, { useRef, useState } from "react";
import { Camera, Check, UploadSimple, X } from "@phosphor-icons/react";
import type { Language } from "../app/shared";
import { addUserPhoto } from "../../lib/lazy-media";
import { processImageFile } from "./ConciergeSuperpowerModal";

type UserPhotoUploadModalProps = {
  placeId: number;
  placeName: string;
  lang: Language;
  onClose: () => void;
};

export function UserPhotoUploadModal({ placeId, placeName, lang, onClose }: UserPhotoUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string; sizeKb: number } | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setIsProcessing(true);
    try {
      setPhoto(await processImageFile(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : lang === "sv" ? "Kunde inte läsa bilden." : "Could not read the image.");
    } finally {
      setIsProcessing(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!photo) {
      setError(lang === "sv" ? "Välj en bild först." : "Choose an image first.");
      return;
    }
    addUserPhoto(placeId, {
      url: photo.dataUrl,
      thumbnailUrl: photo.dataUrl,
      caption: caption.trim() || (lang === "sv" ? `Användarbild från ${placeName}` : `User photo from ${placeName}`),
      credit: lang === "sv" ? "Uppladdat av användare" : "Uploaded by user",
    });
    setSubmitted(true);
    window.setTimeout(onClose, 900);
  };

  return (
    <div className="user-photo-upload-backdrop" role="dialog" aria-modal="true" aria-label={lang === "sv" ? "Ladda upp platsbild" : "Upload place photo"} onClick={onClose}>
      <form className="user-photo-upload-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="user-photo-upload-close" onClick={onClose} aria-label={lang === "sv" ? "Stäng" : "Close"}>
          <X size={18} weight="bold" />
        </button>
        {submitted ? (
          <div className="user-photo-upload-success" role="status">
            <Check size={28} weight="bold" />
            <strong>{lang === "sv" ? "Tack, bilden är tillagd" : "Thanks, photo added"}</strong>
          </div>
        ) : (
          <>
            <div className="user-photo-upload-heading">
              <Camera size={22} weight="bold" />
              <div>
                <h3>{lang === "sv" ? "Lägg till en bild" : "Add a photo"}</h3>
                <p>{placeName}</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { void selectFile(event.target.files?.[0]); event.target.value = ""; }} />
            <button type="button" className="user-photo-upload-picker" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
              <UploadSimple size={20} weight="bold" />
              <span>{isProcessing ? (lang === "sv" ? "Bearbetar bilden..." : "Processing image...") : photo ? photo.name : (lang === "sv" ? "Välj bild från enheten" : "Choose image from device")}</span>
            </button>
            {photo ? <img className="user-photo-upload-preview" src={photo.dataUrl} alt={photo.name} /> : null}
            <label className="user-photo-upload-caption">
              <span>{lang === "sv" ? "Bildtext (valfritt)" : "Caption (optional)"}</span>
              <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={160} placeholder={lang === "sv" ? "Vad visar bilden?" : "What does the photo show?"} />
            </label>
            {error ? <p className="user-photo-upload-error" role="alert">{error}</p> : null}
            <button type="submit" className="user-photo-upload-submit" disabled={isProcessing || !photo}>
              <Camera size={16} weight="bold" />
              {lang === "sv" ? "Lägg till bild" : "Add photo"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
