import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../lib/api.js';
import { setCurrency } from '../lib/format.js';
import { connectSocket, disconnectSocket, useSocketEvent } from '../lib/socket.js';
import { setLanguage } from '../i18n/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    user: null,
    cafe: null,
    settings: null,
    config: null,
    loading: true,
    error: null,
    errorCode: null,
  });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setCurrency(data.config?.currency);
      if (data.user?.language) setLanguage(data.user.language);
      if (data.config?.appName) document.title = data.config.appName;
      setState({ ...data, loading: false, error: null, errorCode: null });
      return data;
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: errorMessage(err),
        errorCode: err?.response?.data?.details?.code || err?.response?.status || null,
      }));
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Open the realtime connection once we know who the user is
  const userId = state.user?._id;
  const role = state.user?.role;
  useEffect(() => {
    if (!userId) return undefined;
    connectSocket();
    return () => disconnectSocket();
  }, [userId, role]);

  // Server says our account changed (approved, role changed, banned…)
  useSocketEvent('me:updated', () => refresh());

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      setUser: (user) => setState((s) => ({ ...s, user })),
      /** Switch language instantly and save it to the profile (bot messages follow it) */
      changeLanguage: async (lang) => {
        setLanguage(lang);
        try {
          const { data } = await api.patch('/users/me', { language: lang });
          setState((s) => ({ ...s, user: data.user }));
        } catch {
          /* language still switched locally */
        }
      },
    }),
    [state, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
