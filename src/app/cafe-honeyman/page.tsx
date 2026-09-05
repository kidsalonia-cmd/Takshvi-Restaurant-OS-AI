import type { Metadata } from "next";
import { supabaseHeaders, supabaseUrl } from "@/lib/cafeSocial";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Cafe Honeyman Sector 49 Gurugram | Coffee, Pasta, Waffles & Fresh Juice",
  description: "Visit Cafe Honeyman at Sapphire Mall, Sector 49, Gurugram near Uppal Southend for coffee, cafe food, pasta, waffles, fresh juice, shakes and ice cream.",
  alternates: { canonical: "/cafe-honeyman" },
  keywords: [
    "Cafe Honeyman",
    "cafe in Sector 49 Gurugram",
    "coffee near Sapphire Mall",
    "cafe near Uppal Southend",
    "pasta Sector 49 Gurugram",
    "waffles Sector 49 Gurugram",
    "fresh juice Sector 49",
    "ice cream Sapphire Mall",
  ],
  openGraph: {
    title: "Cafe Honeyman | Sapphire Mall, Sector 49 Gurugram",
    description: "Coffee, cafe food, pasta, waffles, fresh juice, shakes and ice cream near Uppal Southend.",
    type: "website",
  },
};

type SeoPost = {
  id: string;
  focus?: string | null;
  google_caption: string;
  image_url?: string | null;
  published_at?: string | null;
};

async function getRecentPosts(): Promise<SeoPost[]> {
  try {
    const res = await fetch(
      supabaseUrl("cafe_social_post_queue?business_name=eq.Cafe%20Honeyman&status=eq.published&select=id,focus,google_caption,image_url,published_at&order=published_at.desc&limit=12"),
      { headers: supabaseHeaders(), next: { revalidate: 900 } },
    );
    if (!res.ok) return [];
    return (await res.json()) as SeoPost[];
  } catch {
    return [];
  }
}

const categories = [
  ["Coffee", "Fresh coffee and relaxed cafe breaks in Sector 49, Gurugram."],
  ["Cafe Food", "Comforting cafe food for quick meals, catch-ups and work breaks."],
  ["Pasta", "Pasta cravings sorted near Sapphire Mall and Uppal Southend."],
  ["Waffles", "Warm waffles for sweet cravings and evening cafe stops."],
  ["Fresh Juice", "Fresh juice and chilled refreshments throughout the day."],
  ["Ice Cream", "Cool dessert breaks near Sector 49 and Sapphire Mall."],
  ["Shakes", "Thick chilled shakes to pair with your cafe favourites."],
] as const;

export default async function CafeHoneymanPage() {
  const posts = await getRecentPosts();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: "Cafe Honeyman",
    description: "Cafe in Sapphire Mall, Sector 49, Gurugram serving coffee, cafe food, pasta, waffles, fresh juice, shakes and ice cream.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Sapphire Mall, 37B, Internal Walkway, Orchid Petals, Block S, Uppal Southend, Sector 49",
      addressLocality: "Gurugram",
      addressRegion: "Haryana",
      postalCode: "122018",
      addressCountry: "IN",
    },
    servesCuisine: ["Cafe", "Coffee", "Pasta", "Waffles", "Desserts", "Fresh Juice", "Shakes"],
    areaServed: ["Sector 49 Gurugram", "Uppal Southend", "Sapphire Mall", "Orchid Petals"],
  };

  return (
    <main className="min-h-screen bg-amber-50 text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="bg-slate-950 px-5 py-16 text-white md:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-black uppercase tracking-[.2em] text-amber-300">Cafe Honeyman · Sector 49 Gurugram</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight md:text-6xl">Coffee, food, pasta, waffles, fresh juice & desserts near Sapphire Mall</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">Visit Cafe Honeyman at Sapphire Mall, Sector 49, near Uppal Southend for coffee breaks, casual meals, sweet cravings and refreshing drinks.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="https://wa.me/919971008363" className="rounded-xl bg-emerald-400 px-5 py-3 font-black text-slate-950">WhatsApp Cafe Honeyman</a>
            <a href="#latest" className="rounded-xl bg-white/10 px-5 py-3 font-black">See latest cafe updates</a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 md:px-10">
        <h2 className="text-3xl font-black">What to enjoy at Cafe Honeyman</h2>
        <p className="mt-3 max-w-3xl text-slate-600">Local cafe favourites for guests around Sector 49, Uppal Southend, Orchid Petals and Sapphire Mall.</p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map(([title, text]) => (
            <article key={title} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-amber-100">
              <h3 className="text-xl font-black">{title}</h3>
              <p className="mt-2 leading-7 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="latest" className="bg-white px-5 py-12 md:px-10">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-black">Latest Cafe Honeyman updates</h2>
          <p className="mt-3 max-w-3xl text-slate-600">The same current offers and food highlights published to Google Business are also surfaced here for customers and search engines.</p>
          {posts.length ? (
            <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <article key={post.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                  {post.image_url ? <img src={post.image_url} alt={`${post.focus || "Cafe Honeyman"} at Cafe Honeyman Sector 49 Gurugram`} className="aspect-[4/3] w-full object-cover" /> : null}
                  <div className="p-5">
                    <p className="text-xs font-black uppercase tracking-[.14em] text-emerald-700">{post.focus || "Cafe Honeyman"}</p>
                    <p className="mt-3 leading-7 text-slate-700">{post.google_caption}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-6 rounded-2xl bg-amber-50 p-5 font-semibold text-amber-900">Fresh Cafe Honeyman updates will appear here automatically as campaigns publish.</p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 md:px-10">
        <h2 className="text-3xl font-black">Cafe near Sector 49, Uppal Southend & Sapphire Mall</h2>
        <p className="mt-4 max-w-4xl leading-8 text-slate-700">Cafe Honeyman is located at Sapphire Mall, 37B Internal Walkway, Orchid Petals, Block S, Uppal Southend, Sector 49, Gurugram, Haryana 122018. The location is convenient for nearby residents, shoppers, office visitors and anyone looking for coffee, cafe food, pasta, waffles, fresh juice, shakes or ice cream in the Sector 49 area.</p>
      </section>
    </main>
  );
}
