import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const PAGE_SIZE = 20;

export function fitFileName(activity) {
  const timestamp = activity.startTimeLocal || activity.beginTimestamp;
  const stem = timestamp
    ? String(timestamp).replace(/[ :]/g, "-").replace(/\..+$/, "")
    : String(activity.activityId);
  return `${stem}.fit`;
}

export async function downloadActivities({ client, outputDir, limit = null, delay = async () => {} }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const activities = [];
  for (let start = 0; limit === null || activities.length < limit; start += PAGE_SIZE) {
    const batch = await client.getJson(`/activitylist-service/activities/search/activities?start=${start}&limit=${PAGE_SIZE}`);
    if (!Array.isArray(batch)) throw new Error("Garmin returned an invalid activity list");
    activities.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const selected = limit === null ? activities : activities.slice(0, limit);
  let downloaded = 0;
  let skipped = 0;
  for (const [index, activity] of selected.entries()) {
    const filePath = path.join(outputDir, fitFileName(activity));
    if (fs.existsSync(filePath)) { skipped++; continue; }
    const id = activity.activityId;
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Garmin returned an invalid activity ID");
    const zipBytes = await client.getZip(`/download-service/files/activity/${id}`);
    if (!zipBytes) {
      console.log(`  [${index + 1}/${selected.length}] Activity ${id} has no original file`);
      skipped++;
      continue;
    }
    const zip = new AdmZip(zipBytes);
    const fit = zip.getEntries().find((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".fit"));
    if (!fit) {
      console.log(`  [${index + 1}/${selected.length}] Activity ${id} has no FIT file`);
      skipped++;
      continue;
    }
    const tempPath = `${filePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tempPath, fit.getData());
      fs.renameSync(tempPath, filePath);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
    downloaded++;
    console.log(`  [${index + 1}/${selected.length}] Saved ${path.basename(filePath)}`);
    if (index < selected.length - 1) await delay(1_500);
  }
  return { found: selected.length, downloaded, skipped };
}
