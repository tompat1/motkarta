import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function viteSyncDevPlugin(): Plugin {
  const storePath = path.resolve(process.cwd(), ".tmp/dev_sync_store.json");

  function getStore(): Record<string, { savedPlaceIds: number[]; updatedAt: string }> {
    try {
      if (fs.existsSync(storePath)) {
        return JSON.parse(fs.readFileSync(storePath, "utf-8"));
      }
    } catch {
      // ignore
    }
    return {};
  }

  function saveStore(data: Record<string, { savedPlaceIds: number[]; updatedAt: string }>) {
    try {
      const dir = path.dirname(storePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // ignore
    }
  }

  return {
    name: "vite-plugin-sync-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/sync")) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

        if (req.method === "GET") {
          const rawCode = (url.searchParams.get("code") || "").trim().toUpperCase();
          const cleanCode = rawCode.startsWith("MOT-") ? rawCode : `MOT-${rawCode}`;

          if (!rawCode || cleanCode.length < 5) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: "Invalid sync code parameter" }));
          }

          const store = getStore();
          const item = store[cleanCode];

          if (item) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            return res.end(
              JSON.stringify({
                syncCode: cleanCode,
                savedPlaceIds: item.savedPlaceIds,
                updatedAt: item.updatedAt,
              }),
            );
          }

          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: "Sync code not found or expired" }));
        }

        if (req.method === "POST") {
          let bodyStr = "";
          req.on("data", (chunk) => {
            bodyStr += chunk;
          });
          req.on("end", () => {
            try {
              const body = JSON.parse(bodyStr || "{}");
              const savedPlaceIds = Array.isArray(body?.savedPlaceIds)
                ? body.savedPlaceIds.filter((x: any) => typeof x === "number")
                : [];
              const rawExisting = (body?.existingCode || "").trim().toUpperCase();
              const existingCode = rawExisting
                ? rawExisting.startsWith("MOT-")
                  ? rawExisting
                  : `MOT-${rawExisting}`
                : null;

              let syncCode = existingCode;
              if (!syncCode) {
                const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
                syncCode = "MOT-";
                for (let i = 0; i < 4; i++) {
                  syncCode += chars.charAt(Math.floor(Math.random() * chars.length));
                }
              }

              const updatedAt = new Date().toISOString();
              const store = getStore();
              store[syncCode] = { savedPlaceIds, updatedAt };
              saveStore(store);

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              return res.end(
                JSON.stringify({
                  success: true,
                  syncCode,
                  savedPlaceIds,
                  updatedAt,
                }),
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              return res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

function viteAdminDevPlugin(): Plugin {
  return {
    name: "vite-plugin-admin-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/admin")) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const pathname = url.pathname;
        res.setHeader("Content-Type", "application/json");

        if (pathname === "/api/admin/session") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              admin: true,
              authMode: "dev",
              email: "admin@motkarta.local",
              configured: {
                token: true,
                accessJwt: false,
                trustedHeaders: false,
                emailAllowlist: false,
              },
            }),
          );
        }

        if (pathname === "/api/admin/schema") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              source: "dev",
              ready: true,
              success: true,
              baseSchemaReady: true,
              missing: [],
              checkedAt: new Date().toISOString(),
            }),
          );
        }

        if (pathname === "/api/admin/review-dashboard") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              source: "dev",
              generatedAt: new Date().toISOString(),
              nextStep: "caught_up",
              actions: {
                harvestNeeded: false,
                reviewNeeded: false,
                exportNeeded: false,
              },
              counts: {
                candidateCount: 0,
                newCandidateCount: 0,
                hiddenGemReadyCount: 0,
                needsEvidenceCount: 0,
                possibleDuplicateCount: 0,
                reviewEventCount: 0,
                unexportedReviewCount: 0,
              },
              latestReviewAt: null,
              lastExportedAt: null,
              exportLogAvailable: false,
            }),
          );
        }

        if (pathname === "/api/admin/candidates") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              candidates: [],
              total: 0,
            }),
          );
        }

        if (pathname === "/api/admin/ml-status") {
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              source: "dev",
              timestamp: new Date().toISOString(),
              models: [
                {
                  id: "discovery-hgbr-spatial-oof-v1",
                  name: "Residual Underexposure Model",
                  type: "HistGradientBoostingRegressor",
                  validation: "Out-Of-Fold GroupKFold Spatial Cross-Validation",
                  status: "active",
                  description: "Predicts expected platform popularity from structural & spatial features to identify algorithmic surprise (high positive residuals).",
                  metrics: {
                    mae: 0.1842,
                    rmse: 0.2415,
                    intervalCoverage: 0.904,
                    folds: 5,
                    features: ["log_review_count", "price_level", "latitude", "longitude", "category", "cuisine", "district"],
                  },
                },
                {
                  id: "isolation-forest-spatial-v1",
                  name: "Structural Anomaly Detection",
                  type: "IsolationForest (Unsupervised)",
                  validation: "Contamination 0.07 Spatial Density Pass",
                  status: "active",
                  description: "Detects structurally unusual OpenStreetMap records (tag complexity, historic longevity, density) to flag candidates for review.",
                  metrics: {
                    contamination: 0.07,
                    featureCount: 4,
                    features: ["spatial_density_300m", "tag_complexity", "opening_hours_score", "historic_longevity"],
                  },
                },
                {
                  id: "rec-v1-debiased",
                  name: "Debiased Recommendation LTR",
                  type: "Propensity-Weighted Learning-to-Rank",
                  validation: "Telemetry Impression & Position Bias Tracking",
                  status: "active",
                  description: "Corrects position bias and exposure imbalance using inverse propensity weighting on recommendation telemetry events.",
                  metrics: {
                    privacyVersion: "p1",
                    schemaVersion: "r1",
                    retentionDays: 90,
                  },
                },
                {
                  id: "concierge-rag-v1",
                  name: "Concierge Factual RAG & Dense Retrieval",
                  type: "Hybrid Dense/Sparse Vector Search",
                  validation: "Factuality Gate & Zero-Hallucination Invariant",
                  status: "active",
                  description: "Combines strict factual text chunking with semantic intent classification and double-lock filtering.",
                  metrics: {
                    corpusVersion: "concierge-facts-v1",
                    hitRateAt3: 0.941,
                    mrr: 0.882,
                    latencyMs: 18,
                  },
                },
              ],
              seabornCharts: [
                {
                  id: "eda_feature_relationships",
                  title: "Exploratory Data Analysis (EDA) & Correlation Heatmap",
                  url: "/ml_charts/eda_feature_relationships.png",
                  description: "Seaborn scatter plot and correlation matrix showing relationships between spatial density, tag complexity, venue age, and review volume.",
                },
                {
                  id: "regression_residuals",
                  title: "Residual Underexposure Regression & Error Calibration",
                  url: "/ml_charts/regression_residuals.png",
                  description: "HistGradientBoostingRegressor regression plot (Actual vs OOF Predicted) and residual error histogram with 90% confidence bounds.",
                },
                {
                  id: "isolation_forest_anomalies",
                  title: "Isolation Forest Unsupervised Anomaly Scatter Plot",
                  url: "/ml_charts/isolation_forest_anomalies.png",
                  description: "Scatter plot of Isolation Forest outlier predictions (contamination = 0.07) highlighting structural candidates for review.",
                },
                {
                  id: "ml_lifecycle_and_gaps",
                  title: "Full ML Model Lifecycle Progress & Gap Analysis",
                  url: "/ml_charts/ml_lifecycle_and_gaps.png",
                  description: "Overview of stage completion across the 6 ML pipeline phases and impact scores for identified system gaps.",
                },
              ],
              lifecycleStages: [
                { stage: "1. Open Data Ingestion", completion: 100, status: "complete", notes: "Overpass API, municipal records, guide ingestion." },
                { stage: "2. Isolation Forest Outlier Pass", completion: 100, status: "complete", notes: "Unsupervised spatial density & tag complexity anomaly filtering." },
                { stage: "3. Residual OOF Regression", completion: 100, status: "complete", notes: "HistGradientBoostingRegressor 5-fold spatial cross-validation." },
                { stage: "4. 2-Signal Evidence Gate", completion: 100, status: "complete", notes: "Independent evidence verification & human validation in D1." },
                { stage: "5. Telemetry & Debiased LTR", completion: 85, status: "in_progress", notes: "Impression logging, position bias decay & inverse propensity weighting." },
                { stage: "6. Online Bandit & Cloudflare AI Workers", completion: 50, status: "in_progress", notes: "Edge embeddings with Workers AI & Vectorize for sub-5ms retrieval." },
              ],
              gapsAndImprovements: [
                {
                  id: "cold_start",
                  title: "Cold-Start Venues Without Reviews",
                  impactScore: 82,
                  category: "Data Sparsity",
                  problem: "New venues or unindexed places lack external rating/review volume, making residual regression estimation uncertain.",
                  solution: "Incorporate Cloudflare Workers AI vector embeddings (@cf/baai/bge-small-en-v1.5) on raw OSM descriptions to score potential gems.",
                },
                {
                  id: "position_bias",
                  title: "Position Bias Decay Variance",
                  impactScore: 68,
                  category: "Telemetry & Ranking",
                  problem: "Top-ranked recommendations receive 75% of user clicks regardless of true venue quality.",
                  solution: "Apply inverse propensity score (IPS) weighting to impression events before training rankers.",
                },
                {
                  id: "osm_sparsity",
                  title: "OpenStreetMap Attribute Sparsity",
                  impactScore: 55,
                  category: "Feature Engineering",
                  problem: "42% of OpenStreetMap venue entries lack opening hours, outdoor seating, or detailed cuisine tags.",
                  solution: "Auto-enrich missing attributes via venue website og:image scraping and municipal permit data.",
                },
                {
                  id: "edge_concierge",
                  title: "Cloudflare Edge Vector Retrieval",
                  impactScore: 74,
                  category: "Edge Inference",
                  problem: "External RAG vector stores add 150-300ms latency to mobile Concierge queries.",
                  solution: "Deploy Cloudflare Vectorize + Workers AI for sub-15ms local edge semantic search without python backend servers.",
                },
              ],
              telemetry: {
                totalEvents: 142,
                last24hEvents: 38,
                eventsByMode: { explore: 68, hidden_gems: 45, distance: 29 },
                eventsByType: { impression: 84, click: 36, save: 22 },
                positionDistribution: { "Pos 0": 48, "Pos 1": 24, "Pos 2": 16, "Pos 3": 10 },
              },
              codeSnippets: [
                {
                  id: "model_discovery",
                  title: "1. Residual Underexposure Model (Python)",
                  filename: "scripts/model_discovery.py",
                  description: "Cross-fitted HistGradientBoostingRegressor for detecting algorithmic surprise without data leakage.",
                  code: `import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import KFold

def fit_discovery_model(df: pd.DataFrame):
    """Predict expected popularity from structural features to extract residual underexposure."""
    features = ['price_level', 'latitude', 'longitude', 'tag_count']
    X = df[features].fillna(0)
    y = np.log1p(df['review_count'].clip(lower=0))

    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    oof_predictions = np.zeros(len(df))

    for train_idx, val_idx in kf.split(X):
        model = HistGradientBoostingRegressor(max_iter=150, random_state=42)
        model.fit(X.iloc[train_idx], y.iloc[train_idx])
        oof_predictions[val_idx] = model.predict(X.iloc[val_idx])

    # True latent quality manifests as positive residual under low mainstream exposure
    df['expected_popularity'] = oof_predictions
    df['residual_underexposure'] = y - oof_predictions
    return df`,
                },
                {
                  id: "isolation_forest",
                  title: "2. Structural Anomaly Detection (Python)",
                  filename: "scripts/outlier_detection.py",
                  description: "IsolationForest for detecting unusual high-craft or unindexed candidate venues.",
                  code: `from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

def detect_structural_anomalies(df: pd.DataFrame, contamination=0.07):
    """Identifies outlier venues by density, tag complexity, and operating hours."""
    res = df.copy()
    feature_cols = ["spatial_density_300m", "tag_complexity", "opening_hours_score", "historic_longevity"]
    X_scaled = StandardScaler().fit_transform(res[feature_cols].fillna(0.0))

    iso_forest = IsolationForest(contamination=contamination, random_state=42)
    res["structural_anomaly_score"] = iso_forest.fit_predict(X_scaled)
    # -1 indicates a statistically unusual data record for human candidate review
    res["is_structural_anomaly"] = res["structural_anomaly_score"] == -1
    return res`,
                },
                {
                  id: "concierge_rag",
                  title: "3. Concierge Factual RAG Pipeline (Python)",
                  filename: "motkarta/rag.py",
                  description: "Extracts strictly factual venue context and chunks documents for vector retrieval without hallucinated attributes.",
                  code: `from motkarta.rag import place_to_rag_document, chunk_documents

def build_factual_concierge_corpus(places: list[dict]):
    """Strictly factual documents: Zero hallucinated ratings, verified claims only."""
    documents = [place_to_rag_document(p) for p in places if p.get('lifecycle_state') != 'closed']
    chunks = chunk_documents(documents, max_chars=1200)
    print(f"Generated {len(chunks)} factual chunks from {len(documents)} eligible venues.")
    return chunks`,
                },
                {
                  id: "evaluate_ranking",
                  title: "4. Debiased Learning-to-Rank (Python)",
                  filename: "motkarta/ltr.py",
                  description: "Evaluates position bias and inverse propensity weighting (IPS) on recommendation telemetry.",
                  code: `import numpy as np
import pandas as pd
from motkarta.ltr import PropensityModel, extract_ranking_features

def evaluate_position_bias(telemetry_df: pd.DataFrame):
    """Estimate position decay curve and propensity weights from telemetry events."""
    propensity = PropensityModel(gamma=0.75, min_propensity=0.05)
    
    # Calculate inverse propensity weights: w = 1 / P(Examine | pos)
    weights = [propensity.weight(pos) for pos in telemetry_df["result_position"]]
    telemetry_df["ips_weight"] = weights
    
    print("Computed IPS weights. Top position examination decay bounded to prevent monopoly.")
    return telemetry_df`,
                },
              ],
            }),
          );
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSyncDevPlugin(), viteAdminDevPlugin()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    ...(isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : {}),
  },
});

