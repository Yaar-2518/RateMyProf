import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

export function Link({ to, children, ...props }) {
  return (
    <a href={`#${to}`} {...props}>
      {children}
    </a>
  );
}
export function Avatar({ professor, size = "" }) {
  return (
    <span className={`avatar ${size}`} aria-hidden="true">
      {professor.initials}
    </span>
  );
}
export function Stars({ value }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= Math.round(value) ? "filled" : ""}>
          ★
        </span>
      ))}
    </span>
  );
}
export function Tag({ children, selected, onClick }) {
  const className = `tag ${/Heavy|Difficult|Tough|Strict/.test(children) ? "warm" : ""} ${selected ? "selected" : ""}`;
  return onClick ? (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-pressed={selected}
    >
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  );
}
export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function EmptyState({
  title = "No results found",
  description = "Try another search or choose a different department.",
  children,
}) {
  return (
    <div className="empty-state">
      <span className="icon-tile">
        <Icon name="search" size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search professors...",
  label = "Search",
  ...props
}) {
  return (
    <div className="search-input">
      <Icon name="search" size={19} />
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        {...props}
      />
      {value && (
        <button
          type="button"
          className="icon-button"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
export function DepartmentFilter({ departments, value, onChange }) {
  return (
    <div className="filter-chips" aria-label="Filter by department">
      {["All Departments", ...departments].map((d) => (
        <button
          key={d}
          className={`filter-chip ${value === d ? "active" : ""}`}
          onClick={() => onChange(d)}
          aria-pressed={value === d}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={value === tab}
          className={value === tab ? "active" : ""}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (ref.current.querySelector("button") || ref.current).focus();
    const handler = (e) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = ref.current.querySelectorAll(
          'button, input, select, textarea, a[href], [tabindex="0"]',
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
