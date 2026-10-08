import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);

  const loadPerms = useCallback(async () => {
    try {
      const { data } = await api.get("/me/permissions");
      setPerms(data.perms || {});
    } catch (e) {
      setPerms({});
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      const token = localStorage.getItem("fleet_token");
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
        await loadPerms();
      } catch (e) {
        localStorage.removeItem("fleet_token");
      } finally {
        setLoading(false);
      }
    };
    boot();
  }, [loadPerms]);

  const login = async (username, password) => {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      localStorage.setItem("fleet_token", data.token);
      setUser(data.user);
      await loadPerms();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const loginWithToken = async (token) => {
    localStorage.setItem("fleet_token", token);
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      await loadPerms();
      return { ok: true };
    } catch (e) {
      localStorage.removeItem("fleet_token");
      return { ok: false, error: formatApiError(e) };
    }
  };

  const logout = () => {
    localStorage.removeItem("fleet_token");
    setUser(null);
    setPerms({});
  };

  // can(resourceKey, "view" | "edit") — admin siempre true
  const can = useCallback((key, action = "view") => {
    if (user?.role === "admin") return true;
    const p = perms[key];
    if (!p) return false;
    return action === "edit" ? !!p.edit : !!p.view;
  }, [user, perms]);

  return (
    <AuthContext.Provider value={{ user, loading, perms, can, login, loginWithToken, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
