"use client";

import React from "react";
import { Copy } from "lucide-react";
import { cn } from "../lib/utils";

export const PageHeader = ({
  title,
  description,
  actions,
  titlePrefix,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  titlePrefix?: React.ReactNode;
}) => (
  <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-panel backdrop-blur md:flex-row md:items-end md:justify-between">
    <div>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">DockForge</p>
      <div className="mt-2 flex items-center gap-3">
        {titlePrefix}
        <h1 className="text-3xl font-semibold text-slate-950">{title}</h1>
      </div>
      {description ? <p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
  </div>
);

export const Panel = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => <section className={cn("rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-panel", className)}>{children}</section>;

export const Badge = ({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "danger" | "accent" | "warning";
  children: React.ReactNode;
}) => {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-700",
    danger: "bg-rose-100 text-rose-700",
    accent: "bg-orange-100 text-orange-700",
    warning: "bg-amber-100 text-amber-800",
  };

  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
};

export const Button = ({
  className,
  variant = "primary",
  disabled,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
}) => {
  const styles = {
    primary: "bg-orange-500 text-white hover:bg-orange-600",
    secondary: "bg-slate-900 text-white hover:bg-slate-700",
    ghost: "bg-slate-100 text-slate-800 hover:bg-slate-200",
    danger: "border border-rose-200 bg-rose-100 text-rose-800 hover:bg-rose-200",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    warning: "bg-amber-500 text-white hover:bg-amber-600",
  };

  return (
    <button
      disabled={disabled}
      className={cn(
        "rounded-2xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45",
        styles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn(
      "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 transition focus:border-orange-300",
      className,
    )}
    {...props}
  />
);

export const TextArea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 transition focus:border-orange-300"
    {...props}
  />
);

export const Select = ({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className={cn("w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none", className)}
    {...props}
  />
);

export const StatCard = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) => (
  <Panel className="bg-slate-950 text-white">
    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
    <p className="mt-3 text-4xl font-semibold">{value}</p>
    {hint ? <p className="mt-3 text-sm text-slate-300">{hint}</p> : null}
  </Panel>
);

export const Table = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full border-separate border-spacing-y-2 text-sm">{children}</table>
  </div>
);

export const CopyButton = ({
  text,
  label = "Copy",
  iconOnly = false,
  onCopied,
}: {
  text: string;
  label?: string;
  iconOnly?: boolean;
  onCopied?: () => void;
}) => (
  <Button
    variant="ghost"
    type="button"
    title={label}
    aria-label={label}
    className={iconOnly ? "h-8 w-8 rounded-xl px-0" : undefined}
    onClick={async () => {
      await navigator.clipboard.writeText(text);
      onCopied?.();
    }}
  >
    {iconOnly ? <Copy className="mx-auto h-4 w-4" /> : label}
  </Button>
);
