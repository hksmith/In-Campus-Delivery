import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api.js';
import { toast } from './toast.js';

/**
 * Last answer for each request, so a page you already visited shows at once
 * and refreshes quietly in the background (no spinner). Kept in memory only.
 */
const responseCache = new Map();
const CACHE_LIMIT = 60;

function remember(key, data) {
  responseCache.delete(key);
  responseCache.set(key, data);
  if (responseCache.size > CACHE_LIMIT) responseCache.delete(responseCache.keys().next().value);
}

/** Forget everything (called when the user or their role changes) */
export function clearApiCache() {
  responseCache.clear();
}

/**
 * Loads data from the API.
 *   const { data, loading, error, reload } = useApi('/orders', { params })
 * Pass `null` as url to skip loading.
 * If this request was loaded before, its last result shows immediately while fresh data loads.
 */
export function useApi(url, options = {}) {
  const key = url ? `${url}?${JSON.stringify(options.params || {})}` : null;
  const [state, setState] = useState(() => {
    const cached = key ? responseCache.get(key) : undefined;
    return cached !== undefined ? { data: cached, loading: false, error: null } : { data: null, loading: Boolean(url), error: null };
  });
  const optsRef = useRef(options);
  optsRef.current = options;

  const load = useCallback(
    async (silent = false) => {
      if (!key) return;
      if (!silent) {
        const cached = responseCache.get(key);
        if (cached !== undefined) {
          setState({ data: cached, loading: false, error: null });
          silent = true;
        } else {
          setState((s) => ({ ...s, loading: true, error: null }));
        }
      }
      try {
        const { data } = await api.get(url, { params: optsRef.current.params });
        remember(key, data);
        setState({ data, loading: false, error: null });
      } catch (err) {
        // Keep showing what we have if a background refresh fails
        setState((s) => ({ ...s, loading: false, error: s.data ? null : errorMessage(err) }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  useEffect(() => {
    load();
  }, [load]);

  /** reload(true) refreshes without showing the loading spinner */
  const reload = useCallback((silent = true) => load(silent), [load]);
  const setData = useCallback(
    (data) => {
      if (key) remember(key, data);
      setState((s) => ({ ...s, data }));
    },
    [key]
  );
  return { ...state, reload, setData };
}

/** Wraps an async action with a busy flag and error toast */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, { onError } = {}) => {
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      const msg = errorMessage(err);
      if (onError) onError(msg);
      else toast.error(msg);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return [busy, run];
}

/** Re-render every `ms` (for "5 min ago" labels and countdowns) */
export function useTicker(ms = 30000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
