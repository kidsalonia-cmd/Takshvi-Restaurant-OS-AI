"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Location = { id: string; name: string; code: string };
type Brand = { id: string; name: string; location_id: string };
type Order = { id:string; order_number:string; location_id:string; brand_id:string; source:string; status:string; subtotal:number; packaging_amount:number; discount_amount:number; tax_amount:number; grand_total:number; payment_status:string; payment_method:string|null; platform_gross_amount:number|null; platform_commission_amount:number; platform_other_deductions:number; platform_payout_amount:number|null; created_at:string };
type OrderItem = { id:string; order_id:string; item_name:string; sku:string|null; quantity:number; line_total:number };
type Period = "weekly" | "monthly" | "custom";
type SectionKey = "summary" | "orders" | "platforms" | "items" | "payments" | "gst";
type ColumnKey = "order_number" | "date" | "location" | "brand" | "source" | "payment" | "status" | "subtotal" | "discount" | "gst" | "total" | "payout";

const ONLINE = ["zomato","swiggy","ondc","website"];
const SECTION_OPTIONS: { key:SectionKey; label:string }[] = [
  {key:"summary",label:"Summary KPIs"},{key:"orders",label:"Order Register"},{key:"platforms",label:"Online Sales & Payout"},{key:"items",label:"Item Performance"},{key:"payments",label:"Payment Summary"},{key:"gst",label:"GST Summary"},
];
const COLUMN_OPTIONS: { key:ColumnKey; label:string }[] = [
  {key:"order_number",label:"Order No"},{key:"date",label:"Date / Time"},{key:"location",label:"Location"},{key:"brand",label:"Brand"},{key:"source",label:"Source"},{key:"payment",label:"Payment"},{key:"status",label:"Status"},{key:"subtotal",label:"Subtotal"},{key:"discount",label:"Discount"},{key:"gst",label:"GST"},{key:"total",label:"Total"},{key:"payout",label:"Platform Payout"},
];
const DEFAULT_SECTIONS: SectionKey[] = ["summary","orders","platforms","items","payments","gst"];
const DEFAULT_COLUMNS: ColumnKey[] = COLUMN_OPTIONS.map(x=>x.key);

function cfg(){ const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; if(!url||!key) throw new Error("Supabase environment variables are missing."); return {url,key}; }
function headers(key:string){ return {apikey:key,Authorization:`Bearer ${key}`}; }
function money(v:number){ return `₹${Number(v||0).toFixed(2)}`; }
function localDate(){ return new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}); }
function title(v:string){ return v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()); }
function isoBoundary(date:string,end=false){ return new Date(`${date}T${end?"23:59:59.999":"00:00:00"}+05:30`).toISOString(); }
function mondayOf(date:string){ const d=new Date(`${date}T12:00:00+05:30`); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return d.toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}); }
function addDays(date:string,n:number){ const d=new Date(`${date}T12:00:00+05:30`); d.setDate(d.getDate()+n); return d.toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}); }
function monthStart(date:string){ return `${date.slice(0,7)}-01`; }
function monthEnd(date:string){ const d=new Date(`${date.slice(0,7)}-01T12:00:00+05:30`); d.setMonth(d.getMonth()+1); d.setDate(0); return d.toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}); }

export default function ReportsPage(){
  const today=localDate();
  const [period,setPeriod]=useState<Period>("weekly");
  const [anchorDate,setAnchorDate]=useState(today);
  const [customStart,setCustomStart]=useState(today);
  const [customEnd,setCustomEnd]=useState(today);
  const [locations,setLocations]=useState<Location[]>([]);
  const [brands,setBrands]=useState<Brand[]>([]);
  const [locationId,setLocationId]=useState("all");
  const [brandId,setBrandId]=useState("");
  const [orders,setOrders]=useState<Order[]>([]);
  const [items,setItems]=useState<OrderItem[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [isOwner,setIsOwner]=useState(false);
  const [sections,setSections]=useState<SectionKey[]>(DEFAULT_SECTIONS);
  const [columns,setColumns]=useState<ColumnKey[]>(DEFAULT_COLUMNS);

  const range=useMemo(()=>{
    if(period==="weekly"){ const start=mondayOf(anchorDate); return {start,end:addDays(start,6),label:`Week ${start} to ${addDays(start,6)}`}; }
    if(period==="monthly"){ const start=monthStart(anchorDate); const end=monthEnd(anchorDate); return {start,end,label:`Month ${anchorDate.slice(0,7)}`}; }
    return {start:customStart,end:customEnd,label:`${customStart} to ${customEnd}`};
  },[period,anchorDate,customStart,customEnd]);

  useEffect(()=>{
    const saved=localStorage.getItem("takshvi_report_config");
    if(saved){ try{ const parsed=JSON.parse(saved) as {sections?:SectionKey[];columns?:ColumnKey[]}; if(parsed.sections?.length)setSections(parsed.sections); if(parsed.columns?.length)setColumns(parsed.columns); }catch{} }
    void fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(data=>setIsOwner(["super_admin","company_admin"].includes(data?.user?.role))).catch(()=>setIsOwner(false));
    void loadSetup();
  },[]);
  useEffect(()=>{ void loadOrders(); },[range.start,range.end,locationId]);

  async function loadSetup(){ try{ const {url,key}=cfg(); const [lr,br]=await Promise.all([fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`,{headers:headers(key)}),fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`,{headers:headers(key)})]); if(!lr.ok)throw new Error(await lr.text()); if(!br.ok)throw new Error(await br.text()); setLocations(await lr.json()); setBrands(await br.json()); }catch(e){setError(e instanceof Error?e.message:"Unable to load report setup.");} }
  async function loadOrders(){ setLoading(true); setError(""); try{ const {url,key}=cfg(); const lf=locationId==="all"?"":`&location_id=eq.${locationId}`; const r=await fetch(`${url}/rest/v1/orders?select=*&created_at=gte.${encodeURIComponent(isoBoundary(range.start))}&created_at=lte.${encodeURIComponent(isoBoundary(range.end,true))}${lf}&order=created_at.asc`,{headers:headers(key),cache:"no-store"}); if(!r.ok)throw new Error(await r.text()); const rows=await r.json() as Order[]; setOrders(rows); const ids=rows.map(x=>x.id); if(!ids.length){setItems([]);return;} const ir=await fetch(`${url}/rest/v1/order_items?order_id=in.(${ids.join(",")})&select=id,order_id,item_name,sku,quantity,line_total`,{headers:headers(key),cache:"no-store"}); if(!ir.ok)throw new Error(await ir.text()); setItems(await ir.json()); }catch(e){setError(e instanceof Error?e.message:"Unable to load report.");}finally{setLoading(false);} }

  const visibleBrands=brands.filter(b=>locationId==="all"||b.location_id===locationId);
  const filtered=useMemo(()=>orders.filter(o=>!brandId||o.brand_id===brandId),[orders,brandId]);
  const valid=filtered.filter(o=>o.status!=="cancelled");
  const validIds=new Set(valid.map(o=>o.id));
  const filteredItems=items.filter(i=>validIds.has(i.order_id));
  const totals={orders:valid.length,net:valid.reduce((s,o)=>s+Number(o.grand_total||0),0),discount:valid.reduce((s,o)=>s+Number(o.discount_amount||0),0),tax:valid.reduce((s,o)=>s+Number(o.tax_amount||0),0),cancelled:filtered.filter(o=>o.status==="cancelled").length};
  const aov=totals.orders?totals.net/totals.orders:0;
  const onlineOrders=valid.filter(o=>ONLINE.includes(o.source));
  const platformRows=Object.entries(onlineOrders.reduce<Record<string,{orders:number;sales:number;payout:number}>>((acc,o)=>{const sales=Number(o.platform_gross_amount??o.grand_total); const payout=Number(o.platform_payout_amount??Math.max(0,sales-Number(o.platform_commission_amount||0)-Number(o.platform_other_deductions||0))); acc[o.source]??={orders:0,sales:0,payout:0}; acc[o.source].orders++; acc[o.source].sales+=sales; acc[o.source].payout+=payout; return acc;},{}));
  const itemRows=Object.values(filteredItems.reduce<Record<string,{name:string;sku:string;qty:number;revenue:number}>>((acc,i)=>{const k=i.sku||i.item_name; acc[k]??={name:i.item_name,sku:i.sku||"",qty:0,revenue:0}; acc[k].qty+=Number(i.quantity||0); acc[k].revenue+=Number(i.line_total||0); return acc;},{})).sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue);
  const paymentRows=Object.entries(valid.reduce<Record<string,{count:number;value:number}>>((acc,o)=>{const k=o.payment_method||o.payment_status||"unknown"; acc[k]??={count:0,value:0}; acc[k].count++; acc[k].value+=Number(o.grand_total||0); return acc;},{}));
  const gstRows=Object.entries(valid.reduce<Record<string,{taxable:number;tax:number;count:number}>>((acc,o)=>{const base=Number(o.subtotal||0)+Number(o.packaging_amount||0); const rate=base>0?Math.round(Number(o.tax_amount||0)/base*100):0; const k=`${rate}%`; acc[k]??={taxable:0,tax:0,count:0}; acc[k].taxable+=base-Number(o.discount_amount||0); acc[k].tax+=Number(o.tax_amount||0); acc[k].count++; return acc;},{}));

  function toggleSection(k:SectionKey){ setSections(v=>v.includes(k)?v.filter(x=>x!==k):[...v,k]); }
  function toggleColumn(k:ColumnKey){ setColumns(v=>v.includes(k)?v.filter(x=>x!==k):[...v,k]); }
  function saveConfig(){ if(!isOwner)return; localStorage.setItem("takshvi_report_config",JSON.stringify({sections,columns})); alert("Owner report configuration saved on this device."); }
  function orderExportRow(o:Order){ const row:Record<string,string|number>={}; const map:Record<ColumnKey,[string,string|number]>={order_number:["Order No",o.order_number],date:["Date / Time",new Date(o.created_at).toLocaleString("en-IN")],location:["Location",locations.find(x=>x.id===o.location_id)?.name||""],brand:["Brand",brands.find(x=>x.id===o.brand_id)?.name||""],source:["Source",title(o.source)],payment:["Payment",title(o.payment_method||o.payment_status)],status:["Status",title(o.status)],subtotal:["Subtotal",Number(o.subtotal||0)],discount:["Discount",Number(o.discount_amount||0)],gst:["GST",Number(o.tax_amount||0)],total:["Total",Number(o.grand_total||0)],payout:["Platform Payout",ONLINE.includes(o.source)?Number(o.platform_payout_amount||0):0]}; columns.forEach(c=>row[map[c][0]]=map[c][1]); return row; }
  function exportExcel(){ const wb=XLSX.utils.book_new(); if(sections.includes("summary")) XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{Metric:"Period",Value:range.label},{Metric:"Orders",Value:totals.orders},{Metric:"Net Sales",Value:totals.net},{Metric:"AOV",Value:aov},{Metric:"Discount",Value:totals.discount},{Metric:"GST",Value:totals.tax},{Metric:"Cancelled",Value:totals.cancelled}]),"Summary"); if(sections.includes("orders")) XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(filtered.map(orderExportRow)),"Order Register"); if(sections.includes("platforms")) XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(platformRows.map(([p,v])=>({Platform:title(p),Orders:v.orders,Sales:v.sales,Payout:v.payout,"Payout %":v.sales?v.payout/v.sales*100:0}))),"Online Platforms"); if(sections.includes("items")) XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(itemRows.map((x,i)=>({Rank:i+1,Item:x.name,SKU:x.sku,Quantity:x.qty,Revenue:x.revenue}))),"Item Performance"); if(sections.includes("payments")) XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(paymentRows.map(([p,v])=>({Payment:title(p),Orders:v.count,Value:v.value}))),"Payments"); if(sections.includes("gst")) XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(gstRows.map(([r,v])=>({Rate:r,Orders:v.count,Taxable:v.taxable,GST:v.tax}))),"GST"); XLSX.writeFile(wb,`Takshvi_${period}_${range.start}_to_${range.end}.xlsx`); }

  return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="rounded-3xl bg-slate-950 p-7 text-white"><p className="text-sm font-black uppercase tracking-[.18em] text-emerald-400">Finance Reports</p><h1 className="mt-2 text-3xl font-black">Flexible Business Reports</h1><p className="mt-2 text-sm text-slate-300">{range.label}</p></header>

    <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="grid gap-3 lg:grid-cols-5"><select value={period} onChange={e=>setPeriod(e.target.value as Period)} className="h-12 rounded-xl border px-4"><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select>{period!=="custom"?<input type="date" value={anchorDate} onChange={e=>setAnchorDate(e.target.value)} className="h-12 rounded-xl border px-4"/>:<><input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} className="h-12 rounded-xl border px-4"/><input type="date" value={customEnd} min={customStart} onChange={e=>setCustomEnd(e.target.value)} className="h-12 rounded-xl border px-4"/></>}<select value={locationId} onChange={e=>{setLocationId(e.target.value);setBrandId("");}} className="h-12 rounded-xl border px-4"><option value="all">All locations</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select><select value={brandId} onChange={e=>setBrandId(e.target.value)} className="h-12 rounded-xl border px-4"><option value="">All brands</option>{visibleBrands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><button onClick={exportExcel} className="h-12 rounded-xl bg-slate-950 px-4 font-black text-white">Generate Excel</button></div></section>

    {isOwner?<section className="rounded-3xl border-2 border-emerald-300 bg-emerald-50 p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Owner controls</p><h2 className="text-xl font-black">Choose what managers can generate</h2></div><button onClick={saveConfig} className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">Save Report Selection</button></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><div><p className="mb-2 font-black">Report sections</p><div className="grid gap-2 sm:grid-cols-2">{SECTION_OPTIONS.map(o=><label key={o.key} className="flex items-center gap-2 rounded-xl bg-white p-3 font-bold"><input type="checkbox" checked={sections.includes(o.key)} onChange={()=>toggleSection(o.key)}/>{o.label}</label>)}</div></div><div><p className="mb-2 font-black">Order register columns</p><div className="grid gap-2 sm:grid-cols-2">{COLUMN_OPTIONS.map(o=><label key={o.key} className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm font-bold"><input type="checkbox" checked={columns.includes(o.key)} onChange={()=>toggleColumn(o.key)}/>{o.label}</label>)}</div></div></div></section>:null}

    {error?<div className="rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</div>:null}
    {loading?<div className="rounded-xl bg-white p-5 font-bold">Loading report…</div>:<>
      {sections.includes("summary")?<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card title="Net Sales" value={money(totals.net)} note={`${totals.orders} orders`}/><Card title="AOV" value={money(aov)}/><Card title="GST" value={money(totals.tax)}/><Card title="Discount" value={money(totals.discount)}/></section>:null}
      {sections.includes("platforms")?<Report title="Online Sales vs Payout"><table className="w-full text-sm"><thead><tr><th className="p-3 text-left">Platform</th><th>Orders</th><th className="text-right">Sales</th><th className="text-right">Payout</th></tr></thead><tbody>{platformRows.map(([p,v])=><tr key={p} className="border-t"><td className="p-3 font-bold">{title(p)}</td><td className="text-center">{v.orders}</td><td className="text-right">{money(v.sales)}</td><td className="text-right font-black">{money(v.payout)}</td></tr>)}</tbody></table></Report>:null}
      {sections.includes("items")?<Report title="Item Performance"><table className="w-full text-sm"><thead><tr><th className="p-3 text-left">Item</th><th className="text-right">Qty</th><th className="text-right">Revenue</th></tr></thead><tbody>{itemRows.slice(0,50).map(x=><tr key={x.sku||x.name} className="border-t"><td className="p-3 font-bold">{x.name}</td><td className="text-right">{x.qty}</td><td className="text-right">{money(x.revenue)}</td></tr>)}</tbody></table></Report>:null}
      {sections.includes("orders")?<Report title="Order Register"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>{columns.map(c=><th key={c} className="whitespace-nowrap p-3 text-left">{COLUMN_OPTIONS.find(x=>x.key===c)?.label}</th>)}</tr></thead><tbody>{filtered.slice(0,200).map(o=>{const row=orderExportRow(o);return <tr key={o.id} className="border-t">{Object.values(row).map((v,i)=><td key={i} className="whitespace-nowrap p-3">{typeof v==="number"?Number(v).toFixed(2):v}</td>)}</tr>})}</tbody></table></div></Report>:null}
    </>}
  </div></main>;
}
function Card({title,value,note}:{title:string;value:string;note?:string}){return <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{title}</p><p className="mt-2 text-2xl font-black">{value}</p>{note?<p className="mt-1 text-sm text-slate-500">{note}</p>:null}</div>}
function Report({title,children}:{title:string;children:React.ReactNode}){return <section className="overflow-hidden rounded-3xl bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-black">{title}</h2></div><div className="overflow-x-auto">{children}</div></section>}
