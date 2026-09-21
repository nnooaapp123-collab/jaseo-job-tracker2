// @refresh reset
import { createContext, useContext, ReactNode } from "react";
import { useGetPmMe, usePmLogout, getGetPmMeQueryKey } from "@workspace/api-client-react";
import type { PmUser } from "@workspace/api-client-react";

interface PmAuthContextType {
  user: PmUser | null;
  isLoading: boolean;
  refetch: () => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const PmAuthContext = createContext<PmAuthContextType | undefined>(undefined);

export function PmAuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, refetch } = useGetPmMe({
    query: {
      retry: false,
      queryKey: getGetPmMeQueryKey(),
    }
  });

  const logoutMutation = usePmLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        refetch();
        window.location.href = "/marketplace/login";
      }
    });
  };

  return (
    <PmAuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        refetch,
        logout: handleLogout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </PmAuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(PmAuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a PmAuthProvider");
  }
  return context;
}
