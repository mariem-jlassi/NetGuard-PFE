import { useState, useEffect } from "react";

const TOKEN_KEY   = "netguard_token";
const USER_KEY    = "netguard_user";
const ROLE_KEY    = "netguard_role";
const NAME_KEY    = "netguard_display";

export function useAuth() {
  const [token,       setToken]       = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username,    setUsername]    = useState<string | null>(() => localStorage.getItem(USER_KEY));
  const [role,        setRole]        = useState<string | null>(() => localStorage.getItem(ROLE_KEY));
  const [displayName, setDisplayName] = useState<string | null>(() => localStorage.getItem(NAME_KEY));
  const [isLoading,   setIsLoading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const isAuthenticated = !!token;
  const isAdmin = role === "admin";

  const login = async (user: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY,  data.username);
        localStorage.setItem(ROLE_KEY,  data.role ?? "operator");
        localStorage.setItem(NAME_KEY,  data.displayName ?? data.username);
        setToken(data.token);
        setUsername(data.username);
        setRole(data.role ?? "operator");
        setDisplayName(data.displayName ?? data.username);
        return true;
      }
      setError(data.error || "Identifiants incorrects.");
      return false;
    } catch {
      setError("Impossible de contacter le serveur.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      }).catch(() => {});
    }
    [TOKEN_KEY, USER_KEY, ROLE_KEY, NAME_KEY].forEach(k => localStorage.removeItem(k));
    setToken(null);
    setUsername(null);
    setRole(null);
    setDisplayName(null);
  };

  return { isAuthenticated, isAdmin, token, username, role, displayName, login, logout, isLoading, error };
}
