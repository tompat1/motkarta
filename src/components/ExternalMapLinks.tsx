import type { PlaceInput } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { translations } from "../app/shared";
import { ArrowSquareOut, Compass, Globe, MapPin, MapTrifold } from "@phosphor-icons/react";

export function ExternalMapLinks({
  place,
  lang = "sv",
  onDirectionRequest,
}: {
  place: PlaceInput;
  lang?: Language;
  onDirectionRequest?: () => void;
}) {
  const t = translations[lang];
  const queryText = encodeURIComponent(`${place.name} ${place.address || place.area || ""} Stockholm`);

  const googleMapsUrl =
    place.latitude && place.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${queryText}&query_place_id=${place.latitude},${place.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${queryText}`;

  const appleMapsUrl =
    place.latitude && place.longitude
      ? `https://maps.apple.com/?q=${encodeURIComponent(place.name)}&ll=${place.latitude},${place.longitude}`
      : `https://maps.apple.com/?q=${queryText}`;

  const osmUrl =
    place.latitude && place.longitude
      ? `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=17/${place.latitude}/${place.longitude}`
      : `https://www.openstreetmap.org/search?query=${queryText}`;

  return (
    <div
      className="external-map-actions"
      style={{
        marginTop: "12px",
        paddingTop: "12px",
        borderTop: "1px solid var(--color-mist)",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-stone)",
        }}
      >
        {t.openMapIn}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onDirectionRequest}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 10px",
            background: "var(--color-white)",
            border: "1px solid var(--color-mist)",
            color: "var(--color-ink)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <MapPin size={13} weight="fill" style={{ color: "var(--color-signal)" }} />
          Google Maps
          <ArrowSquareOut size={12} weight="bold" />
        </a>
        <a
          href={appleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onDirectionRequest}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 10px",
            background: "var(--color-white)",
            border: "1px solid var(--color-mist)",
            color: "var(--color-ink)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <Compass size={13} weight="fill" style={{ color: "var(--color-water)" }} />
          Apple Maps
          <ArrowSquareOut size={12} weight="bold" />
        </a>
        <a
          href={osmUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onDirectionRequest}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "6px 10px",
            background: "var(--color-white)",
            border: "1px solid var(--color-mist)",
            color: "var(--color-ink)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <MapTrifold size={13} weight="fill" style={{ color: "var(--color-water)" }} />
          OpenStreetMap
          <ArrowSquareOut size={12} weight="bold" />
        </a>
        {place.website ? (
          <a
            href={place.website.startsWith("http") ? place.website : `https://${place.website}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 10px",
              background: "var(--color-white)",
              border: "1px solid var(--color-mist)",
              color: "var(--color-water)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Globe size={13} weight="bold" />
            {lang === "sv" ? "Hemsida" : "Website"}
            <ArrowSquareOut size={12} weight="bold" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
