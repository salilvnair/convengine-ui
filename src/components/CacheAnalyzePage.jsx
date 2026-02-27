import { useCallback, useEffect, useMemo, useState } from "react";
import { analyzeCaches } from "../api/convengine.api.js";
import { DbTable } from "./convengine/DbTable";

function asText(value) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length === 0 ? "-" : value.join(", ");
  return JSON.stringify(value);
}

function mapRows(obj = {}) {
  return Object.entries(obj).map(([key, value]) => [key, asText(value)]);
}

export default function CacheAnalyzePage() {
  const [warmup, setWarmup] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const loadAnalyze = useCallback(async (withWarmup = warmup) => {
    setLoading(true);
    setError("");
    try {
      const res = await analyzeCaches(withWarmup);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cache analyze failed");
    } finally {
      setLoading(false);
    }
  }, [warmup]);

  useEffect(() => {
    loadAnalyze(true);
  }, [loadAnalyze]);

  const providerRows = useMemo(() => mapRows(data?.cacheProvider || {}), [data]);
  const springRows = useMemo(() => mapRows(data?.springCacheProperties || {}), [data]);
  const infraRows = useMemo(() => mapRows(data?.cacheInfrastructure || {}), [data]);

  const staticCacheRows = useMemo(
    () =>
      Object.entries(data?.staticCaches || {}).map(([cacheName, value]) => [
        cacheName,
        asText(value?.exists),
        asText(value?.hasSimpleKeyEntry),
        asText(value?.listSize),
        asText(value?.nativeEntryCount),
      ]),
    [data]
  );

  const runtimeCacheRows = useMemo(
    () =>
      Object.entries(data?.runtimeCaches || {}).map(([cacheName, value]) => [
        cacheName,
        asText(value?.exists),
        asText(value?.nativeEntryCount),
      ]),
    [data]
  );

  const warmupRows = useMemo(
    () =>
      Object.entries(data?.warmupTimingMs || {}).map(([cacheName, value]) => [
        cacheName,
        `${asText(value?.firstCallMs)} ms`,
        `${asText(value?.secondCallMs)} ms`,
      ]),
    [data]
  );

  return (
    <section className="cache-analyze-page">
      <div className="cache-analyze-content">
        <div className="cache-analyze-toolbar">
          <div>
            <h2>ConvEngine Cache Analyze</h2>
            <p>Live report from `/api/v1/cache/analyze`.</p>
          </div>

          <div className="cache-analyze-actions">
            <label className="cache-analyze-warmup">
              <input
                type="checkbox"
                checked={warmup}
                onChange={(e) => setWarmup(e.target.checked)}
              />
              warmup
            </label>
            <button
              type="button"
              className="cache-analyze-load"
              onClick={() => loadAnalyze(warmup)}
              disabled={loading}
              title={loading ? "Running cache analyze" : "Run cache analyze"}
              aria-label={loading ? "Running cache analyze" : "Run cache analyze"}
            >
              {loading ? "Analyzing..." : "Run Analyze"}
            </button>
          </div>
        </div>

        {error ? <div className="cache-analyze-error">{error}</div> : null}

        <div className="cache-analyze-grid">
          <DbTable title="Cache Provider" columns={["Key", "Value"]} rows={providerRows} />
          <DbTable title="Spring Cache Properties" columns={["Key", "Value"]} rows={springRows} />
          <DbTable title="Cache Infrastructure" columns={["Key", "Value"]} rows={infraRows} />

          <DbTable
            title="Static Caches"
            columns={["Cache", "Exists", "SimpleKey", "ListSize", "NativeEntries"]}
            rows={staticCacheRows}
          />

          <DbTable
            title="Runtime Caches"
            columns={["Cache", "Exists", "NativeEntries"]}
            rows={runtimeCacheRows}
          />

          {warmupRows.length > 0 ? (
            <DbTable
              title="Warmup Timing"
              columns={["Cache", "First Call", "Second Call"]}
              rows={warmupRows}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
