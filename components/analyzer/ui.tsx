import type { HTMLAttributes, ReactNode, SVGProps } from "react";
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
export const IconList = (p: IconProps) => <Icon {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></Icon>;
export const IconSend = (p: IconProps) => <Icon {...p}><path d="M5 12h14m0 0l-6-6m6 6l-6 6" /></Icon>;
export const IconCheck = (p: IconProps) => <Icon {...p}><path d="M5 13l4 4L19 7" /></Icon>;
export const IconX = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const IconAlert = (p: IconProps) => <Icon {...p}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></Icon>;
export const IconChat = (p: IconProps) => <Icon {...p}><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></Icon>;
export const IconBack = (p: IconProps) => <Icon {...p}><path d="M19 12H5m0 0l6-6m-6 6l6 6" /></Icon>;
export const IconLens = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>;
export const IconBook = (p: IconProps) => <Icon {...p}><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 19a2 2 0 002 2h13" /></Icon>;
export const IconChevron = (p: IconProps) => <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>;

export const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
export const BUTTON_PRIMARY = `inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;
export const BUTTON_SECONDARY = `inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent-deep hover:text-bright ${FOCUS_RING}`;
export const EYEBROW = "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted";

export function Card({ children, className = "", ...props }: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLElement>, "className">) {
  return (
    <section className={`rounded-xl border border-line bg-panel ${className}`} {...props}>
      {children}
    </section>
  );
}

export function SectionTitle({ icon, title, hint, right }: { icon: ReactNode; title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-canvas text-accent [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-bright">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
        </div>
      </div>
      {right}
    </div>
  );
}

const TONE = {
  neutral: "border-line bg-raised text-ink",
  accent: "border-accent-deep/70 bg-accent/10 text-accent",
  warn: "border-warn/30 bg-warn/10 text-warn",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

export type Tone = keyof typeof TONE;

const SEVERITY_TONE: Record<Severity, Tone> = { high: "danger", medium: "warn", low: "neutral" };

export const SEVERITY_BORDER: Record<Severity, string> = {
  high: "border-l-danger",
  medium: "border-l-warn",
  low: "border-l-line-strong",
};

const VERDICT: Record<LegalVerdict, { label: string; tone: Tone }> = {
  good_law: { label: "Good law", tone: "accent" },
  questionable: { label: "Questionable", tone: "warn" },
  overruled: { label: "Overruled", tone: "danger" },
  superseded: { label: "Superseded", tone: "danger" },
};

const BADGE = "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`${BADGE} ${TONE[SEVERITY_TONE[severity]]}`}>{severity}</span>;
}

export function VerdictBadge({ verdict }: { verdict: LegalVerdict }) {
  return <span className={`${BADGE} ${TONE[VERDICT[verdict].tone]}`}>{VERDICT[verdict].label}</span>;
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${TONE[tone]}`}>{children}</span>;
}

export const LEVEL_TONE: Record<RiskLevel, { text: string; bar: string; label: string }> = {
  low: { text: "text-accent", bar: "bg-accent", label: "Low risk" },
  medium: { text: "text-warn", bar: "bg-warn", label: "Medium risk" },
  high: { text: "text-danger", bar: "bg-danger", label: "High risk" },
};

export function Meter({ value, max, className = "bg-accent" }: { value: number; max: number; className?: string }) {
  const width = max === 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="presentation">
      <div className={`h-full rounded-full transition-[width] duration-700 ${className}`} style={{ width: `${width}%` }} />
    </div>
  );
}
