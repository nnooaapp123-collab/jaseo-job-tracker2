import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

export type UserRole = "admin" | "cs" | "editor" | "penulis";

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  writerId: number | null;
  writerName: string | null;
  editorId: number | null;
  editorName: string | null;
  isAlsoEditor?: boolean;
  isImpersonating?: boolean;
}

interface AuthContextValue {
  currentUser: AuthUser | null;
  isLoading: boolean;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isLoading: true,
  login: () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/me`, { credentials: "include" });
      if (res.ok) {
        const user = await res.json();
        setCurrentUser(user as AuthUser);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = (user: AuthUser) => {
    setCurrentUser(user);
  };

  const logout = async () => {
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      await fetch(`${base}/api/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    setCurrentUser(null);
  };

  const refresh = fetchMe;

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
