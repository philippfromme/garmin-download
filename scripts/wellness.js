import fs from "node:fs";
import path from "node:path";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const WELLNESS_DATASETS = [
  ["summary", (date, profileId) => `/gc-api/usersummary-service/usersummary/daily/${encodeURIComponent(profileId)}?calendarDate=${date}`],
  ["steps", (date, profileId) => `/gc-api/wellness-service/wellness/dailySummaryChart/${encodeURIComponent(profileId)}?date=${date}`],
  ["sleep", (date) => `/gc-api/sleep-service/sleep/dailySleepData?date=${date}&nonSleepBufferMinutes=60`],
  ["heartRate", (date) => `/gc-api/wellness-service/wellness/dailyHeartRate?date=${date}`],
  ["stressAndBodyBattery", (date) => `/gc-api/wellness-service/wellness/dailyStress/${date}`],
  ["hrv", (date) => `/gc-api/hrv-service/hrv/${date}`],
  ["respiration", (date) => `/gc-api/wellness-service/wellness/daily/respiration/${date}`],
  ["pulseOx", (date) => `/gc-api/wellness-service/wellness/daily/spo2acclimation/${date}`],
];

export function validDate(value) {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function todayInZone(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function wellnessDates({ days = 7, from, to, now = new Date(), timeZone = "UTC" } = {}) {
  if (!Number.isInteger(days) || days < 1) throw new Error("--wellness-days must be a positive integer");
  if (to && !from) throw new Error("--wellness-to requires --wellness-from");
  const end = to ?? todayInZone(now, timeZone);
  const start = from ?? addDays(end, 1 - days);
  if (!validDate(start) || !validDate(end)) throw new Error("Wellness dates must be real YYYY-MM-DD dates");
  if (start > end) throw new Error("--wellness-from must not be after --wellness-to");
  const dates = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export async function downloadWellness({ dates, fetchJson, outputDir, refresh = true, delay = async () => {} }) {
  if (dates.length === 0) return { downloaded: 0, skipped: 0 };
  const profile = await fetchJson("/gc-api/userprofile-service/socialProfile");
  const profileId = profile?.displayName;
  if (typeof profileId !== "string" || !profileId.trim()) {
    throw new Error("Garmin profile response did not contain a displayName");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  let downloaded = 0;
  let skipped = 0;
  for (const date of dates) {
    const filePath = path.join(outputDir, `${date}.json`);
    if (!refresh && fs.existsSync(filePath)) {
      skipped++;
      continue;
    }
    console.log(`  Fetching wellness for ${date}...`);
    const data = { date };
    for (const [name, route] of WELLNESS_DATASETS) {
      data[name] = await fetchJson(route(date, profileId));
      await delay();
    }
    // Only publish a complete day. A failed request leaves the previous file intact.
    const tempPath = `${filePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2) + "\n");
      fs.renameSync(tempPath, filePath);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
    downloaded++;
    console.log(`  Downloaded wellness for ${date}`);
  }
  return { downloaded, skipped };
}
