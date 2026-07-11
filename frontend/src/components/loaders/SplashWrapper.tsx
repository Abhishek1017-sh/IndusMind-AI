"use client";

import { useState, useEffect, useCallback } from "react";
import SplashScreen from "./SplashScreen";

export default function SplashWrapper({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Show splash only once per session
    const seen = sessionStorage.getItem("im_splash_shown");
    if (!seen) {
      setShowSplash(true);
    }
    setMounted(true);
  }, []);

  const handleComplete = useCallback(() => {
    sessionStorage.setItem("im_splash_shown", "1");
    setShowSplash(false);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {showSplash && <SplashScreen onComplete={handleComplete} />}
      <div
        style={{
          opacity: showSplash ? 0 : 1,
          transition: "opacity 0.4s ease",
          pointerEvents: showSplash ? "none" : "all",
        }}
      >
        {children}
      </div>
    </>
  );
}
