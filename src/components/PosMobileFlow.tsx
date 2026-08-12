"use client";

import { useEffect, useState } from "react";

export default function PosMobileFlow() {
  const [billingOpen, setBillingOpen] = useState(false);
  const [cartText, setCartText] = useState("No items added");
  const [totalText, setTotalText] = useState("₹0.00");
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    const sync = () => {
      const aside = document.querySelector<HTMLElement>(".pos-mobile-shell main aside");
      if (!aside) return;
      const lines = Array.from(aside.querySelectorAll<HTMLElement>("[data-pos-cart-line]"));
      const count = lines.reduce((sum, line) => sum + Number(line.dataset.qty || 0), 0);
      const names = lines.slice(0, 3).map((line) => {
        const name = line.dataset.name || "Item";
        const qty = line.dataset.qty || "1";
        return `${name} × ${qty}`;
      });
      setItemCount(count);
      setCartText(names.length ? `${names.join(" · ")}${lines.length > 3 ? ` · +${lines.length - 3} more` : ""}` : "No items added");
      const total = aside.querySelector<HTMLElement>("[data-pos-total]")?.textContent?.trim();
      setTotalText(total || "₹0.00");
      aside.dataset.mobileBillingOpen = billingOpen ? "1" : "0";
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    return () => observer.disconnect();
  }, [billingOpen]);

  useEffect(() => {
    const aside = document.querySelector<HTMLElement>(".pos-mobile-shell main aside");
    if (aside) aside.dataset.mobileBillingOpen = billingOpen ? "1" : "0";
  }, [billingOpen]);

  if (billingOpen) {
    return (
      <button
        type="button"
        onClick={() => setBillingOpen(false)}
        className="fixed left-3 top-3 z-[115] hidden rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 shadow-xl max-md:block"
      >
        ← Add / edit items
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-[4.45rem] z-[60] hidden border-t border-slate-200 bg-white/98 px-3 pb-3 pt-2 shadow-[0_-12px_32px_rgba(15,23,42,0.16)] backdrop-blur max-md:block">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Current bill · {itemCount} item{itemCount === 1 ? "" : "s"}</p>
            <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{cartText}</p>
          </div>
          <p className="shrink-0 text-xl font-black text-emerald-700">{totalText}</p>
        </div>
        <button
          type="button"
          disabled={itemCount === 0}
          onClick={() => { setBillingOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="mt-2 h-12 w-full rounded-xl bg-slate-950 text-base font-black text-white disabled:opacity-40"
        >
          Proceed to Billing
        </button>
      </div>
    </div>
  );
}
