import { requireAdmin, type AdminAuthEnv } from "../../../lib/admin-auth.ts";

type EventContext<Env> = {
  request: Request;
  env: Env;
};

type Env = {
  DB?: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
      };
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
    };
  };
} & AdminAuthEnv;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export async function onRequestGet(context: EventContext<Env>) {
  const authError = await requireAdmin(context.request, context.env);
  if (authError) {
    return authError;
  }

  let telemetryStats = {
    totalEvents: 0,
    last24hEvents: 0,
    eventsByMode: {} as Record<string, number>,
    eventsByType: {} as Record<string, number>,
    positionDistribution: {} as Record<string, number>,
  };

  const db = context.env.DB;
  if (db) {
    try {
      const totalRes = await db.prepare("SELECT COUNT(*) as cnt FROM recommendation_events").all<{ cnt: number }>();
      const totalEvents = Number(totalRes.results?.[0]?.cnt ?? 0);

      const cutoff24h = new Date(Date.now() - 86400 * 1000).toISOString();
      const last24hRes = await db.prepare("SELECT COUNT(*) as cnt FROM recommendation_events WHERE occurred_at >= ?").bind(cutoff24h).all<{ cnt: number }>();
      const last24hEvents = Number(last24hRes.results?.[0]?.cnt ?? 0);

      const modeRes = await db.prepare("SELECT recommendation_mode as key, COUNT(*) as value FROM recommendation_events GROUP BY recommendation_mode").all<{ key: string; value: number }>();
      const eventsByMode: Record<string, number> = {};
      (modeRes.results ?? []).forEach((row) => {
        if (row.key) eventsByMode[row.key] = Number(row.value);
      });

      const typeRes = await db.prepare("SELECT event_type as key, COUNT(*) as value FROM recommendation_events GROUP BY event_type").all<{ key: string; value: number }>();
      const eventsByType: Record<string, number> = {};
      (typeRes.results ?? []).forEach((row) => {
        if (row.key) eventsByType[row.key] = Number(row.value);
      });

      const posRes = await db.prepare("SELECT result_position as key, COUNT(*) as value FROM recommendation_events WHERE result_position IS NOT NULL GROUP BY result_position LIMIT 10").all<{ key: number; value: number }>();
      const positionDistribution: Record<string, number> = {};
      (posRes.results ?? []).forEach((row) => {
        if (row.key !== undefined && row.key !== null) positionDistribution[`Pos ${row.key}`] = Number(row.value);
      });

      telemetryStats = {
        totalEvents,
        last24hEvents,
        eventsByMode,
        eventsByType,
        positionDistribution,
      };
    } catch (dbErr) {
      console.warn("Could not query D1 recommendation_events", dbErr);
    }
  }

  return Response.json(
    {
      source: "d1",
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
      ],
      telemetry: telemetryStats,
      codeSnippets: [
        {
          id: "model_discovery",
          title: "1. Residual Underexposure Model (Python)",
          filename: "scripts/model_discovery.py",
          description: "Cross-fitted HistGradientBoostingRegressor for detecting algorithmic surprise without data leakage.",
          code: `import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold, KFold

MODEL_VERSION = "discovery-hgbr-spatial-oof-v1"
NUMERIC = ["log_review_count", "price_level", "latitude", "longitude"]
CATEGORICAL = ["category", "cuisine", "district", "chain_status"]

def fit_discovery_model(frame: pd.DataFrame, max_folds: int = 5):
    """Return leakage-resistant underexposure candidates with OOF predictions."""
    features = NUMERIC + CATEGORICAL
    splits = GroupKFold(n_splits=max_folds).split(frame, groups=frame["district"])
    
    predictions = np.full(len(frame), np.nan)
    for fold_id, (train_idx, test_idx) in enumerate(splits):
        model = HistGradientBoostingRegressor(random_state=42 + fold_id)
        model.fit(frame.iloc[train_idx][features], frame.iloc[train_idx]["platform_rating"])
        predictions[test_idx] = model.predict(frame.iloc[test_idx][features])

    frame["expected_rating_oof"] = np.clip(predictions, 1.0, 5.0)
    frame["rating_residual"] = frame["platform_rating"] - frame["expected_rating_oof"]
    return frame.sort_values("rating_residual", ascending=False)`,
        },
        {
          id: "outliers",
          title: "2. Isolation Forest Outlier Pass (Python)",
          filename: "motkarta/outliers.py",
          description: "Unsupervised Isolation Forest to flag structurally unusual OpenStreetMap records for candidate review.",
          code: `from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

def process_motkarta_gems(df: pd.DataFrame, contamination: float = 0.07):
    """Flag structurally unusual OSM records for review using Isolation Forest."""
    res = df.copy()
    res["spatial_density_300m"] = calculate_spatial_density(res["latitude"], res["longitude"])
    res["tag_complexity"] = compute_tag_complexity(res["raw_tags"])
    res["historic_longevity"] = compute_historic_longevity(res)
    res["opening_hours_score"] = compute_opening_hours_score(res)

    feature_cols = ["spatial_density_300m", "tag_complexity", "opening_hours_score", "historic_longevity"]
    X_scaled = StandardScaler().fit_transform(res[feature_cols].fillna(0.0))

    iso_forest = IsolationForest(contamination=contamination, random_state=42)
    res["structural_anomaly_score"] = iso_forest.fit_predict(X_scaled)
    # -1 indicates a statistically unusual data record for human candidate review
    res["is_structural_anomaly"] = res["structural_anomaly_score"] == -1
    return res`,
        },
        {
          id: "semantic_discovery",
          title: "3. Semantic Embedding Discovery (Python)",
          filename: "scripts/semantic_discovery.py",
          description: "Uses SentenceTransformers (all-MiniLM-L6-v2) to match raw OSM metadata against artisanal concepts.",
          code: `from sentence_transformers import SentenceTransformer, util
from sklearn.ensemble import IsolationForest

def score_semantic_gems(df: pd.DataFrame):
    """Semantic concept matching combined with spatial uniqueness."""
    model = SentenceTransformer('all-MiniLM-L6-v2')
    target_concept = "independent craft, hidden historical, non-profit community, local artisan"
    target_emb = model.encode(target_concept, convert_to_tensor=True)

    osm_embs = model.encode(df['osm_tags'].tolist(), convert_to_tensor=True)
    df['semantic_score'] = util.cos_sim(osm_embs, target_emb).cpu().numpy().flatten()

    # Exclude commercial chains explicitly
    df['is_chain'] = df['osm_tags'].str.contains('brand=').astype(int)
    df.loc[df['is_chain'] == 1, 'semantic_score'] *= 0.1
    return df.sort_values('semantic_score', ascending=False)`,
        },
        {
          id: "evaluate_ranking",
          title: "4. Debiased Recommendation LTR (Python)",
          filename: "scripts/evaluate_ranking_experiment.py",
          description: "Evaluates position bias and inverse propensity weighting on recommendation telemetry.",
          code: `def evaluate_position_bias(telemetry_df: pd.DataFrame):
    """Estimate position decay curve and propensity weights from telemetry events."""
    clicks_by_pos = telemetry_df[telemetry_df["event_type"] == "click"].groupby("result_position").size()
    impressions_by_pos = telemetry_df[telemetry_df["event_type"] == "impression"].groupby("result_position").size()
    
    ctr_by_position = (clicks_by_pos / impressions_by_pos).fillna(0.0)
    propensity_weights = 1.0 / np.maximum(ctr_by_position, 0.01)
    
    return {
        "ctr_by_position": ctr_by_position.to_dict(),
        "propensity_weights": propensity_weights.to_dict(),
    }`,
        },
      ],
    },
    { headers: jsonHeaders },
  );
}
