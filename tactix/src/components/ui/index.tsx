import React from 'react';

// ─────────────────────────────────────────────────────────────
// Composants d'interface réutilisables (design system TACTIX).
// ─────────────────────────────────────────────────────────────

export function Btn({
  children,
  variant = 'default',
  size,
  block,
  active,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm';
  block?: boolean;
  active?: boolean;
}) {
  const cls = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
    active ? 'btn--active' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Chip({
  active,
  tone,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: 'blue' }) {
  return (
    <button
      className={`chip${active ? ' chip--active' : ''}${tone === 'blue' ? ' chip--blue' : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="segments">
      {options.map((o) => (
        <button
          key={o.id}
          className={o.id === value ? 'is-active' : ''}
          onClick={() => onChange(o.id)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({
  open,
  title,
  onClose,
  children,
  maxWidth,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet"
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__handle" />
        <div className="sheet__title">
          <h2>{title}</h2>
          <button className="sheet__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MenuItem({
  emoji,
  label,
  hint,
  danger,
  onClick,
}: {
  emoji?: string;
  label: string;
  hint?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`menu-item${danger ? ' menu-item--danger' : ''}`} onClick={onClick}>
      {emoji && <span className="menu-item__emoji">{emoji}</span>}
      <span className="grow">
        <span style={{ display: 'block' }}>{label}</span>
        {hint && <span className="muted small">{hint}</span>}
      </span>
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle">
      <div className="grow">
        <div style={{ fontWeight: 650, fontSize: 14.5 }}>{label}</div>
        {hint && <div className="muted small">{hint}</div>}
      </div>
      <div
        className={`switch${value ? ' is-on' : ''}`}
        role="switch"
        aria-checked={value}
        tabIndex={0}
        onClick={() => onChange(!value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onChange(!value);
        }}
      />
    </div>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action && (
        <button onClick={onAction} type="button">
          {action}
        </button>
      )}
    </div>
  );
}

export function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--white)' }}>{text}</div>
      {hint && <div className="small" style={{ marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - step))} type="button">
        −
      </button>
      <div className="stepper__value">
        {value}
        {suffix ? <span className="muted small">{suffix}</span> : null}
      </div>
      <button onClick={() => onChange(Math.min(max, value + step))} type="button">
        +
      </button>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

// ── Icônes (SVG, trait fin, style premium) ───────────────────

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const Icons = {
  home: (
    <svg {...iconProps}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />
    </svg>
  ),
  tactic: (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M12 4v13M3 10.5h18" />
      <path d="M8 20h8" />
    </svg>
  ),
  exercise: (
    <svg {...iconProps}>
      <path d="M6 4v16M18 4v16" />
      <path d="M6 9h6M6 15h6" />
      <path d="M14 12h6" />
    </svg>
  ),
  session: (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h4" />
    </svg>
  ),
  library: (
    <svg {...iconProps}>
      <path d="M4 5.5A2 2 0 0 1 6 3.5h4v17H6a2 2 0 0 1-2-2z" />
      <path d="M10 3.5h4v17h-4zM14 3.5h4a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-4" />
    </svg>
  ),
  star: (filled?: boolean) => (
    <svg {...iconProps} fill={filled ? 'currentColor' : 'none'}>
      <path d="m12 4 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17.4 6.7 20.1l1-5.8L3.5 10.2l5.9-.9z" />
    </svg>
  ),
  play: (
    <svg {...iconProps} fill="currentColor" stroke="none">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  ),
  pause: (
    <svg {...iconProps} fill="currentColor" stroke="none">
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </svg>
  ),
  prev: (
    <svg {...iconProps} fill="currentColor" stroke="none">
      <path d="M7 5h2.5v14H7zM19 5.5v13L9.5 12z" />
    </svg>
  ),
  next: (
    <svg {...iconProps} fill="currentColor" stroke="none">
      <path d="M15 5h2.5v14H15zM5 5.5v13L14.5 12z" />
    </svg>
  ),
  reset: (
    <svg {...iconProps}>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <path d="M4 4v5h5" />
    </svg>
  ),
  undo: (
    <svg {...iconProps}>
      <path d="M9 8H5V4" />
      <path d="M5 8a9 9 0 1 1-1 6" />
    </svg>
  ),
  redo: (
    <svg {...iconProps}>
      <path d="M15 8h4V4" />
      <path d="M19 8a9 9 0 1 0 1 6" />
    </svg>
  ),
  plus: (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  close: (
    <svg {...iconProps}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  trash: (
    <svg {...iconProps}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  ),
  copy: (
    <svg {...iconProps}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5H6a2 2 0 0 0-2 2v9" />
    </svg>
  ),
  download: (
    <svg {...iconProps}>
      <path d="M12 4v11m0 0-4-4m4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  ),
  eye: (
    <svg {...iconProps}>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ),
  target: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  grid: (
    <svg {...iconProps}>
      <path d="M4 9h16M4 15h16M9 4v16M15 4v16" />
    </svg>
  ),
  lock: (
    <svg {...iconProps}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
    </svg>
  ),
  ball: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8.4 15 10.6l-1.1 3.5h-3.8L9 10.6z" />
    </svg>
  ),
};
