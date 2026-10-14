const endpoints = process.argv.slice(2);
const samplesPerEndpoint = 20;

if (endpoints.length < 2 || endpoints.length > 6 || endpoints.some((value) => !value.includes("="))) {
  console.error("Usage: node scripts/measure-regions.mjs fra1=https://preview-fra.example/api/health arn1=https://preview-arn.example/api/health");
  process.exit(2);
}

const percentile = (values, percent) => values[Math.min(values.length - 1, Math.ceil(values.length * percent) - 1)];
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
  let region = "не определён";
  for (let index = 0; index < samplesPerEndpoint + 2; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(parsed, { cache: "no-store" });
    await response.arrayBuffer();
    const duration = performance.now() - startedAt;
    if (!response.ok) throw new Error(label + ": health endpoint ответил " + response.status);
    region = response.headers.get("x-vercel-id")?.split(":")[0] ?? region;
    if (index >= 2) timings.push(duration);
  }
  timings.sort((left, right) => left - right);
  results.push({ label, region, p50: percentile(timings, 0.5), p95: percentile(timings, 0.95) });
}

console.log("Медиана и p95 полного HTTPS-запроса из этой сети; первые два запроса отброшены.");
console.table(results.map(({ label, region, p50, p95 }) => ({ label, region, p50ms: Math.round(p50), p95ms: Math.round(p95) })));
