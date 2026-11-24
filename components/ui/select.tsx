"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

export function Select({
  label,
  labelIcon,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
  labelClassName = "text-small font-bold",
}: {
  label: string;
  labelIcon?: React.ReactNode;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
}) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const listId = `${uid}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options.find((o) => o.value === value) ?? options[0];

  function openList() {
    if (disabled) return;
    setActive(selectedIndex);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList(); else setActive((i) => Math.min(i + 1, last));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList(); else setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        if (open) { event.preventDefault(); setActive(0); }
        break;
      case "End":
        if (open) { event.preventDefault(); setActive(last); }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(active); else openList();
        break;
      case "Escape":
        if (open) { event.preventDefault(); setOpen(false); }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          const start = open ? active + 1 : selectedIndex + 1;
          const key = event.key.toLowerCase();
          const hit = [...options.slice(start), ...options.slice(0, start)].find((o) => o.label.toLowerCase().replace(/^[\d.\s·]+/, "").startsWith(key) || o.label.toLowerCase().startsWith(key));
          if (hit) {
            const index = options.indexOf(hit);
            if (open) setActive(index); else onChange(hit.value);
          }
        }
    }
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`} ref={rootRef}>
      <span id={labelId} className={`flex items-center gap-2 ${labelClassName}`}>{labelIcon}{label}</span>
      <div className="relative">
        <button
          type="button"
          className="select-trigger"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={labelId}
          aria-activedescendant={open ? `${uid}-opt-${active}` : undefined}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKeyDown}
        >
          <span className="truncate">{selected?.label}</span>
          <ChevronDown size={18} aria-hidden="true" className={`flex-none text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? (
          <ul id={listId} ref={listRef} role="listbox" aria-labelledby={labelId} className="select-list">
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value || "__all"}
                  id={`${uid}-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  data-active={index === active}
                  className="select-option"
                  onPointerEnter={() => setActive(index)}
                  onClick={() => choose(index)}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {isSelected ? <Check size={16} aria-hidden="true" className="flex-none text-primary" /> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
