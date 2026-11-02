import { useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { searchOptions } from "../lib/searchOptions.js";

export default function SearchSelect({
  label, options, value = "", onChange, placeholder = "Type to search…",
  disabled = false, required = false, clearOnSelect = false, name,
  emptyMessage = "No matches. Try a different name or code.",
}) {
  const id = useId();
  const input = useRef(null), activeOption = useRef(null);
  const selected = options.find(option => option.value === value);
  const [query, setQuery] = useState(selected?.label || "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const lastValue = useRef(value);
  const selectedLabel = selected?.label || "";
  const { matches, total } = searchOptions(options, query);
  const searching = open && !disabled && !selected && !!query.trim();
  const expanded = searching && matches.length > 0;

  useEffect(() => {
    // Accept parent resets/prefills, without erasing the first character when
    // typing invalidates a previously selected item.
    if (lastValue.current !== value || (value && selectedLabel !== query)) {
      lastValue.current = value;
      setQuery(selectedLabel);
      setOpen(false);
      setActive(0);
    }
  }, [value, selectedLabel]);
  useEffect(() => {
    input.current?.setCustomValidity(required && !value ? `Choose ${label.toLowerCase()} from the search results.` : "");
  }, [value, required, label, query]);
  useEffect(() => {
    if (expanded) activeOption.current?.scrollIntoView?.({ block: "nearest" });
  }, [active, expanded, query]);

  function choose(option) {
    lastValue.current = clearOnSelect ? "" : option.value;
    setQuery(clearOnSelect ? "" : option.label);
    setOpen(false); setActive(0);
    onChange(option.value);
    input.current?.focus();
  }
  function edit(text) {
    setQuery(text); setOpen(true); setActive(0);
    if (value) { lastValue.current = ""; onChange(""); }
  }
  function onKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!query.trim() || selected) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActive(index => !expanded ? (direction === 1 ? 0 : Math.max(0, matches.length - 1)) : Math.max(0, Math.min(matches.length - 1, index + direction)));
      setOpen(true);
    } else if (event.key === "Enter" && expanded && matches[active]) {
      event.preventDefault(); choose(matches[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
    }
  }

  return <div className="search-select" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={id}>{label}</label>
    <div className="search-select-control">
      <Icon name="search" size={17} />
      <input ref={input} id={id} type="text" role="combobox" autoComplete="off"
        value={query} placeholder={placeholder} disabled={disabled} required={required}
        aria-autocomplete="list" aria-expanded={!!expanded} aria-controls={expanded ? `${id}-results` : undefined}
        aria-activedescendant={expanded && matches[active] ? `${id}-option-${active}` : undefined}
        aria-describedby={`${id}-hint`}
        onFocus={event => { setOpen(true); event.target.select(); }}
        onChange={event => edit(event.target.value)} onKeyDown={onKeyDown} />
      {!!query && !disabled && <button type="button" className="icon-button search-select-clear"
        aria-label={`Clear ${label.toLowerCase()}`} onClick={() => {
          lastValue.current = ""; setQuery(""); setOpen(true); setActive(0);
          if (value) onChange(""); input.current?.focus();
        }}><Icon name="close" size={15} /></button>}
    </div>
    {name && <input type="hidden" name={name} value={value} />}
    <span id={`${id}-hint`} className="search-select-hint" role="status">
      {searching ? total ? `${total} match${total === 1 ? "" : "es"}${total > matches.length ? ` · Showing ${matches.length}. Keep typing to narrow results.` : ". Use arrow keys and Enter to select."}` : emptyMessage : selected ? "Selected. Type to replace or clear your choice." : disabled ? "" : "Type a name or code to find a match."}
    </span>
    {expanded && <ul id={`${id}-results`} role="listbox" aria-label={`${label} matches`} className="search-select-results">
      {matches.map((option, index) => <li key={option.value} id={`${id}-option-${index}`}
        ref={index === active ? activeOption : null} role="option" aria-selected={index === active}
        className={index === active ? "active" : ""} onMouseDown={event => event.preventDefault()}
        onMouseEnter={() => setActive(index)} onClick={() => choose(option)}>
        <span>{option.label}</span>{option.description && <small>{option.description}</small>}
      </li>)}
    </ul>}
  </div>;
}
