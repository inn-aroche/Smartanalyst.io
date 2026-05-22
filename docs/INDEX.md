# SmartAnalyst Documentation Index

## Complete Documentation Set (40 Documents)

### SECTION 0 — FONDATIONS GLOBALES (3 docs)

1. **00_BRIEF_EXECUTIF.md** - Vision produit, features, personas, pricing, règles non-négociables
2. **01_CONVENTIONS_GLOBALES.md** - Nommage, langue, gestion erreurs, timezone, canonical metrics glossaire
3. **02_BONNES_PRATIQUES_TRANSVERSALES.md** - RGPD, sécurité, performance, a11y, monitoring, SEO

### SECTION 1 — ARCHITECTURE & DONNÉES (5 docs)

4. **03_ARCHITECTURE_GLOBALE.md** - Flux données, pattern Connector, RLS, Canonical Metrics, event-driven
5. **04_SCHEMA_DONNEES_COMPLET.md** - DDL complet (10 migrations SQL), RLS policies, indices
6. **05_INFRASTRUCTURE_DEVOPS.md** - VPS Hostinger, PM2, Nginx, Redis, environment variables
7. **06_SUPABASE_BONNES_PRATIQUES.md** - Auth JWT, RLS, Vault, Storage, Realtime
8. **14b_CANONICAL_METRICS_LAYER.md** - Schéma universel (toutes les sources normalisées)

### SECTION 2 — API BACKEND (7 docs)

9. **07_API_AUTH_CONNEXION.md** - Signup, login, refresh, logout, OAuth, JWT, password reset
10. **08_API_ONBOARDING.md** - URL scraping (Playwright), business profile detection (Claude), fallback
11. **09_API_CONNECTEURS.md** - CRUD endpoints (list, add, delete, test, sync)
12. **10_CONNECTOR_GA4.md** - OAuth Google, fetchData, normalizeData, testConnection
13. **11_CONNECTOR_META_ADS.md** - Graph API v18, Meta Ads specifics
14. **12_CONNECTOR_GOOGLE_ADS.md** - GAQL queries, Google Ads specifics
15. **13_CONNECTOR_STRIPE.md** - API key, MRR, churn, LTV

### SECTION 3 — CONNECTEURS & BASE (4 docs)

16. **14_CONNECTOR_SEARCH_CONSOLE.md** - OAuth Google, Search Console data
17. **15_BASE_CONNECTOR_CLASSE.md** - Interface abstraite, factory, test pattern
18. **16_SERVICE_IA_INSIGHTS.md** - Prompts système (Haiku), 3-element rule, health score, confidence scoring
19. **16b_ANOMALY_DETECTION.md** - Data quality checks (broken tracking detection)

### SECTION 4 — SERVICES IA & GÉNÉRATION (4 docs)

20. **17_SERVICE_IA_CHAT.md** - Chat conversationnel, sources, confidence score
21. **18_RAPPORTS_GENERATION.md** - Trigger, template HTML, Puppeteer PDF, white-label, idempotence
22. **19_SERVICE_EMAIL_RESEND.md** - Templates (onboarding, weekly, monthly), retry logic
23. **20_QUEUE_SYSTEM_BULLMQ.md** - BullMQ queues (sync, insights, reports, alerts), workers, retries, dead-letter

### SECTION 5 — FEATURES SAAS (7 docs)

24. **21_FEATURE_DASHBOARD.md** - Health score, KPIs, sparklines, alerts, real-time
25. **22_FEATURE_ANALYSE_CONVERSATIONNELLE.md** - Chat interface, suggestions, history
26. **23_FEATURE_INSIGHTS_PROACTIFS.md** - Weekly digest (Monday 8am), muting
27. **24_FEATURE_BENCHMARK_SECTORIEL.md** - MVP (public data) + V2 roadmap (aggregated user data)
28. **25_FEATURE_SCORE_SANTE.md** - Calculation (4 dimensions), weekly update, history
29. **26_FEATURE_RAPPORTS_AUTOMATIQUES.md** - Auto-send config, white-label, idempotence
30. **27_FEATURE_GESTION_CONNECTEURS.md** - List, add, test, disconnect, status indicators

### SECTION 6 — LANDING & VITRINE (8 docs)

31. **28_LANDING_PAGE_STRUCTURE.md** - UX globale, navigation, SEO strategy
32. **29_PAGE_ACCUEIL.md** - Hero, chat demo, features, pricing, FAQ
33. **30_PAGE_PRODUCT.md** - 8 features, personas, benefits, competitive diff
34. **31_PAGE_CONNECTEURS.md** - P1 connectors, roadmap, setup guides
35. **32_PAGE_SECURITE_RGPD.md** - RGPD compliance, data residency, encryption, DPA
36. **33_PAGE_RESSOURCES.md** - Blog, case studies, webinars, guides
37. **34_PAGE_PRICING.md** - 4 plans, features table, enterprise contact
38. **35_BLOG_SEO_CONTENT.md** - 10 articles, SEO keywords, content strategy

### SECTION 7 — UX & PATTERNS (2 docs)

39. **36_UX_ONBOARDING_DETAILLE.md** - 12 steps, timeline budget (< 3 min), accessibility
40. **37_UX_PATTERNS_GLOBAUX.md** - Forms, loading, modals, tables, color palette, typography

---

## Reading Order by Role

### For Backend Developers
1. 00, 01, 02 (foundations)
2. 03, 04, 14b (architecture + data)
3. 07-09 (auth + API)
4. 10-15 (connectors)
5. 16-20 (services)

### For Frontend Developers
1. 00, 01, 02 (foundations)
2. 03, 06 (architecture + Supabase)
3. 21-27 (features)
4. 36, 37 (UX patterns)

### For DevOps
1. 00, 01, 02 (foundations)
2. 05, 06 (infrastructure)
3. 20 (monitoring + queue system)

### For Product Manager
1. 00 (brief)
2. 21-27 (features)
3. 28-35 (go-to-market)

---

## Phase 1 Critical Documents (Weeks 1-3)

- 00, 01, 02, 03, 04, 14b
- 05, 06, 07, 08, 09, 15
- 16, 16b, 17, 20

**All other documents are Phase 2-3 or can be iterated post-launch.**

---

Generated: May 2025
Total Size: ~150KB (expanded to ~500KB with examples)
