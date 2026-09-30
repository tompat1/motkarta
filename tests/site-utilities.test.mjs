import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const utilitiesSource = await readFile(new URL("../src/components/SiteUtilities.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("SiteUtilities component provides back-to-top button and Ask Us sticky pill", () => {
  assert.match(utilitiesSource, /className={`back-to-top \${showBackToTop \? "is-visible" : ""}`}/);
  assert.match(utilitiesSource, /className="contact-toggle"/);
  assert.match(utilitiesSource, /className="contact-widget"/);
  assert.match(utilitiesSource, /className="contact-panel"/);
  assert.match(utilitiesSource, /Ask us/);
  assert.match(utilitiesSource, /Motkarta Studio/);
});

test("styles.css defines site-utilities, back-to-top, and contact-panel CSS rules matching mono.rynell.org", () => {
  assert.match(stylesSource, /\.site-utilities\s*\{/);
  assert.match(stylesSource, /\.back-to-top\s*\{/);
  assert.match(stylesSource, /\.contact-widget\s*\{/);
  assert.match(stylesSource, /\.contact-toggle\s*\{/);
  assert.match(stylesSource, /\.contact-panel\s*\{/);
  assert.match(stylesSource, /\.contact-submit\s*\{/);
});

test("App.tsx integrates SiteUtilities component", () => {
  assert.match(appSource, /import\s*\{\s*SiteUtilities\s*\}\s*from\s*["']\.\/components\/SiteUtilities["']/);
  assert.match(appSource, /<SiteUtilities\s+lang=\{lang\}\s*\/>/);
});
