import { fetchAdminSession } from "../../lib/admin-session-client.ts";
import type { AdminAuthMode } from "../../lib/admin-auth.ts";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Language } from "./shared";
import { translations } from "./shared";
import {
  CMS_STORAGE_KEY,
  CMS_IMAGES_STORAGE_KEY,
  CMS_AUTH_KEY,
  CMS_EDIT_MODE_KEY,
  CMS_MERCH_STORAGE_KEY,
  type MerchItem,
  type CmsCopyMap,
  type CmsImageMap,
  type CmsOverrides,
  type CmsKeyMetadata,
  CMS_CATALOG,
  readStoredCmsOverrides,
  writeStoredCmsOverrides,
  readStoredCmsImages,
  writeStoredCmsImages,
  readStoredCmsEditMode,
  readStoredMerchItems,
  writeStoredMerchItems,
  resetStoredMerchItems,
  persistCmsPayloadToServer,
} from "./cms-store";

export {
  CMS_STORAGE_KEY,
  CMS_IMAGES_STORAGE_KEY,
  CMS_AUTH_KEY,
  CMS_EDIT_MODE_KEY,
  CMS_MERCH_STORAGE_KEY,
  type MerchItem,
  type CmsCopyMap,
  type CmsImageMap,
  type CmsOverrides,
  type CmsKeyMetadata,
  CMS_CATALOG,
  readStoredCmsOverrides,
  writeStoredCmsOverrides,
  readStoredCmsImages,
  writeStoredCmsImages,
  readStoredCmsEditMode,
  readStoredMerchItems,
  writeStoredMerchItems,
  resetStoredMerchItems,
  persistCmsPayloadToServer,
};

export function getBaseCopy(lang: Language, key: string): string {
  const dict = (translations[lang] || translations.sv) as Record<string, unknown>;
  const val = dict[key];
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.join("\n");
  return "";
}

import {
  ArrowCounterClockwise,
  Check,
  DownloadSimple,
  Eye,
  EyeSlash,
  Flag,
  Image as ImageIcon,
  LockKey,
  PencilSimple,
  SignOut,
  Sparkle,
  UploadSimple,
  X,
} from "@phosphor-icons/react";

export interface CmsContextType {
  t: typeof translations.sv & Record<string, string>;
  lang: Language;
  overrides: CmsOverrides;
  images: CmsImageMap;
  isCmsAdmin: boolean;
  isCmsEditMode: boolean;
  loginCms: (passcode: string) => Promise<boolean>;
  logoutCms: () => void;
  toggleCmsEditMode: () => void;
  setIsCmsEditMode: (active: boolean) => void;
  openEditor: (key: string, label?: string) => void;
  closeEditor: () => void;
  openImageEditor: (key: string, label: string, defaultSrc: string) => void;
  closeImageEditor: () => void;
  saveCopy: (key: string, sv: string, en: string) => void;
  saveImage: (key: string, url: string) => void;
  resetImageKey: (key: string) => void;
  resetCopyKey: (key: string) => void;
  resetAllCopy: () => void;
  exportCmsJson: () => string;
  importCmsJson: (json: string) => boolean;
  isLoginOpen: boolean;
  setIsLoginOpen: (open: boolean) => void;
  isOverviewOpen: boolean;
  setIsOverviewOpen: (open: boolean) => void;
  activeToast: string | null;
  setActiveToast: (msg: string | null) => void;
}

const CmsContext = createContext<CmsContextType | null>(null);

export function useCms(): CmsContextType {
  const ctx = useContext(CmsContext);
  if (!ctx) {
    throw new Error("useCms must be used within a CmsProvider");
  }
  return ctx;
}

export function CmsProvider({
  children,
  lang,
}: {
  children: React.ReactNode;
  lang: Language;
}) {
  const [overrides, setOverrides] = useState<CmsOverrides>(readStoredCmsOverrides);
  const [images, setImages] = useState<CmsImageMap>(readStoredCmsImages);
  const [isCmsAdmin, setIsCmsAdmin] = useState(false);
  const [isCmsEditMode, setIsCmsEditModeState] = useState(false);
  const authMode = useRef<AdminAuthMode | undefined>(undefined);
  const authGeneration = useRef(0);

  const isCmsRoute = useCallback(() => {
    if (typeof window === "undefined") return false;
    const url = new URL(window.location.href);
    return (
      url.pathname === "/cms" ||
      url.pathname.startsWith("/cms/") ||
      url.searchParams.has("cms") ||
      window.location.hash === "#cms"
    );
  }, []);

  const [editingItem, setEditingItem] = useState<{ key: string; label: string } | null>(null);
  const [editingImage, setEditingImage] = useState<{ key: string; label: string; defaultSrc: string } | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const url = new URL(window.location.href);
    return (
      url.searchParams.get("cms_login") === "failed" ||
      url.pathname === "/cms" ||
      url.pathname.startsWith("/cms/") ||
      url.searchParams.has("cms") ||
      window.location.hash === "#cms"
    );
  });
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      const generation = ++authGeneration.current;
      const onCmsRoute = isCmsRoute();
      try {
        const session = await fetchAdminSession(sessionStorage.getItem("motkarta_admin_token") || "");
        if (!active || generation !== authGeneration.current) return;
        authMode.current = session.authMode;
        setIsCmsAdmin(true);
        const returning = new URL(window.location.href).searchParams.get("cms_login") === "success";
        setIsCmsEditModeState(returning || onCmsRoute || readStoredCmsEditMode());
        if (returning || onCmsRoute) {
          localStorage.setItem(CMS_EDIT_MODE_KEY, "true");
        }
        if (returning) {
          const url = new URL(window.location.href);
          url.searchParams.delete("cms_login");
          window.history.replaceState(null, "", url);
        }
        if (onCmsRoute) {
          setIsLoginOpen(false);
        }
      } catch {
        if (active && generation === authGeneration.current) {
          setIsCmsAdmin(false);
          setIsCmsEditModeState(false);
          setEditingItem(null);
          setIsOverviewOpen(false);
          if (onCmsRoute) {
            setIsLoginOpen(true);
          }
        }
      }
    };
    void verify();
    window.addEventListener("motkarta:admin-session-changed", verify);
    window.addEventListener("focus", verify);
    window.addEventListener("popstate", verify);
    return () => {
      active = false;
      window.removeEventListener("motkarta:admin-session-changed", verify);
      window.removeEventListener("focus", verify);
      window.removeEventListener("popstate", verify);
    };
  }, [isCmsRoute]);

  useEffect(() => {
    let active = true;
    const hydrateFromServer = async () => {
      try {
        const res = await fetch("/api/cms", { credentials: "same-origin" });
        if (!res.ok || !active) return;
        const payload = (await res.json()) as {
          source?: string;
          overrides?: CmsOverrides;
          images?: CmsImageMap;
          merchItems?: MerchItem[] | null;
        };
        if (!active || payload.source !== "d1") return;
        if (payload.overrides && (payload.overrides.sv || payload.overrides.en)) {
          const nextOverrides: CmsOverrides = {
            sv: payload.overrides.sv ?? {},
            en: payload.overrides.en ?? {},
          };
          setOverrides(nextOverrides);
          writeStoredCmsOverrides(nextOverrides);
        }
        if (payload.images && typeof payload.images === "object") {
          setImages(payload.images);
          writeStoredCmsImages(payload.images);
        }
        if (Array.isArray(payload.merchItems) && payload.merchItems.length > 0) {
          writeStoredMerchItems(payload.merchItems);
        }
      } catch {
        // Offline / local dev without D1 — keep localStorage cache
      }
    };
    void hydrateFromServer();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CMS_STORAGE_KEY) {
        setOverrides(readStoredCmsOverrides());
      }
      if (e.key === CMS_IMAGES_STORAGE_KEY) {
        setImages(readStoredCmsImages());
      }
      if (e.key === CMS_EDIT_MODE_KEY) {
        setIsCmsEditModeState(isCmsAdmin && readStoredCmsEditMode());
      }
    };
    const handleCustom = (e: Event) => {
      const customEvent = e as CustomEvent<CmsOverrides>;
      if (customEvent.detail) {
        setOverrides(customEvent.detail);
      }
    };
    const handleImagesCustom = (e: Event) => {
      const customEvent = e as CustomEvent<CmsImageMap>;
      if (customEvent.detail) {
        setImages(customEvent.detail);
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("motkarta-cms-update", handleCustom);
    window.addEventListener("motkarta-cms-images-update", handleImagesCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("motkarta-cms-update", handleCustom);
      window.removeEventListener("motkarta-cms-images-update", handleImagesCustom);
    };
  }, [isCmsAdmin]);

  const loginCms = useCallback(async (passcode: string): Promise<boolean> => {
    const generation = ++authGeneration.current;
    try {
      const session = await fetchAdminSession(passcode.trim());
      if (generation !== authGeneration.current) return false;
      authMode.current = session.authMode;
      if (session.authMode === "token") sessionStorage.setItem("motkarta_admin_token", passcode.trim());
      localStorage.setItem(CMS_EDIT_MODE_KEY, "true");
      setIsCmsAdmin(true);
      setIsCmsEditModeState(true);
      window.dispatchEvent(new Event("motkarta:admin-session-changed"));
      setActiveToast(lang === "sv" ? "Inloggad. Redigeringsläge aktiverat." : "Signed in. Editing enabled.");
      return true;
    } catch {
      return false;
    }
  }, [lang]);

  const logoutCms = useCallback(() => {
    ++authGeneration.current;
    setIsCmsAdmin(false);
    setIsCmsEditModeState(false);
    setEditingItem(null);
    localStorage.removeItem(CMS_AUTH_KEY);
    localStorage.removeItem(CMS_EDIT_MODE_KEY);
    sessionStorage.removeItem("motkarta_admin_token");
    const mode = authMode.current;
    authMode.current = undefined;
    window.dispatchEvent(new Event("motkarta:admin-session-changed"));
    if (mode === "access_jwt" || mode === "access_header") window.location.assign("/cdn-cgi/access/logout");
    setActiveToast(lang === "sv" ? "Utloggad." : "Signed out.");
  }, [lang]);

  const toggleCmsEditMode = useCallback(() => {
    setIsCmsEditModeState((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(CMS_EDIT_MODE_KEY, String(next));
      }
      return next;
    });
  }, []);

  const setIsCmsEditMode = useCallback((active: boolean) => {
    setIsCmsEditModeState(active);
    if (typeof window !== "undefined") {
      localStorage.setItem(CMS_EDIT_MODE_KEY, String(active));
    }
  }, []);

  const openEditor = useCallback((key: string, label?: string) => {
    const found = CMS_CATALOG.find((c) => c.key === key);
    setEditingItem({ key, label: label || found?.label || key });
  }, []);

  const closeEditor = useCallback(() => {
    setEditingItem(null);
  }, []);

  const openImageEditor = useCallback((key: string, label: string, defaultSrc: string) => {
    setEditingImage({ key, label, defaultSrc });
  }, []);

  const closeImageEditor = useCallback(() => {
    setEditingImage(null);
  }, []);

  const saveCopy = useCallback((key: string, svVal: string, enVal: string) => {
    let nextSnapshot: CmsOverrides = { sv: {}, en: {} };
    setOverrides((prev) => {
      const next: CmsOverrides = {
        sv: { ...prev.sv, [key]: svVal },
        en: { ...prev.en, [key]: enVal },
      };
      nextSnapshot = next;
      writeStoredCmsOverrides(next);
      return next;
    });
    setEditingItem(null);
    setActiveToast(`Ändring sparad för "${key}" på både SV och EN! ⭐`);
    void persistCmsPayloadToServer({ overrides: nextSnapshot }).then((res) => {
      if (res.persistedToD1) {
        setActiveToast(lang === "sv" ? `"${key}" sparad i D1 för alla besökare.` : `"${key}" saved to D1 for all visitors.`);
      }
    });
  }, [lang]);

  const saveImage = useCallback((key: string, url: string) => {
    const trimmed = url.trim();
    let nextSnapshot: CmsImageMap = {};
    setImages((prev) => {
      const next = { ...prev };
      if (trimmed) next[key] = trimmed;
      else delete next[key];
      nextSnapshot = next;
      writeStoredCmsImages(next);
      return next;
    });
    setEditingImage(null);
    setActiveToast(lang === "sv" ? `Bild uppdaterad för "${key}".` : `Image updated for "${key}".`);
    void persistCmsPayloadToServer({ images: nextSnapshot }).then((res) => {
      if (res.persistedToD1) {
        setActiveToast(lang === "sv" ? `Bild "${key}" sparad i D1 för alla besökare.` : `Image "${key}" saved to D1 for all visitors.`);
      }
    });
  }, [lang]);

  const resetImageKey = useCallback((key: string) => {
    let nextSnapshot: CmsImageMap = {};
    setImages((prev) => {
      const next = { ...prev };
      delete next[key];
      nextSnapshot = next;
      writeStoredCmsImages(next);
      return next;
    });
    setEditingImage(null);
    setActiveToast(lang === "sv" ? `Bild "${key}" återställd till original.` : `Image "${key}" reset to default.`);
    void persistCmsPayloadToServer({ images: nextSnapshot });
  }, [lang]);

  const resetCopyKey = useCallback((key: string) => {
    let nextSnapshot: CmsOverrides = { sv: {}, en: {} };
    setOverrides((prev) => {
      const newSv = { ...prev.sv };
      const newEn = { ...prev.en };
      delete newSv[key];
      delete newEn[key];
      const next = { sv: newSv, en: newEn };
      nextSnapshot = next;
      writeStoredCmsOverrides(next);
      return next;
    });
    setActiveToast(`"${key}" återställd till standardtext.`);
    void persistCmsPayloadToServer({ overrides: nextSnapshot });
  }, []);

  const resetAllCopy = useCallback(() => {
    const empty: CmsOverrides = { sv: {}, en: {} };
    setOverrides(empty);
    writeStoredCmsOverrides(empty);
    setActiveToast("Alla CMS-texter återställda till original.");
    void persistCmsPayloadToServer({ overrides: empty });
  }, []);

  const exportCmsJson = useCallback((): string => {
    return JSON.stringify({ ...overrides, images }, null, 2);
  }, [overrides, images]);

  const importCmsJson = useCallback((jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && (parsed.sv || parsed.en || parsed.images)) {
        const next: CmsOverrides = {
          sv: typeof parsed.sv === "object" && parsed.sv ? parsed.sv : {},
          en: typeof parsed.en === "object" && parsed.en ? parsed.en : {},
        };
        setOverrides(next);
        writeStoredCmsOverrides(next);
        const nextImages: CmsImageMap | undefined =
          parsed.images && typeof parsed.images === "object" && !Array.isArray(parsed.images)
            ? (parsed.images as CmsImageMap)
            : undefined;
        if (nextImages) {
          setImages(nextImages);
          writeStoredCmsImages(nextImages);
        }
        setActiveToast("CMS-texter importerade framgångsrikt! ⭐");
        void persistCmsPayloadToServer({ overrides: next, ...(nextImages ? { images: nextImages } : {}) });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // Compute merged translations dictionary
  const t = useMemo(() => {
    const base = translations[lang] || translations.sv;
    const langOverrides = overrides[lang] || {};
    return { ...base, ...langOverrides } as typeof translations.sv & Record<string, string>;
  }, [lang, overrides]);

  const value: CmsContextType = {
    t,
    lang,
    overrides,
    images,
    isCmsAdmin,
    isCmsEditMode,
    loginCms,
    logoutCms,
    toggleCmsEditMode,
    setIsCmsEditMode,
    openEditor,
    closeEditor,
    openImageEditor,
    closeImageEditor,
    saveCopy,
    saveImage,
    resetImageKey,
    resetCopyKey,
    resetAllCopy,
    exportCmsJson,
    importCmsJson,
    isLoginOpen,
    setIsLoginOpen,
    isOverviewOpen,
    setIsOverviewOpen,
    activeToast,
    setActiveToast,
  };

  return (
    <CmsContext.Provider value={value}>
      {children}

      {/* Editing single item modal */}
      {editingItem && (
        <CmsEditorModal
          itemKey={editingItem.key}
          label={editingItem.label}
          overrides={overrides}
          onClose={closeEditor}
          onSave={saveCopy}
          onResetKey={resetCopyKey}
          currentLang={lang}
        />
      )}

      {/* Editing on-page image modal */}
      {editingImage && (
        <CmsImageEditorModal
          imageKey={editingImage.key}
          label={editingImage.label}
          defaultSrc={editingImage.defaultSrc}
          currentSrc={images[editingImage.key]}
          onClose={closeImageEditor}
          onSave={saveImage}
          onReset={resetImageKey}
          lang={lang}
        />
      )}

      {/* Login Modal */}
      {isLoginOpen && (
        <CmsLoginModal
          onClose={() => {
            setIsLoginOpen(false);
            if (isCmsRoute()) {
              const url = new URL(window.location.href);
              if (url.pathname === "/cms" || url.pathname.startsWith("/cms/")) {
                window.history.replaceState(null, "", "/" + (url.search || ""));
              }
            }
          }}
          onLogin={async (pass) => {
            const ok = await loginCms(pass);
            if (ok) {
              setIsLoginOpen(false);
              if (isCmsRoute()) {
                const url = new URL(window.location.href);
                if (url.pathname === "/cms" || url.pathname.startsWith("/cms/")) {
                  window.history.replaceState(null, "", "/" + (url.search || ""));
                }
              }
            }
            return ok;
          }}
          lang={lang}
        />
      )}

      {/* Full Overview Modal */}
      {isOverviewOpen && (
        <CmsOverviewModal
          onClose={() => setIsOverviewOpen(false)}
          overrides={overrides}
          onOpenEditor={openEditor}
          onResetAll={resetAllCopy}
          onExport={exportCmsJson}
          onImport={importCmsJson}
          onLogout={logoutCms}
          lang={lang}
        />
      )}

      {/* Floating helper toolbar when edit mode is active */}
      {isCmsAdmin && isCmsEditMode && (
        <CmsFloatingBar
          overridesCount={Object.keys(overrides.sv || {}).length + Object.keys(overrides.en || {}).length}
          onOpenOverview={() => setIsOverviewOpen(true)}
          onHideFlags={() => setIsCmsEditModeState(false)}
          onLogout={logoutCms}
          lang={lang}
        />
      )}

      {/* Ephemeral Toast Notification */}
      {activeToast && (
        <div className="cms-toast" role="status" aria-live="polite">
          <span>{activeToast}</span>
          <button type="button" onClick={() => setActiveToast(null)}>✕</button>
        </div>
      )}
    </CmsContext.Provider>
  );
}

export function CmsEditFlag({
  cmsKey,
  label,
  className = "",
}: {
  cmsKey: string;
  label?: string;
  className?: string;
}) {
  const { isCmsEditMode, openEditor } = useCms();
  if (!isCmsEditMode) return null;

  return (
    <button
      type="button"
      className={`cms-edit-flag ${className}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openEditor(cmsKey, label);
      }}
      title={`Redigera "${label || cmsKey}" (SV/EN)`}
      aria-label={`Redigera ${label || cmsKey}`}
      data-testid={`cms-flag-${cmsKey}`}
    >
      <span className="cms-edit-flag-symbol" aria-hidden="true">🚩</span>
      <span className="cms-edit-flag-tag">Edit</span>
    </button>
  );
}

function CmsEditorModal({
  itemKey,
  label,
  overrides,
  onClose,
  onSave,
  onResetKey,
  currentLang,
}: {
  itemKey: string;
  label: string;
  overrides: CmsOverrides;
  onClose: () => void;
  onSave: (key: string, sv: string, en: string) => void;
  onResetKey: (key: string) => void;
  currentLang: Language;
}) {
  const defaultSv = getBaseCopy("sv", itemKey);
  const defaultEn = getBaseCopy("en", itemKey);

  const [svVal, setSvVal] = useState<string>(overrides.sv[itemKey] ?? defaultSv);
  const [enVal, setEnVal] = useState<string>(overrides.en[itemKey] ?? defaultEn);

  const meta = CMS_CATALOG.find((c) => c.key === itemKey);
  const isMultiline = meta?.multiline || defaultSv.length > 60 || defaultEn.length > 60;

  const hasOverride = Boolean(overrides.sv[itemKey] || overrides.en[itemKey]);

  return (
    <div className="cms-modal-overlay" onClick={onClose}>
      <div
        className="cms-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cms-editor-title"
      >
        <div className="cms-modal-header">
          <div className="cms-modal-title-group">
            <span className="cms-modal-badge">🚩 CMS REDIGERING</span>
            <h3 id="cms-editor-title">{label || itemKey}</h3>
            <span className="cms-modal-key-code"><code>{itemKey}</code></span>
          </div>
          <button type="button" className="icon-btn cms-close-btn" onClick={onClose} aria-label="Stäng">
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="cms-modal-body">
          <div className="cms-field-block">
            <div className="cms-field-header">
              <label htmlFor="cms-input-sv">
                <span className="cms-lang-flag">🇸🇪</span> <strong>Svenska (SV)</strong>
              </label>
              {svVal !== defaultSv && (
                <button
                  type="button"
                  className="cms-field-reset-link"
                  onClick={() => setSvVal(defaultSv)}
                >
                  Återställ standard
                </button>
              )}
            </div>
            {isMultiline ? (
              <textarea
                id="cms-input-sv"
                rows={4}
                className="cms-textarea"
                value={svVal}
                onChange={(e) => setSvVal(e.target.value)}
                placeholder="Skriv text på svenska..."
                data-testid="cms-input-sv"
              />
            ) : (
              <input
                id="cms-input-sv"
                type="text"
                className="cms-input"
                value={svVal}
                onChange={(e) => setSvVal(e.target.value)}
                placeholder="Skriv text på svenska..."
                data-testid="cms-input-sv"
              />
            )}
            <div className="cms-field-footer">
              <small>{svVal.length} tecken</small>
            </div>
          </div>

          <div className="cms-field-block">
            <div className="cms-field-header">
              <label htmlFor="cms-input-en">
                <span className="cms-lang-flag">🇬🇧</span> <strong>English (EN)</strong>
              </label>
              {enVal !== defaultEn && (
                <button
                  type="button"
                  className="cms-field-reset-link"
                  onClick={() => setEnVal(defaultEn)}
                >
                  Reset to default
                </button>
              )}
            </div>
            {isMultiline ? (
              <textarea
                id="cms-input-en"
                rows={4}
                className="cms-textarea"
                value={enVal}
                onChange={(e) => setEnVal(e.target.value)}
                placeholder="Write copy in English..."
                data-testid="cms-input-en"
              />
            ) : (
              <input
                id="cms-input-en"
                type="text"
                className="cms-input"
                value={enVal}
                onChange={(e) => setEnVal(e.target.value)}
                placeholder="Write copy in English..."
                data-testid="cms-input-en"
              />
            )}
            <div className="cms-field-footer">
              <small>{enVal.length} characters</small>
            </div>
          </div>
        </div>

        <div className="cms-modal-actions">
          {hasOverride && (
            <button
              type="button"
              className="cms-btn-danger"
              onClick={() => {
                onResetKey(itemKey);
                onClose();
              }}
            >
              <ArrowCounterClockwise size={14} weight="bold" /> Återställ båda
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            <button type="button" className="cms-btn-secondary" onClick={onClose} data-testid="cms-cancel-btn">
              Avbryt
            </button>
            <button
              type="button"
              className="cms-btn-primary"
              onClick={() => onSave(itemKey, svVal, enVal)}
              data-testid="cms-save-btn"
            >
              <Check size={16} weight="bold" /> Spara för SV & EN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CmsLoginModal({
  onClose,
  onLogin,
  lang,
}: {
  onClose: () => void;
  onLogin: (passcode: string) => Promise<boolean>;
  lang: Language;
}) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState(() => new URL(window.location.href).searchParams.get("cms_login") === "failed");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await onLogin(passcode);
    setBusy(false);
    if (!ok) {
      setError(true);
    }
  };

  const isSv = lang === "sv";

  return (
    <div className="cms-modal-overlay" onClick={onClose}>
      <div
        className="cms-modal-card cms-login-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cms-login-title"
      >
        <div className="cms-modal-header">
          <div className="cms-modal-title-group">
            <span className="cms-modal-badge">🔐 ADMINISTRATÖR</span>
            <h3 id="cms-login-title">MOTKARTA Admin Light CMS</h3>
          </div>
          <button type="button" className="icon-btn cms-close-btn" onClick={onClose} aria-label="Stäng">
            <X size={18} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="cms-login-form">
          <p className="cms-login-desc">
            {isSv
              ? "Logga in med ditt godkända Cloudflare Access-konto. Text- och bildändringar sparas permanent i D1 för alla besökare."
              : "Sign in with your approved Cloudflare Access account. Copy and image edits are saved persistently to D1 for all visitors."}
          </p>

          <div className="cms-form-group">
            <label htmlFor="cms-passcode-input">
              {isSv ? "Admin-token (alternativ)" : "Admin token (alternative)"}
            </label>
            <input
              id="cms-passcode-input"
              type="password"
              className="cms-input"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                setError(false);
              }}
              placeholder={isSv ? "Din serverkonfigurerade admin-token" : "Your server-configured admin token"}
              autoFocus
              data-testid="cms-login-passcode-input"
            />
            {error && (
              <span className="cms-error-msg" role="alert">
                {isSv ? "Inloggningen kunde inte verifieras. Använd Cloudflare-inloggningen eller en giltig admin-token." : "Sign-in could not be verified. Use Cloudflare sign-in or a valid admin token."}
              </span>
            )}
          </div>

          <div className="cms-login-actions">
            <button
              type="button"
              className="cms-btn-ghost-demo"
              onClick={() => window.location.assign("/api/admin/login")}
              data-testid="cms-cloudflare-login-btn"
            >
              <LockKey size={14} weight="bold" /> {isSv ? "Logga in med Cloudflare" : "Sign in with Cloudflare"}
            </button>
            <button
              type="submit"
              className="cms-btn-primary"
              disabled={busy || !passcode.trim()}
              data-testid="cms-login-submit-btn"
            >
              <LockKey size={16} weight="bold" /> {busy ? (isSv ? "Verifierar..." : "Verifying...") : (isSv ? "Logga in med token" : "Sign in with token")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CmsOverviewModal({
  onClose,
  overrides,
  onOpenEditor,
  onResetAll,
  onExport,
  onImport,
  onLogout,
  lang,
}: {
  onClose: () => void;
  overrides: CmsOverrides;
  onOpenEditor: (key: string, label?: string) => void;
  onResetAll: () => void;
  onExport: () => string;
  onImport: (json: string) => boolean;
  onLogout: () => void;
  lang: Language;
}) {
  const [filter, setFilter] = useState("");
  const [importJsonText, setImportJsonText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const sections = Array.from(new Set(CMS_CATALOG.map((c) => c.section)));

  const filteredCatalog = CMS_CATALOG.filter((item) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    const svText = overrides.sv[item.key] || getBaseCopy("sv", item.key);
    const enText = overrides.en[item.key] || getBaseCopy("en", item.key);
    return (
      item.key.toLowerCase().includes(q) ||
      item.label.toLowerCase().includes(q) ||
      item.section.toLowerCase().includes(q) ||
      svText.toLowerCase().includes(q) ||
      enText.toLowerCase().includes(q)
    );
  });

  const modifiedCount =
    Object.keys(overrides.sv || {}).length + Object.keys(overrides.en || {}).length;

  return (
    <div className="cms-modal-overlay" onClick={onClose}>
      <div
        className="cms-modal-card cms-overview-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cms-overview-title"
      >
        <div className="cms-modal-header">
          <div className="cms-modal-title-group">
            <span className="cms-modal-badge">📑 CMS ÖVERSIKT</span>
            <h3 id="cms-overview-title">Alla texter på sajten (SV / EN)</h3>
            <span className="cms-modal-subcount">
              {modifiedCount} anpassade texter
            </span>
          </div>
          <button type="button" className="icon-btn cms-close-btn" onClick={onClose} aria-label="Stäng">
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="cms-overview-toolbar">
          <input
            type="text"
            className="cms-search-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Sök efter rubrik, text eller nyckel..."
          />
          <div className="cms-toolbar-actions">
            <button
              type="button"
              className="cms-btn-secondary"
              onClick={() => {
                const data = onExport();
                navigator.clipboard?.writeText(data);
                alert("CMS-data kopierad till urklipp som JSON!");
              }}
            >
              <DownloadSimple size={14} weight="bold" /> Exportera JSON
            </button>
            <button
              type="button"
              className="cms-btn-secondary"
              onClick={() => setShowImport((prev) => !prev)}
            >
              <UploadSimple size={14} weight="bold" /> Importera
            </button>
            {modifiedCount > 0 && (
              <button
                type="button"
                className="cms-btn-danger"
                onClick={() => {
                  if (confirm("Är du säker på att du vill återställa alla texter till original?")) {
                    onResetAll();
                  }
                }}
              >
                <ArrowCounterClockwise size={14} weight="bold" /> Återställ alla
              </button>
            )}
            <button
              type="button"
              className="cms-btn-secondary is-logout"
              onClick={() => {
                onClose();
                onLogout();
              }}
              data-testid="cms-overview-logout-btn"
              title={lang === "sv" ? "Logga ut från CMS" : "Sign out from CMS"}
              style={{ color: "#dc2626", borderColor: "#fecaca" }}
            >
              <SignOut size={14} weight="bold" /> {lang === "sv" ? "Logga ut" : "Sign out"}
            </button>
          </div>
        </div>

        {showImport && (
          <div className="cms-import-panel">
            <h4>Klistra in exporterad CMS JSON</h4>
            <textarea
              className="cms-textarea"
              rows={3}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='{"sv": { ... }, "en": { ... }}'
            />
            <button
              type="button"
              className="cms-btn-primary"
              onClick={() => {
                const ok = onImport(importJsonText);
                if (ok) {
                  setShowImport(false);
                  setImportJsonText("");
                } else {
                  alert("Ogiltig JSON-struktur.");
                }
              }}
            >
              Verkställ import
            </button>
          </div>
        )}

        <div className="cms-overview-list">
          {sections.map((sec) => {
            const items = filteredCatalog.filter((c) => c.section === sec);
            if (!items.length) return null;

            return (
              <div key={sec} className="cms-section-group">
                <h4 className="cms-section-title">{sec}</h4>
                <div className="cms-table">
                  {items.map((item) => {
                    const svText = overrides.sv[item.key] || getBaseCopy("sv", item.key);
                    const enText = overrides.en[item.key] || getBaseCopy("en", item.key);
                    const isOverridden = Boolean(overrides.sv[item.key] || overrides.en[item.key]);

                    return (
                      <div
                        key={item.key}
                        className={`cms-row ${isOverridden ? "is-modified" : ""}`}
                      >
                        <div className="cms-row-info">
                          <div className="cms-row-meta">
                            <strong>{item.label}</strong>
                            <code>{item.key}</code>
                            {isOverridden && <span className="cms-modified-pill">Anpassad</span>}
                          </div>
                          <div className="cms-row-preview">
                            <div className="cms-preview-line">
                              <span className="cms-lang-flag">🇸🇪</span>
                              <span>{svText}</span>
                            </div>
                            <div className="cms-preview-line">
                              <span className="cms-lang-flag">🇬🇧</span>
                              <span>{enText}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="cms-row-edit-btn"
                          onClick={() => onOpenEditor(item.key, item.label)}
                          data-testid={`cms-overview-edit-${item.key}`}
                        >
                          <PencilSimple size={14} weight="bold" /> Ändra
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CmsFloatingBar({
  overridesCount,
  onOpenOverview,
  onHideFlags,
  onLogout,
  lang,
}: {
  overridesCount: number;
  onOpenOverview: () => void;
  onHideFlags: () => void;
  onLogout: () => void;
  lang: Language;
}) {
  const isSv = lang === "sv";
  return (
    <aside className="cms-floating-bar" role="region" aria-label="CMS toolbar">
      <div className="cms-floating-info">
        <span className="cms-floating-flag" aria-hidden="true">🚩</span>
        <div className="cms-floating-text">
          <strong>{isSv ? "CMS Redigeringsläge aktivt" : "CMS Edit Mode active"}</strong>
          <small>
            {isSv
              ? "Klicka på 🚩 bredvid text på sajten för att redigera SV & EN"
              : "Click 🚩 beside copy to edit SV & EN"}
          </small>
        </div>
      </div>
      <div className="cms-floating-actions">
        <button
          type="button"
          className="cms-floating-btn"
          onClick={onOpenOverview}
          data-testid="cms-floating-overview-btn"
        >
          📑 {isSv ? "Alla texter" : "All Copy"} {overridesCount > 0 ? `(${overridesCount})` : ""}
        </button>
        <button
          type="button"
          className="cms-floating-btn-ghost"
          onClick={onHideFlags}
          title={isSv ? "Dölj flaggor tillfälligt" : "Hide flags temporarily"}
        >
          <EyeSlash size={14} weight="bold" /> {isSv ? "Dölj flaggor" : "Hide flags"}
        </button>
        <button
          type="button"
          className="cms-floating-btn-logout"
          onClick={onLogout}
          data-testid="cms-floating-logout-btn"
          title={isSv ? "Logga ut från CMS" : "Sign out from CMS"}
        >
          <SignOut size={14} weight="bold" /> {isSv ? "Logga ut" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}

export function CmsFooterControls() {
  const {
    isCmsAdmin,
    isCmsEditMode,
    toggleCmsEditMode,
    setIsLoginOpen,
    setIsOverviewOpen,
    logoutCms,
    lang,
  } = useCms();

  const isSv = lang === "sv";

  if (!isCmsAdmin) {
    return null;
  }

  return (
    <div className="footer-cms-box is-authenticated" data-testid="footer-cms-box">
      <div className="footer-cms-controls">
        <span className="footer-cms-status-pill">
          <span className="status-dot"></span> CMS Admin
        </span>
        <button
          type="button"
          className={`footer-cms-toggle-btn ${isCmsEditMode ? "is-active" : ""}`}
          onClick={toggleCmsEditMode}
          data-testid="footer-cms-toggle-btn"
        >
          {isCmsEditMode ? <Eye size={13} weight="bold" /> : <EyeSlash size={13} weight="bold" />}
          <span>{isCmsEditMode ? (isSv ? "Flaggor: PÅ" : "Flags: ON") : (isSv ? "Flaggor: AV" : "Flags: OFF")}</span>
        </button>
        <button
          type="button"
          className="footer-cms-overview-btn"
          onClick={() => setIsOverviewOpen(true)}
          data-testid="footer-cms-manage-btn"
        >
          📑 {isSv ? "Hantera texter" : "Manage copy"}
        </button>
        <button
          type="button"
          className="footer-cms-logout-btn"
          onClick={logoutCms}
          data-testid="footer-cms-logout-btn"
          title={isSv ? "Logga ut från CMS" : "Log out from CMS"}
        >
          <SignOut size={13} weight="bold" />
        </button>
      </div>
    </div>
  );
}

export function CmsImageEditFlag({
  imageKey,
  label,
  defaultSrc,
  className = "",
}: {
  imageKey: string;
  label: string;
  defaultSrc: string;
  className?: string;
}) {
  const { isCmsAdmin, isCmsEditMode, openImageEditor, lang } = useCms();
  if (!isCmsAdmin || !isCmsEditMode) return null;
  const isSv = lang === "sv";
  return (
    <button
      type="button"
      className={`cms-edit-flag cms-image-edit-flag ${className}`.trim()}
      data-testid={`cms-image-flag-${imageKey}`}
      title={isSv ? `Byt bild: ${label}` : `Edit image: ${label}`}
      aria-label={isSv ? `Byt bild: ${label}` : `Edit image: ${label}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openImageEditor(imageKey, label, defaultSrc);
      }}
    >
      <ImageIcon size={13} weight="bold" />
      <span>{isSv ? "Byt bild" : "Edit image"}</span>
    </button>
  );
}

function compressImageFileToDataUrl(file: File, maxWidth = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image file"));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const webp = canvas.toDataURL("image/webp", 0.82);
        if (webp.startsWith("data:image/webp")) {
          resolve(webp);
        } else {
          resolve(canvas.toDataURL("image/jpeg", 0.84));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function CmsImageEditorModal({
  imageKey,
  label,
  defaultSrc,
  currentSrc,
  onClose,
  onSave,
  onReset,
  lang,
}: {
  imageKey: string;
  label: string;
  defaultSrc: string;
  currentSrc?: string;
  onClose: () => void;
  onSave: (key: string, url: string) => void;
  onReset: (key: string) => void;
  lang: Language;
}) {
  const isSv = lang === "sv";
  const [urlValue, setUrlValue] = useState(currentSrc || "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const previewSrc = urlValue.trim() || defaultSrc;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      if (dataUrl.length > 1_400_000) {
        setUploadError(isSv ? "Bilden är för stor efter komprimering. Välj en mindre bild eller ange en URL." : "Image is too large after compression. Choose a smaller file or provide a URL.");
      } else {
        setUrlValue(dataUrl);
      }
    } catch {
      setUploadError(isSv ? "Kunde inte läsa bildfilen." : "Could not read image file.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="cms-modal-overlay" onClick={onClose}>
      <div
        className="cms-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cms-image-editor-title"
      >
        <div className="cms-modal-header">
          <div className="cms-modal-title-group">
            <span className="cms-modal-badge">
              <ImageIcon size={13} weight="bold" /> CMS BILD
            </span>
            <h3 id="cms-image-editor-title">{label}</h3>
            <code className="cms-key-tag">{imageKey}</code>
          </div>
          <button type="button" className="icon-btn cms-close-btn" onClick={onClose} aria-label={isSv ? "Stäng" : "Close"}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="cms-modal-body">
          <div className="cms-image-editor-preview">
            <img src={previewSrc} alt={label} />
          </div>

          <div className="cms-form-group">
            <label htmlFor="cms-image-url-input">
              {isSv ? "Bild-URL (https://... eller /sökväg)" : "Image URL (https://... or /path)"}
            </label>
            <input
              id="cms-image-url-input"
              type="text"
              className="cms-input"
              value={urlValue}
              onChange={(e) => {
                setUrlValue(e.target.value);
                setUploadError(null);
              }}
              placeholder={defaultSrc}
              data-testid="cms-image-url-input"
            />
          </div>

          <div className="cms-form-group">
            <label htmlFor="cms-image-file-input">
              {isSv ? "Eller ladda upp från enhet (komprimeras & sparas i D1):" : "Or upload from device (compressed & saved to D1):"}
            </label>
            <input
              id="cms-image-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => void handleFileChange(e)}
              disabled={uploading}
              data-testid="cms-image-file-input"
            />
            {uploadError ? <span className="cms-error-msg" role="alert">{uploadError}</span> : null}
          </div>
        </div>

        <div className="cms-modal-footer">
          <button
            type="button"
            className="cms-reset-btn"
            onClick={() => onReset(imageKey)}
            disabled={!currentSrc}
            data-testid="cms-image-reset-btn"
          >
            <ArrowCounterClockwise size={14} weight="bold" />
            {isSv ? "Återställ original" : "Reset default"}
          </button>
          <div className="cms-modal-footer-right">
            <button type="button" className="cms-cancel-btn" onClick={onClose}>
              {isSv ? "Avbryt" : "Cancel"}
            </button>
            <button
              type="button"
              className="cms-save-btn"
              disabled={uploading}
              onClick={() => onSave(imageKey, urlValue)}
              data-testid="cms-image-save-btn"
            >
              <Check size={14} weight="bold" />
              {isSv ? "Spara bild" : "Save image"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
