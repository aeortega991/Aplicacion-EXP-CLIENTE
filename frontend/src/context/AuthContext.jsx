import { createContext, useContext, useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
      } catch (e) {
        localStorage.removeItem("fleet_token");
      } finally {
        setLoading(false);
      }
    };
    boot();
  }, []);

  const login = async (username, password) => {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      localStorage.setItem("fleet_token", data.token);
      setUser(data.user);
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
      return { ok: true };
    } catch (e) {
      localStorage.removeItem("fleet_token");
      return { ok: false, error: formatApiError(e) };
    }
  };

  const logout = () => {
    localStorage.removeItem("fleet_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithToken, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
