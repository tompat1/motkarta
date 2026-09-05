"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OnboardingModal } from "./components/OnboardingModal";
import { AdminReviewPanel, isAdminRoutePath, readStoredAdminToken, type AdminSessionStatus } from "./admin/AdminReviewPanel";
import { ConciergeAnswerView } from "./components/ConciergeAnswerView";
import { ConciergeSuperpowerModal } from "./components/ConciergeSuperpowerModal";
import { CuratedSourcesPanel } from "./components/CuratedSourcesPanel";
import { ExternalMapLinks } from "./components/ExternalMapLinks";
import { FoodMap } from "./components/FoodMap";
import { LazyPlaceMediaDrawer } from "./components/LazyPlaceMediaDrawer";
import { VerificationBar } from "./components/VerificationBar";
import { matchesEstablishmentFilter } from "./app/place-filtering";
import { sanitizeAndAugmentPlaces } from "./app/place-sanitization";
import {
  DISTANCE_INTENT_REGEX,
  INITIAL_CURATED_SOURCES,
  POPULAR_CONCIERGE_PROMPTS,
  SEARCH_CUISINE_SUGGESTIONS,
  STOCKHOLM_REGION_OPTIONS,
  allCuisines,
  comparePlaces,
  cuisineLabel,
  cuisineOptionsFromPlaces,
  cuisineParts,
  distanceFromPoint,
  formatDistance,
  formatUpdatedDate,
  hasCoordinates,
  kindFilterLabel,
  logConciergeQuery,
  modeLabel,
  modeScore,
  modes,
  preferencesFromQuery,
  recommendationExplanation,
  recommendationImpressionLimit,
  renderLimit,
  rounded,
  sortModeLabel,
  sortModes,
  stockholmCenter,
  translations,
  visibleEstablishmentTypes,
  type CuratedSource,
  type CuisineFilter,
  type EstablishmentFilter,
  type Language,
  type Mode,
  type SortMode,
  type SuperpowerMode,
} from "./app/shared";
import {
  getRecommendationAnonymousUserId,
  getRecommendationSessionId,
  recommendationKindContext,
  recommendationRankingModeContext,
  recommendationSortModeContext,
  safeRandomId,
  MAX_RECOMMENDATION_EVENTS_PER_BATCH,
  RECOMMENDATION_SCORER_VERSION,
  queryLengthBucket,
  recommendationResultSetSignature,
  buildRecommendationEventIdempotencyKey,
  recommendationCuisineContext,
  recommendationModeForContext,
  type QueryContext,
  type RecommendationEventDraft,
} from "./ml/recommendationInstrumentation";
import { MerchPanel } from "./components/MerchPanel";
import { PreloaderModal } from "./components/PreloaderModal";
import {
  Bread,
  Certificate,
  Check,
  CaretUp,
  CaretDown,
  CircleNotch,
  Clock,
  Coffee,
  Compass,
  ForkKnife,
  Image,
  MapTrifold,
  MagnifyingGlass,
  PlusCircle,
  Scales,
  ShieldCheck,
  SignOut,
  ShoppingBag,
  ShoppingCart,
  Shuffle,
  Sliders,
  Sparkle,
  Star,
  Faders,
  List,
  Heart,
  PawPrint,
} from "@phosphor-icons/react";
import { parseConciergeAnswer } from "../lib/concierge-parser";
import { retrieveAndSynthesize } from "../functions/api/concierge";
import { CartDrawer } from "./components/CartDrawer";
import {
  MobileFilterBottomSheet,
  type MobileFilterState,
} from "./components/MobileFilterBottomSheet";
import { PlaceDetailSheet } from "./components/PlaceDetailSheet";
import { MobilePlaceCardList } from "./components/MobilePlaceCardList";
import {
  addUserReview,
  addUserPhoto,
} from "../lib/lazy-media";
import {
  type PlaceInput,
  type ScoredPlace,
  scorePlace,
} from "../lib/scoring";
import { fetchPlacesPayload, type DataSource } from "../lib/place-payload";

export default function App() {
  const [places, setPlaces] = useState<PlaceInput[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("loading");
  const [mode, setMode] = useState<Mode>("For you");
  const [sortMode, setSortMode] = useState<SortMode>("Best match");
  const [randomSeed, setRandomSeed] = useState(1);
  const [kind, setKind] = useState<EstablishmentFilter>("All places");
  const [cuisine, setCuisine] = useState<CuisineFilter>(allCuisines);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [isMapCardMinimized, setIsMapCardMinimized] = useState(false);

  const [mobileViewMode, setMobileViewMode] = useState<"map" | "list">("map");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isPlaceDetailOpen, setIsPlaceDetailOpen] = useState(false);
  const [mobileFilters, setMobileFilters] = useState<MobileFilterState>({
    savedOnly: false,
    openOnly: false,
    kind: "All places",
    cuisine: allCuisines,
    selectedTags: [],
  });

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (mobileFilters.savedOnly) count++;
    if (mobileFilters.openOnly) count++;
    if (kind !== "All places") count++;
    if (cuisine !== allCuisines) count++;
    count += mobileFilters.selectedTags.length;
    return count;
  }, [mobileFilters, kind, cuisine]);

  const handleUpdateMobileFilters = (newFilters: MobileFilterState) => {
    setMobileFilters(newFilters);
    if (newFilters.kind !== kind) {
      setKind(newFilters.kind);
    }
    if (newFilters.cuisine !== cuisine) {
      setCuisine(newFilters.cuisine);
    }
  };

  const handleResetMobileFilters = () => {
    setMobileFilters({
      savedOnly: false,
      openOnly: false,
      kind: "All places",
      cuisine: allCuisines,
      selectedTags: [],
    });
    setKind("All places");
    setCuisine(allCuisines);
    setQuery("");
  };

  useEffect(() => {
    setIsMapCardMinimized(false);
  }, [selected]);

  const [superpowerMode, setSuperpowerMode] = useState<SuperpowerMode | null>(null);
  const [lang, setLang] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("motkarta_lang");
      if (saved === "sv" || saved === "en") return saved;
    }
    return "sv";
  });

  const t = translations[lang];
  const isAdminRoute = isAdminRoutePath();

  const handleSetLang = (newLang: Language) => {
    setLang(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_lang", newLang);
    }
  };

  const [userRatings, setUserRatings] = useState<Record<number, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("motkarta_ratings");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {};
  });

  const [savedPlaceIds, setSavedPlaceIds] = useState<number[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("motkarta_saved_places");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  const [cart, setCart] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("motkarta_cart");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {};
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  const handleAddToCart = (itemId: string) => {
    setCart((prev) => {
      const current = prev[itemId] || 0;
      const next = { ...prev, [itemId]: current + 1 };
      if (typeof window !== "undefined") {
        localStorage.setItem("motkarta_cart", JSON.stringify(next));
      }
      return next;
    });
  };

  const handleUpdateCartQty = (itemId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[itemId] || 0;
      const updated = current + delta;
      let next: Record<string, number>;
      if (updated <= 0) {
        next = { ...prev };
        delete next[itemId];
      } else {
        next = { ...prev, [itemId]: updated };
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("motkarta_cart", JSON.stringify(next));
      }
      return next;
    });
  };

  const handleRemoveCartItem = (itemId: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[itemId];
      if (typeof window !== "undefined") {
        localStorage.setItem("motkarta_cart", JSON.stringify(next));
      }
      return next;
    });
  };

  const totalCartCount = Object.values(cart).reduce((sum, count) => sum + count, 0);

  const [showPreloader, setShowPreloader] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("motkarta_preloader_seen") !== "true";
    }
    return false;
  });

  const handleClosePreloader = () => {
    setShowPreloader(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_preloader_seen", "true");
    }
  };

  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("motkarta_onboarded") !== "true";
    }
    return false;
  });

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_onboarded", "true");
    }
  };

  const handleRatePlace = (id: number, rating: number) => {
    const updated = { ...userRatings, [id]: rating };
    setUserRatings(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_ratings", JSON.stringify(updated));
    }
  };

  const handleToggleSavePlace = (id: number) => {
    const wasSaved = savedPlaceIds.includes(id);
    const updated = savedPlaceIds.includes(id)
      ? savedPlaceIds.filter((pId) => pId !== id)
      : [...savedPlaceIds, id];
    setSavedPlaceIds(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_saved_places", JSON.stringify(updated));
    }
    if (!wasSaved) {
      recordRecommendationEvents([{ establishmentId: id, eventType: "save", queryContext: { surface: "place_detail" } }]);
    }
  };

  const [concierge, setConcierge] = useState(
    lang === "sv"
      ? "specialty coffee och kardemummabulle, bortom de mest turistiga gatorna"
      : "specialty coffee and a cardamom bun, away from the busiest tourist streets",
  );
  const [curatedSources, setCuratedSources] = useState<CuratedSource[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_user_sources");
        if (stored) {
          const userSources: CuratedSource[] = JSON.parse(stored);
          return [...INITIAL_CURATED_SOURCES, ...userSources];
        }
      } catch {}
    }
    return INITIAL_CURATED_SOURCES;
  });

  const handleAddSourceSuperpower = (newSource: CuratedSource) => {
    setCuratedSources((prev) => [...prev, newSource]);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_user_sources");
        const list: CuratedSource[] = stored ? JSON.parse(stored) : [];
        localStorage.setItem("motkarta_user_sources", JSON.stringify([...list, newSource]));
      } catch {}
    }
    void fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSource),
    }).catch(() => {});
    setAnswer(
      lang === "sv"
        ? `Källan '${newSource.name}' har lagts till i registret och sparats i databasen.`
        : `The source '${newSource.name}' has been added to the registry and saved to the database.`,
    );
  };
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const [isSourcesLoading, setIsSourcesLoading] = useState(false);
  const [isPromptsLoading, setIsPromptsLoading] = useState(false);
  const [adminSession, setAdminSession] = useState<AdminSessionStatus | null>(null);

  const checkGlobalAdminSession = useCallback(async (tokenOverride?: string) => {
    const token = (tokenOverride ?? readStoredAdminToken()).trim();
    try {
      const res = await fetch("/api/admin/session", {
        headers: token ? { "x-motkarta-admin-token": token } : {},
      });
      const data = (await res.json().catch(() => null)) as AdminSessionStatus | null;
      if (res.ok && data?.admin) {
        setAdminSession(data);
      } else {
        setAdminSession(null);
      }
    } catch {
      setAdminSession(null);
    }
  }, []);

  const handleGlobalAdminLogout = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("motkarta_admin_token");
    }
    const mode = adminSession?.authMode;
    setAdminSession(null);
    if (mode === "token") {
      void checkGlobalAdminSession("");
      return;
    }
    if (typeof window !== "undefined") {
      window.location.assign("/cdn-cgi/access/logout");
    }
  };

  useEffect(() => {
    void checkGlobalAdminSession();
  }, [checkGlobalAdminSession]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlaces() {
      try {
        const payload = await fetchPlacesPayload();

        if (!cancelled && payload.places?.length) {
          setPlaces(sanitizeAndAugmentPlaces(payload.places));
          setDataSource(payload.source);
        } else if (!cancelled) {
          setPlaces([]);
          setDataSource("unavailable");
        }
      } catch {
        if (!cancelled) {
          setPlaces([]);
          setDataSource("unavailable");
        }
      }
    }

    async function loadDbSources() {
      setIsSourcesLoading(true);
      try {
        const resp = await fetch("/api/sources");
        if (resp.ok) {
          const payload = (await resp.json()) as { sources?: CuratedSource[] };
          if (!cancelled && payload.sources?.length) {
            setCuratedSources(payload.sources);
          }
        }
      } catch {}
      if (!cancelled) setIsSourcesLoading(false);
    }

    async function loadDbPrompts() {
      setIsPromptsLoading(true);
      try {
        const resp = await fetch("/api/prompts");
        if (resp.ok) {
          const payload = (await resp.json()) as { prompts?: string[] };
          if (!cancelled && payload.prompts?.length) {
            setConciergeHistory((prev) => Array.from(new Set([...payload.prompts!, ...prev])));
          }
        }
      } catch {}
      if (!cancelled) setIsPromptsLoading(false);
    }

    void loadPlaces();
    void loadDbSources();
    void loadDbPrompts();

    return () => {
      cancelled = true;
    };
  }, []);

  const preferences = useMemo(() => preferencesFromQuery(query, kind), [kind, query]);
  const scoredPlaces = useMemo(
    () => places.map((place) => scorePlace(place, preferences)),
    [places, preferences],
  );
  const cuisineOptions = useMemo(() => cuisineOptionsFromPlaces(places), [places]);

  useEffect(() => {
    if (cuisine !== allCuisines && !cuisineOptions.includes(cuisine)) {
      setCuisine(allCuisines);
    }
  }, [cuisine, cuisineOptions]);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "acquired" | "denied">("idle");
  const [locationToast, setLocationToast] = useState<string | null>(null);

  const requestUserLocation = useCallback(
    (autoSortByDistance = false) => {
      if (typeof window === "undefined" || !navigator.geolocation) {
        setLocationStatus("denied");
        return;
      }
      setLocationStatus("requesting");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setUserLocation(coords);
          setLocationStatus("acquired");
          if (autoSortByDistance) {
            setSortMode("Distance");
          }
        },
        (err) => {
          console.warn("Geolocation positioning error:", err);
          setLocationStatus("denied");
          if (autoSortByDistance) {
            setLocationToast(
              lang === "sv"
                ? "Kunde inte hämta din position. Tillåt platstjänster i webbläsaren."
                : "Could not retrieve your location. Please allow location access.",
            );
            setTimeout(() => setLocationToast(null), 4000);
          }
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    },
    [lang],
  );

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      requestUserLocation(false);
    }
  }, [requestUserLocation]);

  const ranked = useMemo(

    () =>
      scoredPlaces
        .filter((place) => {
          if (mobileFilters.savedOnly && !savedPlaceIds.includes(place.id)) {
            return false;
          }
          return matchesEstablishmentFilter(place, kind, savedPlaceIds);
        })
        .filter((place) => cuisine === allCuisines || cuisineParts(place).includes(cuisine))
        .filter((place) => {
          if (mobileFilters.selectedTags.length === 0) return true;
          const searchStr = [
            ...place.tags,
            place.kind,
            place.cuisine || "",
            place.specialty?.ownRoastery ? "Own roastery" : "",
            place.specialty?.singleOrigin ? "Single origin" : "",
            place.specialty?.filterCoffee ? "Filter" : "",
            ...(place.specialty?.manualBrewMethods || []),
          ]
            .join(" ")
            .toLowerCase();

          return mobileFilters.selectedTags.every((t) => {
            const tLower = t.toLowerCase();
            const noteLower = (place.note ?? "").toLowerCase();
            const nameLower = (place.name ?? "").toLowerCase();
            const evLabelLower = (place.evidenceLabel ?? "").toLowerCase();
            const placeTags = (place.tags ?? []).map((pt) => pt.toLowerCase());

            if (tLower === "dog friendly" || tLower === "hundvänligt") {
              return (
                searchStr.includes("dog friendly") ||
                searchStr.includes("hundvänligt") ||
                searchStr.includes("hundvänlig") ||
                searchStr.includes("tasstipset") ||
                evLabelLower.includes("tasstipset") ||
                nameLower.includes("dog") ||
                nameLower.includes("hund") ||
                noteLower.includes("hund") ||
                noteLower.includes("dog") ||
                placeTags.some((pt) =>
                  [
                    "dog friendly",
                    "hundvänligt",
                    "tasstipset",
                    "hundar välkomna",
                    "verifierad hundpolicy",
                    "hundar inne & ute",
                    "endast uteservering",
                  ].includes(pt) ||
                  pt.includes("dog") ||
                  pt.includes("hund")
                )
              );
            }
            return (
              searchStr.includes(tLower) ||
              nameLower.includes(tLower) ||
              noteLower.includes(tLower) ||
              placeTags.some((pt) => pt.includes(tLower))
            );
          });
        })
        .filter((place) =>
          `${place.name} ${place.area} ${place.cuisine ?? ""} ${place.tags.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => {
          if (kind === "Latest" && sortMode === "Best match") {
            const dateA = new Date(a.lastUpdated ?? 0).getTime();
            const dateB = new Date(b.lastUpdated ?? 0).getTime();
            if (dateA !== dateB) return dateB - dateA;
            return b.id - a.id;
          }
          return comparePlaces(a, b, mode, sortMode, randomSeed, userLocation ?? stockholmCenter);
        }),
    [
      cuisine,
      kind,
      mobileFilters.savedOnly,
      mobileFilters.selectedTags,
      mode,
      query,
      randomSeed,
      savedPlaceIds,
      scoredPlaces,
      sortMode,
      userLocation,
    ],
  );
  const visibleRanked = useMemo(() => ranked.slice(0, renderLimit), [ranked]);
  const hasSearchQuery = Boolean(query.trim());

  const recommendationQueryContext = useMemo<QueryContext>(
    () => ({
      hasQuery: Boolean(query.trim()),
      queryLengthBucket: queryLengthBucket(query),
      kind: recommendationKindContext(kind),
      cuisine: recommendationCuisineContext(cuisine),
      mode: recommendationRankingModeContext(mode),
      sortMode: recommendationSortModeContext(sortMode),
      resultCount: visibleRanked.length,
      surface: "results",
    }),
    [cuisine, kind, mode, query, sortMode, visibleRanked.length],
  );
  const resultSetSignature = useMemo(
    () => recommendationResultSetSignature(recommendationQueryContext, visibleRanked.map((place) => place.id)),
    [recommendationQueryContext, visibleRanked],
  );
  const resultSetStateRef = useRef({ signature: "", sequence: 0, id: "" });
  if (resultSetStateRef.current.signature !== resultSetSignature) {
    const sequence = resultSetStateRef.current.sequence + 1;
    resultSetStateRef.current = {
      signature: resultSetSignature,
      sequence,
      id: `rs_${Date.now().toString(36)}_${sequence}_${safeRandomId().slice(0, 12)}`,
    };
  }
  const recommendationResultSetId = resultSetStateRef.current.id;
  const attemptedRecommendationEventKeysRef = useRef<Set<string>>(new Set());
  const recommendationEventFlushRef = useRef<Promise<void>>(Promise.resolve());

  const recordRecommendationEvents = useCallback(
    (drafts: RecommendationEventDraft[]) => {
      if (typeof window === "undefined" || !drafts.length) return;
      if (dataSource !== "d1") return;

      const anonymousUserId = getRecommendationAnonymousUserId();
      const sessionId = getRecommendationSessionId();
      const occurredAt = new Date().toISOString();
      const events = drafts.map((draft) => {
        const queryContext = { ...recommendationQueryContext, ...(draft.queryContext ?? {}) };
        const resultSetId = draft.resultSetId ?? (draft.eventType === "impression" ? recommendationResultSetId : null);
        return {
          establishmentId: draft.establishmentId,
          anonymousUserId,
          sessionId,
          eventType: draft.eventType,
          resultPosition: draft.resultPosition ?? null,
          recommendationMode: draft.recommendationMode ?? recommendationModeForContext(queryContext),
          queryContext,
          modelVersion: RECOMMENDATION_SCORER_VERSION,
          occurredAt,
          idempotencyKey: buildRecommendationEventIdempotencyKey({
            sessionId,
            eventType: draft.eventType,
            establishmentId: draft.establishmentId,
            resultPosition: draft.resultPosition,
            modelVersion: RECOMMENDATION_SCORER_VERSION,
            queryContext,
            resultSetId,
          }),
        };
      });

      const attemptedKeys = attemptedRecommendationEventKeysRef.current;
      const unsentEvents = events.filter((event) => {
        if (attemptedKeys.has(event.idempotencyKey)) return false;
        attemptedKeys.add(event.idempotencyKey);
        return true;
      });

      if (!unsentEvents.length) return;

      if (attemptedKeys.size > 2_000) {
        for (const key of attemptedKeys) {
          attemptedKeys.delete(key);
          if (attemptedKeys.size <= 1_500) break;
        }
      }

      recommendationEventFlushRef.current = recommendationEventFlushRef.current
        .catch(() => {})
        .then(async () => {
          for (let index = 0; index < unsentEvents.length; index += MAX_RECOMMENDATION_EVENTS_PER_BATCH) {
            const chunk = unsentEvents.slice(index, index + MAX_RECOMMENDATION_EVENTS_PER_BATCH);
            await fetch("/api/recommendation-events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ events: chunk }),
              keepalive: chunk.length <= 20,
            }).catch(() => undefined);
          }
        });
      void recommendationEventFlushRef.current;
    },
    [dataSource, recommendationQueryContext, recommendationResultSetId],
  );

  useEffect(() => {
    if (!visibleRanked.length) return;
    recordRecommendationEvents(
      visibleRanked
        .slice(0, recommendationImpressionLimit)
        .map((place, index) => ({
          establishmentId: place.id,
          eventType: "impression",
          resultPosition: index,
          resultSetId: recommendationResultSetId,
        })),
    );
  }, [recordRecommendationEvents, recommendationResultSetId, visibleRanked]);

  const active = selected !== null ? (ranked.find((place) => place.id === selected) ?? null) : null;

  useEffect(() => {
    if (selected !== null && !ranked.some((place) => place.id === selected)) {
      setSelected(null);
    }
  }, [ranked, selected]);

  const handleSelectPlace = useCallback(
    (id: number) => {
      setSelected(id);
      recordRecommendationEvents([{ establishmentId: id, eventType: "profile_view", queryContext: { surface: "map" } }]);
      const isVisibleInRanked = ranked.some((p) => p.id === id);
      if (!isVisibleInRanked) {
        setKind("All places");
        setCuisine(allCuisines);
        setQuery("");
      }
    },
    [ranked, recordRecommendationEvents],
  );

  const mapPlaces = useMemo(
    () => (active && !visibleRanked.some((p) => p.id === active.id) ? [active, ...visibleRanked] : visibleRanked),
    [active, visibleRanked],
  );

  const [isConciergeFocused, setIsConciergeFocused] = useState(false);
  const [conciergeHistory, setConciergeHistory] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_concierge_history");
        if (stored) {
          const list: Array<{ query: string }> = JSON.parse(stored);
          return list.map((item) => item.query);
        }
      } catch {}
    }
    return [];
  });

  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const matchingSuggestions = useMemo(() => {
    const inputClean = concierge.trim().toLowerCase();
    const allCandidates = Array.from(new Set([...conciergeHistory, ...POPULAR_CONCIERGE_PROMPTS]));
    if (!inputClean) {
      return allCandidates.slice(0, 5);
    }
    return allCandidates
      .filter((prompt) => prompt.toLowerCase().includes(inputClean))
      .slice(0, 5);
  }, [concierge, conciergeHistory]);

  const searchAutocompleteSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matchedRegions = STOCKHOLM_REGION_OPTIONS.filter(
      (r) => r.label.toLowerCase().includes(q) || r.aliases.some((a) => a.includes(q))
    ).map((r) => ({
      id: `region-${r.value}`,
      label: r.label,
      value: r.value,
      badge: "Stadsdel",
      icon: "📍",
    }));

    const matchedCuisines = SEARCH_CUISINE_SUGGESTIONS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.value.toLowerCase().includes(q)
    ).map((c) => ({
      id: `cuisine-${c.value}`,
      label: c.label,
      value: c.value,
      badge: c.badge,
      icon: "🍴",
    }));

    const matchedPlaces = places
      .filter((p) => p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q))
      .slice(0, 5)
      .map((p) => ({
        id: `place-${p.id}`,
        label: `${p.name} (${p.area})`,
        value: p.name,
        badge: p.kind,
        icon: "🏢",
      }));

    if (!q) {
      return [...matchedRegions.slice(0, 4), ...matchedCuisines.slice(0, 4), ...matchedPlaces.slice(0, 3)];
    }

    return [...matchedRegions, ...matchedCuisines, ...matchedPlaces].slice(0, 8);
  }, [places, query]);

  async function askWithQuery(queryText: string) {
    if (!queryText.trim()) return;

    if (DISTANCE_INTENT_REGEX.test(queryText)) {
      if (!userLocation) {
        requestUserLocation(true);
      } else {
        setSortMode("Distance");
      }
    }

    setAsking(true);
    setAnswer(null);

    logConciergeQuery(queryText, lang);
    setConciergeHistory((prev) => {
      const filtered = prev.filter((q) => q.toLowerCase() !== queryText.trim().toLowerCase());
      return [queryText.trim(), ...filtered].slice(0, 100);
    });

    let finalAnswer = "";

    try {
      const resp = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText, places }),
      });

      if (resp.ok) {
        const payload = (await resp.json()) as { answer?: string };
        if (payload.answer) {
          finalAnswer = payload.answer;
        }
      }
    } catch {
      // Fallback to local RAG when endpoint is unreachable in standalone dev
    }

    if (!finalAnswer) {
      const ragResult = retrieveAndSynthesize(queryText, places);
      finalAnswer = ragResult.answer;
    }

    setAnswer(finalAnswer);
    setAsking(false);

    const parsed = parseConciergeAnswer(finalAnswer);
    if (parsed.superpowerAction) {
      setSuperpowerMode(parsed.superpowerAction);
    }
  }

  const handleAddPlaceSuperpower = (newPlace: PlaceInput) => {
    setPlaces((prev) => [newPlace, ...prev]);
    setSelected(newPlace.id);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_user_places");
        const list: PlaceInput[] = stored ? JSON.parse(stored) : [];
        localStorage.setItem("motkarta_user_places", JSON.stringify([newPlace, ...list]));
      } catch {}
    }
    setAnswer(`Superpower aktiverad. Ditt nya oberoende ställe '${newPlace.name}' i ${newPlace.area} har lagts till lokalt som kandidat för verifiering.`);
  };

  const handleAddReviewSuperpower = (placeId: number, rev: { author: string; rating: number; content: string; source: "Community Submission" }) => {
    addUserReview(placeId, rev);
    const targetPlace = places.find((p) => p.id === placeId);
    setSelected(placeId);
    setAnswer(`Superpower aktiverad. Din recension för '${targetPlace?.name ?? "Stället"}' har sparats och inväntar verifiering.`);
  };

  const handleAddPhotoSuperpower = (placeId: number, ph: { url: string; thumbnailUrl: string; caption: string; credit?: string }) => {
    addUserPhoto(placeId, ph);
    const targetPlace = places.find((p) => p.id === placeId);
    setSelected(placeId);
    setAnswer(`📷 Superpower Aktiverad! Ditt foto för '${targetPlace?.name ?? "Stället"}' har lagts till i bildgalleriet!`);
  };

  const handleRatePlaceSuperpower = (placeId: number, rating: number) => {
    handleRatePlace(placeId, rating);
    const targetPlace = places.find((p) => p.id === placeId);
    setSelected(placeId);
    setAnswer(`⭐ Superpower Aktiverad! Ditt betyg (${rating}/5 stjärnor) för '${targetPlace?.name ?? "Stället"}' har sparats!`);
  };

  async function ask() {
    await askWithQuery(concierge);
  }

  async function askFromSearch() {
    const searchText = query.trim() || concierge.trim();
    if (!searchText) return;

    setConcierge(searchText);
    await askWithQuery(searchText);

    if (typeof window !== "undefined") {
      setTimeout(() => {
        document.getElementById("concierge-answer")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }

  const handleRefineQuery = (extra: string) => {
    const updated = `${concierge} (${extra})`;
    setConcierge(updated);
    void askWithQuery(updated);
  };

  if (isAdminRoute) {
    return (
      <main className="admin-app-shell">
        <header className="admin-app-topbar">
          <a className="brand" href="/" aria-label="MOTKARTA">
            <img src="/motkarta_drop_divided_black_red.svg" alt="MOTKARTA Pin" className="brand-counter-pin" />
            <img src="/logo.webp" alt="MOTKARTA" className="brand-logo" />
            <span>{t.brandDescriptor}</span>
          </a>
          <div className="admin-topbar-actions">
            {adminSession?.admin ? (
              <div className="admin-session-auth" aria-live="polite">
                <ShieldCheck size={14} weight="bold" />
                <span>
                  {adminSession.email
                    ? adminSession.email
                    : lang === "sv"
                      ? "Adminsession aktiv"
                      : "Admin session active"}
                </span>
                <button
                  type="button"
                  className="admin-review-ghost-btn admin-logout-btn"
                  onClick={handleGlobalAdminLogout}
                  title={lang === "sv" ? "Logga ut från adminsession" : "Log out from admin session"}
                >
                  <SignOut size={14} weight="bold" />
                  {adminSession.authMode === "token"
                    ? lang === "sv"
                      ? "Glöm token"
                      : "Forget token"
                    : lang === "sv"
                      ? "Logga ut"
                      : "Log out"}
                </button>
              </div>
            ) : null}
            <div className="lang-switcher" aria-label="Language selector">
              <button
                type="button"
                className={`lang-btn ${lang === "sv" ? "active" : ""}`}
                onClick={() => handleSetLang("sv")}
              >
                SV
              </button>
              <button
                type="button"
                className={`lang-btn ${lang === "en" ? "active" : ""}`}
                onClick={() => handleSetLang("en")}
              >
                EN
              </button>
            </div>
          </div>
        </header>
        <section className="admin-app-intro" aria-labelledby="admin-app-title">
          <p className="eyebrow">{lang === "sv" ? "Skyddad adminyta" : "Protected admin area"}</p>
          <h1 id="admin-app-title">{lang === "sv" ? "Operationskö" : "Operations queue"}</h1>
          <p>
            {lang === "sv"
              ? "Granska kandidater, exportera labels och kontrollera att D1-adminschemat är redo."
              : "Review candidates, export labels, and check that the D1 admin schema is ready."}
          </p>
        </section>
        <CuratedSourcesPanel
          sources={curatedSources}
          isLoading={isSourcesLoading}
          lang={lang}
          onAddSource={() => setSuperpowerMode("add_source")}
        />
        <AdminReviewPanel
          lang={lang}
          adminSession={adminSession}
          onSessionChange={setAdminSession}
          onLogout={handleGlobalAdminLogout}
        />
        {superpowerMode === "add_source" ? (
          <ConciergeSuperpowerModal
            mode={superpowerMode}
            places={places}
            activePlace={active}
            onClose={() => setSuperpowerMode(null)}
            onAddPlace={handleAddPlaceSuperpower}
            onAddReview={handleAddReviewSuperpower}
            onAddPhoto={handleAddPhotoSuperpower}
            onRatePlace={handleRatePlaceSuperpower}
            onAddSource={handleAddSourceSuperpower}
            lang={lang}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main>
      {/* Unified Motkarta Top Header */}
      <header className="topbar">
        <a
          className="brand"
          href="#"
          aria-label="MOTKARTA"
          onClick={(e) => {
            e.preventDefault();
            handleResetMobileFilters();
          }}
        >
          <img src="/motkarta_drop_divided_black_red.svg" alt="MOTKARTA Pin" className="brand-counter-pin" />
          <img src="/logo.webp" alt="MOTKARTA" className="brand-logo" />
          <span className="brand-descriptor">{t.brandDescriptor}</span>
        </a>
        <nav>
          <a href="#map" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Compass size={14} weight="bold" /> {t.navMap}
          </a>
          <a href="#method" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <ShieldCheck size={14} weight="bold" /> {t.navMethod}
          </a>
          <a href="#concierge" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <MagnifyingGlass size={14} weight="bold" /> {t.navConcierge}
          </a>
          <a href="#merch" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <ShoppingBag size={14} weight="bold" /> Merch
          </a>
          <button
            type="button"
            className="onboarding-trigger-btn"
            onClick={() => setShowOnboarding(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", font: "inherit", color: "inherit", cursor: "pointer" }}
          >
            <Sparkle size={14} weight="bold" /> {lang === "sv" ? "Principer" : "Principles"}
          </button>
        </nav>
        <div className="topbar-actions">
          {adminSession?.admin ? (
            <div className="admin-session-auth topbar-session-auth" aria-live="polite">
              <ShieldCheck size={14} weight="bold" />
              <span>
                {adminSession.email
                  ? adminSession.email
                  : lang === "sv"
                    ? "Admin"
                    : "Admin"}
              </span>
              <button
                type="button"
                className="admin-review-ghost-btn admin-logout-btn"
                onClick={handleGlobalAdminLogout}
                title={lang === "sv" ? "Logga ut från adminsession" : "Log out of admin session"}
              >
                <SignOut size={14} weight="bold" />
                {adminSession.authMode === "token"
                  ? lang === "sv"
                    ? "Glöm"
                    : "Forget"
                  : lang === "sv"
                    ? "Logga ut"
                    : "Log out"}
              </button>
            </div>
          ) : null}

          {/* Mobile view toggle (Map / List) - only visible on mobile */}
          <button
            type="button"
            className="mobile-nav-toggle-btn"
            onClick={() => setMobileViewMode(mobileViewMode === "map" ? "list" : "map")}
            aria-label={mobileViewMode === "map" ? "Visa lista" : "Visa karta"}
          >
            {mobileViewMode === "map" ? (
              <>
                <List size={16} weight="bold" />
                <span>{lang === "sv" ? "Lista" : "List"}</span>
              </>
            ) : (
              <>
                <MapTrifold size={16} weight="bold" />
                <span>{lang === "sv" ? "Karta" : "Map"}</span>
              </>
            )}
          </button>

          <button
            type="button"
            className={`topbar-cart-btn ${totalCartCount > 0 ? "has-items" : ""}`}
            onClick={() => setIsCartOpen(true)}
            aria-label={lang === "sv" ? "Öppna varukorg" : "Open shopping cart"}
            title={lang === "sv" ? `Varukorg (${totalCartCount})` : `Shopping Cart (${totalCartCount})`}
          >
            <ShoppingCart size={16} weight="bold" />
            <span className="topbar-cart-badge">{totalCartCount}</span>
          </button>

          <div className="lang-switcher" aria-label="Language selector">
            <button
              type="button"
              className={`lang-btn ${lang === "sv" ? "active" : ""}`}
              onClick={() => handleSetLang("sv")}
            >
              SV
            </button>
            <button
              type="button"
              className={`lang-btn ${lang === "en" ? "active" : ""}`}
              onClick={() => handleSetLang("en")}
            >
              EN
            </button>
          </div>

          <a className="about" href="#sources">
            <span className={`status-dot status-dot-${dataSource}`} />
            {dataSource === "osm"
              ? t.dataSourceLiveOsm
              : dataSource === "d1"
                ? t.dataSourceLiveD1
                : dataSource === "loading"
                  ? t.dataSourceLoading
                  : t.dataSourceUnavailable}
          </a>
        </div>
      </header>

      {/* Mobile-only Quick Search & Filter Controls */}
      <div className="mobile-controls-bar">
        {/* Search Bar Input */}
        <div className="mobile-search-input-wrapper">
          <MagnifyingGlass size={18} weight="bold" className="mobile-search-icon" />
          <input
            type="text"
            className="mobile-search-input"
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              setConcierge(val);
            }}
            placeholder={lang === "sv" ? "Vad vill du äta?" : "What do you want to eat?"}
          />
          {query.trim() ? (
            <button
              type="button"
              className="mobile-search-clear"
              onClick={() => {
                setQuery("");
                setConcierge("");
              }}
              aria-label="Clear search"
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* Horizontal Quick Filter Carousel */}
        <div className="mobile-quick-filter-carousel" role="toolbar" aria-label="Quick filters">
          <button
            type="button"
            className={`quick-filter-pill ${activeFilterCount > 0 ? "is-primary-active" : ""}`}
            onClick={() => setIsFilterSheetOpen(true)}
          >
            <Faders size={14} weight="bold" />
            {activeFilterCount > 0 ? (
              <span className="quick-filter-badge">{activeFilterCount}</span>
            ) : null}
            <span>{lang === "sv" ? "Filter" : "Filters"}</span>
          </button>

          <button
            type="button"
            className={`quick-filter-pill ${mobileFilters.savedOnly ? "is-active" : ""}`}
            onClick={() =>
              handleUpdateMobileFilters({
                ...mobileFilters,
                savedOnly: !mobileFilters.savedOnly,
              })
            }
          >
            <Heart
              size={13}
              weight={mobileFilters.savedOnly ? "fill" : "bold"}
            />
            <span>{lang === "sv" ? "Sparade" : "Saved"}</span>
          </button>

          <button
            type="button"
            className={`quick-filter-pill ${mobileFilters.openOnly ? "is-active" : ""}`}
            onClick={() =>
              handleUpdateMobileFilters({
                ...mobileFilters,
                openOnly: !mobileFilters.openOnly,
              })
            }
          >
            <Clock size={13} weight="bold" />
            <span>{lang === "sv" ? "Öppet nu" : "Open now"}</span>
          </button>

          <button
            type="button"
            className={`quick-filter-pill ${mobileFilters.selectedTags.includes("Dog friendly") ? "is-active" : ""}`}
            onClick={() => {
              const exists = mobileFilters.selectedTags.includes("Dog friendly");
              const updated = exists
                ? mobileFilters.selectedTags.filter((t) => t !== "Dog friendly")
                : [...mobileFilters.selectedTags, "Dog friendly"];
              handleUpdateMobileFilters({
                ...mobileFilters,
                selectedTags: updated,
              });
            }}
          >
            <PawPrint
              size={13}
              weight={mobileFilters.selectedTags.includes("Dog friendly") ? "fill" : "bold"}
            />
            <span>{lang === "sv" ? "Hundvänligt" : "Dog friendly"}</span>
          </button>

          <button
            type="button"
            className={`quick-filter-pill ${kind === "Specialty coffee" ? "is-active" : ""}`}
            onClick={() => {
              const nextKind = kind === "Specialty coffee" ? "All places" : "Specialty coffee";
              setKind(nextKind);
              setMobileFilters((prev) => ({ ...prev, kind: nextKind }));
            }}
          >
            <span>Specialty Coffee</span>
          </button>

          <button
            type="button"
            className={`quick-filter-pill ${cuisine === "pizza" ? "is-active" : ""}`}
            onClick={() => {
              const nextCuisine = cuisine === "pizza" ? allCuisines : "pizza";
              setCuisine(nextCuisine);
              setMobileFilters((prev) => ({ ...prev, cuisine: nextCuisine }));
            }}
          >
            <span>Pizza</span>
          </button>

          <button
            type="button"
            className={`quick-filter-pill ${kind === "Bakery" ? "is-active" : ""}`}
            onClick={() => {
              const nextKind = kind === "Bakery" ? "All places" : "Bakery";
              setKind(nextKind);
              setMobileFilters((prev) => ({ ...prev, kind: nextKind }));
            }}
          >
            <span>{lang === "sv" ? "Bageri" : "Bakery"}</span>
          </button>

          <button
            type="button"
            className={`quick-filter-pill ${kind === "Restaurant" ? "is-active" : ""}`}
            onClick={() => {
              const nextKind = kind === "Restaurant" ? "All places" : "Restaurant";
              setKind(nextKind);
              setMobileFilters((prev) => ({ ...prev, kind: nextKind }));
            }}
          >
            <span>{lang === "sv" ? "Restaurang" : "Restaurant"}</span>
          </button>

          <button
            type="button"
            className={`quick-filter-pill ${query.toLowerCase() === "vasastan" ? "is-active" : ""}`}
            onClick={() => {
              const nextQuery = query.toLowerCase() === "vasastan" ? "" : "Vasastan";
              setQuery(nextQuery);
              setConcierge(nextQuery);
            }}
          >
            <span>Vasastan</span>
          </button>

          <button
            type="button"
            className={`quick-filter-pill ${query.toLowerCase() === "södermalm" ? "is-active" : ""}`}
            onClick={() => {
              const nextQuery = query.toLowerCase() === "södermalm" ? "" : "Södermalm";
              setQuery(nextQuery);
              setConcierge(nextQuery);
            }}
          >
            <span>Södermalm</span>
          </button>

          <button
            type="button"
            className={`quick-filter-pill ${query.toLowerCase() === "östermalm" ? "is-active" : ""}`}
            onClick={() => {
              const nextQuery = query.toLowerCase() === "östermalm" ? "" : "Östermalm";
              setQuery(nextQuery);
              setConcierge(nextQuery);
            }}
          >
            <span>Östermalm</span>
          </button>
        </div>
      </div>

      <section className="intro">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>
            {t.titleMain}
            <br />
            <i>{t.titleSub}</i>
          </h1>
          <p className="sub-lede">{t.subLede}</p>
        </div>
        <p className="lede">{t.lede}</p>
      </section>

      <section className="controls" id="map">
        <div className="search-container-relative">
          <div className="unified-search-input-wrapper">
            <MagnifyingGlass size={18} weight="bold" style={{ color: "var(--color-ink)", flexShrink: 0 }} />
            <input
              aria-label={lang === "sv" ? "Sök ställen, kök, område eller fråga concierge" : "Search places, cuisine, area, or ask concierge"}
              value={query}
              onChange={(event) => {
                const val = event.target.value;
                setQuery(val);
                setConcierge(val);
                if (DISTANCE_INTENT_REGEX.test(val)) {
                  if (!userLocation) {
                    requestUserLocation(true);
                  } else {
                    setSortMode("Distance");
                  }
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void askFromSearch();
                }
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
              placeholder={lang === "sv" ? "Sök ställe, kök, stadsdel eller ställ en fråga till concierge..." : "Search place, cuisine, region or ask concierge..."}
            />
            {query.trim() ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setQuery("");
                  setConcierge("");
                }}
                aria-label="Clear search field"
                title={lang === "sv" ? "Rensa fält" : "Clear field"}
              >
                ✕
              </button>
            ) : null}
            <button
              type="button"
              className="unified-search-ai-btn"
              onClick={() => void askFromSearch()}
              disabled={asking || !(query.trim() || concierge.trim())}
              title={lang === "sv" ? "Ställ fråga till AI-Concierge" : "Ask AI Concierge"}
            >
              {asking ? (
                <CircleNotch size={15} className="animate-spin" />
              ) : (
                <Sparkle size={15} weight="bold" />
              )}
              <span>{lang === "sv" ? "Fråga concierge" : "Ask concierge"}</span>
            </button>
          </div>

          <div className="unified-superpower-row" aria-label="Concierge superpowers">
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_place")}>
              <PlusCircle size={13} weight="bold" /> {lang === "sv" ? "➕ Nytt ställe" : "➕ Add place"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_review")}>
              <Sparkle size={13} weight="bold" /> {lang === "sv" ? "✍️ Recension" : "✍️ Review"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_photo")}>
              <Image size={13} weight="bold" /> {lang === "sv" ? "📷 Foto" : "📷 Photo"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("rate_place")}>
              <Star size={13} weight="bold" /> {lang === "sv" ? "⭐ Betygsätt" : "⭐ Rate"}
            </button>
            {(query.trim() || kind !== "All places" || cuisine !== allCuisines || mobileFilters.selectedTags.length > 0) ? (
              <button
                type="button"
                className="superpower-chip-btn"
                style={{ marginLeft: "auto", background: "transparent", borderColor: "var(--color-mist)", color: "var(--color-stone)" }}
                onClick={handleResetMobileFilters}
                title={lang === "sv" ? "Återställ alla filter och sökning" : "Reset all filters"}
              >
                ✕ {lang === "sv" ? "Rensa allt" : "Reset all"}
              </button>
            ) : null}
          </div>

          {isSearchFocused && (searchAutocompleteSuggestions.length > 0 || matchingSuggestions.length > 0) ? (
            <div className="search-autocomplete-box">
              {searchAutocompleteSuggestions.length > 0 ? (
                <>
                  <div className="autocomplete-category-header">
                    <Compass size={12} weight="bold" />
                    <span>{lang === "sv" ? "STADSDELAR, STÄLLEN & KÖK" : "REGIONS, PLACES & CUISINES"}</span>
                  </div>
                  {searchAutocompleteSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="autocomplete-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQuery(item.value);
                        setConcierge(item.value);
                        setIsSearchFocused(false);
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>{item.icon}</span>
                        <span style={{ fontWeight: 600 }}>{item.label}</span>
                      </span>
                      <span className="autocomplete-type-badge">{item.badge}</span>
                    </button>
                  ))}
                </>
              ) : null}

              {matchingSuggestions.length > 0 ? (
                <>
                  <div className="autocomplete-category-header" style={{ marginTop: searchAutocompleteSuggestions.length > 0 ? "8px" : "0", borderTop: searchAutocompleteSuggestions.length > 0 ? "1px solid var(--color-mist)" : "none", paddingTop: "8px" }}>
                    <Sparkle size={12} weight="bold" />
                    <span>{lang === "sv" ? "FRÅGA AI-CONCIERGE" : "ASK AI CONCIERGE"}</span>
                  </div>
                  {matchingSuggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="autocomplete-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQuery(item);
                        setConcierge(item);
                        setIsSearchFocused(false);
                        void askWithQuery(item);
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Sparkle size={13} style={{ color: "var(--color-water)" }} />
                        <span>{item}</span>
                      </span>
                      <span className="autocomplete-type-badge" style={{ background: "rgba(37, 99, 235, 0.1)", color: "var(--color-water)" }}>
                        {lang === "sv" ? "Fråga" : "Ask"}
                      </span>
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mobile-filter-selects" aria-label={lang === "sv" ? "Mobil platsfiltrering" : "Mobile place filters"}>
          <label>
            <span>{t.typeFilterLabel}</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as EstablishmentFilter)}>
              {visibleEstablishmentTypes.map((item) => (
                <option key={item} value={item}>
                  {kindFilterLabel(item, lang)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.cuisineFilterLabel}</span>
            <select value={cuisine} onChange={(event) => setCuisine(event.target.value)}>
              {[allCuisines, ...cuisineOptions].map((item) => (
                <option key={item} value={item}>
                  {item === allCuisines ? t.allCuisines : cuisineLabel(item, lang)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="chips" aria-label="Filter typ">
          <span className="filter-label">{t.typeFilterLabel}</span>
          <div className="chip-row">
            {visibleEstablishmentTypes.map((item) => (
              <button
                key={item}
                className={kind === item ? "active" : ""}
                onClick={() => setKind(item)}
                type="button"
              >
                {kindFilterLabel(item, lang)}
              </button>
            ))}
          </div>
        </div>
        <div className="chips cuisine-chips" aria-label="Filter kök">
          <span className="filter-label">{t.cuisineFilterLabel}</span>
          <div className="chip-row">
            {[allCuisines, ...cuisineOptions].map((item) => (
              <button
                key={item}
                className={cuisine === item ? "active" : ""}
                onClick={() => setCuisine(item)}
                type="button"
              >
                {item === allCuisines ? t.allCuisines : cuisineLabel(item, lang)}
              </button>
            ))}
          </div>
        </div>
        <div className="chips feature-chips" aria-label="Filter egenskaper">
          <span className="filter-label">{lang === "sv" ? "Egenskaper" : "Features"}</span>
          <div className="chip-row">
            <button
              className={mobileFilters.selectedTags.includes("Dog friendly") ? "active" : ""}
              onClick={() => {
                const exists = mobileFilters.selectedTags.includes("Dog friendly");
                const updated = exists
                  ? mobileFilters.selectedTags.filter((t) => t !== "Dog friendly")
                  : [...mobileFilters.selectedTags, "Dog friendly"];
                handleUpdateMobileFilters({
                  ...mobileFilters,
                  selectedTags: updated,
                });
              }}
              type="button"
              style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              <PawPrint size={13} weight={mobileFilters.selectedTags.includes("Dog friendly") ? "fill" : "bold"} />
              <span>{lang === "sv" ? "Hundvänligt" : "Dog Friendly"}</span>
            </button>
          </div>
        </div>
      </section>

      {answer ? (
        <section className="concierge-answer-section" id="concierge-answer" aria-label="Concierge answer">
          <ConciergeAnswerView
            answer={answer}
            places={places}
            onSelectPlace={handleSelectPlace}
            onRefineQuery={handleRefineQuery}
            lang={lang}
            onClose={() => setAnswer(null)}
          />
        </section>
      ) : null}

      <section className="workspace">
        {mobileViewMode === "list" ? (
          <MobilePlaceCardList
            places={visibleRanked}
            activePlace={active}
            savedPlaceIds={savedPlaceIds}
            userLocation={userLocation}
            lang={lang}
            onSelectPlace={(p) => {
              setSelected(p.id);
              setIsPlaceDetailOpen(true);
            }}
            onToggleSave={handleToggleSavePlace}
          />
        ) : (
          <div className="map-panel">
            <FoodMap
              places={mapPlaces}
              activePlace={active}
              userLocation={userLocation}
              onSelect={handleSelectPlace}
              onUserLocated={(loc) => {
                setUserLocation(loc);
                setSortMode("Distance");
              }}
              onToggleView={() => setMobileViewMode("list")}
              lang={lang}
            />

          {locationToast ? (
            <div className="location-toast" role="status">
              <span>{locationToast}</span>
              <button type="button" onClick={() => setLocationToast(null)}>✕</button>
            </div>
          ) : null}
          <div className="legend map-legend">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Coffee size={14} weight="bold" style={{ color: "var(--color-water)" }} /> {t.legendSpecialty}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Bread size={14} weight="bold" style={{ color: "var(--color-water)" }} /> {t.legendBakery}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <ForkKnife size={14} weight="bold" style={{ color: "var(--color-water)" }} /> {t.legendRestaurant}
            </span>
          </div>

          {active ? (
          <article className={`map-card ${isMapCardMinimized ? "is-minimized" : ""}`}>
            <div className="map-card-header">
              <div className="map-card-title-meta">
                <span className="map-card-kind-badge">
                  {kindFilterLabel(active.kind, lang)} · {active.area}
                  {userLocation && hasCoordinates(active) ? ` · 📍 ${formatDistance(distanceFromPoint(active, userLocation), lang)}` : ""}
                </span>
                <h3 className="map-card-header-title">{active.name}</h3>
              </div>
              <div className="map-card-header-actions">
                <button
                  type="button"
                  className="map-card-toggle-btn"
                  onClick={() => setIsMapCardMinimized(!isMapCardMinimized)}
                  title={
                    isMapCardMinimized
                      ? lang === "sv"
                        ? "Visa alla detaljer"
                        : "Expand details"
                      : lang === "sv"
                        ? "Minimera kort"
                        : "Minimize card"
                  }
                >
                  {isMapCardMinimized ? (
                    <>
                      <CaretDown size={14} weight="bold" />
                      <span>{lang === "sv" ? "Visa" : "Expand"}</span>
                    </>
                  ) : (
                    <>
                      <CaretUp size={14} weight="bold" />
                      <span>{lang === "sv" ? "Dölj" : "Minimize"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {!isMapCardMinimized && (
              <div className="map-card-body">
                {cuisineParts(active).length ? (
                  <p className="cuisine-line">{cuisineParts(active).map((c) => cuisineLabel(c, lang)).join(" · ")}</p>
                ) : null}
                <p className="recommendation">{recommendationExplanation(active)}</p>
                <p className="note">{active.note}</p>
                <div className="tag-row">
                  {active.tags.map((tag: string) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="score-row">
                  <div>
                    <b>{rounded(active.scores.quality)}</b>
                    <span>{t.quality}</span>
                  </div>
                  <div>
                    <b>{rounded(active.scores.popularity)}</b>
                    <span>{t.popularity}</span>
                  </div>
                  <div>
                    <b>{rounded(active.scores.discovery)}</b>
                    <span>{t.discovery}</span>
                  </div>
                  <div>
                    <b>{rounded(active.scores.relevance)}</b>
                    <span>{t.relevance}</span>
                  </div>
                </div>
                <div
                  className="user-rating-bar"
                  style={{
                    marginTop: "12px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--color-mist)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--color-ink)",
                      }}
                    >
                      {lang === "sv" ? "Ditt betyg:" : "Your rating:"}
                    </span>
                    <div style={{ display: "flex", gap: "3px" }}>
                      {[1, 2, 3, 4, 5].map((star) => {
                        const currentRating = userRatings[active.id] ?? 0;
                        const isFilled = currentRating >= star;
                        return (
                          <button
                            key={star}
                            type="button"
                            onClick={() => handleRatePlace(active.id, star)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: "2px",
                              cursor: "pointer",
                              display: "inline-flex",
                            }}
                            title={lang === "sv" ? `Ge ${star} av 5 stjärnor` : `Rate ${star} out of 5 stars`}
                          >
                            <Star
                              size={18}
                              weight={isFilled ? "fill" : "regular"}
                              style={{ color: isFilled ? "#F59E0B" : "var(--color-mist)" }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSavePlace(active.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      background: savedPlaceIds.includes(active.id) ? "var(--color-ink)" : "var(--color-white)",
                      color: savedPlaceIds.includes(active.id) ? "var(--color-paper)" : "var(--color-ink)",
                      border: "1px solid var(--color-mist)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all var(--motion-fast)",
                    }}
                  >
                    <Star
                      size={14}
                      weight={savedPlaceIds.includes(active.id) ? "fill" : "bold"}
                      style={{ color: savedPlaceIds.includes(active.id) ? "#F59E0B" : "currentColor" }}
                    />
                    {savedPlaceIds.includes(active.id)
                      ? lang === "sv"
                        ? "Sparad"
                        : "Saved"
                      : lang === "sv"
                        ? "Spara ställe"
                        : "Save place"}
                  </button>
                </div>

                <VerificationBar place={active} lang={lang} />
                <div className="curated-attribution-box">
                  <div className="curated-attribution-title">
                    <ShieldCheck size={14} style={{ color: "var(--color-water)" }} />
                    {lang === "sv" ? "KÄLLTILLSKRIVNING & UPPHOVSRÄTT" : "SOURCE ATTRIBUTION & COPYRIGHT"}
                  </div>
                  <div className="curated-attribution-body">
                    {lang === "sv"
                      ? "Kurerade källor används som källhänvisad plats- och evidensdata, inte som importerade betyg. Guidedata kan komma från Anders Husa & Kaitlin Orr Guide, White Guide Nordic, Specialty Coffee Sweden Registry och Visit Stockholm. Tillsynsdata från Stockholms stad (CC0). Kartdata från OpenStreetMap (ODbL)."
                      : "Curated sources are used as attributed place and evidence data, not imported ratings. Guide data may come from Anders Husa & Kaitlin Orr Guide, White Guide Nordic, Specialty Coffee Sweden Registry, and Visit Stockholm. Inspection data from Stockholm City (CC0). Map data from OpenStreetMap (ODbL)."}
                  </div>
                </div>
                <ExternalMapLinks
                  place={active}
                  lang={lang}
                  onDirectionRequest={() =>
                    recordRecommendationEvents([
                      { establishmentId: active.id, eventType: "direction_request", queryContext: { surface: "place_detail" } },
                    ])
                  }
                />
                {active.discoveryReasons?.length ? (
                  <ul className="reason-list" aria-label="Discovery score reasons">
                    {active.discoveryReasons.slice(0, 3).map((reason: string) => (
                      <li key={reason} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                        <PlusCircle size={14} weight="fill" style={{ color: "var(--orange)", flexShrink: 0, marginTop: "2px" }} />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <small>
                  {active.evidence.confidence === "High" ? t.confidenceHigh : active.evidence.confidence === "Medium" ? t.confidenceMed : t.confidenceLow} · {active.evidenceLabel}
                </small>
                <p className="source-line">
                  {t.sourceLabel}: {active.sourceName ?? "OpenStreetMap"} · {t.lastUpdatedLabel}: {formatUpdatedDate(active.lastUpdated)}
                </p>
                <LazyPlaceMediaDrawer place={active} lang={lang} />
              </div>
            )}
          </article>
          ) : null}
        </div>
        )}

        <aside className="results">

          <div className="results-head">
            <div>
              <p className="eyebrow">{t.eyebrow}</p>
              <h2>{ranked.length} {t.placesInView}</h2>
              {ranked.length > renderLimit ? <small>{t.showingTop} {renderLimit}</small> : null}
            </div>
            <div className="rank-controls">
              <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
                {modes.map((item) => (
                  <option key={item} value={item}>{modeLabel(item, lang)}</option>
                ))}
              </select>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                {sortModes.map((item) => (
                  <option key={item} value={item}>{sortModeLabel(item, lang)}</option>
                ))}
              </select>
              {sortMode === "Surprise me" ? (
                <button
                  type="button"
                  onClick={() => setRandomSeed((value) => value + 1)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <Shuffle size={13} weight="bold" /> {t.shuffle}
                </button>
              ) : null}
            </div>
          </div>
          <p className="formula">
            {mode === "Hidden gems"
              ? t.formulaHiddenGems
              : mode === "Popular now"
                ? t.formulaPopularNow
                : mode === "Quality first"
                  ? t.formulaQualityFirst
                  : t.formulaDefault}
          </p>
          <div className="principles" aria-label="Ranking principles">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} weight="bold" style={{ color: "var(--color-water)" }} /> {t.principle1}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} weight="bold" style={{ color: "var(--color-water)" }} /> {t.principle2}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} weight="bold" style={{ color: "var(--color-water)" }} /> {t.principle3}
            </span>
          </div>
          <div className="list">
            {hasSearchQuery && visibleRanked.length === 0 ? (
              <div className="search-empty-state" aria-live="polite">
                <strong>{t.noSearchResultsTitle}</strong>
                <span>
                  {t.noSearchResultsText} "{query.trim()}".
                </span>
              </div>
            ) : null}
            {visibleRanked.map((place, index) => (
              <div
                key={place.id}
                className={active && place.id === active.id ? "place active-place" : "place"}
                onClick={() => {
                  setSelected(place.id);
                  recordRecommendationEvents([
                    {
                      establishmentId: place.id,
                      eventType: "profile_view",
                      resultPosition: index,
                      queryContext: { surface: "results" },
                    },
                  ]);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(place.id);
                    recordRecommendationEvents([
                      {
                        establishmentId: place.id,
                        eventType: "profile_view",
                        resultPosition: index,
                        queryContext: { surface: "results" },
                      },
                    ]);
                  }
                }}
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="place-main">
                  <small>
                    {kindFilterLabel(place.kind, lang)} · {place.area}
                    {userLocation && hasCoordinates(place) ? ` · 📍 ${formatDistance(distanceFromPoint(place, userLocation), lang)}` : ""}
                  </small>
                  <strong>{place.name}</strong>
                  <span>{place.tags.slice(0, 2).join(" · ")}</span>
                </span>
                <span className="total">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSavePlace(place.id);
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "inline-flex" }}
                      title={savedPlaceIds.includes(place.id) ? (lang === "sv" ? "Ta bort från sparade" : "Remove from saved") : (lang === "sv" ? "Spara ställe" : "Save place")}
                    >
                      <Star
                        size={15}
                        weight={savedPlaceIds.includes(place.id) ? "fill" : "regular"}
                        style={{ color: savedPlaceIds.includes(place.id) ? "#F59E0B" : "var(--color-mist)" }}
                      />
                    </button>
                    <b>{rounded(modeScore(place, mode))}</b>
                  </div>
                  <small>{mode === "For you" ? t.matchScoreLabel : t.totalScoreLabel}</small>
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="concierge" id="concierge">
        <div>
          <p className="eyebrow">{t.conciergeEyebrow}</p>
          <h2>
            {t.conciergeHeadingMain} <i>{t.conciergeHeadingItalic}</i>
            <br />
            {t.conciergeHeadingSub}
          </h2>
          <p>{t.conciergeDesc}</p>
          <div className="superpower-chips" aria-label="Concierge superpowers">
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_place")}>
              <PlusCircle size={14} weight="bold" /> {lang === "sv" ? "➕ Lägg till nytt ställe" : "➕ Add new place"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_review")}>
              <Sparkle size={14} weight="bold" /> {lang === "sv" ? "✍️ Skriv recension" : "✍️ Write review"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_photo")}>
              <Image size={14} weight="bold" /> {lang === "sv" ? "📷 Lägg till foto" : "📷 Add photo"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("rate_place")}>
              <Star size={14} weight="bold" /> {lang === "sv" ? "⭐ Betygsätt ställe" : "⭐ Rate place"}
            </button>
          </div>
        </div>
        <div className="concierge-showcase-box">
          <div className="concierge-showcase-header">
            <Sparkle size={14} weight="bold" style={{ color: "var(--color-water)" }} />
            <span>{lang === "sv" ? "Populära frågor att ställa i sökfältet" : "Popular questions to ask in the search bar"}</span>
          </div>
          <div className="concierge-prompt-cloud">
            {POPULAR_CONCIERGE_PROMPTS.slice(0, 6).map((promptText) => (
              <button
                key={promptText}
                type="button"
                className="concierge-prompt-pill"
                onClick={() => {
                  setQuery(promptText);
                  setConcierge(promptText);
                  document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
                  void askWithQuery(promptText);
                }}
              >
                <MagnifyingGlass size={13} style={{ color: "var(--color-water)", flexShrink: 0 }} />
                <span>{promptText}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="method" id="method">
        <div>
          <p className="eyebrow">{t.methodEyebrow}</p>
          <h2>
            {t.methodHeadingMain}
            <br />
            {t.methodHeadingSub}
          </h2>
        </div>
        <div className="method-grid">
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>01</b>
              <Sliders size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method01Title}</h3>
            <p>{t.method01Desc}</p>
          </article>
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>02</b>
              <Scales size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method02Title}</h3>
            <p>{t.method02Desc}</p>
          </article>
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>03</b>
              <Certificate size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method03Title}</h3>
            <p>{t.method03Desc}</p>
          </article>
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>04</b>
              <Sparkle size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method04Title}</h3>
            <p>{t.method04Desc}</p>
          </article>
        </div>
        <CuratedSourcesPanel
          sources={curatedSources}
          isLoading={isSourcesLoading}
          lang={lang}
        />
        <div className="disclaimer">
          {t.dataNoteLabel}
          <span>{t.dataNoteText}</span>
        </div>
      </section>

      <MerchPanel
        lang={lang}
        cart={cart}
        onAddToCart={handleAddToCart}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {superpowerMode && superpowerMode !== "add_source" ? (
        <ConciergeSuperpowerModal
          mode={superpowerMode}
          places={places}
          activePlace={active}
          onClose={() => setSuperpowerMode(null)}
          onAddPlace={handleAddPlaceSuperpower}
          onAddReview={handleAddReviewSuperpower}
          onAddPhoto={handleAddPhotoSuperpower}
          onRatePlace={handleRatePlaceSuperpower}
          onAddSource={handleAddSourceSuperpower}
          lang={lang}
        />
      ) : null}

      <PreloaderModal
        isOpen={showPreloader}
        onClose={handleClosePreloader}
        lang={lang}
      />

      <OnboardingModal
        isOpen={showOnboarding}
        onClose={handleCloseOnboarding}
        onOpenConcierge={() => {
          const el = document.getElementById("concierge");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }}
        lang={lang}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        lang={lang}
      />

      <MobileFilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        filters={mobileFilters}
        onUpdateFilters={handleUpdateMobileFilters}
        onResetFilters={handleResetMobileFilters}
        matchingCount={ranked.length}
        lang={lang}
      />

      {active ? (
        <PlaceDetailSheet
          place={active}
          isOpen={isPlaceDetailOpen}
          isSaved={savedPlaceIds.includes(active.id)}
          userRating={userRatings[active.id] ?? 0}
          userLocation={userLocation}
          lang={lang}
          onClose={() => setIsPlaceDetailOpen(false)}
          onToggleSave={handleToggleSavePlace}
          onRatePlace={handleRatePlace}
          onViewOnMap={(p) => {
            setSelected(p.id);
            setMobileViewMode("map");
            setIsPlaceDetailOpen(false);
          }}
        />
      ) : null}

      <footer>

        <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
          <img src="/logo.webp" alt="MOTKARTA" className="footer-logo" />
          <span>/ {t.footerLeft.replace(/^MOTKARTA \/ /, "")}</span>
        </div>
        <span>{t.footerRight}</span>
      </footer>
    </main>
  );
}
