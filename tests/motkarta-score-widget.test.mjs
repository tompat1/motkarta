import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const widgetSource = await readFile(new URL("../src/components/MotkartaScoreWidget.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const detailSheetSource = await readFile(new URL("../src/components/PlaceDetailSheet.tsx", import.meta.url), "utf8");

test("MotkartaScoreWidget provides all 5 score dimensions and circular gauge", () => {
  // Widget header and 5 dimensions
  assert.match(widgetSource, /MOTKARTA SCORE/);
  assert.match(widgetSource, /RELEVANCE/);
  assert.match(widgetSource, /RELEVANS/);
  assert.match(widgetSource, /QUALITY/);
  assert.match(widgetSource, /KVALITET/);
  assert.match(widgetSource, /POPULARITY/);
  assert.match(widgetSource, /POPULARITET/);
  assert.match(widgetSource, /DISCOVERY/);
  assert.match(widgetSource, /UPPTÄCKT/);
  assert.match(widgetSource, /FRESHNESS/);
  assert.match(widgetSource, /FÄRSKHET/);

  // Donut gauge with overall score and labels
  assert.match(widgetSource, /OVERALL/);
  assert.match(widgetSource, /TOTALT/);
  assert.match(widgetSource, /motkarta-score-gauge-svg/);
  assert.match(widgetSource, /motkarta-score-gauge-fill/);
  assert.match(widgetSource, /strokeDasharray/);
});

test("styles define stylish Motkarta score widget, bars, and donut gauge", () => {
  assert.match(stylesSource, /\.motkarta-score-widget\s*\{/);
  assert.match(stylesSource, /\.motkarta-score-bars\s*\{/);
  assert.match(stylesSource, /\.motkarta-score-bar-track\s*\{/);
  assert.match(stylesSource, /\.motkarta-score-bar-fill\s*\{/);
  assert.match(stylesSource, /\.motkarta-score-gauge\s*\{/);
  assert.match(stylesSource, /\.motkarta-score-gauge-num\s*\{/);
  assert.match(stylesSource, /container-type:\s*inline-size/);
});

test("App.tsx integrates MotkartaScoreWidget into map-card place card", () => {
  assert.match(appSource, /import\s*\{\s*MotkartaScoreWidget\s*\}\s*from\s*["']\.\/components\/MotkartaScoreWidget["']/);
  assert.match(appSource, /<MotkartaScoreWidget[\s\S]*?scores=\{active\.scores\}[\s\S]*?overallScore=\{modeScore\(active,\s*mode\)\}/);
});

test("PlaceDetailSheet.tsx integrates MotkartaScoreWidget into place detail sheet", () => {
  assert.match(detailSheetSource, /import\s*\{\s*MotkartaScoreWidget\s*\}\s*from\s*["']\.\/MotkartaScoreWidget["']/);
  assert.match(detailSheetSource, /<MotkartaScoreWidget[\s\S]*?scores=\{place\.scores\}[\s\S]*?overallScore=\{place\.scores(\?\.|\.)recommendation\}/);
});
