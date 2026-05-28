// Source-of-truth content for the /product/[slug] sub-pages.
// Adding a feature here generates /en/product/<slug>/ and /fr/product/<slug>/
// automatically (see [slug].astro in both locales).
//
// Each feature: { slug, en: { ... }, fr: { ... } }. Both languages must share
// the same shape — keep them in lock-step.

export const PRODUCT_FEATURES = [
  {
    slug: 'conversational-ai',
    icon: '◑',
    en: {
      kicker: 'Conversational AI',
      title: 'Ask anything about your marketing.',
      tagline: 'A senior analyst, but typed.',
      hero:
        "Ask your data the same way you'd ask a teammate. Structured answers come back with the numbers, the time window, the causes — and what to do next.",
      h2_problem: "The 5-dashboards problem",
      problem:
        "Most marketing questions span 3-5 tools. GA4 for traffic, Meta Ads for paid social, Stripe for revenue, Search Console for SEO. Building a single coherent story by hand is 30-60 minutes of clicking. Multiply that by every weekly stand-up.",
      h2_how: 'How it works',
      how: [
        { title: '1. Plain language input', body: "You type in English or French. No SQL, no metric picker. \"Why did CVR drop last week?\" is enough." },
        { title: '2. Query planning', body: "The AI maps your question to the canonical metrics layer, picks the right sources, builds the SQL/API calls, and runs them with the right window comparison." },
        { title: '3. Structured answer', body: "Result: a TL;DR + the underlying numbers + 2-3 contributing factors + recommended actions. Every number is sourced — you can click to see the raw connector data." },
        { title: '4. Follow-ups', body: "Each answer keeps context, so you can refine without re-explaining. \"Same thing but for last 30 days?\" works." },
      ],
      h2_examples: 'Real questions our users ask',
      examples: [
        "Why did conversion rate drop yesterday vs the week before?",
        "Which campaign drove revenue last week, broken down by audience?",
        "Show me ad fatigue signals on Meta over the last 14 days.",
        "What's my blended CAC across all paid channels this month?",
        "Compare organic vs paid landing page performance.",
      ],
      h2_under_hood: 'Under the hood',
      under_hood:
        "Anthropic Claude models (Haiku for fast lookups, Sonnet for complex multi-source analysis). Every answer is grounded in your live connector data via the canonical metrics layer — never hallucinated. Your data never leaves the European hosting region.",
      cta_title: 'Stop building reports by hand.',
      cta_body: 'Connect one source and try a question on real data.',
    },
    fr: {
      kicker: 'IA conversationnelle',
      title: 'Pose n’importe quelle question à tes données.',
      tagline: 'Un analyste senior, mais en chat.',
      hero:
        "Parle à tes données comme tu parlerais à un collègue. Tu reçois une réponse structurée avec les chiffres, la période, les causes — et les actions recommandées.",
      h2_problem: 'Le problème des 5 dashboards',
      problem:
        "La plupart des questions marketing traversent 3 à 5 outils. GA4 pour le trafic, Meta Ads pour le paid social, Stripe pour le revenu, Search Console pour le SEO. Construire une histoire cohérente à la main, c’est 30 à 60 minutes de clics. Multiplie par chaque stand-up hebdo.",
      h2_how: 'Comment ça marche',
      how: [
        { title: '1. Question en langage naturel', body: "Tape en français ou en anglais. Pas de SQL, pas de sélecteur de métriques. « Pourquoi le taux de conversion a baissé la semaine dernière ? » suffit." },
        { title: '2. Planification de la requête', body: "L’IA mappe ta question sur la couche de métriques canoniques, choisit les bonnes sources, construit les appels SQL/API et lance la bonne comparaison temporelle." },
        { title: '3. Réponse structurée', body: "Résultat : un TL;DR + les chiffres sous-jacents + 2 à 3 facteurs contributifs + actions recommandées. Chaque chiffre est sourcé — un clic pour voir la donnée brute du connecteur." },
        { title: '4. Suivis', body: "Chaque réponse garde le contexte. Tu raffines sans tout ré-expliquer. « Pareil mais sur 30 jours ? » fonctionne." },
      ],
      h2_examples: 'Vraies questions posées par nos users',
      examples: [
        "Pourquoi le taux de conversion a baissé hier vs la semaine d’avant ?",
        "Quelle campagne a généré le plus de revenu la semaine dernière, ventilé par audience ?",
        "Montre-moi les signes de fatigue créative sur Meta sur 14 jours.",
        "Quel est mon CAC blended sur tous les canaux paid ce mois-ci ?",
        "Compare les performances landing organique vs paid.",
      ],
      h2_under_hood: 'Sous le capot',
      under_hood:
        "Modèles Claude d’Anthropic (Haiku pour les lookups rapides, Sonnet pour l’analyse multi-source). Chaque réponse est ancrée dans tes données live via la couche de métriques canoniques — jamais hallucinée. Tes données ne quittent jamais l’hébergement européen.",
      cta_title: 'Arrête de construire tes rapports à la main.',
      cta_body: 'Connecte une source et teste une vraie question.',
    },
  },
  {
    slug: 'connectors',
    icon: '◴',
    en: {
      kicker: 'Connectors',
      title: 'All your marketing tools, unified.',
      tagline: 'One-click OAuth. Encrypted at rest.',
      hero:
        "Connect GA4, Meta Ads, Google Ads, Stripe and Search Console in one click each. We pull the last 90 days on day one, then keep syncing. Tokens encrypted via Supabase Vault, Row-Level Security on every row.",
      h2_problem: 'Available today',
      problem:
        "GA4 · Meta Ads (Facebook + Instagram) · Google Ads · Stripe · Google Search Console. Every connector is built on the same base class — same retry logic, same canonical mapping, same status reporting.",
      h2_how: 'How a connector works',
      how: [
        { title: '1. One-click OAuth', body: "You authorize SmartAnalyst on the source's screen. Refresh tokens are stored encrypted at rest, never logged." },
        { title: '2. Initial backfill', body: "We pull the last 90 days of metrics on connection. No manual export." },
        { title: '3. Incremental sync', body: "Hourly or daily depending on the source. We track sync status per connector — green/orange/red so you always know if a number is fresh." },
        { title: '4. Canonical mapping', body: "Raw API responses are mapped to our canonical metrics layer (see canonical-metrics). Sources never bleed their naming into your dashboard." },
      ],
      h2_examples: 'Roadmap',
      examples: [
        "Shopify — order-level revenue, refund tracking",
        "HubSpot — pipeline, deals, contact lifecycle",
        "Mailchimp — open rate, CTR, list health",
        "LinkedIn Ads — B2B paid funnel",
        "Klaviyo — email/SMS attribution",
        "Notion / Google Sheets — for ad-hoc data",
      ],
      h2_under_hood: 'Security & compliance',
      under_hood:
        "Tokens encrypted using Supabase Vault (libsodium). Row-Level Security ensures workspace isolation at the database level. EU hosting (Supabase Ireland). Sources you disconnect have their tokens purged within minutes. Full audit log of who connected what, when.",
      cta_title: 'Start with the source you check the most.',
      cta_body: 'Adding the rest takes seconds each.',
    },
    fr: {
      kicker: 'Connecteurs',
      title: 'Tous tes outils marketing, unifiés.',
      tagline: 'OAuth en 1 clic. Chiffrement au repos.',
      hero:
        "Connecte GA4, Meta Ads, Google Ads, Stripe et Search Console en un clic chacun. On synchronise les 90 derniers jours dès la connexion, puis en continu. Tokens chiffrés via Supabase Vault, Row-Level Security partout.",
      h2_problem: 'Disponibles aujourd’hui',
      problem:
        "GA4 · Meta Ads (Facebook + Instagram) · Google Ads · Stripe · Google Search Console. Chaque connecteur partage la même base — même retry, même mapping canonique, même reporting de statut.",
      h2_how: 'Comment fonctionne un connecteur',
      how: [
        { title: '1. OAuth en 1 clic', body: "Tu autorises SmartAnalyst sur l’écran de la source. Les refresh tokens sont stockés chiffrés au repos, jamais loggés." },
        { title: '2. Backfill initial', body: "On synchronise les 90 derniers jours dès la connexion. Pas d’export manuel." },
        { title: '3. Sync incrémental', body: "Horaire ou journalier selon la source. On suit le statut par connecteur — vert/orange/rouge pour que tu saches si un chiffre est frais." },
        { title: '4. Mapping canonique', body: "Les réponses API brutes sont mappées sur notre couche de métriques canoniques. Les sources ne polluent pas ton dashboard avec leur vocabulaire." },
      ],
      h2_examples: 'Roadmap',
      examples: [
        "Shopify — revenu par commande, tracking des remboursements",
        "HubSpot — pipeline, deals, lifecycle contact",
        "Mailchimp — taux d’ouverture, CTR, santé de liste",
        "LinkedIn Ads — funnel B2B paid",
        "Klaviyo — attribution email/SMS",
        "Notion / Google Sheets — pour les données ad-hoc",
      ],
      h2_under_hood: 'Sécurité & conformité',
      under_hood:
        "Tokens chiffrés via Supabase Vault (libsodium). Row-Level Security pour isoler les workspaces au niveau base. Hébergement européen (Supabase Irlande). Les sources déconnectées voient leurs tokens purgés en quelques minutes. Audit log complet de qui a connecté quoi, et quand.",
      cta_title: 'Commence par la source que tu regardes le plus.',
      cta_body: 'Ajouter les autres prend quelques secondes chacune.',
    },
  },
  {
    slug: 'canonical-metrics',
    icon: '◆',
    en: {
      kicker: 'Canonical Metrics Layer',
      title: 'One vocabulary for every source.',
      tagline: 'Apples = apples. Always.',
      hero:
        "GA4 says \"sessions\". Meta says \"reach\". Google Ads says \"impressions\". Stripe says \"successful_payments\". A naive AI gets lost or compares apples to oranges. Our canonical layer normalizes everything into one shared metric vocabulary.",
      h2_problem: "The naming chaos",
      problem:
        "Same idea, four different words across four tools. Same word, different definitions across tools (a \"session\" in GA4 ≠ a \"session\" in Adobe). Without normalization, the AI either guesses wrong or refuses to compare. We don't guess.",
      h2_how: 'How the layer works',
      how: [
        { title: '1. Source mapping', body: "Every metric in every connector has an explicit mapping to a canonical key (e.g. ga4.sessions → sessions_all, meta_ads.impressions → impressions_paid_social)." },
        { title: '2. Type-safe transforms', body: "Currency conversions, timezone normalization (everything in your workspace timezone), and date alignment happen here. No timezone-shift surprises." },
        { title: '3. Confidence score', body: "Each canonical metric carries a 0-100 confidence score. Bad data from a flaky API drops the score — and the AI flags it instead of pretending the number is solid." },
        { title: '4. Audit trail', body: "Every canonical metric value links back to its source row(s). One click to see the GA4 / Meta / Stripe response that produced it." },
      ],
      h2_examples: 'Canonical keys (sample)',
      examples: [
        "sessions_all — total sessions across analytics sources",
        "spend_paid_total — total ad spend (Meta + Google Ads + others)",
        "revenue_total — total revenue (Stripe primary, GA4 as fallback)",
        "conversions_all — sum of macro conversion events",
        "cpc_blended — blended cost-per-click across paid channels",
      ],
      h2_under_hood: 'Why this matters for AI quality',
      under_hood:
        "LLMs are pattern matchers — feed them inconsistent naming and they will confidently confuse \"reach\" with \"impressions\". Feed them one canonical schema and they reason cleanly. This is the foundation that makes cross-source questions work: \"What's my CAC blended across all paid channels?\" only has an answer because the canonical layer knows how to combine spend + conversions across sources.",
      cta_title: 'Want to see the canonical schema?',
      cta_body: 'It’s published in our docs — full transparency on what we normalize and how.',
    },
    fr: {
      kicker: 'Couche de métriques canoniques',
      title: 'Un seul vocabulaire pour toutes les sources.',
      tagline: 'Choux = choux. Toujours.',
      hero:
        "GA4 dit « sessions ». Meta dit « reach ». Google Ads dit « impressions ». Stripe parle de « successful_payments ». Une IA naïve s’y perd ou compare des choux et des carottes. Notre couche canonique normalise tout dans un seul vocabulaire métrique partagé.",
      h2_problem: 'Le chaos du naming',
      problem:
        "Même idée, quatre mots différents selon l’outil. Même mot, définitions différentes (une « session » GA4 ≠ une « session » Adobe). Sans normalisation, l’IA devine mal ou refuse de comparer. Nous, on ne devine pas.",
      h2_how: 'Comment ça marche',
      how: [
        { title: '1. Mapping par source', body: "Chaque métrique de chaque connecteur a un mapping explicite vers une clé canonique (ex : ga4.sessions → sessions_all, meta_ads.impressions → impressions_paid_social)." },
        { title: '2. Transformations type-safe', body: "Conversions de devises, normalisation des fuseaux horaires (tout dans le timezone de ton workspace), alignement des dates. Pas de surprises de décalage." },
        { title: '3. Score de confiance', body: "Chaque métrique canonique porte un score 0-100. Des données médiocres d’une API capricieuse baissent le score — et l’IA le signale au lieu de prétendre que le chiffre est solide." },
        { title: '4. Traçabilité', body: "Chaque valeur canonique pointe vers les lignes sources qui l’ont produite. Un clic pour voir la réponse GA4 / Meta / Stripe brute." },
      ],
      h2_examples: 'Clés canoniques (échantillon)',
      examples: [
        "sessions_all — total des sessions toutes sources analytics",
        "spend_paid_total — dépenses pub totales (Meta + Google Ads + autres)",
        "revenue_total — revenu total (Stripe primaire, GA4 en fallback)",
        "conversions_all — somme des conversions macro",
        "cpc_blended — coût-par-clic blended sur les canaux paid",
      ],
      h2_under_hood: 'Pourquoi c’est critique pour la qualité IA',
      under_hood:
        "Les LLMs sont des pattern matchers — donne-leur un naming incohérent et ils confondront « reach » et « impressions » avec assurance. Donne-leur un schéma canonique unique et ils raisonnent proprement. C’est la fondation qui rend les questions cross-source possibles : « Quel est mon CAC blended sur tous les canaux paid ? » n’a une réponse que parce que la couche canonique sait comment combiner spend + conversions à travers les sources.",
      cta_title: 'Tu veux voir le schéma canonique ?',
      cta_body: 'Il est publié dans nos docs — transparence totale sur ce qu’on normalise et comment.',
    },
  },
  {
    slug: 'proactive-insights',
    icon: '◐',
    en: {
      kicker: 'Proactive Insights',
      title: 'Know before it hurts.',
      tagline: 'A Monday morning email that earns its open.',
      hero:
        "Every Monday at 8am, you get one email: anomalies the AI spotted in the last 7 days, opportunities worth pursuing, and risks to watch. No noise — only items that beat a confidence threshold.",
      h2_problem: 'Dashboards only help if you check them',
      problem:
        "Most marketing fires start days before anyone notices. A creative starts fatiguing on Wednesday — by Friday CPM is up 40%. Inventory stops fulfilling on Saturday — Monday morning panic. Dashboards don't pull you in; they wait. Proactive insights flip that.",
      h2_how: 'What the email surfaces',
      how: [
        { title: 'Anomalies', body: "Statistical outliers: a metric drifted >2σ from its 30-day baseline, or a conversion funnel step dropped sharply. With the likely cause if we can identify one." },
        { title: 'Opportunities', body: "Campaigns hitting good ROAS that could absorb more budget. Search queries you're winning organically — worth bidding on. Audiences performing better than expected." },
        { title: 'Risks', body: "Ad fatigue signals (declining CTR with stable creative age). Sudden tracking gaps. CPC drift on key terms. Subscription churn spikes." },
        { title: 'Always with context', body: "Every item links back to the chat — click to dig in with follow-up questions. No item ships without supporting evidence." },
      ],
      h2_examples: 'Recent examples (real, anonymized)',
      examples: [
        "« Meta CTR down 22% on Account X over 7 days — creative refresh recommended. »",
        "« Stripe MRR up 8% wk-over-wk, driven by Pro plan upgrades. »",
        "« 3 GSC keywords ranking #2-3 with 4k impressions — paid bid candidates. »",
        "« Google Ads spend +30% on campaign Y but conversions flat — investigate. »",
      ],
      h2_under_hood: 'How we keep noise out',
      under_hood:
        "Each insight passes through a 3-step filter: statistical significance (>2σ over 30-day window), business significance (the dollar impact is non-trivial), and novelty (we don't repeat the same item week after week). You get 3-5 high-signal items, not 30 maybe-something items.",
      cta_title: 'Your Monday morning, returned.',
      cta_body: 'Get the first insight email after your first 7 days of synced data.',
    },
    fr: {
      kicker: 'Insights proactifs',
      title: 'Sache avant que ça fasse mal.',
      tagline: 'Un email du lundi matin qui mérite son ouverture.',
      hero:
        "Chaque lundi à 8h, tu reçois un email : anomalies détectées par l’IA sur les 7 derniers jours, opportunités à saisir, risques à surveiller. Pas de bruit — uniquement les items qui passent un seuil de confiance.",
      h2_problem: 'Les dashboards aident seulement si tu les regardes',
      problem:
        "La plupart des incendies marketing démarrent plusieurs jours avant qu’on les remarque. Une créa commence à fatiguer le mercredi — vendredi le CPM est à +40 %. Une intégration casse samedi — panique lundi matin. Les dashboards attendent. Les insights proactifs renversent la logique.",
      h2_how: 'Ce que l’email remonte',
      how: [
        { title: 'Anomalies', body: "Outliers statistiques : une métrique a dévié de >2σ par rapport à sa baseline 30 jours, ou une étape de funnel a chuté brutalement. Avec la cause probable si on peut l’identifier." },
        { title: 'Opportunités', body: "Campagnes au ROAS solide qui pourraient absorber plus de budget. Requêtes search où tu performes en organique — à bidder en paid. Audiences qui performent au-dessus des attentes." },
        { title: 'Risques', body: "Signes de fatigue créa (CTR en baisse avec créa du même âge). Pertes de tracking soudaines. Dérive de CPC sur des termes clés. Pics de churn." },
        { title: 'Toujours avec contexte', body: "Chaque item renvoie au chat — un clic pour creuser avec des questions de suivi. Aucun item sans preuves." },
      ],
      h2_examples: 'Exemples récents (réels, anonymisés)',
      examples: [
        "« CTR Meta -22 % sur le compte X sur 7 jours — renouvellement créa recommandé. »",
        "« MRR Stripe +8 % vs semaine précédente, tiré par les upgrades Pro. »",
        "« 3 mots-clés GSC en position 2-3 avec 4k impressions — candidats à bid paid. »",
        "« Spend Google Ads +30 % sur la campagne Y mais conversions stables — à investiguer. »",
      ],
      h2_under_hood: 'Comment on évite le bruit',
      under_hood:
        "Chaque insight passe un filtre en 3 étapes : significativité statistique (>2σ sur 30 jours), significativité business (impact € non trivial), nouveauté (on ne répète pas le même item semaine après semaine). Tu reçois 3-5 items à fort signal, pas 30 items peut-être-quelque-chose.",
      cta_title: 'Récupère ton lundi matin.',
      cta_body: 'Premier email d’insights après 7 jours de données synchronisées.',
    },
  },
  {
    slug: 'reports',
    icon: '▤',
    en: {
      kicker: 'Reports',
      title: 'Auto-generated reports clients actually read.',
      tagline: 'PDF, branded, sent on the 1st.',
      hero:
        "Every month on the 1st, a PDF lands in your client's inbox — executive summary, key metrics, charts, recommendations. Built from live data, signed off by the AI, branded with your logo.",
      h2_problem: 'The monthly report tax',
      problem:
        "If you manage 5 clients, you spend 1-2 days every month assembling reports — pulling numbers from 5 tools, building charts in Slides, writing the exec summary. Reports take longer than the work they describe. We fix that.",
      h2_how: 'Structure of a report',
      how: [
        { title: '1. Executive summary', body: "3 paragraphs at the top: what happened, what worked, what to fix. Written by the AI in your voice (custom prompt per workspace if needed)." },
        { title: '2. KPI grid', body: "The 6-8 metrics that matter for this client, with delta vs previous period. Configurable per workspace." },
        { title: '3. Channel sections', body: "One section per active connector. Paid social, paid search, SEO, revenue — only the ones your client actually uses." },
        { title: '4. Recommendations', body: "The same items as the weekly proactive insights, rolled up for the month with explicit next-step actions." },
      ],
      h2_examples: 'What you can customize',
      examples: [
        "Logo, primary color, accent color (Pro)",
        "Full white-label: your domain, your branding (Agency)",
        "Sender email address",
        "Recipient list per workspace",
        "Day of the month for auto-send (1, 5, 15…)",
        "Sections to include / hide",
      ],
      h2_under_hood: 'Rendering',
      under_hood:
        "PDF is rendered server-side via Playwright (Chromium headless). Templates use Handlebars and a constrained component library so the AI can never inject HTML it shouldn't. Each report is stored encrypted; clients access via signed URL with 7-day TTL.",
      cta_title: 'Stop billing time you don’t love.',
      cta_body: 'Spin up your first report from current month data in 2 minutes.',
    },
    fr: {
      kicker: 'Rapports',
      title: 'Des rapports auto que tes clients lisent vraiment.',
      tagline: 'PDF, brandé, envoyé le 1ᵉʳ.',
      hero:
        "Chaque mois le 1ᵉʳ, un PDF atterrit dans la boîte de ton client — résumé exécutif, métriques clés, graphiques, recommandations. Construit sur les données live, signé par l’IA, brandé à ton logo.",
      h2_problem: 'La taxe du rapport mensuel',
      problem:
        "Si tu gères 5 clients, tu passes 1-2 jours chaque mois à monter des rapports — extraire des chiffres de 5 outils, construire des graphes en Slides, rédiger le résumé exécutif. Les rapports prennent plus de temps que le travail qu’ils décrivent. On corrige ça.",
      h2_how: 'Structure d’un rapport',
      how: [
        { title: '1. Résumé exécutif', body: "3 paragraphes en haut : ce qui s’est passé, ce qui a marché, ce qu’il faut corriger. Rédigé par l’IA dans ton ton (prompt custom par workspace si besoin)." },
        { title: '2. Grille de KPIs', body: "Les 6-8 métriques qui comptent pour ce client, avec delta vs période précédente. Configurable par workspace." },
        { title: '3. Sections par canal', body: "Une section par connecteur actif. Paid social, paid search, SEO, revenu — seulement ceux que ton client utilise vraiment." },
        { title: '4. Recommandations', body: "Les mêmes items que les insights proactifs hebdo, agrégés sur le mois avec actions explicites." },
      ],
      h2_examples: 'Ce que tu peux customiser',
      examples: [
        "Logo, couleur principale, couleur d’accent (Pro)",
        "Marque blanche complète : ton domaine, ton branding (Agence)",
        "Adresse email d’envoi",
        "Liste des destinataires par workspace",
        "Jour du mois pour l’envoi auto (1, 5, 15…)",
        "Sections à inclure / masquer",
      ],
      h2_under_hood: 'Génération',
      under_hood:
        "Le PDF est rendu côté serveur via Playwright (Chromium headless). Les templates utilisent Handlebars et une lib de composants contraints pour que l’IA ne puisse jamais injecter du HTML interdit. Chaque rapport est stocké chiffré ; les clients y accèdent via URL signée avec TTL 7 jours.",
      cta_title: 'Arrête de facturer du temps que tu n’aimes pas.',
      cta_body: 'Lance ton premier rapport sur les données du mois en cours en 2 minutes.',
    },
  },
  {
    slug: 'multi-workspace',
    icon: '◫',
    en: {
      kicker: 'Multi-workspace',
      title: 'One account. Twenty clients.',
      tagline: 'Per-client connectors, metrics, reports — switch in one click.',
      hero:
        "Designed for agencies and freelancers managing portfolios. Each workspace is an isolated tenant — own connectors, own metrics, own reports, own brand. Switch with one click from the top-left dropdown.",
      h2_problem: 'The agency stack problem',
      problem:
        "Most analytics tools assume one company = one account. Agencies don't fit that model. You either pay N seats × N clients (= unbearable), juggle N different logins, or build hacks. We built for you from day one.",
      h2_how: 'How workspaces work',
      how: [
        { title: 'Isolated tenants', body: "Each client lives in its own workspace. Their data never bleeds into another workspace — enforced at the database level via Row-Level Security." },
        { title: 'Shared team', body: "Your team members get access to the workspaces you assign. Roles: admin, editor, viewer. Add a junior on one client, full access on another." },
        { title: 'Per-workspace brand', body: "Each workspace can have its own logo + colors. Reports and email templates pick the right brand automatically." },
        { title: 'Top-level dashboard', body: "Cross-workspace view at the org level — your overall MRR across all clients, total ad spend you manage, alerts across the portfolio." },
      ],
      h2_examples: 'Plans and limits',
      examples: [
        "Starter — up to 5 workspaces",
        "Pro — up to 20 workspaces (P1 connectors on all)",
        "Agency — unlimited workspaces, all connectors, full white-label",
      ],
      h2_under_hood: 'Security model',
      under_hood:
        "Workspace isolation isn't a product feature — it's a Postgres Row-Level Security policy. Every query is automatically scoped to the calling user's workspace memberships. Even if there was a bug in the API code, the database would refuse cross-workspace reads.",
      cta_title: 'Built for portfolios.',
      cta_body: 'Add a workspace per client in 30 seconds. Switch in one.',
    },
    fr: {
      kicker: 'Multi-workspace',
      title: 'Un compte. Vingt clients.',
      tagline: 'Connecteurs, métriques, rapports par client — bascule en 1 clic.',
      hero:
        "Pensé pour les agences et freelances qui gèrent un portefeuille. Chaque workspace est un tenant isolé — propres connecteurs, propres métriques, propres rapports, propre marque. Bascule en un clic depuis le menu en haut à gauche.",
      h2_problem: 'Le problème du stack agence',
      problem:
        "La plupart des outils analytics partent du principe qu’une entreprise = un compte. Les agences ne rentrent pas dans ce modèle. Tu paies soit N sièges × N clients (= insupportable), soit tu jongles avec N logins, soit tu bricoles. Nous, on a construit pour toi dès le jour 1.",
      h2_how: 'Comment marchent les workspaces',
      how: [
        { title: 'Tenants isolés', body: "Chaque client vit dans son propre workspace. Sa donnée ne fuit jamais vers un autre workspace — appliqué au niveau base via Row-Level Security." },
        { title: 'Équipe partagée', body: "Tes membres d’équipe ont accès aux workspaces que tu leur assignes. Rôles : admin, editor, viewer. Ajoute un junior sur 1 client, full access sur un autre." },
        { title: 'Marque par workspace', body: "Chaque workspace a son logo + ses couleurs. Les rapports et templates email piochent la bonne marque automatiquement." },
        { title: 'Dashboard top-level', body: "Vue cross-workspace au niveau de ton organisation — MRR total tous clients, dépense pub totale gérée, alertes sur le portefeuille." },
      ],
      h2_examples: 'Plans et limites',
      examples: [
        "Starter — jusqu’à 5 workspaces",
        "Pro — jusqu’à 20 workspaces (connecteurs P1 partout)",
        "Agence — workspaces illimités, tous les connecteurs, marque blanche complète",
      ],
      h2_under_hood: 'Modèle de sécurité',
      under_hood:
        "L’isolation par workspace n’est pas un feature flag — c’est une policy Postgres Row-Level Security. Chaque requête est automatiquement scopée aux memberships du user qui appelle. Même un bug du code API ne pourrait pas faire fuiter une lecture cross-workspace : la base refuserait.",
      cta_title: 'Conçu pour les portefeuilles.',
      cta_body: 'Ajoute un workspace par client en 30 secondes. Bascule en 1.',
    },
  },
  {
    slug: 'white-label',
    icon: '◇',
    en: {
      kicker: 'White-label',
      title: 'Your brand, your AI analyst.',
      tagline: 'Clients should never see "SmartAnalyst" unless you want them to.',
      hero:
        "Reports, emails, the client-facing dashboard — all in your colors and your logo. On the Agency plan, even the URL can be yours (custom domain on the roadmap).",
      h2_problem: 'Why white-label matters for agencies',
      problem:
        "If your client sees a third-party brand on every report, you're training them to evaluate the tool, not your work. White-label keeps the focus where it belongs: on the agency they're paying.",
      h2_how: 'What you can rebrand',
      how: [
        { title: 'Logo + colors (Pro)', body: "Upload your logo, set primary + accent colors. Reports, the proactive-insights email, and the client-facing dashboard pick those up automatically." },
        { title: 'Email sender (Pro)', body: "Reports and alerts can be sent from a custom address (e.g. reports@youragency.com). DMARC/SPF setup is one DNS record." },
        { title: 'Full white-label (Agency)', body: "All visible mentions of SmartAnalyst removed. Footers cleaned. Login screens for your clients use your branding." },
        { title: 'Custom domain (roadmap, Agency)', body: "Serve the client portal at app.youragency.com. Pending TLS automation work." },
      ],
      h2_examples: 'Levels',
      examples: [
        "Starter — SmartAnalyst branded (visible « powered by »)",
        "Pro — your logo + colors",
        "Agency — full white-label, your brand everywhere",
      ],
      h2_under_hood: 'How it’s configured',
      under_hood:
        "Workspace settings → Branding. Logo upload (PNG/SVG, max 2MB). Colors picked from a color picker with WCAG contrast warnings. Live preview of report header / dashboard nav / email signature before saving. Changes apply immediately to new reports; existing reports keep their original branding.",
      cta_title: 'Show up as you.',
      cta_body: 'Set your brand once. Every client deliverable picks it up.',
    },
    fr: {
      kicker: 'Marque blanche',
      title: 'Ta marque, ton analyste IA.',
      tagline: 'Tes clients ne devraient jamais voir « SmartAnalyst » si tu ne le veux pas.',
      hero:
        "Rapports, emails, dashboard client — tout dans tes couleurs et ton logo. Sur le plan Agence, même l’URL peut être à toi (domaine custom dans la roadmap).",
      h2_problem: 'Pourquoi la marque blanche compte pour les agences',
      problem:
        "Si ton client voit une marque tierce sur chaque rapport, tu l’entraînes à évaluer l’outil, pas ton travail. La marque blanche garde le focus là où il doit être : sur l’agence qu’il paie.",
      h2_how: 'Ce que tu peux rebrander',
      how: [
        { title: 'Logo + couleurs (Pro)', body: "Upload ton logo, paramètre couleur principale + accent. Rapports, email d’insights proactifs et dashboard client les reprennent automatiquement." },
        { title: 'Email expéditeur (Pro)', body: "Rapports et alertes peuvent partir d’une adresse custom (ex. rapports@tonagence.com). Setup DMARC/SPF = un enregistrement DNS." },
        { title: 'Marque blanche complète (Agence)', body: "Toutes les mentions visibles de SmartAnalyst supprimées. Footers nettoyés. Écrans de login pour tes clients à ta marque." },
        { title: 'Domaine custom (roadmap, Agence)', body: "Servir le portail client à app.tonagence.com. En attente de l’automatisation TLS." },
      ],
      h2_examples: 'Niveaux',
      examples: [
        "Starter — marque SmartAnalyst visible (mention « propulsé par »)",
        "Pro — ton logo + tes couleurs",
        "Agence — marque blanche complète, ta marque partout",
      ],
      h2_under_hood: 'Comment ça se configure',
      under_hood:
        "Paramètres workspace → Branding. Upload du logo (PNG/SVG, max 2 Mo). Couleurs via color picker avec warnings contraste WCAG. Aperçu live de l’en-tête de rapport / nav du dashboard / signature email avant de sauvegarder. Les changements s’appliquent immédiatement aux nouveaux rapports ; les rapports existants gardent leur branding d’origine.",
      cta_title: 'Présente-toi comme toi.',
      cta_body: 'Règle ta marque une fois. Chaque livrable client la reprend.',
    },
  },
]

export const PRODUCT_FEATURES_BY_SLUG = Object.fromEntries(
  PRODUCT_FEATURES.map((f) => [f.slug, f]),
)
