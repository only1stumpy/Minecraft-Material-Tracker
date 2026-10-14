import { fileURLToPath } from "node:url";

const samplesPerEndpoint = 20;
const unknownRegion = "не определён";
const vercelRegionPattern = /^[a-z]{3}\d+$/i;

/**
 * x-vercel-id is emitted as edge-region::function-region::request-id.
 * Keep parsing defensive because the header is optional and its value is
 * supplied by the network boundary, not by this script.
 */
export function parseFunctionRegion(header) {
  if (typeof header !== "string") return null;
  const segments = header.trim().split("::").map((segment) => segment.trim());
  const edgeRegion = segments[0] ?? "";
  const functionRegion = segments[1] ?? "";
  if (!vercelRegionPattern.test(edgeRegion) || !vercelRegionPattern.test(functionRegion)) return null;
  return functionRegion.toLowerCase();
}

const percentile = (values, percent) => values[Math.min(values.length - 1, Math.ceil(values.length * percent) - 1)];

async function main(endpoints) {
  if (endpoints.length < 2 || endpoints.length > 6 || endpoints.some((value) => !value.includes("="))) {
    console.error("Usage: node scripts/measure-regions.mjs fra1=https://preview-fra.example/api/health arn1=https://preview-arn.example/api/health");
    process.exitCode = 2;
    return;
  }

  const results = [];

  for (const endpoint of endpoints) {
    const separator = endpoint.indexOf("=");
    const label = endpoint.slice(0, separator);
    const url = endpoint.slice(separator + 1);
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error("Некорректный URL для " + label); }
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      throw new Error("Для " + label + " нужен HTTPS URL");
    }

    const timings = [];
    let region = unknownRegion;
    for (let index = 0; index < samplesPerEndpoint + 2; index += 1) {
      const startedAt = performance.now();
      const response = await fetch(parsed, { cache: "no-store" });
      await response.arrayBuffer();
      const duration = performance.now() - startedAt;
      if (!response.ok) throw new Error(label + ": health endpoint ответил " + response.status);
      const detectedRegion = parseFunctionRegion(response.headers.get("x-vercel-id"));
      if (detectedRegion) region = detectedRegion;
      if (index >= 2) timings.push(duration);
    }
    timings.sort((left, right) => left - right);
    results.push({ label, region, p50: percentile(timings, 0.5), p95: percentile(timings, 0.95) });
  }

  console.log("Медиана и p95 полного HTTPS-запроса из этой сети; первые два запроса отброшены.");
  console.table(results.map(({ label, region, p50, p95 }) => ({ label, region, p50ms: Math.round(p50), p95ms: Math.round(p95) })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main(process.argv.slice(2));
}
