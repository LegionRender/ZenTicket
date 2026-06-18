import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspaceHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className,
}) {
  return (
    <div className={cn("zt-ws-header", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {eyebrow ? <span className="zt-ws-header-eyebrow">{eyebrow}</span> : null}
        {title ? <h1 className="zt-ws-header-title">{title}</h1> : null}
        {subtitle ? <p className="zt-ws-header-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      {children}
    </div>
  );
}

export function WorkspaceSurface({ children, className }) {
  return <section className={cn("zt-ws-surface", className)}>{children}</section>;
}

function ButtonBase({ className, children, ...props }) {
  return (
    <button className={cn("zt-ws-btn", className)} {...props}>
      {children}
    </button>
  );
}

export function PrimaryButton({ className, children, ...props }) {
  return (
    <ButtonBase className={cn("zt-ws-btn-primary", className)} {...props}>
      {children}
    </ButtonBase>
  );
}

export function SecondaryButton({ className, children, ...props }) {
  return (
    <ButtonBase className={cn("zt-ws-btn-secondary", className)} {...props}>
      {children}
    </ButtonBase>
  );
}

export function GhostButton({ className, children, ...props }) {
  return (
    <ButtonBase className={cn("zt-ws-btn-ghost", className)} {...props}>
      {children}
    </ButtonBase>
  );
}

export function SecondaryAction({ className, children, trailing = true, ...props }) {
  return (
    <ButtonBase className={cn("zt-ws-secondary-action", className)} {...props}>
      <span>{children}</span>
      {trailing ? <ChevronRight className="h-4 w-4" /> : null}
    </ButtonBase>
  );
}

export function IconButton({ className, children, ...props }) {
  return (
    <ButtonBase className={cn("zt-ws-icon-btn", className)} {...props}>
      {children}
    </ButtonBase>
  );
}

export function FloatingScanButton({ className, active, children, ...props }) {
  return (
    <button
      className={cn("zt-ws-fab", active && "is-active", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function WorkspaceCard({ className, children, elevated = false }) {
  return (
    <article className={cn("zt-ws-card", elevated && "zt-ws-card-elevated", className)}>
      {children}
    </article>
  );
}

export function MetricCard({
  className,
  label,
  value,
  hint,
  trailing,
  children,
}) {
  return (
    <WorkspaceCard className={cn("zt-ws-metric-card", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="zt-ws-card-label">{label}</p>
          <p className="zt-ws-card-value">{value}</p>
          {hint ? <p className="zt-ws-card-hint">{hint}</p> : null}
        </div>
        {trailing}
      </div>
      {children}
    </WorkspaceCard>
  );
}

export function PromoCard({ className, title, copy, action, children }) {
  return (
    <article className={cn("zt-ws-promo-card", className)}>
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {copy ? <p className="text-sm text-white/78">{copy}</p> : null}
      </div>
      {children}
      {action}
    </article>
  );
}

export function StatusBadge({ className, children, tone = "info" }) {
  return (
    <span className={cn("zt-ws-badge", `zt-ws-badge-${tone}`, className)}>
      {children}
    </span>
  );
}

export function SegmentedControl({ items = [], value, onChange, className }) {
  return (
    <div className={cn("zt-ws-segmented", className)} role="tablist">
      {items.map((item) => {
        const itemValue = item.value ?? item.id ?? item.label;
        const isActive = itemValue === value;
        return (
          <button
            key={itemValue}
            type="button"
            onClick={() => onChange?.(itemValue)}
            className={cn("zt-ws-segmented-item", isActive && "is-active")}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs({ items = [], value, onChange, className }) {
  return (
    <div className={cn("zt-ws-tabs", className)} role="tablist">
      {items.map((item) => {
        const itemValue = item.value ?? item.id ?? item.label;
        const isActive = itemValue === value;
        return (
          <button
            key={itemValue}
            type="button"
            onClick={() => onChange?.(itemValue)}
            className={cn("zt-ws-tab", isActive && "is-active")}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ className, icon, ...props }) {
  return (
    <label className={cn("zt-ws-search", className)}>
      {icon ?? <Search className="h-4 w-4 text-[var(--workspace-text-muted)]" />}
      <input className="zt-ws-search-input" {...props} />
    </label>
  );
}

export function FormField({ label, hint, error, className, children }) {
  return (
    <label className={cn("zt-ws-field", className)}>
      {label ? <span className="zt-ws-field-label">{label}</span> : null}
      {children}
      {error ? (
        <span className="zt-ws-field-error">{error}</span>
      ) : hint ? (
        <span className="zt-ws-field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function BottomNavigation({ items = [], className }) {
  return (
    <nav className={cn("zt-ws-bottom-nav", className)}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          disabled={item.disabled}
          onClick={item.onClick}
          className={cn(
            "zt-ws-bottom-nav-item",
            item.active && "is-active",
            item.disabled && "is-disabled",
            item.emphasized && "is-emphasized",
          )}
        >
          <span className="zt-ws-bottom-nav-icon">{item.icon}</span>
          <span className="zt-ws-bottom-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function SectionHeader({ title, subtitle, action, className }) {
  return (
    <div className={cn("zt-ws-section-header", className)}>
      <div className="min-w-0">
        <h2 className="zt-ws-section-title">{title}</h2>
        {subtitle ? <p className="zt-ws-section-subtitle">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, copy, action, className, children }) {
  return (
    <div className={cn("zt-ws-empty-state", className)}>
      {children}
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-[var(--workspace-text-primary)]">{title}</h3>
        {copy ? <p className="text-sm text-[var(--workspace-text-secondary)]">{copy}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ProgressSteps({ steps = [], currentStep = 0, className }) {
  return (
    <div className={cn("zt-ws-steps", className)}>
      {steps.map((step, index) => {
        const state =
          index < currentStep ? "is-complete" : index === currentStep ? "is-active" : "";
        return (
          <div key={step.label ?? index} className={cn("zt-ws-step", state)}>
            <div className="zt-ws-step-dot">{index + 1}</div>
            <span className="zt-ws-step-label">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
