import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildReviewLabelExport, extractReviewRows } from "../lib/review-labels.ts";

const [inputPath, outputPath = "outputs/human_validation_labels.json"] = process.argv.slice(2);

if (!inputPath) {
  throw new Error("usage: node scripts/export_review_labels.mjs data/review-events-export.json outputs/human_validation_labels.json");
}

const output = buildReviewLabelExport(extractReviewRows(JSON.parse(await readFile(resolve(inputPath), "utf8"))));

await writeFile(resolve(outputPath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath} (${output.labels.length} labels, ${output.duplicateResolutions.length} duplicate resolutions)`);
