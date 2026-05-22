# SmartAnalyst — Complete Documentation Package

**Version:** 1.0 (May 2025)  
**Status:** Production-ready for Phase 1 build  
**Target:** Claude Code, LLM agents, senior developers, product teams

---

## What's in this package?

**40 comprehensive documentation files** covering:
- Architecture & infrastructure (5 docs)
- Backend API & services (15 docs)
- Features & product (8 docs)
- Landing page & go-to-market (8 docs)
- UX & patterns (2 docs)
- Foundations & conventions (2 docs)

**Total:** ~500KB expanded, ~150KB architecture + examples.

---

## How to use this documentation

### For building SmartAnalyst (backend + frontend)

1. **Start here:**
   - `00_BRIEF_EXECUTIF.md` — Understand the product vision
   - `01_CONVENTIONS_GLOBALES.md` — Learn naming, code style, timezone rules
   - `02_BONNES_PRATIQUES_TRANSVERSALES.md` — Security, RGPD, performance standards

2. **Then read by phase:**
   - **Phase 1 (Weeks 1-3):** Read docs 03-20 (architecture, auth, connectors, services)
   - **Phase 2 (Weeks 4-5):** Read docs 21-27 (features UI, dashboard, chat)
   - **Phase 3 (Weeks 6+):** Read docs 28-37 (landing page, marketing, UX)

3. **Use as reference:**
   - Search `## Implementation` or `## Code Example` for copy-paste ready code
   - Check `## Checklist` sections for validation before moving forward
   - Refer to `03_ARCHITECTURE_GLOBALE.md` when confused about data flow

### For product managers & stakeholders

- `00_BRIEF_EXECUTIF.md` — Product features, personas, pricing
- `21-27_FEATURE_*.md` — UI/UX for each feature
- `28-35_PAGE_*.md` — Landing page structure & copy

### For DevOps & infrastructure

- `05_INFRASTRUCTURE_DEVOPS.md` — VPS setup, PM2, Nginx
- `06_SUPABASE_BONNES_PRATIQUES.md` — Database & auth setup
- `20_QUEUE_SYSTEM_BULLMQ.md` — Background jobs & monitoring

---

## Key architectural decisions (read first!)

1. **Canonical Metrics (doc 14b)** — All data sources normalized to one universal schema. This is CRITICAL for Phase 1.
2. **Multi-Tenancy via RLS (docs 03, 04)** — Row-level security in Supabase prevents any data leakage.
3. **BullMQ Queues (doc 20)** — Replaces simple cron jobs. Handles retries, prioritization, rate limiting.
4. **Playwright unified (docs 05, 08, 18)** — Single browser automation for scraping + PDF generation (saves 300MB RAM).
5. **Event-Driven Realtime (doc 03)** — Supabase realtime + explicit cache invalidation (no TTL-based staleness).

---

## Critical files for Phase 1

```
Priority: MUST READ BEFORE CODING

03_ARCHITECTURE_GLOBALE.md       (30 min) — How everything connects
04_SCHEMA_DONNEES_COMPLET.md     (30 min) — Database schema (SQL copy-paste ready)
07_API_AUTH_CONNEXION.md         (20 min) — Auth endpoints
14b_CANONICAL_METRICS_LAYER.md   (15 min) — Universal data schema
16_SERVICE_IA_INSIGHTS.md        (25 min) — AI prompts & logic
20_QUEUE_SYSTEM_BULLMQ.md        (20 min) — Background jobs

Total: ~2 hours → You can start coding.
```

---

## Using with Claude Code or other LLMs

### For autonomous coding:

1. Feed the agent **one section at a time** (not all 40 files):
   - "Build Phase 1 backend" → Feed 03, 04, 05, 06, 07, 08, 09, 15, 16, 20
   - "Build dashboard" → Feed 03, 06, 21, 37
   - "Build landing page" → Feed 28, 29, 30, 37

2. Add context: "Use 01_CONVENTIONS_GLOBALES.md for all naming/code style"

3. Expect complete, production-ready code without ambiguity

4. Use **INDEX.md** to find related docs quickly

### For iterative development:

- Start with Phase 1 docs
- As you build, reference the specific doc for that module
- Never skip the "## Checklist" section before moving to next doc

---

## Common questions

**Q: Can I skip docs?**  
A: No. Read them in order. They're interconnected. If you skip doc 14b (Canonical Metrics), you'll refactor code in week 4. Skip it at your own risk.

**Q: Are these docs complete for building the product?**  
A: Yes, for Phase 1-2. Some details are stubs (intentionally), but the structure is solid. You won't get stuck.

**Q: Should I update these docs as I build?**  
A: Yes. Keep them synced with actual implementation. They become your source of truth.

**Q: Where's the JavaScript frontend code?**  
A: That's Phase 2-3. Focus on backend (Phase 1) first. Docs 21-27 cover the features you'll build.

**Q: Where's the landing page HTML/CSS?**  
A: Docs 28-35 are specifications. You'll use them to build the actual HTML in Phase 3.

---

## Checklist before you start

- [ ] Read 00_BRIEF_EXECUTIF.md (understand what you're building)
- [ ] Read 01_CONVENTIONS_GLOBALES.md (how to name things, where timezone logic lives)
- [ ] Read 03_ARCHITECTURE_GLOBALE.md (how data flows)
- [ ] Read 04_SCHEMA_DONNEES_COMPLET.md (database schema)
- [ ] Read 14b_CANONICAL_METRICS_LAYER.md (why this is critical)
- [ ] Skim 07-16 (understand which endpoint does what)
- [ ] Read 20_QUEUE_SYSTEM_BULLMQ.md (how jobs work)
- [ ] Confirm you understand RLS (Row-Level Security) — this is your security model
- [ ] Confirm you understand timezone handling (each workspace has its own timezone)

**If you can answer these questions, you're ready:**
1. What is Canonical Metrics and why does it matter?
2. How does RLS prevent data leakage between workspaces?
3. What's the difference between access_token and refresh_token?
4. Why do we use Playwright instead of Puppeteer + Playwright?
5. What happens when a data sync job finishes?

---

## Support & feedback

- If a doc is unclear → Update it (you're not the last person to read it)
- If you find a bug in the spec → Log it in the code
- If something contradicts the code → The code wins, update the doc
- If you complete a Phase → Archive the phase's docs, they become reference

---

## License & attribution

These docs are internal SmartAnalyst documentation.  
Written for Claude Code (Anthropic), adaptable to any LLM.  
Updated regularly as product evolves.

---

**Last updated:** May 15, 2025  
**Status:** ✅ Ready for Phase 1 build
