export type PhotoHeroFit = "contain" | "cover";

export type PhotoHeroFrame = {
  heroFocusX: number;
  heroFocusY: number;
  heroScale: number;
  heroFit: PhotoHeroFit;
};

export const DEFAULT_PHOTO_HERO_FRAME: PhotoHeroFrame = {
  heroFocusX: 50,
  heroFocusY: 50,
  heroScale: 1,
  heroFit: "contain",
};

export function clampHeroFocus(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function clampHeroScale(value: number) {
  return Math.min(3, Math.max(1, value));
}

export function parseHeroFit(value: unknown): PhotoHeroFit {
  return value === "cover" ? "cover" : "contain";
}

export function normalizePhotoHeroFrame(input?: Partial<PhotoHeroFrame> | null): PhotoHeroFrame {
  return {
    heroFocusX: clampHeroFocus(Number(input?.heroFocusX ?? DEFAULT_PHOTO_HERO_FRAME.heroFocusX)),
    heroFocusY: clampHeroFocus(Number(input?.heroFocusY ?? DEFAULT_PHOTO_HERO_FRAME.heroFocusY)),
    heroScale: clampHeroScale(Number(input?.heroScale ?? DEFAULT_PHOTO_HERO_FRAME.heroScale)),
    heroFit: parseHeroFit(input?.heroFit),
  };
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readHeroFit(value: unknown): PhotoHeroFit | undefined {
  return value === "contain" || value === "cover" ? value : undefined;
}

export function heroFrameFromRow(row?: Record<string, unknown> | null): PhotoHeroFrame {
  if (!row) return DEFAULT_PHOTO_HERO_FRAME;
  return normalizePhotoHeroFrame({
    heroFocusX: readNumber(row.heroFocusX) ?? readNumber(row.hero_focus_x),
    heroFocusY: readNumber(row.heroFocusY) ?? readNumber(row.hero_focus_y),
    heroScale: readNumber(row.heroScale) ?? readNumber(row.hero_scale),
    heroFit: readHeroFit(row.heroFit) ?? readHeroFit(row.hero_fit),
  });
}

export function heroImageStyle(frame?: Partial<PhotoHeroFrame> | null): {
  objectFit: PhotoHeroFit;
  objectPosition: string;
  transform?: string;
  transformOrigin: string;
} {
  const normalized = normalizePhotoHeroFrame(frame);
  const transformOrigin = `${normalized.heroFocusX}% ${normalized.heroFocusY}%`;
  return {
    objectFit: normalized.heroFit,
    objectPosition: `${normalized.heroFocusX}% ${normalized.heroFocusY}%`,
    transform: normalized.heroScale === 1 ? undefined : `scale(${normalized.heroScale})`,
    transformOrigin,
  };
}
