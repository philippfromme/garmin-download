const BASE_URL = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createPersonalApiClient(apiKey, {
  baseUrl = BASE_URL,
  fetchImpl = fetch,
  delay = sleep,
  now = Date.now,
  log = console.warn,
} = {}) {
  if (!apiKey?.trim()) throw new Error("GARMIN_PERSONAL_API_KEY is required");
  let token;
  let tokenTime = 0;

  async function send(path, options = {}) {
    return fetchImpl(new URL(path, baseUrl), {
      ...options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  async function obtainToken() {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response;
      try {
        response = await send(TOKEN_PATH, {
          method: "POST",
          headers: { Authorization: `ApiKey ${apiKey}`, Accept: "*/*" },
        });
      } catch (error) {
        if (attempt === MAX_RETRIES) throw new Error(`Garmin token request failed: ${error.message}`);
        const waitMs = 5_000 * 2 ** attempt;
        log(`Garmin token request failed; retrying in ${waitMs / 1000}s`);
        await delay(waitMs);
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000 : 5_000 * 2 ** attempt;
        log(`Garmin token request returned ${response.status}; retrying in ${waitMs / 1000}s`);
        await delay(waitMs);
        continue;
      }
      if (!response.ok) throw new Error(`Garmin token request failed (status ${response.status})`);
      const value = (await response.text()).trim();
      if (!value) throw new Error("Garmin token response was empty");
      token = value;
      tokenTime = now();
      return;
    }
  }

  async function request(path, { binary = false } = {}) {
    let refreshed = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (!token || now() - tokenTime >= 23 * 60 * 60 * 1000) await obtainToken();
      let response;
      try {
        response = await send(path, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: binary ? "application/zip, application/x-zip-compressed, application/octet-stream" : "application/json",
          },
        });
      } catch (error) {
        if (attempt === MAX_RETRIES) throw new Error(`Garmin request failed for ${path}: ${error.message}`);
        const waitMs = 5_000 * 2 ** attempt;
        log(`Garmin request for ${path} failed; retrying in ${waitMs / 1000}s`);
        await delay(waitMs);
        continue;
      }
      if (response.status === 401 && !refreshed) {
        token = undefined;
        refreshed = true;
        await obtainToken();
        attempt--;
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000 : 5_000 * 2 ** attempt;
        log(`Garmin returned ${response.status} for ${path}; retrying in ${waitMs / 1000}s`);
        await delay(waitMs);
        continue;
      }
      if (response.status === 204 || response.status === 404) return null;
      if (!response.ok) throw new Error(`Garmin request failed for ${path} (status ${response.status})`);
      if (binary) return Buffer.from(await response.arrayBuffer());
      const body = await response.text();
      if (!body) return null;
      try { return JSON.parse(body); }
      catch { throw new Error(`Garmin returned invalid JSON for ${path}`); }
    }
    throw new Error(`Garmin request failed for ${path} after ${MAX_RETRIES + 1} attempts`);
  }

  return {
    getJson: (path) => request(path),
    getZip: (path) => request(path, { binary: true }),
  };
}
