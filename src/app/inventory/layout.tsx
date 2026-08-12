import Link from "next/link";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <Link
        href="/inventory/transfers"
        className="fixed bottom-24 right-4 z-[70] rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 shadow-xl transition hover:bg-emerald-400 lg:bottom-6 lg:right-6"
      >
        ⇄ Stock Transfer
      </Link>
    </div>
  );
}
