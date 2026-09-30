import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("map loader spins the Motkarta mark without a dark tile", () => {
  assert.match(
    appSource,
    /className="places-loading-spinner"[\s\S]*src="\/motkarta_drop_divided_black_red\.svg"[\s\S]*className="animate-spin"/,
  );

  const spinnerRule = stylesSource.match(/\.places-loading-spinner\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(spinnerRule, /background(?:-color)?\s*:/);
  assert.match(stylesSource, /\.places-loading-spinner img\s*\{[\s\S]*height:\s*100px;[\s\S]*width:\s*67px;/);
});
