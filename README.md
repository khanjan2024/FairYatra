# 🧭 FairYatra — Fair Fare Checker for North East India

## 🔑 Demo Credentials

> Use these to explore the app without creating an account.

| Role | Name | Email | Password |
|---|---|---|---|
| **Admin** | Admin | admin@fairyatra.app | Admin@1234 |
| **User** | User | user@gmail.com | user1234 |

> **Admin** can access the full Admin Panel at `/admin` — manage reports, approve scam tips, edit the Scam DB, and manage users.
> **User** can submit reports, vote on community posts, and use the fare checker.

---

FairYatra helps travellers in North East India check whether a quoted price is **Fair**, **Suspicious**, or **High Risk** before they pay. It combines benchmark fare data, community reports, and a curated scam database to give real-time, location-aware guidance.

---

## Features

- **Fare Checker** — Enter pickup, destination, and quoted price. Get an instant verdict with a plain-English explanation of why the price is fair or suspicious.
- **Live Location Search** — Powered by OpenStreetMap Nominatim. Type any location name and get real suggestions — airports, temples, markets, hotels.
- **Community Reports** — Users submit fare reports, complaints, reviews, and scam tips. All reports are shared across devices via Supabase.
- **Scam Library** — 28+ curated scam entries across Guwahati, Shillong, Gangtok, Tawang, and Kaziranga. Admin can add, edit, and delete entries live.
- **Map View** — Leaflet/OpenStreetMap map showing scam hotspots and community report clusters.
- **Auth** — Signup/login powered by Supabase Auth. Every user must be authenticated. No guest access.
- **Admin Panel** — Full dashboard for admins: manage reports, review scam tips, manage users (ban/unban, promote to admin), and edit the Scam DB.
- **Scam Tip Approval** — Users submit scam tips → admin reviews and approves them → they appear in the public Scam Library with a "Community" badge.
- **Helpful Votes** — Users can upvote community reports. One vote per user, persisted in Supabase.
- **Multilingual "What to Say"** — Negotiation phrases in English, Hindi, and Assamese (Assamese placeholders ready for translation).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React |
| Map | Leaflet + OpenStreetMap |
| Geocoding | Nominatim (OpenStreetMap public API) |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth |
| Hosting | Vercel (recommended) |

---

## Project Structure

```
src/
├── components/
│   ├── PlaceAutocomplete.tsx   # Live geocoding search (Nominatim + static)
│   ├── ResultCard.tsx          # Fare check result with verdict, bar, reasons
│   └── Skeleton.tsx            # Loading shimmer components
├── data/
│   ├── benchmarks.json         # Base fares, per-km rates, surcharge rules
│   ├── phrases.json            # "What to say" templates (en/hi/as)
│   └── places.json             # Key pickup points with lat/lng
├── lib/
│   ├── auth.ts                 # Supabase Auth wrapper
│   ├── AuthContext.tsx         # React context + session management
│   ├── cache.ts                # In-memory stale-while-revalidate cache
│   ├── fare.ts                 # Pure fare logic (haversine, surcharges, verdict)
│   ├── RequireAuth.tsx         # Route guard — redirects to /auth if not logged in
│   ├── storage.ts              # All Supabase DB operations
│   └── supabase.ts             # Supabase client singleton
├── screens/
│   ├── AdminPanel.tsx          # Admin dashboard (5 tabs)
│   ├── AuthScreen.tsx          # Sign in / Sign up
│   ├── CheckFare.tsx           # Main fare checker
│   ├── CommunityFeed.tsx       # Live report feed
│   ├── MapScreen.tsx           # Leaflet map with scam pins
│   ├── ReportPrice.tsx         # Submit fare/complaint/review/scam tip
│   └── ScamLibrary.tsx         # Searchable scam database
└── types/
    └── index.ts                # All TypeScript types
```

---

## Local Development

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/your-username/fairyatra.git
cd fairyatra
npm install
```

### 2. Set up Supabase

#### Create tables

Go to your Supabase project → **SQL Editor** → **New query**, paste and run `supabase_schema.sql` from the project root.

#### Seed the scam database

In the SQL Editor, run `seed_scams.sql` from the project root. This inserts all 28 seed scam entries.

#### Add the source column

```sql
alter table public.community_scams
add column if not exists source text not null default 'community';
```

#### Add the helpful increment function

```sql
create or replace function increment_helpful(report_id text)
returns void language plpgsql security definer as $$
begin
  update public.reports set helpful = helpful + 1 where id = report_id;
end;
$$;
```

### 3. Configure environment

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Both values are in your Supabase project → **Settings → API**.

### 4. Run

```bash
npm run dev
```

Open **http://localhost:5173**.

### 5. Create the admin account

1. Sign up at `http://localhost:5173` with `admin@fairyatra.app`
2. In Supabase SQL Editor, run:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@fairyatra.app');
```

3. Sign out and sign back in — the Admin badge appears in the header.

---

## Running Tests

```bash
npm test
```

34 unit tests covering: haversine distance, surcharge stacking, benchmark range calculation, community report blending, scam proximity matching, phrase template rendering, and full fare check integration.

---

## Deployment on Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Import on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repository
3. Vercel auto-detects Vite — no configuration needed

### 3. Add environment variables

In Vercel project settings → **Environment Variables**, add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://your-project-ref.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your anon public key |

### 4. Deploy

Click **Deploy**. Vercel builds and deploys automatically. Every `git push` to `main` triggers a new deployment.

### 5. Configure Supabase redirect URLs

In Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: Add `https://your-app.vercel.app/**`

---

## Deployment on Netlify (alternative)

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

Add the same environment variables in Netlify → **Site settings → Environment variables**.

Create a `public/_redirects` file so client-side routing works:

```
/* /index.html 200
```

---

## Supabase Schema Overview

| Table | Purpose |
|---|---|
| `profiles` | Extends `auth.users` with `name`, `role`, `banned` |
| `reports` | All community reports (fare, complaint, review, scam tip) |
| `helpful_votes` | One row per user per report — prevents double voting |
| `community_scams` | All scam entries (seed + admin-added + community-approved) |

Row-Level Security is enabled on all tables:
- Authenticated users can read everything
- Users can only insert their own reports
- Only admins can delete reports, update scam entries, manage users

---

## Fare Logic

The fare engine (`src/lib/fare.ts`) is pure TypeScript with no side effects:

1. **Distance** — Haversine × 1.3 road factor, or from real coordinates when both pickup and destination are geocoded
2. **Benchmark range** — Base fare + per-km rate ± 10–15% margin. Uses known fixed fares for typical routes when matched.
3. **Surcharges** — Night (+25%), hill road (+20%), airport (flat fee), luggage (flat + per-bag)
4. **Community blend** — Median of paid fares from community reports, weighted 0→50% as report count grows 0→10
5. **Verdict** — Ratio of quoted ÷ fair ceiling: ≤1.1 = Fair, ≤1.6 = Suspicious, >1.6 = High Risk. Escalates one step if matching scam entries exist at the location.

---

## Cities Covered

| City | State | Services |
|---|---|---|
| Guwahati | Assam | Taxi, Auto, Shared Cab, Guide, Restaurant |
| Shillong | Meghalaya | Taxi, Auto, Shared Cab, Guide, Restaurant |
| Gangtok | Sikkim | Taxi, Shared Cab, Guide, Restaurant |
| Tawang | Arunachal Pradesh | Taxi, Shared Cab, Guide, Restaurant |
| Kaziranga | Assam | Taxi, Shared Cab, Guide, Restaurant |

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anon public key (safe to expose) |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and run tests: `npm test`
4. Commit: `git commit -m "Add your feature"`
5. Push and open a Pull Request

### Adding a new city

1. Add benchmark data to `src/data/benchmarks.json`
2. Add key places to `src/data/places.json`
3. Add scam entries to `seed_scams.sql` and run in Supabase
4. Add city centre coordinates to the `CITY_CENTRES` array in `CheckFare.tsx` and `ReportPrice.tsx`

---

## License

MIT © 2026 FairYatra
