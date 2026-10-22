"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";

export interface CatalogVariant {
  id: number;
  sku: string;
  barcode?: string | null;
  name: string;
  category_name: string;
  uom_base: string;
  unit_cost_usd: number;
  unit_cost_ves: number;
  sales_price_usd: number;
  sales_price_ves: number;
}

export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export interface VariantComboboxProps {
  value: number;
  variants: CatalogVariant[];
  onChange: (variantId: number, variant?: CatalogVariant) => void;
  onSearchCatalog: (query: string) => Promise<void>;
  placeholder?: string;
  compact?: boolean;
}

export function VariantCombobox({
  value,
  variants,
  onChange,
  onSearchCatalog,
  placeholder = "Seleccionar producto...",
  compact = false,
}: VariantComboboxProps) {
  const listboxId = React.useId();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === value),
    [variants, value]
  );

  const filteredVariants = useMemo(() => {
    const tokens = normalizeSearchText(query)
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return variants;
    return variants.filter((v) => {
      const haystack = normalizeSearchText(
        `${v.sku} ${v.name} ${v.category_name || ""} ${v.barcode || ""}`
      );
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [variants, query]);

  const safeHighlightedIndex =
    filteredVariants.length > 0
      ? Math.min(highlightedIndex, filteredVariants.length - 1)
      : 0;

  function scrollOptionIntoView(index: number) {
    if (!listRef.current) return;
    const item = listRef.current.children[index] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }

  const openDropdown = React.useCallback(() => {
    setQuery("");
    const idx = variants.findIndex((v) => v.id === value);
    const initialIdx = idx >= 0 ? idx : 0;
    setHighlightedIndex(initialIdx);
    setIsOpen(true);
    requestAnimationFrame(() => {
      scrollOptionIntoView(initialIdx);
    });
  }, [variants, value]);

  const closeDropdown = React.useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setLoading(false);
  }, []);

  // Cerrar al hacer clic afuera
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, closeDropdown]);

  // Enfocar el buscador interno cuando se despliega el combobox
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Búsqueda en vivo contra el catálogo maestro con debounce cuando el usuario escribe
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setLoading(false);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      if (!active) return;
      setLoading(true);
      try {
        await onSearchCatalog(trimmed);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, isOpen, onSearchCatalog]);

  function handleSelect(v: CatalogVariant) {
    onChange(v.id, v);
    closeDropdown();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const base = Math.min(prev, Math.max(0, filteredVariants.length - 1));
        const next = filteredVariants.length > 0 ? (base + 1) % filteredVariants.length : 0;
        scrollOptionIntoView(next);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const base = Math.min(prev, Math.max(0, filteredVariants.length - 1));
        const next =
          filteredVariants.length > 0
            ? (base - 1 + filteredVariants.length) % filteredVariants.length
            : 0;
        scrollOptionIntoView(next);
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredVariants[safeHighlightedIndex];
      if (target) {
        handleSelect(target);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
    }
  }

  const activeOptionId =
    isOpen && filteredVariants.length > 0
      ? `${listboxId}-opt-${safeHighlightedIndex}`
      : undefined;

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={handleKeyDown}>
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-haspopup="listbox"
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        className={`w-full text-left flex items-center justify-between gap-2 bg-white border transition-all cursor-pointer ${
          isOpen
            ? "border-orange-500 ring-2 ring-orange-500/20"
            : "border-slate-300 hover:border-slate-400"
        } ${
          compact
            ? "px-2.5 py-1.5 rounded-lg text-xs"
            : "px-3.5 py-2.5 rounded-xl text-sm font-medium"
        }`}
      >
        <span className="truncate text-slate-800">
          {selectedVariant ? (
            <>
              <span className="font-mono font-bold text-orange-700">[{selectedVariant.sku}]</span>{" "}
              <span>{selectedVariant.name}</span>{" "}
              <span className="text-slate-500">({selectedVariant.uom_base})</span>
              <span className="text-slate-400">
                {" "}
                — Costo: ${selectedVariant.unit_cost_usd.toFixed(2)} | PVP: $
                {selectedVariant.sales_price_usd.toFixed(2)}
              </span>
            </>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <i
          className={`pi pi-chevron-down text-xs text-slate-400 transition-transform shrink-0 ${
            isOpen ? "rotate-180 text-orange-600" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 z-50 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden max-w-[calc(100vw-2rem)] ${
            compact ? "w-full min-w-[300px] sm:min-w-[420px]" : "w-full"
          }`}
        >
          {/* Buscador integrado dentro del menú desplegable */}
          <div className="p-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <i className="pi pi-search text-xs text-slate-400 ml-1.5 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              aria-label="Filtrar variantes por SKU, nombre o categoría"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              placeholder="Buscar por SKU, nombre o categoría..."
              className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-orange-500"
            />
            {loading && (
              <i className="pi pi-spin pi-spinner text-xs text-orange-500 mr-1 shrink-0" />
            )}
            {query && !loading && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setHighlightedIndex(0);
                  searchInputRef.current?.focus();
                }}
                className="text-slate-400 hover:text-slate-600 px-1 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <i className="pi pi-times text-xs" />
              </button>
            )}
          </div>

          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            className="max-h-64 overflow-y-auto divide-y divide-slate-100"
          >
            {filteredVariants.length === 0 ? (
              <li className="px-3.5 py-4 text-center text-xs text-slate-400">
                {loading
                  ? "Buscando productos en el catálogo maestro..."
                  : `No se encontraron productos para "${query}"`}
              </li>
            ) : (
              filteredVariants.map((v, i) => {
                const isSelected = v.id === value;
                const isHighlighted = i === safeHighlightedIndex;
                return (
                  <li
                    id={`${listboxId}-opt-${i}`}
                    key={v.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(v);
                    }}
                    className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                      isHighlighted
                        ? "bg-orange-50 text-slate-900"
                        : isSelected
                        ? "bg-orange-50/50 text-slate-900 font-semibold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="truncate">
                      <span className="font-mono font-bold text-orange-700">[{v.sku}]</span>{" "}
                      <span className="font-medium text-slate-800">{v.name}</span>{" "}
                      <span className="text-[11px] font-mono text-slate-500">({v.uom_base})</span>
                      <span className="text-[11px] text-slate-500">
                        {" "}
                        — Costo: <strong className="font-mono">${v.unit_cost_usd.toFixed(2)}</strong>{" "}
                        | PVP: <strong className="font-mono">${v.sales_price_usd.toFixed(2)}</strong>
                      </span>
                    </div>
                    {isSelected && (
                      <i className="pi pi-check text-xs text-orange-600 shrink-0" />
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
