import "dotenv/config";

import path from "node:path";
import { createPersonalApiClient } from "./personal-api.js";
import { downloadActivities } from "./activities.js";
import { downloadWellness, wellnessDates } from "./wellness.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function option(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function options() {
  const known = new Set([
    "--last", "--wellness-only", "--no-wellness", "--wellness-days",
    "--wellness-from", "--wellness-to",
  ]);
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--") && !known.has(arg)) throw new Error(`Unknown option: ${arg}`);
  }
  const only = process.argv.includes("--wellness-only");
  const wellness = !process.argv.includes("--no-wellness");
  if (only && !wellness) throw new Error("--wellness-only cannot be combined with --no-wellness");
  const lastValue = option("--last");
  const last = lastValue === undefined ? null : Number(lastValue);
  if (last !== null && (!Number.isInteger(last) || last < 1)) throw new Error("--last must be a positive integer");
  const daysValue = option("--wellness-days");
  const days = daysValue === undefined ? 7 : Number(daysValue);
  const from = option("--wellness-from");
  const to = option("--wellness-to");
  const timeZone = process.env.GARMIN_TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dates = wellness ? wellnessDates({ days, from, to, timeZone }) : [];
  const dataDir = path.resolve(process.env.GARMIN_DATA_DIR || "data");
  return { only, dates, refresh: !from, dataDir, last };
}

async function main() {
  const { only, dates, refresh, dataDir, last } = options();
  const client = createPersonalApiClient(process.env.GARMIN_PERSONAL_API_KEY);

  if (dates.length) {
    console.log(`Downloading wellness for ${dates.length} day(s)...`);
    const result = await downloadWellness({
      dates,
      client,
      outputDir: path.join(dataDir, "wellness"),
      refresh,
      delay: () => sleep(500),
    });
    console.log(`Wellness: ${result.downloaded} saved, ${result.skipped} already present.`);
  }
  if (only) return;

  console.log("Downloading FIT activities...");
  const result = await downloadActivities({
    client,
    outputDir: path.join(dataDir, "fit"),
    limit: last,
    delay: sleep,
  });
  console.log(`Activities: ${result.found} found, ${result.downloaded} saved, ${result.skipped} skipped.`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
