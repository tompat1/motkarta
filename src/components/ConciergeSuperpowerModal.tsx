import React, { useMemo, useState } from "react";
import type { EstablishmentType, PlaceInput } from "../../lib/scoring";
import type { CuratedSource, Language, SuperpowerMode } from "../app/shared";
import { curatedSourceTypes } from "../app/shared";
import { Image, PlusCircle, ShieldCheck, Sparkle, Star } from "@phosphor-icons/react";

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
}) {
  const [selectedPlaceId, setSelectedPlaceId] = useState<number>(activePlace ? activePlace.id : (places[0]?.id ?? 1));

  // Place form fields
  const [name, setName] = useState("");
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
  const [photoUrl, setPhotoUrl] = useState("");
  const [caption, setCaption] = useState("");

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
    if (!photoUrl.trim()) return;
    onAddPhoto(selectedPlaceId, {
      url: photoUrl.trim(),
      thumbnailUrl: photoUrl.trim(),
      caption: caption.trim() || "Foto inskickat av användare",
      credit: "Inskickat via Concierge",
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
            <div className="superpower-form-group">
              <label>Välj ställe *</label>
              <select value={selectedPlaceId} onChange={(e) => setSelectedPlaceId(Number(e.target.value))}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.area})
                  </option>
                ))}
              </select>
            </div>
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
            <div className="superpower-form-group">
              <label>Välj ställe *</label>
              <select value={selectedPlaceId} onChange={(e) => setSelectedPlaceId(Number(e.target.value))}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.area})
                  </option>
                ))}
              </select>
            </div>
            <div className="superpower-form-group">
              <label>Bild-URL *</label>
              <input type="url" required value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="superpower-form-group">
              <label>Bildtext / Bildbeskrivning</label>
              <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="t.ex. Färskgräddade bullar & baristakaffe" />
            </div>
            <button type="submit" className="superpower-submit-btn">
              <Image size={16} /> Lägg till foto i galleriet
            </button>
          </form>
        )}

        {mode === "rate_place" && (
          <form className="superpower-form" onSubmit={handleSubmitRating}>
            <div className="superpower-form-group">
              <label>Välj ställe *</label>
              <select value={selectedPlaceId} onChange={(e) => setSelectedPlaceId(Number(e.target.value))}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.area})
                  </option>
                ))}
              </select>
            </div>
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
