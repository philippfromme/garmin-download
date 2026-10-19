const DEFAULT_TIMEOUT_MS = 30_000;

export async function fetchInBrowser({ fetchUrl, headers, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(fetchUrl, { headers, signal: controller.signal });
    if (response.status === 204 || response.status === 404) {
      return { status: response.status, data: null };
    }
    if (!response.ok) return { status: response.status };
    if (!response.headers.get("content-type")?.includes("json")) {
      return { status: response.status, invalidContentType: true };
    }
    return { status: response.status, data: await response.json() };
  } catch (error) {
    return { networkError: error?.name === "AbortError" ? "timeout" : error?.message || String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGarminJson(page, session, route, {
  baseUrl = "https://connect.garmin.com",
  refreshHeaders,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.warn,
  maxRetries = 5,
  retryDelayMs = 5_000,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let refreshed = false;
  let attempt = 0;
  while (true) {
    const result = await page.evaluate(fetchInBrowser, {
      fetchUrl: `${baseUrl}${route}`,
      headers: session.headers,
      timeoutMs,
    });

    if ((result.status === 401 || result.status === 403) && !refreshed && refreshHeaders) {
      log(`  Garmin session expired for ${route}; refreshing it...`);
      session.headers = await refreshHeaders();
      refreshed = true;
      continue;
    }

    const retryable = result.networkError || result.status === 429 || result.status >= 500;
    if (retryable && attempt < maxRetries) {
      const waitMs = retryDelayMs * 2 ** attempt;
      const reason = result.networkError === "timeout"
        ? `timed out after ${timeoutMs / 1000}s`
        : result.networkError || `status ${result.status}`;
      log(`  Garmin request for ${route} ${reason}; retrying in ${waitMs / 1000}s (${attempt + 1}/${maxRetries})...`);
      await delay(waitMs);
      attempt++;
      continue;
    }

    if (result.networkError === "timeout") {
      throw new Error(`Garmin request timed out for ${route} after ${maxRetries + 1} attempts`);
    }
    if (result.networkError) {
      throw new Error(`Garmin request failed for ${route}: ${result.networkError}`);
    }
    if (result.invalidContentType) {
      throw new Error(`Garmin returned non-JSON data for ${route}`);
    }
    if (result.status >= 400) {
      throw new Error(`Garmin request failed for ${route} (status ${result.status})`);
    }
    return result.data;
  }
}
