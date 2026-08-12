"use client";

import { useEffect, useState } from "react";

type Customer = {
  name: string;
  phone: string;
  visits: number;
  lifetimeSales: number;
  totalDiscount: number;
  lastVisit: string;
};

type Anchor = { top: number; left: number; width: number } | null;

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function PosCustomerMemory() {
  const [results, setResults] = useState<Customer[]>([]);
  const [anchor, setAnchor] = useState<Anchor>(null);
  const [activeInput, setActiveInput] = useState<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    let requestId = 0;

    const updateAnchor = (input: HTMLInputElement | null) => {
      if (!input) return setAnchor(null);
      const rect = input.getBoundingClientRect();
      setAnchor({ top: rect.bottom + 6, left: Math.max(8, rect.left), width: Math.max(280, rect.width) });
    };

    const handleInput = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (!(input instanceof HTMLInputElement)) return;
      const isName = input.placeholder === "Customer name";
      const isPhone = input.placeholder === "Customer WhatsApp number";
      if (!isName && !isPhone) return;

      setActiveInput(input);
      updateAnchor(input);
      const value = input.value.trim();
      const comparable = isPhone ? value.replace(/\D/g, "") : value;
      window.clearTimeout(timer);
      if (comparable.length < 4) {
        setResults([]);
        setLoading(false);
        return;
      }

      const currentRequest = ++requestId;
      timer = window.setTimeout(async () => {
        setLoading(true);
        try {
          const response = await fetch(`/api/customers/search?q=${encodeURIComponent(value)}`, { cache: "no-store" });
          const data = await response.json() as { customers?: Customer[] };
          if (currentRequest === requestId) setResults(data.customers || []);
        } catch {
          if (currentRequest === requestId) setResults([]);
        } finally {
          if (currentRequest === requestId) setLoading(false);
        }
      }, 220);
    };

    const handleFocus = (event: FocusEvent) => {
      const input = event.target as HTMLInputElement;
      if (input?.placeholder === "Customer name" || input?.placeholder === "Customer WhatsApp number") {
        setActiveInput(input);
        updateAnchor(input);
      }
    };

    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      const input = activeInput;
      if (input && target !== input && !(target instanceof Element && target.closest("[data-customer-suggestions]"))) {
        setResults([]);
      }
    };

    const relabelDiscount = () => {
      const input = document.querySelector<HTMLInputElement>('input[placeholder="Discount ₹"]');
      if (!input || input.dataset.discountLabelled === "1") return;
      input.dataset.discountLabelled = "1";
      input.setAttribute("aria-label", "Discount amount in rupees");
      const label = document.createElement("div");
      label.textContent = "Discount ₹";
      label.className = "mb-1 text-xs font-black uppercase tracking-wide text-slate-500";
      label.dataset.posDiscountLabel = "1";
      input.parentElement?.insertBefore(label, input);
    };

    const handleViewport = () => updateAnchor(activeInput);
    relabelDiscount();
    const observer = new MutationObserver(relabelDiscount);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", handleInput, true);
    document.addEventListener("focusin", handleFocus, true);
    document.addEventListener("mousedown", handlePointer, true);
    window.addEventListener("scroll", handleViewport, true);
    window.addEventListener("resize", handleViewport);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("focusin", handleFocus, true);
      document.removeEventListener("mousedown", handlePointer, true);
      window.removeEventListener("scroll", handleViewport, true);
      window.removeEventListener("resize", handleViewport);
    };
  }, [activeInput]);

  function choose(customer: Customer) {
    const nameInput = document.querySelector<HTMLInputElement>('input[placeholder="Customer name"]');
    const phoneInput = document.querySelector<HTMLInputElement>('input[placeholder="Customer WhatsApp number"]');
    if (nameInput) setReactInputValue(nameInput, customer.name || "");
    if (phoneInput) setReactInputValue(phoneInput, customer.phone || "");
    setResults([]);
    setAnchor(null);
  }

  return (
    <>
      <div className="pos-customer-tools fixed bottom-5 right-4 z-[75] hidden flex-col items-end gap-2 lg:flex">
        <a
          href="/api/customers/export"
          className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-xl hover:bg-blue-700"
        >
          Download Customers Excel
        </a>
        <span className="rounded-lg bg-white/95 px-3 py-2 text-[11px] font-bold text-slate-600 shadow">
          Customer lookup starts after 4 letters or 4 phone digits
        </span>
      </div>

      {anchor && (loading || results.length > 0) ? (
        <div
          data-customer-suggestions
          className="fixed z-[150] max-h-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl"
          style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
        >
          {loading ? <p className="p-3 text-sm font-bold text-slate-500">Searching customers…</p> : null}
          {!loading && results.map((customer) => (
            <button
              type="button"
              key={`${customer.phone}-${customer.name}`}
              onClick={() => choose(customer)}
              className="block w-full rounded-xl px-3 py-3 text-left hover:bg-emerald-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{customer.name || "Unnamed customer"}</p>
                  <p className="mt-1 text-sm font-bold text-slate-600">{customer.phone}</p>
                </div>
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black">{customer.visits} visits</span>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Sales ₹{customer.lifetimeSales.toFixed(2)} · Discounts ₹{customer.totalDiscount.toFixed(2)}
              </p>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
