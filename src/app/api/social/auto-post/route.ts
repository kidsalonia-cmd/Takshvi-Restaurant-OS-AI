import { NextRequest, NextResponse } from "next/server";
import { publishGooglePost, supabaseHeaders, supabaseUrl, type QueuePost } from "@/lib/cafeSocial";

const focusRotation = ["Coffee", "Cafe Food", "Pasta", "Waffles", "Fresh Juice", "Ice Cream", "Shakes"] as const;

const captions: Record<string, string[]> = {
  Coffee: ["Looking for coffee near Sector 49, Gurugram? Visit Cafe Honeyman at Sapphire Mall, Uppal Southend for freshly brewed coffee and a relaxed cafe break.","Coffee in Sector 49, Gurugram tastes better with a relaxed break. Drop into Cafe Honeyman at Sapphire Mall, near Uppal Southend, for your next cup.","Searching for a cafe near Sapphire Mall? Cafe Honeyman in Sector 49, Gurugram serves fresh coffee for work breaks, catch-ups and easy evenings."],
  "Cafe Food": ["Hungry near Sector 49, Gurugram? Cafe Honeyman at Sapphire Mall, Uppal Southend is your nearby stop for cafe food, coffee, shakes and sweet cravings.","Planning a quick food break near Sapphire Mall? Visit Cafe Honeyman, Sector 49, Gurugram for comforting cafe food and refreshing drinks.","Cafe food near Uppal Southend and Sector 49: stop by Cafe Honeyman at Sapphire Mall for snacks, meals, coffee and desserts."],
  Pasta: ["Pasta cravings near Sector 49, Gurugram? Visit Cafe Honeyman at Sapphire Mall, Uppal Southend for a comforting pasta break with coffee or shakes.","Looking for pasta near Sapphire Mall? Make it a Cafe Honeyman meal in Sector 49, Gurugram and pair your pasta with a chilled drink.","Your next pasta stop in Sector 49 is Cafe Honeyman at Sapphire Mall, near Uppal Southend. Come by for an easy cafe meal."],
  Waffles: ["Waffle cravings in Sector 49, Gurugram? Visit Cafe Honeyman at Sapphire Mall, Uppal Southend for warm waffles and a sweet cafe break.","Looking for waffles near Sapphire Mall? Cafe Honeyman in Sector 49, Gurugram has your dessert and coffee break sorted.","Make your Sector 49 evening sweeter with waffles at Cafe Honeyman, Sapphire Mall, near Uppal Southend."],
  "Fresh Juice": ["Fresh juice near Sector 49, Gurugram? Refresh at Cafe Honeyman, Sapphire Mall, Uppal Southend with a chilled juice and a quick cafe break.","Looking for fresh juice near Sapphire Mall? Visit Cafe Honeyman in Sector 49, Gurugram for a refreshing stop during your day.","Refresh your day around Uppal Southend with fresh juice at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram."],
  "Ice Cream": ["Ice cream cravings near Sector 49, Gurugram? Visit Cafe Honeyman at Sapphire Mall, Uppal Southend for a cool and sweet break.","Looking for ice cream near Sapphire Mall? Cafe Honeyman in Sector 49, Gurugram is ready for your next dessert stop.","Sweet break around Uppal Southend? Cool down with ice cream at Cafe Honeyman, Sapphire Mall, Sector 49."],
  Shakes: ["Craving a shake near Sector 49, Gurugram? Visit Cafe Honeyman at Sapphire Mall, Uppal Southend for thick chilled shakes and cafe favourites.","Shakes near Sapphire Mall: stop at Cafe Honeyman in Sector 49, Gurugram for a chilled refreshment and a relaxed cafe break.","Make your Uppal Southend cafe break cooler with a shake at Cafe Honeyman, Sapphire Mall, Sector 49, Gurugram."],
};

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}
function dayIndex(dateString: string) { const [y,m,d] = dateString.split("-").map(Number); return Math.floor(Date.UTC(y,m-1,d)/86_400_000); }
function slotForHour(hour: number) { const hours=[9,12,15,18,21]; return hours.reduce((best,current)=>Math.abs(current-hour)<Math.abs(best-hour)?current:best,hours[0]); }
async function patchPost(id: string, payload: Record<string, unknown>) { const response=await fetch(supabaseUrl(`cafe_social_post_queue?id=eq.${encodeURIComponent(id)}`),{method:"PATCH",headers:supabaseHeaders(),body:JSON.stringify({...payload,updated_at:new Date().toISOString()})}); if(!response.ok) throw new Error(await response.text()); }

async function run(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const auth = request.headers.get("authorization");
    const isVercelCron = request.headers.get("x-vercel-cron") === "1";
    const hasValidSecret = Boolean(cronSecret && auth === `Bearer ${cronSecret}`);
    // Vercel cron requests are trusted by the platform. If CRON_SECRET is configured,
    // Vercel may also send the Bearer token; accept either form so scheduled jobs cannot be blocked.
    if (cronSecret && !isVercelCron && !hasValidSecret) return NextResponse.json({success:false,message:"Unauthorized."},{status:401});

    const {date,hour}=istParts();
    const forcedSlot=request.nextUrl.searchParams.get("slot");
    const parsedForcedHour=forcedSlot?Number(forcedSlot):NaN;
    const slotHour=[9,12,15,18,21].includes(parsedForcedHour)?parsedForcedHour:slotForHour(hour);
    const index=dayIndex(date); const slotIndex=[9,12,15,18,21].indexOf(slotHour);
    const focus=focusRotation[(index*5+slotIndex)%focusRotation.length];
    const captionList=captions[focus]; const caption=captionList[(index+slotIndex)%captionList.length];
    const uniqueTitle=`AUTO-${date}-${slotHour}`;
    const imageUrl=`${request.nextUrl.origin}/api/social/cafe-image?focus=${encodeURIComponent(focus)}&slot=${slotHour}&date=${date}`;
    const actionUrl=process.env.CAFE_HONEYMAN_CTA_URL||"https://wa.me/919971008363"; const now=new Date().toISOString();

    const existingResponse=await fetch(supabaseUrl(`cafe_social_post_queue?title=eq.${encodeURIComponent(uniqueTitle)}&select=id,business_name,google_caption,instagram_caption,image_url,action_url,publish_google,publish_instagram,scheduled_for,status&limit=1`),{headers:supabaseHeaders(),cache:"no-store"});
    if(!existingResponse.ok) throw new Error(await existingResponse.text()); const existing=await existingResponse.json() as QueuePost[];
    let post: QueuePost;
    if(existing.length){ const current=existing[0]; if(current.status==="published") return NextResponse.json({success:true,skipped:true,reason:"This slot is already published.",post:current,trigger:isVercelCron?"vercel-cron":"manual"}); await patchPost(current.id,{business_name:"Cafe Honeyman",google_caption:caption,image_url:imageUrl,action_url:actionUrl,publish_google:true,publish_instagram:false,scheduled_for:now,status:"scheduled",last_error:null,google_post_id:null,published_at:null}); post={...current,business_name:"Cafe Honeyman",google_caption:caption,image_url:imageUrl,action_url:actionUrl,publish_google:true,publish_instagram:false,scheduled_for:now,status:"scheduled"}; }
    else { const payload={business_name:"Cafe Honeyman",title:uniqueTitle,focus,google_caption:caption,instagram_caption:null,image_url:imageUrl,action_url:actionUrl,publish_google:true,publish_instagram:false,scheduled_for:now,status:"scheduled"}; const insertResponse=await fetch(supabaseUrl("cafe_social_post_queue"),{method:"POST",headers:supabaseHeaders({Prefer:"return=representation"}),body:JSON.stringify(payload)}); if(!insertResponse.ok) throw new Error(await insertResponse.text()); const rows=await insertResponse.json() as QueuePost[]; post=rows[0]; if(!post?.id) throw new Error("Automatic post was not created."); }
    try { const googlePostId=await publishGooglePost(post); await patchPost(post.id,{status:"published",google_post_id:googlePostId,published_at:new Date().toISOString(),last_error:null}); return NextResponse.json({success:true,retried:existing.length>0,slot:slotHour,focus,googlePostId,imageUrl,trigger:isVercelCron?"vercel-cron":"manual"}); }
    catch(error){ const message=error instanceof Error?error.message:"Google publishing failed."; await patchPost(post.id,{status:"failed",last_error:message}); return NextResponse.json({success:false,retried:existing.length>0,slot:slotHour,focus,message,trigger:isVercelCron?"vercel-cron":"manual"},{status:500}); }
  } catch(error){ return NextResponse.json({success:false,message:error instanceof Error?error.message:"Automatic Cafe post failed."},{status:500}); }
}
export async function GET(request:NextRequest){return run(request);} export async function POST(request:NextRequest){return run(request);}
