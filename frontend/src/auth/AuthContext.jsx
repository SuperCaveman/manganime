import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getCurrentUser } from './cognito';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading

  const refresh = useCallback(() => {
    return getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
