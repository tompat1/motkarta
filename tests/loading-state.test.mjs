import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("map loader revolves the Motkarta mark around its centered vertical axis", () => {
  assert.match(
    appSource,
    /src="\/motkarta_drop_divided_black_red\.svg"[\s\S]{0,160}className="motkarta-axis-spin"/,
  );

  const spinnerRule = stylesSource.match(/\.places-loading-spinner\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(spinnerRule, /background(?:-color)?\s*:/);
  assert.match(spinnerRule, /align-items:\s*center;/);
  assert.match(spinnerRule, /display:\s*inline-flex;/);
  assert.match(spinnerRule, /justify-content:\s*center;/);
  assert.match(stylesSource, /\.places-loading-spinner img\s*\{[\s\S]*height:\s*100px;[\s\S]*width:\s*67px;/);
  assert.match(stylesSource, /\.motkarta-axis-spin\s*\{[\s\S]*animation:\s*motkarta-axis-spin 1\.4s linear infinite;/);
  assert.match(stylesSource, /@keyframes motkarta-axis-spin\s*\{[\s\S]*rotateY\(360deg\)/);
  assert.doesNotMatch(stylesSource, /\.places-loading-card span,/);
});
