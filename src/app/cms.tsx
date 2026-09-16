import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Language } from "./shared";
import { translations } from "./shared";
import {
  CMS_STORAGE_KEY,
  CMS_AUTH_KEY,
  CMS_EDIT_MODE_KEY,
  type CmsCopyMap,
  type CmsOverrides,
  type CmsKeyMetadata,
  CMS_CATALOG,
  readStoredCmsOverrides,
  writeStoredCmsOverrides,
  readStoredCmsAuth,
  readStoredCmsEditMode,
  isCmsPasscodeValid,
} from "./cms-store";

export {
  CMS_STORAGE_KEY,
  CMS_AUTH_KEY,
  CMS_EDIT_MODE_KEY,
  type CmsCopyMap,
  type CmsOverrides,
  type CmsKeyMetadata,
  CMS_CATALOG,
  readStoredCmsOverrides,
  writeStoredCmsOverrides,
  readStoredCmsAuth,
  readStoredCmsEditMode,
  isCmsPasscodeValid,
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
  isCmsAdmin: boolean;
  isCmsEditMode: boolean;
  loginCms: (passcode: string) => boolean;
  logoutCms: () => void;
  toggleCmsEditMode: () => void;
  setIsCmsEditMode: (active: boolean) => void;
  openEditor: (key: string, label?: string) => void;
  closeEditor: () => void;
  saveCopy: (key: string, sv: string, en: string) => void;
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
  initialAdmin = false,
}: {
  children: React.ReactNode;
  lang: Language;
  initialAdmin?: boolean;
}) {
  const [overrides, setOverrides] = useState<CmsOverrides>(readStoredCmsOverrides);
  const [isCmsAdmin, setIsCmsAdmin] = useState<boolean>(() => initialAdmin || readStoredCmsAuth());
  const [isCmsEditMode, setIsCmsEditModeState] = useState<boolean>(() => {
    return (initialAdmin || readStoredCmsAuth()) && readStoredCmsEditMode();
  });

  const [editingItem, setEditingItem] = useState<{ key: string; label: string } | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<string | null>(null);

  useEffect(() => {
    if (initialAdmin && !isCmsAdmin) {
      setIsCmsAdmin(true);
      if (typeof window !== "undefined") {
        localStorage.setItem(CMS_AUTH_KEY, "true");
      }
    }
  }, [initialAdmin, isCmsAdmin]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CMS_STORAGE_KEY) {
        setOverrides(readStoredCmsOverrides());
      }
      if (e.key === CMS_AUTH_KEY) {
        setIsCmsAdmin(readStoredCmsAuth());
      }
      if (e.key === CMS_EDIT_MODE_KEY) {
        setIsCmsEditModeState(readStoredCmsEditMode());
      }
    };
    const handleCustom = (e: Event) => {
      const customEvent = e as CustomEvent<CmsOverrides>;
      if (customEvent.detail) {
        setOverrides(customEvent.detail);
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("motkarta-cms-update", handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("motkarta-cms-update", handleCustom);
    };
  }, []);

  const loginCms = useCallback((passcode: string): boolean => {
    const trimmed = passcode.trim().toLowerCase();
    const storedToken = (typeof window !== "undefined" ? window.sessionStorage.getItem("motkarta_admin_token") : "")?.trim();
    // Support admin token, common admin passcodes or demo quick-access
    const isValid =
      Boolean(storedToken && passcode.trim() === storedToken) ||
      trimmed === "admin" ||
      trimmed === "motkarta" ||
      trimmed === "motkarta-admin" ||
      trimmed === "motkarta2026";

    if (isValid) {
      setIsCmsAdmin(true);
      setIsCmsEditModeState(true);
      if (typeof window !== "undefined") {
        localStorage.setItem(CMS_AUTH_KEY, "true");
        localStorage.setItem(CMS_EDIT_MODE_KEY, "true");
      }
      setActiveToast("Inloggad som CMS Admin! Redigeringsläge aktiverat. ⭐");
      return true;
    }
    return false;
  }, []);

  const logoutCms = useCallback(() => {
    setIsCmsAdmin(false);
    setIsCmsEditModeState(false);
    setEditingItem(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(CMS_AUTH_KEY);
      localStorage.removeItem(CMS_EDIT_MODE_KEY);
    }
    setActiveToast("Utloggad från Admin Light CMS.");
  }, []);

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

  const saveCopy = useCallback((key: string, svVal: string, enVal: string) => {
    setOverrides((prev) => {
      const next: CmsOverrides = {
        sv: { ...prev.sv, [key]: svVal },
        en: { ...prev.en, [key]: enVal },
      };
      writeStoredCmsOverrides(next);
      return next;
    });
    setEditingItem(null);
    setActiveToast(`Ändring sparad för "${key}" på både SV och EN! ⭐`);
  }, []);

  const resetCopyKey = useCallback((key: string) => {
    setOverrides((prev) => {
      const newSv = { ...prev.sv };
      const newEn = { ...prev.en };
      delete newSv[key];
      delete newEn[key];
      const next = { sv: newSv, en: newEn };
      writeStoredCmsOverrides(next);
      return next;
    });
    setActiveToast(`"${key}" återställd till standardtext.`);
  }, []);

  const resetAllCopy = useCallback(() => {
    const empty: CmsOverrides = { sv: {}, en: {} };
    setOverrides(empty);
    writeStoredCmsOverrides(empty);
    setActiveToast("Alla CMS-texter återställda till original.");
  }, []);

  const exportCmsJson = useCallback((): string => {
    return JSON.stringify(overrides, null, 2);
  }, [overrides]);

  const importCmsJson = useCallback((jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && (parsed.sv || parsed.en)) {
        const next: CmsOverrides = {
          sv: typeof parsed.sv === "object" ? parsed.sv : {},
          en: typeof parsed.en === "object" ? parsed.en : {},
        };
        setOverrides(next);
        writeStoredCmsOverrides(next);
        setActiveToast("CMS-texter importerade framgångsrikt! ⭐");
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
    isCmsAdmin,
    isCmsEditMode,
    loginCms,
    logoutCms,
    toggleCmsEditMode,
    setIsCmsEditMode,
    openEditor,
    closeEditor,
    saveCopy,
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

      {/* Login Modal */}
      {isLoginOpen && (
        <CmsLoginModal
          onClose={() => setIsLoginOpen(false)}
          onLogin={(pass) => {
            const ok = loginCms(pass);
            if (ok) setIsLoginOpen(false);
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
          lang={lang}
        />
      )}

      {/* Floating helper toolbar when edit mode is active */}
      {isCmsAdmin && isCmsEditMode && (
        <CmsFloatingBar
          overridesCount={Object.keys(overrides.sv || {}).length + Object.keys(overrides.en || {}).length}
          onOpenOverview={() => setIsOverviewOpen(true)}
          onHideFlags={() => setIsCmsEditModeState(false)}
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
  onLogin: (passcode: string) => boolean;
  lang: Language;
}) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onLogin(passcode);
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
              ? "Logga in för att redigera rubriker, texter, navigering och sektioner direkt på webbplatsen på både svenska och engelska i realtid."
              : "Log in to edit headlines, paragraphs, navigation, and section copy directly on the live website across Swedish and English in real-time."}
          </p>

          <div className="cms-form-group">
            <label htmlFor="cms-passcode-input">
              {isSv ? "Admin lösenord / Token" : "Admin Passcode / Token"}
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
              placeholder={isSv ? "t.ex. motkarta eller admin token..." : "e.g. motkarta or admin token..."}
              autoFocus
              data-testid="cms-login-passcode-input"
            />
            {error && (
              <span className="cms-error-msg">
                {isSv ? "Felaktigt lösenord. Prova 'motkarta' eller admin token." : "Invalid passcode. Try 'motkarta' or admin token."}
              </span>
            )}
          </div>

          <div className="cms-login-actions">
            <button
              type="button"
              className="cms-btn-ghost-demo"
              onClick={() => onLogin("motkarta")}
              data-testid="cms-quick-login-btn"
            >
              <Sparkle size={14} weight="bold" /> {isSv ? "Snabbåtkomst Redaktör" : "Quick Access Editor"}
            </button>
            <button
              type="submit"
              className="cms-btn-primary"
              data-testid="cms-login-submit-btn"
            >
              <LockKey size={16} weight="bold" /> {isSv ? "Logga in & Aktivera" : "Log In & Activate"}
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
  lang,
}: {
  onClose: () => void;
  overrides: CmsOverrides;
  onOpenEditor: (key: string, label?: string) => void;
  onResetAll: () => void;
  onExport: () => string;
  onImport: (json: string) => boolean;
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
  lang,
}: {
  overridesCount: number;
  onOpenOverview: () => void;
  onHideFlags: () => void;
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
    return (
      <div className="footer-cms-box" data-testid="footer-cms-box">
        <button
          type="button"
          className="footer-cms-login-btn"
          onClick={() => setIsLoginOpen(true)}
          data-testid="footer-cms-login-btn"
          title={isSv ? "Öppna Admin Light CMS" : "Open Admin Light CMS"}
        >
          <LockKey size={13} weight="bold" /> {isSv ? "Admin Light CMS" : "Admin Light CMS"}
        </button>
      </div>
    );
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
