# Scout — client demo runbook

A practical script for showing Scout to Property Buy or Rent. Everything runs locally; demo mode never contacts an external website.

---

## Before the demo (2 minutes)

```bash
cd "search agent"
npm start
```

- Open **http://127.0.0.1:4321**.
- Confirm the sidebar says **Simulation** and the footer says **Simulated market data**.
- Reset the workspace from the sidebar: **Reset demo data → Reset demo data**.
- Use a desktop viewport (1440×900 or larger is ideal). Scout is fully responsive, but the offer ledger is richer on desktop.
- Optional: open a second browser tab at `#/portfolio` so you can switch to it without a load.

Expected baseline after a reset: 20 homes, 14 sources, no runs, last scan “No scans yet”.

> **Check the room:** demo mode is offline and deterministic. Live mode would require a Tavily key and permitted sources. Do not imply the demo is querying idealista or OLX — it is not.

---

## The 6-minute flow

### 0:00 — The opening

> “This is Scout. It is not a chatbot with a property prompt. It is a small agent pipeline with a catalogue, persisted state and an audit trail. You give it a client brief; it returns a price position you can defend.”

Point at the hero and the map panel:

- the map is the Algarve coverage;
- the catalogue count;
- “what lands on your desk” below the brief;
- the loop card on the right.

Keep this short. The product should demonstrate itself.

### 1:00 — Run the signature brief

The default brief is the Algarve long-let search:

> “Long-term rental for a retired couple: 2–3 bedroom apartment or townhouse with sea view and pool access, around Lagos or Portimão, budget up to €2,200/month.”

Press **Run Scout** (or ⌘/Ctrl + Enter).

Narrate only what is on screen:

- **Interpret brief** — transaction, bedrooms, locations, budget and features are parsed, with assumptions shown.
- **Plan sources** — Scout chooses relevant sources and adds at least one new source domain to the catalogue.
- **Search market** — each source is queried separately; one failure cannot take down the run.
- **Normalise & filter** — duplicate listings are collapsed; non-EUR prices are converted; off-brief results are counted and rejected.
- **Match portfolio** — mirrors first, then comparable homes by city, type, bedrooms, area and features.
- **Benchmark prices** — median, quartiles and positioning.
- **Write report** — persisted, exportable and reopenable.

The run takes around **4–5 seconds** at demo pacing. The page scrolls to the report when it lands.

### 2:00 — Read the headline, not the table

At the top of the report:

> “Four of four portfolio listings were benchmarked. The median position is around −4% — the portfolio is broadly inside the market corridor, but that hides two very different stories.”

Then the KPI row:

- **46 unique offers** — 52 found, 1 duplicate collapsed (numbers vary slightly with each run).
- **Median price position** — within the ±7% corridor.
- **4 / 4 listings benchmarked**.
- **3 portal mirrors** — two of them undercut the portal ask.
- **Annualised gap** — the money at stake if the flagged gaps were closed.

### 2:45 — Findings

Walk the first two or three:

1. **PBR-1042 sits ~14% above its comparable median.**  
   “The Lagos two-bed is the outlier. Eleven comparables put the median around €1,450 against our €1,650.”
2. **PBR-1042 is mirrored below the portal price.**  
   “Idealista shows the same home at €1,525, 8.2% under our ask. That is a client-facing inconsistency, not just a market signal.”
3. **PBR-1088 mirror undercut** — another, smaller inconsistency in Portimão.
4. **PBR-1067 has pricing headroom** — the townhouse is below its market median; repricing is an opportunity, not a cut.

Use the **Market pulse** card on the right to show the split: below / at / above market. Click any finding to open the underlying listing.

### 3:30 — Evidence and positioning

Scroll to **Your positioning**. Point out:

- your ask (orange marker) against the p25–p75 market band;
- the median tick;
- the verdict badge and number of comparables;
- that every listing has a source trail.

Click **PBR-1042**. In the drawer:

- the market median and suggested ask;
- the distribution chart with your ask marked;
- portal mirrors;
- the comparables used.

Then scroll to the **Offer ledger** and click the first **Mirror** row:

> “This is the extracted evidence. Title, source, price normalised to EUR, confidence, the snippet Scout parsed. It believes this is our own listing at a lower price.”

Point out the **+1 duplicate** note if present and the **Market only** filter.

### 4:15 — Iterate, don’t restart

Close the drawer. Click **Refine brief**:

- the brief is restored to the composer;
- the thread is retained; the next run is **Iteration 2**.

Adjust the brief: “Drop the budget to €2,100 and keep the same search.” Run again.

> “Same client thread, new iteration. Every report is stored, so the team can see what changed and why. This mirrors the three or four iterations your property finders already run.”

### 5:00 — The source catalogue and audit trail

Go to **Sources**:

- point out the source Scout discovered during the run (**Scout find** badge, used count 0 until the next scan);
- toggle a source off and on; explain the reliability weighting in deduplication;
- **Add source** shows the admin path for a new agency or licensed feed.

Go to **Run history**:

- each run has status, duration, iteration, offer count and runtime;
- open one to replay the report;
- mention export: **CSV** for Excel, **JSON** for the platform team, **Print** for a client-ready PDF.

### 5:40 — Close on method and limits

Open **Method & limits** (footer or report footnote). Say:

> “The agent is deliberately honest about its limits. It compares asking prices, it does not verify availability. Mirror detection and comparables are documented models, not magic. The live portal adapter respects robots and has an SSRF guard. Production adds auth, roles and licensed feeds.”

Then reset the demo before the next audience.

---

## Q&A cheat sheet

### “Is this connecting to idealista and the other portals?”

**Demo:** No. Every listing, agency and URL in simulation mode is fictional. The source catalogue uses familiar portal names so the workflow is legible.

**Live:** Tavily discovers and queries public pages on registered domains, then extracts JSON-LD/OpenGraph/visible text. It respects robots.txt and does not bypass logins. You must still comply with each portal’s terms and use licensed APIs/feeds where required.

### “Do we throw away Zoho or WordPress?”

No. Scout is a price-intelligence service, not a CRM replacement. Zoho remains the system of record for clients, partners and workflow. The site can stay on WordPress. Scout’s API is deliberately separate so it can read a brief and write back only a signed-off shortlist or benchmark.

### “Will the agent teach itself?”

Be precise. An LLM can improve extraction and language handling, but price matching, deduplication and auditability need deterministic engineering. Scout uses an optional LLM only as an extraction fallback; the matching and reporting logic is deterministic and testable. A prompt-only agent is not production-ready for money decisions.

### “What does it cost to run?”

- Demo mode: the local Node process only; no external API spend.
- Live mode: search API usage (Tavily) plus optional LLM extraction, plus hosting. Page fetches are capped at 30/run and 3/source.
- The agent can be pointed at an OpenAI-compatible local model for data-residency-sensitive deployments; extraction quality and latency must be measured.

### “Where does the data live?”

Demo: a single local SQLite file in `data/`. The container persists `/app/data`. Live deployments can use Postgres and a UK/EU region. Client briefs should have a retention period (the client’s own answer suggested a few months) and exports should be stored in the CRM/SharePoint, not left in the tool indefinitely.

### “Do we need MFA and multiple users?”

The current build is a single-tenant internal demo without auth. Before rollout, put it behind an identity-aware proxy or add app-level auth with staff roles. MFA is supported by the surrounding identity provider, not built into Scout.

### “Can we search Spain as well?”

Yes: the portfolio and catalogue include Andalusia; a Spain brief selects the Spanish sources. The default demo stays in the Algarve for a clear narrative.

### “What happens if a portal changes its HTML?”

The live extractor falls back through JSON-LD → OpenGraph → visible text → optional LLM. Failures are isolated per source, logged and surfaced as coverage, not hidden. Add fixtures for each permitted source before relying on it.

### “Can it check availability?”

No — and the client brief already identified this as an industry limitation. Scout reads asking prices. Availability remains a manual owner/agency check. A production workflow could add a confirmation task or integrate an owner portal, but should not automate availability claims.

### “Why does the report say ‘mirror’?”

A mirror is a competitor page that appears to advertise one of your own listings. Scout detects this from a reference mention or strong attribute/title similarity. It is excluded from the comparable set so the listing cannot benchmark itself.

### “What is the confidence score?”

A quality signal for extraction (structured data > OpenGraph > visible text) and source reliability. It is not a probability that the listing is available or correctly priced.

### “Can the client use it directly in phase two?”

Yes, as a portal/search product — but the current build needs authentication, per-user history, quotas, billing and a public-content review before exposing it. The run/report model and API can support that phase.

---

## Failure fallbacks

- **Server not started:** `npm start`; check http://127.0.0.1:4321/api/health.
- **Port in use:** `PORT=4322 npm start`.
- **A run was interrupted:** the server marks stale runs as failed on restart; start a new run.
- **Demo data looks stale:** **Reset demo data** clears runs and discovered sources.
- **Live mode fails at startup:** set `TAVILY_API_KEY` or return to `SCOUT_MODE=demo`.
- **No offers found:** widen the brief or re-enable sources; the report will explicitly show the coverage and rejection reasons.

---

## What to leave running after the demo

Either:

- reset demo data for a clean handover; or
- leave the latest strong report open at `#/runs/<id>` so the client can explore.

The application is local and makes no external requests in simulation mode, so it is safe to leave running on a laptop during an internal review.
