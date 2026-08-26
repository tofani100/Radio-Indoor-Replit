import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

interface AuthUser { id: number; email: string; name: string; role: string; }
interface AuthContextType { user: AuthUser | null; isLoading: boolean; setUser: (u: AuthUser | null) => void; }

const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true, setUser: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const { data, isLoading: queryLoading, isError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  useEffect(() => {
    if (data) setUser(data as AuthUser);
    if (isError) setUser(null);
  }, [data, isError]);

  const isLoading = queryLoading && !isError;

  return <AuthContext.Provider value={{ user, isLoading, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
