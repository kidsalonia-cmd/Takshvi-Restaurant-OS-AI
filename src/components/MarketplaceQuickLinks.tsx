"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MarketplaceQuickLinks(){
 const pathname=usePathname();
 if(pathname.startsWith("/integrations/marketplaces"))return null;
 return <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 sm:flex-row">
  <Link href="/integrations/marketplaces" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-2xl ring-1 ring-white/10 hover:bg-emerald-500 hover:text-slate-950">Zomato + Swiggy</Link>
  <Link href="/orders" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-2xl ring-1 ring-slate-200 hover:bg-emerald-50">Live Orders</Link>
 </div>
}
