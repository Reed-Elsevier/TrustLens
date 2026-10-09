import type { CSSProperties, HTMLAttributes, ReactNode, SVGProps } from "react";
import type { LegalVerdict, RiskLevel, Severity } from "@/lib/analyze/types";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const IconUpload = (p: IconProps) => <Icon {...p}><path d="M12 16V4m0 0l-4 4m4-4l4 4" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></Icon>;
export const IconFile = (p: IconProps) => <Icon {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Icon>;
export const IconShield = (p: IconProps) => <Icon {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></Icon>;
export const IconScale = (p: IconProps) => <Icon {...p}><path d="M12 3v18M7 21h10M5 7h14" /><path d="M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z" /></Icon>;
export const IconSpark = (p: IconProps) => <Icon {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" /></Icon>;
export const IconSend = (p: IconProps) => <Icon {...p}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></Icon>;
export const IconCheck = (p: IconProps) => <Icon {...p}><path d="M5 13l4 4L19 7" /></Icon>;
export const IconX = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const IconAlert = (p: IconProps) => <Icon {...p}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></Icon>;
export const IconChat = (p: IconProps) => <Icon {...p}><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></Icon>;
export const IconBack = (p: IconProps) => <Icon {...p}><path d="M19 12H5m0 0l6-6m-6 6l6 6" /></Icon>;
export const IconLens = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>;
export const IconBook = (p: IconProps) => <Icon {...p}><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 19a2 2 0 002 2h13" /></Icon>;

export function Card({ children, className = "", ...props }: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLElement>, "className">) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:shadow-none ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ icon, title, hint, right }: { icon: ReactNode; title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-600 dark:text-indigo-300 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
        </div>
      </div>
      {right}
    </div>
  );
}

const SEVERITY_STYLES: Record<Severity, string> = {
  high: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  medium: "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  low: "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
};

export const SEVERITY_BORDER: Record<Severity, string> = {
  high: "border-l-rose-500",
  medium: "border-l-amber-500",
  low: "border-l-sky-500",
};

const VERDICT_STYLES: Record<LegalVerdict, { label: string; className: string }> = {
  good_law: { label: "Good law", className: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30" },
  questionable: { label: "Questionable", className: SEVERITY_STYLES.medium },
  overruled: { label: "Overruled", className: SEVERITY_STYLES.high },
  superseded: { label: "Superseded", className: SEVERITY_STYLES.high },
};

const PILL = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`${PILL} ${SEVERITY_STYLES[severity]}`}>{severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low"}</span>;
}

export function VerdictBadge({ verdict }: { verdict: LegalVerdict }) {
  const { label, className } = VERDICT_STYLES[verdict];
  return <span className={`${PILL} ${className}`}>{label}</span>;
}

export function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "indigo" | "emerald" | "amber" | "rose" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10",
    indigo: "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30",
    emerald: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    amber: SEVERITY_STYLES.medium,
    rose: SEVERITY_STYLES.high,
  };
  return <span className={`${PILL} ${tones[tone]}`}>{children}</span>;
}

export const LEVEL_TONE: Record<RiskLevel, { ring: string; text: string; label: string }> = {
  low: { ring: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "Low risk" },
  medium: { ring: "stroke-amber-500", text: "text-amber-600 dark:text-amber-400", label: "Medium risk" },
  high: { ring: "stroke-rose-500", text: "text-rose-600 dark:text-rose-400", label: "High risk" },
};

/** Circular gauge; the fill animates in with CSS only so no effect or state is needed. */
export function ScoreRing({ value, display, ringClass, textClass, size = 112 }: { value: number | null; display: string; ringClass: string; textClass: string; size?: number }) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = value === null ? 0 : Math.min(100, Math.max(0, value)) / 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-white/10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          className={`${ringClass} animate-ring`}
          style={{ "--ring-circumference": circumference, "--ring-offset": circumference * (1 - fraction), strokeDashoffset: circumference * (1 - fraction) } as CSSProperties}
        />
      </svg>
      <div className={`absolute inset-0 grid place-items-center text-2xl font-bold tabular-nums ${textClass}`}>{display}</div>
    </div>
  );
}

export function Bar({ value, max, className = "bg-indigo-500" }: { value: number; max: number; className?: string }) {
  const width = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="presentation">
      <div className={`h-full rounded-full transition-[width] duration-700 ${className}`} style={{ width: `${width}%` }} />
    </div>
  );
}
