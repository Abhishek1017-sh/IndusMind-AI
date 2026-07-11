"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { loginApi, registerApi, type AuthToken, type LoginPayload, type RegisterPayload } from "@/lib/api";

interface User { email: string; name: string; role: string; }

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (p: LoginPayload) => Promise<void>;
  register: (p: RegisterPayload) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return decodeURIComponent(parts.pop()?.split(";").shift() || "");
  return null;
}

function setCookie(name: string, value: string, days = 7) {
  if (typeof document === "undefined") return;
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `; expires=${date.toUTCString()}`;
  document.cookie = `${name}=${encodeURIComponent(value)}${expires}; path=/; SameSite=Lax; Secure`;
}

function eraseCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=-99999999; path=/; SameSite=Lax; Secure`;
}

function readStorage(key: string): string | null {
  try {
    const val = localStorage.getItem(key);
    if (val) return val;
    return getCookie(key);
  } catch {
    return getCookie(key);
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
  setCookie(key, value);
}

function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  eraseCookie(key);
}


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Hydrate once on mount — read persisted session
  useEffect(() => {
    const storedToken = readStorage("im_token");
    const storedUser  = readStorage("im_user");
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        removeStorage("im_token");
        removeStorage("im_user");
      }
    }
    setIsLoading(false);
  }, []);

  const saveAuth = useCallback((data: AuthToken) => {
    const u: User = { email: data.email, name: data.name, role: data.role };
    writeStorage("im_token", data.access_token);
    writeStorage("im_user", JSON.stringify(u));
    setToken(data.access_token);
    setUser(u);
  }, []);

  const login = useCallback(async (p: LoginPayload) => {
    const data = await loginApi(p);
    saveAuth(data);
    // Small defer so React re-renders the token state before the layout guard checks
    setTimeout(() => router.push("/dashboard"), 50);
  }, [saveAuth, router]);

  const register = useCallback(async (p: RegisterPayload) => {
    const data = await registerApi(p);
    saveAuth(data);
    setTimeout(() => router.push("/dashboard"), 50);
  }, [saveAuth, router]);

  const logout = useCallback(() => {
    removeStorage("im_token");
    removeStorage("im_user");
    setToken(null);
    setUser(null);
    router.push("/");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
