import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type UserRole = "cs" | "editor" | "penulis";

export interface CurrentUser {
  role: UserRole;
  writerId: number | null;
  writerName: string | null;
  editorId: number | null;
  editorName: string | null;
}

interface UserContextValue {
  currentUser: CurrentUser;
  setCurrentUser: (user: CurrentUser) => void;
}

const defaultUser: CurrentUser = {
  role: "cs",
  writerId: null,
  writerName: null,
  editorId: null,
  editorName: null,
};

const UserContext = createContext<UserContextValue>({
  currentUser: defaultUser,
  setCurrentUser: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<CurrentUser>(() => {
    try {
      const saved = localStorage.getItem("jaseo_current_user");
      if (saved) return JSON.parse(saved);
    } catch {}
    return defaultUser;
  });

  const setCurrentUser = (user: CurrentUser) => {
    setCurrentUserState(user);
    localStorage.setItem("jaseo_current_user", JSON.stringify(user));
  };

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(UserContext);
}
