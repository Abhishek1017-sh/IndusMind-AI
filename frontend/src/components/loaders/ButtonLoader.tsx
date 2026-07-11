"use client";

import { Loader2 } from "lucide-react";

interface ButtonLoaderProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export default function ButtonLoader({
  loading,
  loadingText = "Loading...",
  children,
  className = "",
  disabled,
  ...props
}: ButtonLoaderProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`relative flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all duration-200 cursor-pointer disabled:opacity-60 overflow-hidden ${className}`}
      style={{
        background: "linear-gradient(135deg, #2563EB, #3B82F6)",
        boxShadow: "0 4px 12px rgba(37,99,235,0.2)",
      }}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="im-fade-in">{loadingText}</span>
        </>
      ) : (
        <span className="im-fade-in flex items-center gap-2">{children}</span>
      )}
    </button>
  );
}
