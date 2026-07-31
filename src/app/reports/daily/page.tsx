"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Location={id:string;name:string;code:string};
type Brand={id:string;name:string;location_id:string};
type Order={id:string;order_number:string;location_id:string;brand_id:string;source:string;status:string;subtotal:number;packaging_amount:number;discount_amount:number;tax_amount:number;grand_total:number;payment_status:string;payment_method:string|null;created_at:string};

function cfg(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)throw new Error("Supabase environment variables are missing.");return{url,key}}
function headers(key:string){return{apikey:key,Authorization:`Bearer ${key}`}}
function money(v:number){return `₹${Number(v||0).toFixed(2)}`}
function localDate(){return new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"})}
function startEnd(date:string){const start=new Date(`${date}T00:00:00+05:30`).toISOString();const end=new Date(`${date}T23:59:59.999+05:30`).toISOString();return{start,end}}

export default function DailyReportsPage(){
 const[locations,setLocations]=useState<Location[]>([]);const[brands,setBrands]=useState<Brand[]>([]);const[orders,setOrders]=useState<Order[]>([]);const[date,setDate]=useState(localDate());const[locationId,setLocationId]=useState("all");const[brandId,setBrandId]=useState("");const[loading,setLoading]=useState(true);const[error,setError]=useState("");
 useEffect(()=>{void loadSetup()},[]);useEffect(()=>{void loadOrders()},[date,locationId]);
 async function loadSetup(){try{const{url,key}=cfg();const[lr,br]=await Promise.all([fetch(`${url}/rest/v1/locations?select=id,name,code&is_active=eq.true&order=name.asc`,{headers:headers(key)}),fetch(`${url}/rest/v1/brands?select=id,name,location_id&is_active=eq.true&order=name.asc`,{headers:headers(key)})]);if(!lr.ok)throw new Error(await lr.text());if(!br.ok)throw new Error(await br.text());setLocations(await lr.json());setBrands(await br.json())}catch(e){setError(e instanceof Error?e.message:"Unable to load report setup.")}}
 async function loadOrders(){setLoading(true);setError("");try{const{url,key}=cfg();const{start,end}=startEnd(date);const locationFilter=locationId==="all"?"":`&location_id=eq.${locationId}`;const r=await fetch(`${url}/rest/v1/orders?select=*&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}${locationFilter}&order=created_at.asc`,{headers:headers(key),cache:"no-store"});if(!r.ok)throw new Error(await r.text());setOrders(await r.json())}catch(e){setError(e instanceof Error?e.message:"Unable to load daily report.")}finally{setLoading(false)}}
 const visibleBrands=brands.filter(b=>locationId==="all"||b.location_id===locationId);
 const filtered=useMemo(()=>orders.filter(o=>!brandId||o.brand_id===brandId),[orders,brandId]);
 const valid=filtered.filter(o=>o.status!=="cancelled");
 const totals={orders:valid.length,gross:valid.reduce((s,o)=>s+Number(o.subtotal)+Number(o.packaging_amount),0),discount:valid.reduce((s,o)=>s+Number(o.discount_amount),0),tax:valid.reduce((s,o)=>s+Number(o.tax_amount),0),net:valid.reduce((s,o)=>s+Number(o.grand_total),0),cancelled:filtered.filter(o=>o.status==="cancelled").length};
 const aov=totals.orders?totals.net/totals.orders:0;
 const paymentRows=Object.entries(valid.reduce<Record<string,{count:number,value:number}>>((a,o)=>{const k=o.payment_method||o.payment_status||"unknown";a[k]??={count:0,value:0};a[k].count++;a[k].value+=Number(o.grand_total);return a},{}));
 const gstRows=Object.entries(valid.reduce<Record<string,{taxable:number,tax:number,total:number,count:number}>>((a,o)=>{const rate=Number(o.tax_amount)>0&&Number(o.subtotal)+Number(o.packaging_amount)>0?Math.round((Number(o.tax_amount)/(Number(o.subtotal)+Number(o.packaging_amount)))*100):0;const k=`${rate}%`;a[k]??={taxable:0,tax:0,total:0,count:0};a[k].taxable+=Number(o.subtotal)+Number(o.packaging_amount)-Number(o.discount_amount);a[k].tax+=Number(o.tax_amount);a[k].total+=Number(o.grand_total);a[k].count++;return a},{}));
 function exportXls(){
  const orderRows=filtered.map(o=>({
   "Order No":o.order_number,
   "Date & Time":new Date(o.created_at).toLocaleString("en-IN"),
   Location:locations.find(l=>l.id===o.location_id)?.name||"",
   Brand:brands.find(b=>b.id===o.brand_id)?.name||"",
   Source:o.source.replaceAll("_"," "),
   Payment:(o.payment_method||o.payment_status).replaceAll("_"," "),
   Status:o.status,
   Taxable:Number((Number(o.subtotal)+Number(o.packaging_amount)-Number(o.discount_amount)).toFixed(2)),
   GST:Number(Number(o.tax_amount).toFixed(2)),
   Total:Number(Number(o.grand_total).toFixed(2)),
  }));
  const summaryRows=[
   {Metric:"Report Date",Value:date},
   {Metric:"Orders",Value:totals.orders},
   {Metric:"Net Sales",Value:Number(totals.net.toFixed(2))},
   {Metric:"Average Order Value",Value:Number(aov.toFixed(2))},
   {Metric:"GST",Value:Number(totals.tax.toFixed(2))},
   {Metric:"Discount",Value:Number(totals.discount.toFixed(2))},
   {Metric:"Cancelled Orders",Value:totals.cancelled},
  ];
  const paymentSheetRows=paymentRows.map(([method,value])=>({Method:method.replaceAll("_"," "),Orders:value.count,Amount:Number(value.value.toFixed(2))}));
  const gstSheetRows=gstRows.map(([rate,value])=>({Rate:rate,Orders:value.count,Taxable:Number(value.taxable.toFixed(2)),GST:Number(value.tax.toFixed(2)),Total:Number(value.total.toFixed(2))}));
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(summaryRows),"Summary");
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(orderRows),"Order Register");
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(paymentSheetRows),"Payments");
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(gstSheetRows),"GST Summary");
  XLSX.writeFile(workbook,`Takshvi_Daily_Report_${date}.xls`,{bookType:"biff8"});
 }
 return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-8"><div className="mx-auto max-w-7xl space-y-6"><header className="rounded-3xl bg-slate-950 p-7 text-white"><p className="text-sm font-black uppercase tracking-[.18em] text-emerald-400">Finance Reports</p><h1 className="mt-2 text-3xl font-black">Daily Sales, Payments & GST</h1></header>
 <section className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-4"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="h-12 rounded-xl border px-4"/><select value={locationId} onChange={e=>{setLocationId(e.target.value);setBrandId("")}} className="h-12 rounded-xl border px-4"><option value="all">All locations</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}</select><select value={brandId} onChange={e=>setBrandId(e.target.value)} className="h-12 rounded-xl border px-4"><option value="">All brands</option>{visibleBrands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><button onClick={exportXls} className="h-12 rounded-xl bg-slate-950 font-black text-white">Download Excel (.xls)</button></section>
 <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Card t="Orders" v={String(totals.orders)}/><Card t="Net Sales" v={money(totals.net)}/><Card t="AOV" v={money(aov)}/><Card t="GST" v={money(totals.tax)}/><Card t="Discount" v={money(totals.discount)}/><Card t="Cancelled" v={String(totals.cancelled)} danger={totals.cancelled>0}/></section>
 <section className="grid gap-5 lg:grid-cols-2"><Report title="Payment Summary"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Method</th><th>Orders</th><th className="text-right">Amount</th></tr></thead><tbody>{paymentRows.map(([k,v])=><tr key={k} className="border-b"><td className="p-3 font-bold capitalize">{k.replaceAll("_"," ")}</td><td className="text-center">{v.count}</td><td className="text-right font-black">{money(v.value)}</td></tr>)}</tbody></table></Report><Report title="GST Summary"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Rate</th><th>Orders</th><th className="text-right">Taxable</th><th className="text-right">GST</th></tr></thead><tbody>{gstRows.map(([k,v])=><tr key={k} className="border-b"><td className="p-3 font-bold">{k}</td><td className="text-center">{v.count}</td><td className="text-right">{money(v.taxable)}</td><td className="text-right font-black">{money(v.tax)}</td></tr>)}</tbody></table></Report></section>
 <Report title="Order Register"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Order</th><th>Time</th><th>Brand</th><th>Source</th><th>Payment</th><th>Status</th><th className="text-right">GST</th><th className="text-right">Total</th></tr></thead><tbody>{filtered.map(o=><tr key={o.id} className="border-b"><td className="p-3 font-bold">{o.order_number}</td><td>{new Date(o.created_at).toLocaleTimeString("en-IN")}</td><td>{brands.find(b=>b.id===o.brand_id)?.name||"—"}</td><td className="capitalize">{o.source.replaceAll("_"," ")}</td><td className="capitalize">{(o.payment_method||o.payment_status).replaceAll("_"," ")}</td><td className={o.status==="cancelled"?"font-bold text-red-600":"capitalize"}>{o.status}</td><td className="text-right">{money(o.tax_amount)}</td><td className="text-right font-black">{money(o.grand_total)}</td></tr>)}</tbody></table></div></Report>{loading?<p className="font-bold text-slate-500">Loading report...</p>:null}{error?<p className="rounded-xl bg-red-50 p-4 font-bold text-red-700">{error}</p>:null}</div></main>}
function Card({t,v,danger=false}:{t:string;v:string;danger?:boolean}){return <div className={`rounded-2xl p-5 shadow-sm ${danger?"bg-red-50":"bg-white"}`}><p className="text-sm font-bold text-slate-500">{t}</p><p className={`mt-2 text-2xl font-black ${danger?"text-red-600":""}`}>{v}</p></div>}
function Report({title,children}:{title:string;children:React.ReactNode}){return <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-xl font-black">{title}</h2>{children}</section>}
