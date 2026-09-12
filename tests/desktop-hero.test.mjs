import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("desktop hero is a living counter-map backed by catalog places", () => {
  assert.match(appSource, /className="intro countermap-hero"/);
  assert.match(appSource, /DESKTOP_HERO_STORIES/);
  assert.match(appSource, /Official Website \(gastcafe\.se\)/);
  assert.match(appSource, /Official Website \(soderbergsbageri\.se\)/);
  assert.match(appSource, /Official Website \(gamlaorangeriet\.se\)/);
  assert.match(appSource, /handleSelectPlace\(story\.id\)/);
  assert.doesNotMatch(appSource, /100% Äkta hantverk|100% Curated quality|Realtidsuppdaterad guide/);
});

test("concierge and filter deck preserves labeled controls and live selection state", () => {
  assert.match(appSource, /aria-labelledby="countermap-controls-title"/);
  assert.match(appSource, /htmlFor="desktop-discovery-search"/);
  assert.match(appSource, /id="desktop-discovery-search"/);
  assert.match(appSource, /className="countermap-selection-readout" aria-live="polite"/);
  assert.match(appSource, /getPopularConciergePrompts\(lang\)\.slice\(0, 3\)/);
  assert.match(appSource, /aria-pressed=\{kind === item\}/);
  assert.match(appSource, /aria-pressed=\{cuisine === item\}/);
});

test("counter-map motion is bounded and has a reduced-motion path", () => {
  assert.match(stylesSource, /@keyframes countermap-route-arrival/);
  assert.match(stylesSource, /animation: countermap-route-arrival 900ms/);
  assert.doesNotMatch(stylesSource, /countermap-route-arrival[^;]*infinite/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*countermap-active-route/);
  assert.match(stylesSource, /@media \(max-width: 768px\)[\s\S]*\.countermap-controls/);
});

test("topbar navigation remains sticky and viewport scrolling is unblocked", () => {
  assert.match(stylesSource, /\.topbar[\s\S]*?position:\s*sticky;/);
  assert.match(stylesSource, /\.topbar[\s\S]*?top:\s*0;/);
  assert.match(stylesSource, /html,\s*\n\s*body[\s\S]*?overflow-x:\s*clip;/);
});

const sharedSource = await readFile(new URL("../src/app/shared.ts", import.meta.url), "utf8");

test("desktop hero features independent discovery manifesto", () => {
  assert.match(appSource, /className="countermap-hero-manifest"/);
  assert.match(appSource, /countermap-hero-manifest-primary/);
  assert.match(appSource, /countermap-hero-manifest-secondary/);
  assert.match(stylesSource, /\.countermap-hero-manifest\s*\{/);
  assert.match(stylesSource, /\.countermap-hero-manifest-primary\s*\{/);
  assert.match(sharedSource, /heroManifestPrimary:\s*"A MORE DELICIOUS, MORE HUMAN STOCKHOLM\."/);
  assert.match(sharedSource, /heroManifestSecondary:\s*"INDEPENDENT DISCOVERY FOR A BRIGHTER CITY\."/);
  assert.match(sharedSource, /heroManifestPrimary:\s*"ETT GODARE, MER MÄNSKLIGT STOCKHOLM\."/);
  assert.match(sharedSource, /heroManifestSecondary:\s*"OBEROENDE UPPTÄCKT FÖR EN LJUSARE STAD\."/);
});

