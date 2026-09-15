import React, { useMemo, useState } from "react";
import type { EstablishmentType, PlaceInput } from "../../lib/scoring";
import type { CuratedSource, Language, SuperpowerMode } from "../app/shared";
import { curatedSourceTypes } from "../app/shared";
import { Camera, Image, Link, PlusCircle, ShieldCheck, Sparkle, Star, Trash, UploadSimple } from "@phosphor-icons/react";
import { SearchablePlaceSelect } from "./SearchablePlaceSelect";

export async function processImageFile(file: File): Promise<{
  dataUrl: string;
  name: string;
  sizeKb: number;
}> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Endast bildfiler (JPG, PNG, WebP) stöds");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kunde inte läsa bildfilen från enheten"));
    reader.onload = () => {
      const result = reader.result as string;
      if (typeof window === "undefined" || !window.Image) {
        resolve({
          dataUrl: result,
          name: file.name,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
        });
        return;
      }

      const img = new window.Image();
      img.onerror = () => {
        resolve({
          dataUrl: result,
          name: file.name,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
        });
      };
      img.onload = () => {
        try {
          const maxDim = 1200;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve({
              dataUrl: result,
              name: file.name,
              sizeKb: Math.max(1, Math.round(file.size / 1024)),
            });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
          const sizeKb = Math.max(1, Math.round((optimizedDataUrl.length * 3) / 4 / 1024));
          resolve({
            dataUrl: optimizedDataUrl,
            name: file.name,
            sizeKb,
          });
        } catch {
          resolve({
            dataUrl: result,
            name: file.name,
            sizeKb: Math.max(1, Math.round(file.size / 1024)),
          });
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export function ConciergeSuperpowerModal({
  mode,
  places,
  activePlace,
  onClose,
  onAddPlace,
  onAddReview,
  onAddPhoto,
  onRatePlace,
  onAddSource,
  lang = "sv",
  initialPlaceName,
}: {
  mode: SuperpowerMode;
  places: PlaceInput[];
  activePlace: PlaceInput | null;
  onClose: () => void;
  onAddPlace: (place: PlaceInput) => void;
  onAddReview: (placeId: number, review: { author: string; rating: number; content: string; source: "Community Submission" }) => void;
  onAddPhoto: (placeId: number, photo: { url: string; thumbnailUrl: string; caption: string; credit?: string }) => void;
  onRatePlace: (placeId: number, rating: number) => void;
  onAddSource?: (source: CuratedSource) => void;
  lang?: Language;
  initialPlaceName?: string;
}) {
  const [selectedPlaceId, setSelectedPlaceId] = useState<number>(activePlace ? activePlace.id : (places[0]?.id ?? 1));

  // Place form fields
  const [name, setName] = useState(initialPlaceName ?? "");
  const [kind, setKind] = useState("Restaurant");
  const [cuisine, setCuisine] = useState("swedish");
  const [area, setArea] = useState("Vasastan");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState("");

  // Review fields
  const [author, setAuthor] = useState("");
  const [reviewContent, setReviewContent] = useState("");

  // Photo fields
  const [photoSource, setPhotoSource] = useState<"device" | "url">("device");
  const [devicePhoto, setDevicePhoto] = useState<{
    dataUrl: string;
    name: string;
    sizeKb: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    setUploadError(null);
    setIsOptimizing(true);
    try {
      const processed = await processImageFile(file);
      setDevicePhoto(processed);
      setPhotoSource("device");
    } catch (err: any) {
      setUploadError(err?.message || (lang === "sv" ? "Kunde inte läsa bilden" : "Failed to load image"));
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = "";
  };

  // Source fields
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<CuratedSource["type"]>("Verified Guide");
  const [sourceLicense, setSourceLicense] = useState(
    lang === "sv" ? "Öppen data / Citerat med tillstånd" : "Open data / Cited with permission",
  );
  const [sourceDesc, setSourceDesc] = useState("");
  const sourceModalCopy =
    lang === "sv"
      ? {
          title: "📜 Lägg till ny kurerad källa",
          nameLabel: "Källans namn / Titel *",
          namePlaceholder: "t.ex. Guide Michelin Stockholm eller Krogen & Bageriet",
          urlLabel: "Webbadress / URL *",
          typeLabel: "Typ av källa",
          typeHelp: {
            "Official City Guide": "Official City Guide (Officiell stads- eller besöksguide)",
            "Verified Guide": "Verified Guide (Redaktionell krog- & matguide)",
            "Municipal Inspection": "Municipal Inspection (Kommunalt tillsynsregister)",
            "Open Data": "Open Data (Öppet API / Databas)",
            "Editorial Review": "Editorial Review (Tidningsrecension)",
            Community: "Community (Verifierad användarsamling)",
          },
          licenseLabel: "Licens & Upphovsrättsattribuering",
          licensePlaceholder: "t.ex. CC0 1.0, ODbL, eller Citerat med tillstånd",
          descriptionLabel: "Källbeskrivning & Omfång",
          descriptionPlaceholder: "Beskriv vad källan granskar och bidrar med...",
          defaultLicense: "Citerat med källhänvisning",
          defaultDescription: "Kurerat källmaterial inskickat av användare.",
          submit: "Lägg till ny kurerad källa i registret",
        }
      : {
          title: "📜 Add new curated source",
          nameLabel: "Source name / Title *",
          namePlaceholder: "e.g. Michelin Guide Stockholm or Local Food Registry",
          urlLabel: "Web address / URL *",
          typeLabel: "Source type",
          typeHelp: {
            "Official City Guide": "Official City Guide",
            "Verified Guide": "Verified Guide",
            "Municipal Inspection": "Municipal Inspection",
            "Open Data": "Open Data",
            "Editorial Review": "Editorial Review",
            Community: "Community",
          },
          licenseLabel: "License & copyright attribution",
          licensePlaceholder: "e.g. CC0 1.0, ODbL, or Cited with permission",
          descriptionLabel: "Source description & scope",
          descriptionPlaceholder: "Describe what the source verifies and contributes...",
          defaultLicense: "Cited with source attribution",
          defaultDescription: "Curated source material submitted for admin review.",
          submit: "Add curated source to registry",
        };

  const duplicateMatch = useMemo(() => {
    if (!name.trim() || mode !== "add_place") return null;
    const targetName = name.trim().toLowerCase();
    return places.find((p) => p.name.trim().toLowerCase() === targetName) ?? null;
  }, [name, places, mode]);

  const handleSubmitPlace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || duplicateMatch) return;

    const newPlace: PlaceInput = {
      id: Date.now(),
      name: name.trim(),
      kind: kind as EstablishmentType,
      cuisine: cuisine.trim(),
      area: area.trim(),
      address: address.trim() || `${area}, Stockholm`,
      note: note.trim() || `Oberoende ${kind.toLowerCase()} i ${area}.`,
      tags: [...tags.split(",").map((t) => t.trim()).filter(Boolean), "Community submission", "Pending verification"],
      evidenceLabel: "Pending community submission · not independently verified",
      lifecycleState: "candidate",
      ratingAverage: 4.1,
      reliableRatingCount: 0,
      reviewCount: 0,
      categoryMeanRating: 4.1,
      categoryPopularityRaw: 0,
      localPopularityPercentile: 0.5,
      priceLevel: 2,
      mainstreamExposure: 0,
      ageDays: 1,
      daysSinceFreshEvidence: 365,
      evidence: {
        specialistGuide: 0,
        independentEditorial: 0,
        verifiedUserRating: 0,
        repeatVisits: 0,
        recentReviews: 0,
        credibleReviewers: 0,
        inspectionStatus: 0,
        verifiedAttributes: 0,
        dataFreshness: 10,
        confidence: "Low",
      },
      latitude: activePlace && activePlace.latitude != null ? activePlace.latitude + 0.002 : 59.3326 + (Math.random() - 0.5) * 0.02,
      longitude: activePlace && activePlace.longitude != null ? activePlace.longitude + 0.002 : 18.0649 + (Math.random() - 0.5) * 0.02,
      engagement: {
        searchImpressions: 0,
        profileViews: 0,
        mapMarkerClicks: 0,
        saves: 0,
        directionRequests: 0,
        confirmedVisits: 0,
        repeatVisits: 0,
        recommendations: 0,
        recentSaves: 0,
      },
      x: 50,
      y: 50,
    };

    onAddPlace(newPlace);
    onClose();
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewContent.trim()) return;
    onAddReview(selectedPlaceId, {
      author: author.trim() || "Oberoende Matälskare",
      rating,
      content: reviewContent.trim(),
      source: "Community Submission",
    });
    onClose();
  };

  const handleSubmitPhoto = (e: React.FormEvent) => {
    e.preventDefault();
    const finalUrl = photoSource === "device" ? devicePhoto?.dataUrl : photoUrl.trim();
    if (!finalUrl) return;

    const isFromDevice = photoSource === "device";
    onAddPhoto(selectedPlaceId, {
      url: finalUrl,
      thumbnailUrl: finalUrl,
      caption: caption.trim() || (lang === "sv" ? "Foto inskickat av användare" : "Photo submitted by user"),
      credit: isFromDevice
        ? (lang === "sv" ? "Uppladdat från enhet" : "Uploaded from device")
        : "Inskickat via Concierge",
    });
    onClose();
  };

  const handleSubmitRating = (e: React.FormEvent) => {
    e.preventDefault();
    onRatePlace(selectedPlaceId, rating);
    onClose();
  };

  const handleSubmitSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName.trim() || !sourceUrl.trim()) return;
    onAddSource?.({
      id: `src-${Date.now()}`,
      name: sourceName.trim(),
      url: sourceUrl.trim(),
      type: sourceType,
      license: sourceLicense.trim() || sourceModalCopy.defaultLicense,
      description: sourceDesc.trim() || sourceModalCopy.defaultDescription,
      addedByUser: true,
    });
    onClose();
  };

  return (
    <div className="superpower-modal-overlay" onClick={onClose}>
      <div className="superpower-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="superpower-modal-head">
          <h3>
            {mode === "add_place" && "➕ Lägg till nytt ställe"}
            {mode === "add_review" && "✍️ Skriv verifierad recension"}
            {mode === "add_photo" && "📷 Lägg till foto till ställe"}
            {mode === "rate_place" && "⭐ Betygsätt ställe"}
            {mode === "add_source" && sourceModalCopy.title}
          </h3>
          <button type="button" className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {mode === "add_place" && (
          <form className="superpower-form" onSubmit={handleSubmitPlace}>
            <div className="superpower-form-group">
              <label>Namn på stället *</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="t.ex. Oaxen Slip" />
            </div>
            {duplicateMatch ? (
              <div
                style={{
                  padding: "10px 14px",
                  background: "#FEF2F2",
                  border: "1px solid #F87171",
                  color: "#991B1B",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                ⚠️ Stället "{duplicateMatch.name}" finns redan i kartan ({duplicateMatch.area}).
              </div>
            ) : null}
            <div className="superpower-form-group">
              <label>Typ av ställe</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="Restaurant">Restaurant / Bistro</option>
                <option value="Specialty coffee">Specialty Coffee</option>
                <option value="Bakery">Bakery / Bageri</option>
                <option value="Café">Café / Fika</option>
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Kök / Kategori</label>
              <input type="text" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="t.ex. swedish, bakery, mexican" />
            </div>
            <div className="superpower-form-group">
              <label>Stadsdel / Område</label>
              <input type="text" value={area} onChange={(e) => setArea(e.target.value)} placeholder="t.ex. Djurgården, Vasastan, Södermalm" />
            </div>
            <div className="superpower-form-group">
              <label>Adress</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="t.ex. Beckholmsvägen 26" />
            </div>
            <div className="superpower-form-group">
              <label>Beskrivning / Notering</label>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Berätta vad som gör stället unikt..." />
            </div>
            <div className="superpower-form-group">
              <label>Startbetyg (1–5 stjärnor)</label>
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                <option value={5}>★ ★ ★ ★ ★ (5.0)</option>
                <option value={4}>★ ★ ★ ★ ☆ (4.0)</option>
                <option value={3}>★ ★ ★ ☆ ☆ (3.0)</option>
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Taggar (kommaseparerade)</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Oberoende, Ekologiskt, Sjöutsikt" />
            </div>
            <button type="submit" className="superpower-submit-btn" disabled={Boolean(duplicateMatch)} style={{ opacity: duplicateMatch ? 0.5 : 1, cursor: duplicateMatch ? "not-allowed" : "pointer" }}>
              <PlusCircle size={16} /> Publicera nytt ställe i kartan
            </button>
          </form>
        )}

        {mode === "add_review" && (
          <form className="superpower-form" onSubmit={handleSubmitReview}>
            <SearchablePlaceSelect
              places={places}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={setSelectedPlaceId}
              lang={lang}
              label={lang === "sv" ? "Välj ställe" : "Select place"}
              required
            />
            <div className="superpower-form-group">
              <label>Ditt namn / Alias</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="t.ex. Anna K." />
            </div>
            <div className="superpower-form-group">
              <label>Betyg</label>
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                <option value={5}>★ ★ ★ ★ ★ (5/5)</option>
                <option value={4}>★ ★ ★ ★ ☆ (4/5)</option>
                <option value={3}>★ ★ ★ ☆ ☆ (3/5)</option>
                <option value={2}>★ ★ ☆ ☆ ☆ (2/5)</option>
                <option value={1}>★ ☆ ☆ ☆ ☆ (1/5)</option>
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Din Recension *</label>
              <textarea rows={4} required value={reviewContent} onChange={(e) => setReviewContent(e.target.value)} placeholder="Dela din upplevelse av mat, atmosfär och service..." />
            </div>
            <button type="submit" className="superpower-submit-btn">
              <Sparkle size={16} /> Publicera Recension
            </button>
          </form>
        )}

        {mode === "add_photo" && (
          <form className="superpower-form" onSubmit={handleSubmitPhoto}>
            <SearchablePlaceSelect
              places={places}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={setSelectedPlaceId}
              lang={lang}
              label={lang === "sv" ? "Välj ställe" : "Select place"}
              required
            />

            {/* Source selector tabs */}
            <div className="superpower-source-toggle" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={photoSource === "device"}
                className={`superpower-tab-btn ${photoSource === "device" ? "is-active" : ""}`}
                onClick={() => setPhotoSource("device")}
              >
                <UploadSimple size={15} weight="bold" />
                {lang === "sv" ? "Från enhet / Kamera" : "From device / Camera"}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={photoSource === "url"}
                className={`superpower-tab-btn ${photoSource === "url" ? "is-active" : ""}`}
                onClick={() => setPhotoSource("url")}
              >
                <Link size={15} weight="bold" />
                {lang === "sv" ? "Bild-URL" : "Image URL"}
              </button>
            </div>

            {photoSource === "device" ? (
              <div className="superpower-form-group">
                <label>{lang === "sv" ? "Välj bild från enhet *" : "Choose image from device *"}</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleFileInputChange}
                />
                {devicePhoto ? (
                  <div className="superpower-photo-preview-card">
                    <img
                      src={devicePhoto.dataUrl}
                      alt={devicePhoto.name}
                      className="superpower-preview-thumbnail"
                    />
                    <div className="superpower-preview-details">
                      <span className="superpower-preview-filename" title={devicePhoto.name}>
                        {devicePhoto.name}
                      </span>
                      <span className="superpower-preview-meta">
                        {devicePhoto.sizeKb} KB · {lang === "sv" ? "Optimerad bild redo" : "Optimized image ready"}
                      </span>
                    </div>
                    <div className="superpower-preview-actions">
                      <button
                        type="button"
                        className="superpower-preview-action-btn"
                        onClick={() => fileInputRef.current?.click()}
                        title={lang === "sv" ? "Byt bild" : "Change image"}
                      >
                        {lang === "sv" ? "Byt" : "Change"}
                      </button>
                      <button
                        type="button"
                        className="superpower-preview-action-btn is-delete"
                        onClick={() => setDevicePhoto(null)}
                        title={lang === "sv" ? "Ta bort bild" : "Remove photo"}
                        aria-label={lang === "sv" ? "Ta bort bild" : "Remove photo"}
                      >
                        <Trash size={15} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`superpower-dropzone ${isDragging ? "is-dragging" : ""}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    <div className="superpower-dropzone-icon-circle">
                      <Camera size={24} weight="bold" />
                    </div>
                    <div className="superpower-dropzone-text">
                      <strong>
                        {isOptimizing
                          ? (lang === "sv" ? "Optimerar bild..." : "Optimizing image...")
                          : (lang === "sv" ? "Välj bild eller ta foto" : "Choose image or take photo")}
                      </strong>
                      <span>
                        {lang === "sv"
                          ? "Klicka för att bläddra i enheten eller dra in ett foto hit"
                          : "Click to browse device or drag & drop a photo here"}
                      </span>
                    </div>
                    <span className="superpower-dropzone-badge">
                      {lang === "sv" ? "Kamera & Galleri · JPG, PNG, WebP" : "Camera & Gallery · JPG, PNG, WebP"}
                    </span>
                  </div>
                )}
                {uploadError ? (
                  <p className="superpower-upload-error" role="alert">
                    ⚠️ {uploadError}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="superpower-form-group">
                <label>{lang === "sv" ? "Bild-URL *" : "Image URL *"}</label>
                <input
                  type="url"
                  required={photoSource === "url"}
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://..."
                />
                {photoUrl.trim().startsWith("http") ? (
                  <div className="superpower-url-preview">
                    <img
                      src={photoUrl.trim()}
                      alt="Förhandsvisning"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = "none";
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )}

            <div className="superpower-form-group">
              <label>{lang === "sv" ? "Bildtext / Bildbeskrivning" : "Caption / Description"}</label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={
                  lang === "sv"
                    ? "t.ex. Färskgräddade bullar & baristakaffe"
                    : "e.g. Freshly baked buns & barista coffee"
                }
              />
            </div>

            <button
              type="submit"
              className="superpower-submit-btn"
              disabled={isOptimizing || (photoSource === "device" ? !devicePhoto : !photoUrl.trim())}
              style={{
                opacity: (photoSource === "device" ? !devicePhoto : !photoUrl.trim()) ? 0.5 : 1,
                cursor: (photoSource === "device" ? !devicePhoto : !photoUrl.trim()) ? "not-allowed" : "pointer",
              }}
            >
              <Image size={16} />{" "}
              {isOptimizing
                ? (lang === "sv" ? "Optimerar bild..." : "Optimizing image...")
                : (lang === "sv" ? "Lägg till foto i galleriet" : "Add photo to gallery")}
            </button>
          </form>
        )}

        {mode === "rate_place" && (
          <form className="superpower-form" onSubmit={handleSubmitRating}>
            <SearchablePlaceSelect
              places={places}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={setSelectedPlaceId}
              lang={lang}
              label={lang === "sv" ? "Välj ställe" : "Select place"}
              required
            />
            <div className="superpower-form-group">
              <label>Sätt betyg (1–5 stjärnor)</label>
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                <option value={5}>★ ★ ★ ★ ★ (Fem stjärnor)</option>
                <option value={4}>★ ★ ★ ★ ☆ (Fyra stjärnor)</option>
                <option value={3}>★ ★ ★ ☆ ☆ (Tre stjärnor)</option>
                <option value={2}>★ ★ ☆ ☆ ☆ (Två stjärnor)</option>
                <option value={1}>★ ☆ ☆ ☆ ☆ (En stjärna)</option>
              </select>
            </div>
            <button type="submit" className="superpower-submit-btn">
              <Star size={16} weight="fill" /> Spara betyg
            </button>
          </form>
        )}

        {mode === "add_source" && (
          <form className="superpower-form" onSubmit={handleSubmitSource}>
            <div className="superpower-form-group">
              <label>{sourceModalCopy.nameLabel}</label>
              <input
                type="text"
                required
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder={sourceModalCopy.namePlaceholder}
              />
            </div>
            <div className="superpower-form-group">
              <label>{sourceModalCopy.urlLabel}</label>
              <input
                type="url"
                required
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="superpower-form-group">
              <label>{sourceModalCopy.typeLabel}</label>
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value as CuratedSource["type"])}>
                {curatedSourceTypes.map((type) => (
                  <option key={type} value={type}>
                    {sourceModalCopy.typeHelp[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="superpower-form-group">
              <label>{sourceModalCopy.licenseLabel}</label>
              <input
                type="text"
                value={sourceLicense}
                onChange={(e) => setSourceLicense(e.target.value)}
                placeholder={sourceModalCopy.licensePlaceholder}
              />
            </div>
            <div className="superpower-form-group">
              <label>{sourceModalCopy.descriptionLabel}</label>
              <textarea
                rows={2}
                value={sourceDesc}
                onChange={(e) => setSourceDesc(e.target.value)}
                placeholder={sourceModalCopy.descriptionPlaceholder}
              />
            </div>
            <button type="submit" className="superpower-submit-btn">
              <ShieldCheck size={16} /> {sourceModalCopy.submit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
