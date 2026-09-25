import React, { useRef } from "react";
import type { Language } from "../app/shared";
import { kindFilterLabel } from "../app/shared";
import {
  DEFAULT_PHOTO_HERO_FRAME,
  clampHeroFocus,
  heroImageStyle,
  normalizePhotoHeroFrame,
  type PhotoHeroFrame,
} from "../../lib/photo-hero-frame";

export type AdminPlacePreview = {
  name: string;
  kind: string;
  area: string;
  cuisine?: string | null;
};

type Props = {
  imageUrl: string;
  frame: PhotoHeroFrame;
  onFrameChange: (frame: PhotoHeroFrame) => void;
  placePreview?: AdminPlacePreview;
  lang: Language;
};

export function AdminPhotoHeroEditor({ imageUrl, frame, onFrameChange, placePreview, lang }: Props) {
  const dragRef = useRef<{ x: number; y: number; focusX: number; focusY: number } | null>(null);
  const normalized = normalizePhotoHeroFrame(frame);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      focusX: normalized.heroFocusX,
      focusY: normalized.heroFocusY,
    };
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - dragRef.current.x) / rect.width) * 100;
    const deltaY = ((event.clientY - dragRef.current.y) / rect.height) * 100;
    onFrameChange(normalizePhotoHeroFrame({
      ...normalized,
      heroFocusX: clampHeroFocus(dragRef.current.focusX - deltaX),
      heroFocusY: clampHeroFocus(dragRef.current.focusY - deltaY),
    }));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const imageStyle = heroImageStyle(normalized);

  return (
    <div className="admin-photo-hero-editor">
      <div className="admin-photo-hero-editor-head">
        <strong>{lang === "sv" ? "Hero-ram" : "Hero frame"}</strong>
        <span>{lang === "sv" ? "Dra för att flytta · zooma för storlek" : "Drag to reposition · zoom for size"}</span>
      </div>
      <div
        className="admin-photo-hero-frame"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="img"
        aria-label={lang === "sv" ? "Justera hero-bildens position" : "Adjust hero image position"}
      >
        <img src={imageUrl} alt="" style={imageStyle} draggable={false} />
        <span className="admin-photo-hero-frame-hint">
          {lang === "sv" ? "Dra bilden" : "Drag image"}
        </span>
      </div>
      <div className="admin-photo-hero-controls">
        <label>
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={2.5}
            step={0.05}
            value={normalized.heroScale}
            onChange={(event) => onFrameChange(normalizePhotoHeroFrame({
              ...normalized,
              heroScale: Number(event.target.value),
            }))}
          />
          <output>{normalized.heroScale.toFixed(2)}×</output>
        </label>
        <div className="admin-photo-hero-fit-toggle" role="group" aria-label={lang === "sv" ? "Anpassning" : "Fit mode"}>
          <button
            type="button"
            className={normalized.heroFit === "contain" ? "is-active" : ""}
            onClick={() => onFrameChange(normalizePhotoHeroFrame({ ...normalized, heroFit: "contain" }))}
          >
            {lang === "sv" ? "Visa hela" : "Show full"}
          </button>
          <button
            type="button"
            className={normalized.heroFit === "cover" ? "is-active" : ""}
            onClick={() => onFrameChange(normalizePhotoHeroFrame({ ...normalized, heroFit: "cover" }))}
          >
            {lang === "sv" ? "Fyll ruta" : "Fill frame"}
          </button>
        </div>
        <button
          type="button"
          className="admin-photo-hero-reset"
          onClick={() => onFrameChange(DEFAULT_PHOTO_HERO_FRAME)}
        >
          {lang === "sv" ? "Återställ" : "Reset"}
        </button>
      </div>
      {placePreview ? (
        <div className="admin-place-card-preview-wrap">
          <div className="admin-place-card-preview-label">
            {lang === "sv" ? "Förhandsvisning: kartkort" : "Preview: map card"}
          </div>
          <article className="admin-place-card-preview map-card" aria-hidden="true">
            <div className="map-card-header">
              <div className="map-card-title-meta">
                <span className="map-card-kind-badge">
                  {kindFilterLabel(placePreview.kind, lang)} · {placePreview.area}
                </span>
                <h3 className="map-card-header-title">{placePreview.name}</h3>
              </div>
            </div>
            <div className="map-card-body">
              {placePreview.cuisine ? <p className="cuisine-line">{placePreview.cuisine}</p> : null}
              <div className="map-card-photo-container">
                <img
                  src={imageUrl}
                  alt=""
                  className="map-card-hero-photo"
                  style={imageStyle}
                  draggable={false}
                />
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </div>
  );
}
