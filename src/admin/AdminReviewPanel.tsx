import React, { useCallback, useEffect, useState } from "react";
import type { PlaceInput, PlaceLifecycleState } from "../../lib/scoring";
import { isBroadStockholmArea, STOCKHOLM_REGIONS as STOCKHOLM_REGION_NAMES } from "../../lib/stockholm-regions";
import type { Language } from "../app/shared";
import { formatUpdatedDate } from "../app/shared";
import { AdminCoveragePanel } from "./AdminCoveragePanel";
import { AdminMlDashboard } from "./AdminMlDashboard";
import { ArrowClockwise, ArrowRight, ArrowSquareOut, CheckCircle, CircleNotch, DownloadSimple, Globe, MapPin, PlusCircle, Scales, ShieldCheck, Sliders, Sparkle, X } from "@phosphor-icons/react";

type AdminStateFilter = PlaceLifecycleState | "unresolved_region" | "needs_input" | "ml_dashboard" | "all";
type AdminValidationLabel = NonNullable<PlaceInput["validationLabel"]>;

type AdminCandidate = {
  id: number;
  name: string;
  kind: string;
  area: string;
  address: string | null;
  website: string | null;
  note: string;
  lifecycleState: PlaceLifecycleState;
  validationLabel: AdminValidationLabel | null;
  validationNotes: string | null;
  candidateSourceType: string | null;
  candidateSourceId: string | null;
  candidateReviewStatus: string | null;
  candidateAllowedUse: string | null;
  duplicateResolution: "merged" | "keep_separate" | null;
  mergedIntoEstablishmentId: number | null;
  updatedAt: string | null;
  createdAt: string | null;
  evidenceCount: number;
  evidenceSourceTypes: string[];
  latestEvidenceAt: string | null;
  evidenceGate: {
    independentEvidenceCount: number;
    independentEvidenceTypes: string[];
    canPromoteHiddenGem: boolean;
    hasCurrentExistence: boolean;
    sourceGaps: string[];
  };
  possibleDuplicateCount: number;
  possibleDuplicates: AdminDuplicateMatch[];
};

type AdminDuplicateMatch = {
  id: number;
  name: string;
  kind: string;
  area: string;
  lifecycleState: string;
  reason: string;
};

type AdminReviewLabelExport = {
  source?: string;
  updatedAt?: string;
  policy?: string;
  labels?: unknown[];
  duplicateResolutions?: unknown[];
  error?: string;
};

type AdminReviewDashboard = {
  source?: string;
  generatedAt?: string;
  nextStep?: "export" | "review" | "harvest" | "caught_up";
  actions?: {
    harvestNeeded: boolean;
    reviewNeeded: boolean;
    exportNeeded: boolean;
  };
  counts?: {
    candidateCount: number;
    newCandidateCount: number;
    hiddenGemReadyCount: number;
    needsEvidenceCount: number;
    possibleDuplicateCount: number;
    reviewEventCount: number;
    unexportedReviewCount: number;
  };
  latestReviewAt?: string | null;
  lastExportedAt?: string | null;
  exportLogAvailable?: boolean;
  error?: string;
};

type AdminSchemaStatus = {
  source?: string;
  checkedAt?: string;
  ready?: boolean;
  success?: boolean;
  baseSchemaReady?: boolean;
  missing?: Array<{
    kind: "missing_table" | "missing_column";
    table: string;
    column?: string;
  }>;
  error?: string;
};

export type AdminSessionStatus = {
  admin: boolean;
  authMode?: "access_jwt" | "access_header" | "token" | "none";
  email?: string;
  reason?: string;
  configured?: {
    token: boolean;
    accessJwt: boolean;
    trustedHeaders: boolean;
    emailAllowlist: boolean;
  };
  error?: string;
};

const adminStateFilters: AdminStateFilter[] = ["candidate", "baseline", "verified", "featured", "unresolved_region", "needs_input", "ml_dashboard", "all"];

export function AdminReviewPanel({
  lang = "sv",
  adminSession: propAdminSession,
  onSessionChange,
  onLogout,
}: {
  lang?: Language;
  adminSession?: AdminSessionStatus | null;
  onSessionChange?: (session: AdminSessionStatus | null) => void;
  onLogout?: () => void;
}) {
  const [tokenInput, setTokenInput] = useState(readStoredAdminToken);
  const [adminToken, setAdminToken] = useState(readStoredAdminToken);
  const [stateFilter, setStateFilter] = useState<AdminStateFilter>("candidate");
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [exportingLabels, setExportingLabels] = useState(false);
  const [resolvingRegions, setResolvingRegions] = useState(false);
  const [websiteInputs, setWebsiteInputs] = useState<Record<number, string>>({});
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [labelExportStatus, setLabelExportStatus] = useState("");
  const [dashboard, setDashboard] = useState<AdminReviewDashboard | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<AdminSchemaStatus | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSessionStatus | null>(propAdminSession ?? null);
  const [checkingSession, setCheckingSession] = useState(true);
  const hasAdminAuth = adminSession?.admin === true;

  const adminHeaders = useCallback(
    (tokenOverride?: string, extraHeaders?: Record<string, string>) => {
      const token = (tokenOverride ?? adminToken).trim();
      return token
        ? { ...extraHeaders, "x-motkarta-admin-token": token }
        : { ...extraHeaders };
    },
    [adminToken],
  );

  const loadCandidates = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setCandidates([]);
        setStatus("");
        return;
      }

      if (stateFilter === "ml_dashboard") {
        setCandidates([]);
        setStatus(lang === "sv" ? "ML-Dashboard aktiv." : "ML Dashboard active.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/candidates?state=${stateFilter}&limit=100`, {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          candidates?: AdminCandidate[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte ladda granskningskön." : "Could not load review queue."));
        }

        const nextCandidates = payload.candidates ?? [];
        const nextNotes: Record<number, string> = {};
        nextCandidates.forEach((candidate) => {
          nextNotes[candidate.id] = candidate.validationNotes ?? "";
        });
        setCandidates(nextCandidates);
        setReviewNotes(nextNotes);
        setStatus(
          lang === "sv"
            ? `${nextCandidates.length} poster laddade från D1.`
            : `${nextCandidates.length} records loaded from D1.`,
        );
      } catch (loadError) {
        setCandidates([]);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, lang, stateFilter],
  );

  const loadDashboard = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setDashboard(null);
        return;
      }

      setLoadingDashboard(true);
      try {
        const response = await fetch("/api/admin/review-dashboard", {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminReviewDashboard;

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte ladda sessionsstatus." : "Could not load session status."));
        }

        setDashboard(payload);
      } catch (dashboardError) {
        setDashboard(null);
        setError(dashboardError instanceof Error ? dashboardError.message : String(dashboardError));
      } finally {
        setLoadingDashboard(false);
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, lang],
  );

  const loadSchemaStatus = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setSchemaStatus(null);
        return;
      }

      try {
        const response = await fetch("/api/admin/schema", {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminSchemaStatus;

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte läsa schema-status." : "Could not read schema status."));
        }

        setSchemaStatus(payload);
        return payload;
      } catch (schemaError) {
        setSchemaStatus(null);
        setError(schemaError instanceof Error ? schemaError.message : String(schemaError));
        return null;
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, lang],
  );

  const runAdminSelfCheck = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) return null;

      setSchemaBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/schema", {
          method: "POST",
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminSchemaStatus;

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte köra runtime-check." : "Could not run runtime check."));
        }

        setSchemaStatus(payload);
        if (payload.ready) {
          setStatus(lang === "sv" ? "Runtime-check klar. DB och adminschema är redo." : "Runtime check complete. DB and admin schema are ready.");
          await Promise.all([loadDashboard(token), loadCandidates(token)]);
        }
        return payload;
      } catch (schemaError) {
        setDashboard(null);
        setCandidates([]);
        setError(schemaError instanceof Error ? schemaError.message : String(schemaError));
        return null;
      } finally {
        setSchemaBusy(false);
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, lang, loadCandidates, loadDashboard],
  );

  const checkAdminSession = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      setCheckingSession(true);

      try {
        const response = await fetch("/api/admin/session", {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminSessionStatus;
        setAdminSession(payload);
        onSessionChange?.(payload);

        if (!response.ok || !payload.admin) {
          if (!token) {
            setStatus(payload.reason ?? (lang === "sv" ? "Admin-konto krävs." : "Admin account required."));
          }
          return payload;
        }

        setStatus(
          payload.email
            ? lang === "sv"
              ? `Adminsession redo: ${payload.email}.`
              : `Admin session ready: ${payload.email}.`
            : lang === "sv"
              ? "Adminsession redo."
              : "Admin session ready.",
        );
        return payload;
      } catch (sessionError) {
        const message = sessionError instanceof Error ? sessionError.message : String(sessionError);
        const failStatus: AdminSessionStatus = { admin: false, reason: message };
        setAdminSession(failStatus);
        onSessionChange?.(failStatus);
        setStatus(message);
        return null;
      } finally {
        setCheckingSession(false);
      }
    },
    [adminHeaders, adminToken, lang, onSessionChange],
  );

  useEffect(() => {
    void checkAdminSession();
  }, []);

  useEffect(() => {
    if (adminSession?.admin) {
      void runAdminSelfCheck(adminToken);
    }
  }, [adminSession?.admin]);

  useEffect(() => {
    if (hasAdminAuth && schemaStatus?.ready) {
      void loadCandidates();
    }
  }, [hasAdminAuth, schemaStatus?.ready, loadCandidates]);

  const handleUnlock = (event: React.FormEvent) => {
    event.preventDefault();
    const token = tokenInput.trim();
    setAdminToken(token);
    if (typeof window !== "undefined" && token) {
      window.sessionStorage.setItem("motkarta_admin_token", token);
    }
    void checkAdminSession(token);
  };

  const handleForgetToken = () => {
    setAdminToken("");
    setTokenInput("");
    setCandidates([]);
    setReviewNotes({});
    setStatus("");
    setLabelExportStatus("");
    setDashboard(null);
    setSchemaStatus(null);
    setError(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("motkarta_admin_token");
    }
    onSessionChange?.(null);
    void checkAdminSession("");
  };

  const handleAdminLogout = () => {
    setAdminToken("");
    setTokenInput("");
    setCandidates([]);
    setReviewNotes({});
    setStatus("");
    setLabelExportStatus("");
    setDashboard(null);
    setSchemaStatus(null);
    setError(null);

    if (onLogout) {
      onLogout();
      return;
    }

    if (typeof window === "undefined") {
      void checkAdminSession("");
      return;
    }

    window.sessionStorage.removeItem("motkarta_admin_token");

    if (adminSession?.authMode === "token") {
      void checkAdminSession("");
      return;
    }

    window.location.assign("/cdn-cgi/access/logout");
  };

  const promoteCandidate = async (
    candidate: AdminCandidate,
    lifecycleState: PlaceLifecycleState,
    validationLabel: AdminValidationLabel,
  ) => {
    if (!hasAdminAuth) return;

    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          state: lifecycleState,
          validationLabel,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara granskningen." : "Could not save review."));
      }

      const updatedCandidate: AdminCandidate = {
        ...candidate,
        lifecycleState,
        validationLabel,
        validationNotes: validationNotes || null,
        updatedAt: payload.reviewedAt ?? new Date().toISOString(),
      };

      setCandidates((current) =>
        current.flatMap((row) => {
          if (row.id !== candidate.id) {
            return [row];
          }

          if (stateFilter !== "all" && lifecycleState !== stateFilter) {
            return [];
          }

          return [updatedCandidate];
        }),
      );
      setStatus(
        lang === "sv"
          ? `${candidate.name} uppdaterades till ${lifecycleStateLabel(lifecycleState, lang)}.`
          : `${candidate.name} updated to ${lifecycleStateLabel(lifecycleState, lang)}.`,
      );
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const resolveDuplicate = async (
    candidate: AdminCandidate,
    action: "merge_duplicate" | "keep_separate",
    targetId?: number,
  ) => {
    if (!hasAdminAuth) return;

    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          action,
          targetId,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        targetEstablishmentId?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara dubblettbeslutet." : "Could not save duplicate decision."));
      }

      if (action === "merge_duplicate") {
        setCandidates((current) => current.filter((row) => row.id !== candidate.id));
        setStatus(
          lang === "sv"
            ? `${candidate.name} slogs ihop med #${payload.targetEstablishmentId ?? targetId}.`
            : `${candidate.name} merged into #${payload.targetEstablishmentId ?? targetId}.`,
        );
      } else {
        setCandidates((current) =>
          current.map((row) =>
            row.id === candidate.id
              ? {
                  ...row,
                  duplicateResolution: "keep_separate",
                  candidateReviewStatus: "duplicate_checked_keep_separate",
                  validationNotes: validationNotes || row.validationNotes,
                  updatedAt: payload.reviewedAt ?? new Date().toISOString(),
                  possibleDuplicateCount: 0,
                  possibleDuplicates: [],
                }
              : row,
          ),
        );
        setStatus(
          lang === "sv"
            ? `${candidate.name} markerades som separat plats.`
            : `${candidate.name} marked as a separate place.`,
        );
      }
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const updateCandidateRegion = async (candidate: AdminCandidate, district: string) => {
    if (!hasAdminAuth || !district) return;

    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          action: "update_district",
          district,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        district?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara region." : "Could not save region."));
      }

      setCandidates((current) =>
        current.flatMap((row) => {
          if (row.id !== candidate.id) return [row];
          if (stateFilter === "unresolved_region" && !isBroadStockholmArea(district)) {
            return [];
          }
          return [{ ...row, area: district, updatedAt: payload.reviewedAt ?? new Date().toISOString() }];
        }),
      );
      setStatus(
        lang === "sv"
          ? `${candidate.name} uppdaterades till region ${district}.`
          : `${candidate.name} updated to region ${district}.`,
      );
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const updateCandidateWebsite = async (candidate: AdminCandidate, rawWebsite: string) => {
    if (!hasAdminAuth || !rawWebsite.trim()) return;

    const website = rawWebsite.trim();
    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          action: "update_website",
          website,
          scrapeImage: true,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        website?: string;
        scrapedPhotoUrl?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara webbadress." : "Could not save website."));
      }

      const updatedWebsite = payload.website ?? website;
      setCandidates((current) =>
        current.flatMap((row) => {
          if (row.id !== candidate.id) return [row];
          if (stateFilter === "needs_input" && updatedWebsite && row.address && !isBroadStockholmArea(row.area)) {
            return [];
          }
          return [{ ...row, website: updatedWebsite, updatedAt: payload.reviewedAt ?? new Date().toISOString() }];
        }),
      );

      setStatus(
        payload.scrapedPhotoUrl
          ? lang === "sv"
            ? `Webbplats sparad för ${candidate.name} & bild hämtades (${payload.scrapedPhotoUrl}).`
            : `Saved website for ${candidate.name} & scraped official photo (${payload.scrapedPhotoUrl}).`
          : lang === "sv"
            ? `Webbplats sparad för ${candidate.name}.`
            : `Saved website for ${candidate.name}.`,
      );
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const exportReviewLabels = async () => {
    const token = adminToken.trim();
    if (!hasAdminAuth || typeof document === "undefined") return;

    setExportingLabels(true);
    setError(null);
    setLabelExportStatus("");

    try {
      const response = await fetch("/api/admin/review-labels", {
        method: "POST",
        headers: adminHeaders(token),
      });
      const payload = (await response.json().catch(() => ({}))) as AdminReviewLabelExport;

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte exportera labels." : "Could not export labels."));
      }

      const filePayload = {
        updatedAt: payload.updatedAt ?? new Date().toISOString(),
        policy:
          payload.policy ??
          "Human validation labels exported from admin review events. Duplicate resolutions are kept separate from hidden-gem/mainstream labels.",
        labels: payload.labels ?? [],
        duplicateResolutions: payload.duplicateResolutions ?? [],
      };
      const blob = new Blob([`${JSON.stringify(filePayload, null, 2)}\n`], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `motkarta-human-validation-labels-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setLabelExportStatus(
        lang === "sv"
          ? `Exporterade ${filePayload.labels.length} labels och ${filePayload.duplicateResolutions.length} dubblettbeslut.`
          : `Exported ${filePayload.labels.length} labels and ${filePayload.duplicateResolutions.length} duplicate decisions.`,
      );
      await loadDashboard(token);
      await loadSchemaStatus(token);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExportingLabels(false);
    }
  };

  const resolvePlacesWithoutRegion = async () => {
    const token = adminToken.trim();
    if (!hasAdminAuth) return;

    setResolvingRegions(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/resolve-regions", {
        method: "POST",
        headers: adminHeaders(token),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        totalChecked?: number;
        resolvedCount?: number;
        updatedPlaces?: Array<{ id: number; name: string; previousDistrict: string; resolvedDistrict: string }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte lösa saknade regioner." : "Could not resolve missing regions."));
      }

      const count = payload.resolvedCount ?? 0;
      const examples = (payload.updatedPlaces ?? [])
        .slice(0, 3)
        .map((p) => `${p.name} → ${p.resolvedDistrict}`)
        .join(", ");

      setStatus(
        count > 0
          ? lang === "sv"
            ? `Löste regioner för ${count} platser${examples ? ` (${examples})` : ""}.`
            : `Resolved regions for ${count} places${examples ? ` (${examples})` : ""}.`
          : lang === "sv"
            ? "Alla platser har redan giltiga regioner."
            : "All places already have specific regions.",
      );

      await Promise.all([loadCandidates(token), loadDashboard(token)]);
    } catch (resolveErr) {
      setError(resolveErr instanceof Error ? resolveErr.message : String(resolveErr));
    } finally {
      setResolvingRegions(false);
    }
  };

  return (
    <section className="admin-review-panel" id="admin-review" aria-labelledby="admin-review-title">
      <div className="admin-review-head">
        <div>
          <p className="admin-review-kicker">
            <ShieldCheck size={14} weight="bold" /> {lang === "sv" ? "Adminflöde" : "Admin workflow"}
          </p>
          <h3 id="admin-review-title">
            {lang === "sv" ? "Granskningskö" : "Review queue"}
          </h3>
        </div>

        {!hasAdminAuth ? (
          <form className="admin-review-auth" onSubmit={handleUnlock}>
            <label className="sr-only" htmlFor="admin-token">
              {lang === "sv" ? "Lokal admin-token" : "Local admin token"}
            </label>
            <input
              id="admin-token"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={lang === "sv" ? "Lokal/dev-token" : "Local/dev token"}
              autoComplete="off"
            />
            <button type="submit" disabled={checkingSession} title={lang === "sv" ? "Lås upp lokal granskningskö" : "Unlock local review queue"}>
              {checkingSession ? <CircleNotch size={14} className="animate-spin" /> : <ShieldCheck size={14} weight="bold" />}
              {checkingSession ? (lang === "sv" ? "Kollar" : "Checking") : lang === "sv" ? "Lås upp" : "Unlock"}
            </button>
            {tokenInput || adminToken ? (
              <button
                type="button"
                className="admin-review-ghost-btn"
                onClick={handleForgetToken}
                title={lang === "sv" ? "Glöm lokal token" : "Forget local token"}
              >
                <X size={14} weight="bold" />
              </button>
            ) : null}
          </form>
        ) : null}
      </div>

      <div className="admin-review-toolbar" aria-label={lang === "sv" ? "Filter för granskningskö" : "Review queue filters"}>
        <div className="admin-state-tabs">
          {adminStateFilters.map((state) => (
            <button
              key={state}
              type="button"
              className={stateFilter === state ? "active" : ""}
              aria-pressed={stateFilter === state}
              onClick={() => setStateFilter(state)}
            >
              {lifecycleStateLabel(state, lang)}
            </button>
          ))}
        </div>
        <div className="admin-toolbar-actions">
          <button
            type="button"
            className="admin-resolve-regions-btn"
            onClick={() => void resolvePlacesWithoutRegion()}
            disabled={!hasAdminAuth || resolvingRegions || loading || schemaStatus?.ready !== true}
            title={
              lang === "sv"
                ? "Lös regioner för alla platser utan specifik region (t.ex. Djurgården, Södermalm, Norrmalm, Vasastan, Söderort, Västerort)"
                : "Resolve regions for all places without a specific region"
            }
          >
            {resolvingRegions ? <CircleNotch size={14} className="animate-spin" /> : <MapPin size={14} weight="bold" />}
            {lang === "sv" ? "Lös saknade regioner" : "Resolve missing regions"}
          </button>
          <button
            type="button"
            className="admin-refresh-btn"
            onClick={() => void loadCandidates()}
            disabled={!hasAdminAuth || loading || schemaStatus?.ready !== true}
            title={lang === "sv" ? "Ladda om från D1" : "Reload from D1"}
          >
            {loading ? <CircleNotch size={14} className="animate-spin" /> : <ArrowClockwise size={14} weight="bold" />}
            {lang === "sv" ? "Ladda om" : "Reload"}
          </button>
        </div>
      </div>

      {hasAdminAuth ? (
        <div className={`admin-schema-panel ${schemaStatus?.ready ? "ready" : "needs-setup"}`}>
          <div className="admin-schema-copy">
            <span>{schemaStatus?.ready ? (lang === "sv" ? "Runtime redo" : "Runtime ready") : lang === "sv" ? "Runtime-check" : "Runtime check"}</span>
            <small>{schemaStatusText(schemaStatus, lang)}</small>
          </div>
          <button
            type="button"
            className="admin-schema-btn"
            onClick={() => void runAdminSelfCheck()}
            disabled={!hasAdminAuth || schemaBusy}
            title={lang === "sv" ? "Kontrollera token, DB och adminschema" : "Check token, DB, and admin schema"}
          >
            {schemaBusy ? <CircleNotch size={14} className="animate-spin" /> : <ShieldCheck size={14} weight="bold" />}
            {schemaBusy ? (lang === "sv" ? "Kollar" : "Checking") : schemaStatus?.ready ? (lang === "sv" ? "Kolla igen" : "Recheck") : lang === "sv" ? "Kör check" : "Run check"}
          </button>
        </div>
      ) : null}

      {hasAdminAuth && schemaStatus?.ready ? (
        <div className={`admin-session-dashboard step-${dashboard?.nextStep ?? "loading"}`} aria-live="polite">
          <div className="admin-session-summary">
            <span className="admin-session-badge">
              {dashboardStepLabel(dashboard?.nextStep, loadingDashboard, lang)}
            </span>
            <strong>{dashboardHeadline(dashboard, loadingDashboard, lang)}</strong>
            <small>{dashboardSubcopy(dashboard, loadingDashboard, lang)}</small>
          </div>
          <div className="admin-session-metrics">
            {dashboardMetrics(dashboard, lang).map((metric) => (
              <div key={metric.key} className={`admin-session-metric tone-${metric.tone}`}>
                <span className="admin-session-metric-icon">{metric.icon}</span>
                <span>{metric.label}</span>
                <b>{metric.value}</b>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {hasAdminAuth ? (
        <AdminCoveragePanel lang={lang} adminToken={adminToken} />
      ) : null}

      <div className="admin-export-panel">
        <div className="admin-export-copy">
          <span>{lang === "sv" ? "Efter granskning: exportera labels." : "After review: export labels."}</span>
          <small>{lang === "sv" ? "ML-labels och dubblettbeslut sparas separat." : "ML labels and duplicate decisions stay separate."}</small>
        </div>
        <button
          type="button"
          className="admin-export-btn"
          onClick={() => void exportReviewLabels()}
          disabled={!hasAdminAuth || exportingLabels || schemaStatus?.ready !== true}
          title={lang === "sv" ? "Ladda ner label-export från D1" : "Download label export from D1"}
        >
          {exportingLabels ? <CircleNotch size={14} className="animate-spin" /> : <DownloadSimple size={14} weight="bold" />}
          {lang === "sv" ? "Exportera" : "Export"}
        </button>
      </div>

      {labelExportStatus ? (
        <div className="admin-export-meta" aria-live="polite">
          {labelExportStatus}
        </div>
      ) : null}

      <div className="admin-review-status" aria-live="polite">
        {error ? <span className="admin-review-error">{error}</span> : status}
      </div>

      {!hasAdminAuth ? (
        <div className="admin-review-empty">
          {checkingSession ? <CircleNotch size={18} className="animate-spin" /> : <ShieldCheck size={18} weight="bold" />}
          <span>
            {checkingSession
              ? lang === "sv"
                ? "Kontrollerar adminsession..."
                : "Checking admin session..."
              : adminSession?.reason ??
                (lang === "sv"
                  ? "Admin-konto krävs. I produktion ska /admin skyddas med Cloudflare Access."
                  : "Admin account required. In production, /admin should be protected by Cloudflare Access.")}
          </span>
        </div>
      ) : schemaBusy || !schemaStatus ? (
        <div className="admin-review-empty">
          <CircleNotch size={18} className="animate-spin" />
          <span>{lang === "sv" ? "Kör runtime-check mot Cloudflare..." : "Running runtime check against Cloudflare..."}</span>
        </div>
      ) : schemaStatus.ready === false ? (
        <div className="admin-review-empty">
          <ShieldCheck size={18} weight="bold" />
          <span>{schemaStatusText(schemaStatus, lang)}</span>
        </div>
      ) : stateFilter === "ml_dashboard" ? (
        <AdminMlDashboard lang={lang} adminHeaders={adminHeaders} hasAdminAuth={hasAdminAuth} />
      ) : loading ? (
        <div className="admin-review-empty">
          <CircleNotch size={18} className="animate-spin" />
          <span>{lang === "sv" ? "Laddar kandidater..." : "Loading candidates..."}</span>
        </div>
      ) : candidates.length ? (
        <div className="admin-candidate-list">
          {candidates.map((candidate) => (
            <article key={candidate.id} className="admin-candidate-row" aria-busy={busyId === candidate.id}>
              <div className="admin-candidate-main">
                <div className="admin-candidate-meta">
                  <span className={`admin-state-badge state-${candidate.lifecycleState}`}>
                    {lifecycleStateLabel(candidate.lifecycleState, lang)}
                  </span>
                  <span>{candidate.kind} · {candidate.area}</span>
                  {isBroadStockholmArea(candidate.area) ? (
                    <span className="admin-region-warn-badge" title={lang === "sv" ? "Saknar specifik region/stadsdel" : "Needs specific region/district"}>
                      <MapPin size={12} weight="bold" /> {lang === "sv" ? "Saknar region" : "Needs region"}
                    </span>
                  ) : null}
                  {candidate.validationLabel ? <span>{validationLabelText(candidate.validationLabel, lang)}</span> : null}
                </div>
                <h4>{candidate.name}</h4>
                <p>{candidate.note}</p>
                <div className="admin-source-strip">
                  <span>
                    <ShieldCheck size={13} weight="bold" />
                    {candidate.candidateSourceType ?? "source_unknown"}
                  </span>
                  {candidate.candidateSourceId ? <span>{candidate.candidateSourceId}</span> : null}
                  {candidate.candidateReviewStatus ? <span>{candidate.candidateReviewStatus}</span> : null}
                  {candidate.address ? <span>{candidate.address}</span> : null}
                  {candidate.website ? (
                    <a href={candidate.website.startsWith("http") ? candidate.website : `https://${candidate.website}`} target="_blank" rel="noopener noreferrer">
                      <Globe size={13} weight="bold" />
                      {lang === "sv" ? "Webb" : "Web"}
                      <ArrowSquareOut size={11} weight="bold" />
                    </a>
                  ) : null}
                </div>
                <div className="admin-evidence-strip">
                  <span>
                    <ShieldCheck size={13} weight="bold" />
                    {candidate.evidenceCount} {lang === "sv" ? "signaler" : "signals"}
                  </span>
                  <span className={candidate.evidenceGate.canPromoteHiddenGem ? "admin-gate-pass" : "admin-gate-warn"}>
                    {candidate.evidenceGate.independentEvidenceCount}/2 {lang === "sv" ? "oberoende" : "independent"}
                  </span>
                  {candidate.evidenceSourceTypes.slice(0, 4).map((sourceType) => (
                    <span key={sourceType}>{sourceType}</span>
                  ))}
                  <span>
                    {lang === "sv" ? "Senast" : "Latest"} {formatUpdatedDate(candidate.latestEvidenceAt ?? undefined)}
                  </span>
                </div>
                {candidate.evidenceGate.sourceGaps.length ? (
                  <div className="admin-gap-row">
                    {candidate.evidenceGate.sourceGaps.map((gap) => (
                      <span key={gap}>{sourceGapLabel(gap, lang)}</span>
                    ))}
                  </div>
                ) : null}
                {candidate.possibleDuplicates.length ? (
                  <div className="admin-duplicate-box">
                    <div className="admin-duplicate-title">
                      <Scales size={13} weight="bold" />
                      {lang === "sv" ? "Möjlig dubblett" : "Possible duplicate"}
                    </div>
                    {candidate.possibleDuplicates.slice(0, 4).map((match) => (
                      <div key={match.id} className="admin-duplicate-row">
                        <div>
                          <b>#{match.id} {match.name}</b>
                          <span>
                            {match.kind} · {match.area} · {lifecycleStateLabel(match.lifecycleState as AdminStateFilter, lang)} · {duplicateReasonLabel(match.reason, lang)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="admin-mini-action"
                          disabled={busyId === candidate.id}
                          onClick={() => void resolveDuplicate(candidate, "merge_duplicate", match.id)}
                          title={lang === "sv" ? "Slå ihop kandidatens källor med vald plats" : "Merge candidate sources into selected place"}
                        >
                          <ArrowRight size={13} weight="bold" />
                          {lang === "sv" ? "Slå ihop" : "Merge"}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="admin-mini-action secondary"
                      disabled={busyId === candidate.id}
                      onClick={() => void resolveDuplicate(candidate, "keep_separate")}
                    >
                      <CheckCircle size={13} weight="bold" />
                      {lang === "sv" ? "Behåll separat" : "Keep separate"}
                    </button>
                  </div>
                ) : candidate.duplicateResolution ? (
                  <div className="admin-duplicate-resolved">
                    {duplicateResolutionLabel(candidate.duplicateResolution, lang)}
                    {candidate.mergedIntoEstablishmentId ? ` #${candidate.mergedIntoEstablishmentId}` : ""}
                  </div>
                ) : null}
                {candidate.candidateAllowedUse ? (
                  <p className="admin-allowed-use">{candidate.candidateAllowedUse}</p>
                ) : null}

                <div className={`admin-region-picker-row ${isBroadStockholmArea(candidate.area) ? "unresolved" : ""}`}>
                  <label htmlFor={`admin-region-select-${candidate.id}`} className="admin-region-picker-label">
                    <MapPin size={13} weight="bold" />
                    {lang === "sv" ? "Manuell region / stadsdel:" : "Manual region / district:"}
                  </label>
                  <select
                    id={`admin-region-select-${candidate.id}`}
                    className="admin-region-select"
                    value={(STOCKHOLM_REGION_NAMES as readonly string[]).includes(candidate.area) ? candidate.area : ""}
                    disabled={busyId === candidate.id}
                    onChange={(event) => {
                      const nextRegion = event.target.value;
                      if (nextRegion) {
                        void updateCandidateRegion(candidate, nextRegion);
                      }
                    }}
                  >
                    <option value="" disabled>
                      {isBroadStockholmArea(candidate.area)
                        ? (lang === "sv" ? "⚠️ Välj region ur listan..." : "⚠️ Select region from list...")
                        : (lang === "sv" ? "— Välj ny region —" : "— Select new region —")}
                    </option>
                    {STOCKHOLM_REGION_NAMES.map((regionName) => (
                      <option key={regionName} value={regionName}>
                        {regionName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`admin-website-picker-row ${!candidate.website ? "unresolved" : ""}`}>
                  <label htmlFor={`admin-website-input-${candidate.id}`} className="admin-website-picker-label">
                    <Globe size={13} weight="bold" />
                    {lang === "sv" ? "Webbplats & Bild-scraper:" : "Website & Image Scraper:"}
                  </label>
                  <div className="admin-website-input-wrap">
                    <input
                      id={`admin-website-input-${candidate.id}`}
                      type="url"
                      className="admin-website-input"
                      value={websiteInputs[candidate.id] ?? candidate.website ?? ""}
                      onChange={(event) =>
                        setWebsiteInputs((current) => ({
                          ...current,
                          [candidate.id]: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                    <button
                      type="button"
                      className="admin-scrape-btn"
                      disabled={busyId === candidate.id || !(websiteInputs[candidate.id] ?? candidate.website ?? "").trim()}
                      onClick={() =>
                        void updateCandidateWebsite(
                          candidate,
                          websiteInputs[candidate.id] ?? candidate.website ?? "",
                        )
                      }
                      title={lang === "sv" ? "Spara webbadress och sök automatiskt efter bild (og:image)" : "Save website URL and automatically extract og:image photo"}
                    >
                      <DownloadSimple size={13} weight="bold" />
                      {lang === "sv" ? "Spara & hämta bild" : "Save & scrape photo"}
                    </button>
                  </div>
                </div>

                <label className="admin-notes-label" htmlFor={`admin-notes-${candidate.id}`}>
                  {lang === "sv" ? "Granskningsnotering" : "Review note"}
                </label>
                <textarea
                  id={`admin-notes-${candidate.id}`}
                  rows={2}
                  value={reviewNotes[candidate.id] ?? ""}
                  onChange={(event) =>
                    setReviewNotes((current) => ({
                      ...current,
                      [candidate.id]: event.target.value,
                    }))
                  }
                  placeholder={
                    lang === "sv"
                      ? "T.ex. OSM + kommunal träff + manuell webbkontroll."
                      : "E.g. OSM + municipal match + manual website check."
                  }
                />
              </div>

              <div className="admin-candidate-actions">
                <button
                  type="button"
                  className="admin-action-btn primary"
                  disabled={busyId === candidate.id || !candidate.evidenceGate.canPromoteHiddenGem}
                  title={
                    candidate.evidenceGate.canPromoteHiddenGem
                      ? validationLabelText("known_hidden_gem", lang)
                      : lang === "sv"
                        ? "Kräver minst två oberoende icke-Google-signaler"
                        : "Requires at least two independent non-Google signals"
                  }
                  onClick={() => void promoteCandidate(candidate, "verified", "known_hidden_gem")}
                >
                  <Sparkle size={14} weight="bold" />
                  {lang === "sv" ? "Dold pärla" : "Hidden gem"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate, "verified", "known_mainstream")}
                >
                  <CheckCircle size={14} weight="bold" />
                  {lang === "sv" ? "Mainstream" : "Mainstream"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={busyId === candidate.id || !candidate.evidenceGate.canPromoteHiddenGem}
                  title={
                    candidate.evidenceGate.canPromoteHiddenGem
                      ? validationLabelText("known_hidden_gem", lang)
                      : lang === "sv"
                        ? "Kräver minst två oberoende icke-Google-signaler"
                        : "Requires at least two independent non-Google signals"
                  }
                  onClick={() => void promoteCandidate(candidate, "featured", "known_hidden_gem")}
                >
                  <ShieldCheck size={14} weight="bold" />
                  {lang === "sv" ? "Featured" : "Featured"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn muted"
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate, "candidate", "not_enough_evidence")}
                >
                  <Sliders size={14} weight="bold" />
                  {lang === "sv" ? "Mer bevis" : "More evidence"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn danger"
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate, "candidate", "closed_wrong_category")}
                >
                  <X size={14} weight="bold" />
                  {lang === "sv" ? "Stäng" : "Close"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-review-empty">
          <CheckCircle size={18} weight="bold" />
          <span>{lang === "sv" ? "Inga poster i valt läge." : "No records in selected state."}</span>
        </div>
      )}
    </section>
  );
}

function dashboardStepLabel(
  step: AdminReviewDashboard["nextStep"] | undefined,
  loading: boolean,
  lang: Language,
) {
  if (loading && !step) {
    return lang === "sv" ? "Laddar" : "Loading";
  }
  const labels: Record<NonNullable<AdminReviewDashboard["nextStep"]>, { sv: string; en: string }> = {
    export: { sv: "Export nu", en: "Export now" },
    review: { sv: "Review nu", en: "Review now" },
    harvest: { sv: "Harvest nu", en: "Harvest now" },
    caught_up: { sv: "Ikapp", en: "Caught up" },
  };
  return labels[step ?? "caught_up"][lang];
}

function dashboardHeadline(
  dashboard: AdminReviewDashboard | null,
  loading: boolean,
  lang: Language,
) {
  if (loading && !dashboard) {
    return lang === "sv" ? "Läser sessionsstatus" : "Reading session status";
  }
  if (!dashboard) {
    return lang === "sv" ? "Sessionsstatus saknas" : "Session status unavailable";
  }
  if (dashboard.exportLogAvailable === false) {
    return lang === "sv" ? "Exportloggen saknar migration" : "Export log migration missing";
  }
  const labels: Record<NonNullable<AdminReviewDashboard["nextStep"]>, { sv: string; en: string }> = {
    export: { sv: "Exportera labels efter granskning", en: "Export labels after review" },
    review: { sv: "Starta en review-session", en: "Start a review session" },
    harvest: { sv: "Hämta mer oberoende evidens", en: "Harvest more independent evidence" },
    caught_up: { sv: "Inget akut i kön", en: "Nothing urgent in the queue" },
  };
  return labels[dashboard.nextStep ?? "caught_up"][lang];
}

function dashboardSubcopy(
  dashboard: AdminReviewDashboard | null,
  loading: boolean,
  lang: Language,
) {
  if (loading && !dashboard) {
    return lang === "sv" ? "Kontrollerar D1-kö, granskningshändelser och senaste export." : "Checking D1 queue, review events, and latest export.";
  }
  if (!dashboard) {
    return lang === "sv" ? "Lås upp med adminsession för att läsa live-status." : "Unlock with an admin session to read live status.";
  }
  if (dashboard.exportLogAvailable === false) {
    return lang === "sv" ? "Kör senaste D1-migrationerna så export-checkpoints kan sparas." : "Apply the latest D1 migrations so export checkpoints can be saved.";
  }

  const counts = dashboard.counts;
  if (dashboard.nextStep === "export") {
    return lang === "sv"
      ? `${counts?.unexportedReviewCount ?? 0} granskningsbeslut är nyare än senaste export.`
      : `${counts?.unexportedReviewCount ?? 0} review decisions are newer than the latest export.`;
  }
  if (dashboard.nextStep === "review") {
    return lang === "sv"
      ? `${counts?.candidateCount ?? 0} kandidater i kön, ${counts?.hiddenGemReadyCount ?? 0} redo för hidden-gem beslut.`
      : `${counts?.candidateCount ?? 0} candidates in queue, ${counts?.hiddenGemReadyCount ?? 0} ready for hidden-gem decisions.`;
  }
  if (dashboard.nextStep === "harvest") {
    return lang === "sv"
      ? `${counts?.needsEvidenceCount ?? 0} kandidater behöver fler eller färskare källsignaler.`
      : `${counts?.needsEvidenceCount ?? 0} candidates need more or fresher source signals.`;
  }
  return lang === "sv" ? "Inga oexporterade beslut och inga tydliga review-blockerare." : "No unexported decisions and no clear review blockers.";
}

function dashboardMetrics(dashboard: AdminReviewDashboard | null, lang: Language) {
  const counts = dashboard?.counts;
  return [
    {
      key: "new",
      label: lang === "sv" ? "Nya kandidater" : "New candidates",
      value: dashboardMetricValue(counts?.newCandidateCount),
      icon: <PlusCircle size={15} weight="bold" />,
      tone: counts?.newCandidateCount ? "review" : "neutral",
    },
    {
      key: "ready",
      label: lang === "sv" ? "Redo pärlor" : "Ready gems",
      value: dashboardMetricValue(counts?.hiddenGemReadyCount),
      icon: <Sparkle size={15} weight="bold" />,
      tone: counts?.hiddenGemReadyCount ? "review" : "neutral",
    },
    {
      key: "gaps",
      label: lang === "sv" ? "Källgap" : "Source gaps",
      value: dashboardMetricValue(counts?.needsEvidenceCount),
      icon: <Sliders size={15} weight="bold" />,
      tone: counts?.needsEvidenceCount ? "harvest" : "neutral",
    },
    {
      key: "duplicates",
      label: lang === "sv" ? "Dubbletter" : "Duplicates",
      value: dashboardMetricValue(counts?.possibleDuplicateCount),
      icon: <Scales size={15} weight="bold" />,
      tone: counts?.possibleDuplicateCount ? "review" : "neutral",
    },
    {
      key: "unexported",
      label: lang === "sv" ? "Oexporterat" : "Unexported",
      value: dashboardMetricValue(counts?.unexportedReviewCount),
      icon: <DownloadSimple size={15} weight="bold" />,
      tone: counts?.unexportedReviewCount ? "export" : "neutral",
    },
    {
      key: "last-export",
      label: lang === "sv" ? "Senaste export" : "Last export",
      value: dashboard?.lastExportedAt ? formatUpdatedDate(dashboard.lastExportedAt) : lang === "sv" ? "Aldrig" : "Never",
      icon: <CheckCircle size={15} weight="bold" />,
      tone: dashboard?.lastExportedAt ? "ok" : "neutral",
    },
  ];
}

function dashboardMetricValue(value: number | undefined) {
  return typeof value === "number" ? String(value) : "...";
}

function schemaStatusText(status: AdminSchemaStatus | null, lang: Language) {
  if (!status) {
    return lang === "sv" ? "Adminsession, DB-bindning och adminschema kontrolleras automatiskt." : "Admin session, DB binding, and admin schema are checked automatically.";
  }

  if (status.ready) {
    return lang === "sv" ? "Adminsession fungerar, DB är bunden och adminschema är redo." : "Admin session works, DB is bound, and admin schema is ready.";
  }

  if (status.baseSchemaReady === false) {
    return lang === "sv" ? "DB svarar, men grundtabellen saknas. Kör initial seed/import först." : "DB responds, but the base table is missing. Run the initial seed/import first.";
  }

  const missingCount = status.missing?.length ?? 0;
  return lang === "sv"
    ? `${missingCount} schemadelar saknades och förbereds automatiskt. Kör check igen om detta kvarstår.`
    : `${missingCount} schema parts were missing and are prepared automatically. Run check again if this remains.`;
}

export function readStoredAdminToken() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.sessionStorage.getItem("motkarta_admin_token") ?? "";
  } catch {
    return "";
  }
}

export function isAdminRoutePath() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/admin" || path.startsWith("/admin/") || path === "/api/admin/app";
}

function lifecycleStateLabel(state: AdminStateFilter | string, lang: Language) {
  const labels: Record<AdminStateFilter, { sv: string; en: string }> = {
    baseline: { sv: "Baseline", en: "Baseline" },
    candidate: { sv: "Kandidat", en: "Candidate" },
    verified: { sv: "Verifierad", en: "Verified" },
    featured: { sv: "Utvald", en: "Featured" },
    unresolved_region: { sv: "Saknar region", en: "Needs Region" },
    needs_input: { sv: "Saknar uppgifter", en: "Needs Info" },
    ml_dashboard: { sv: "🤖 ML & Modeller", en: "🤖 ML & Models" },
    all: { sv: "Alla", en: "All" },
  };
  return labels[state as AdminStateFilter]?.[lang] ?? state;
}

function validationLabelText(label: AdminValidationLabel, lang: Language) {
  const labels: Record<AdminValidationLabel, { sv: string; en: string }> = {
    known_mainstream: { sv: "Känd mainstream", en: "Known mainstream" },
    known_hidden_gem: { sv: "Känd dold pärla", en: "Known hidden gem" },
    not_enough_evidence: { sv: "Otillräckliga bevis", en: "Not enough evidence" },
    closed_wrong_category: { sv: "Stängd/fel kategori", en: "Closed/wrong category" },
  };
  return labels[label][lang];
}

function sourceGapLabel(gap: string, lang: Language) {
  const labels: Record<string, { sv: string; en: string }> = {
    needs_second_independent_evidence: { sv: "Behöver andra oberoende signalen", en: "Needs second independent signal" },
    needs_osm_or_open_data_match: { sv: "Behöver OSM/open-data match", en: "Needs OSM/open-data match" },
    needs_current_existence_signal: { sv: "Behöver aktuell existenssignal", en: "Needs current existence signal" },
    google_metadata_only: { sv: "Endast Google-metadata", en: "Google metadata only" },
  };
  return labels[gap]?.[lang] ?? gap.replaceAll("_", " ");
}

function duplicateReasonLabel(reason: string, lang: Language) {
  const labels: Record<string, { sv: string; en: string }> = {
    name_area: { sv: "namn + område", en: "name + area" },
    address: { sv: "adress", en: "address" },
    nearby_name: { sv: "nära + liknande namn", en: "nearby + similar name" },
    possible_match: { sv: "möjlig träff", en: "possible match" },
  };
  return labels[reason]?.[lang] ?? reason.replaceAll("_", " ");
}

function duplicateResolutionLabel(resolution: "merged" | "keep_separate", lang: Language) {
  const labels = {
    merged: { sv: "Dubblett ihopslagen med", en: "Duplicate merged into" },
    keep_separate: { sv: "Granskad som separat plats", en: "Reviewed as separate place" },
  };
  return labels[resolution][lang];
}
