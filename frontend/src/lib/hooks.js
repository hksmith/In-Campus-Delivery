import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api.js';
import { toast } from './toast.js';

/**
 * Loads data from the API.
 *   const { data, loading, error, reload } = useApi('/orders', { params })
 * Pass `null` as url to skip loading.
 */
export function useApi(url, options = {}) {
  const [state, setState] = useState({ data: null, loading: Boolean(url), error: null });
  const key = url ? `${url}?${JSON.stringify(options.params || {})}` : null;
  const optsRef = useRef(options);
  optsRef.current = options;

  const load = useCallback(
    async (silent = false) => {
      if (!key) return;
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { data } = await api.get(url, { params: optsRef.current.params });
        setState({ data, loading: false, error: null });
      } catch (err) {
        setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
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
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
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
