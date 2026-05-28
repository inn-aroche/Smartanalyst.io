// Persona-driven use case pages. URL: /[locale]/use-cases/[slug]/

export const USE_CASES = [
  {
    slug: 'agency',
    icon: '◧',
    en: {
      kicker: 'For agencies',
      title: 'Manage 20 clients without 20 dashboards.',
      tagline: 'Marketing agencies, performance marketing teams.',
      hero:
        "You run a marketing agency. You have 5 to 50 clients, each with their own GA4, Meta Ads, Google Ads, Stripe, GSC. Your monthly reporting tax is days, not hours. SmartAnalyst is built for that shape of work.",
      pains: [
        { title: 'Logins everywhere', body: "You jump between 20+ login screens to assemble one client report. Half the screenshots are out of date by the time you ship the slides." },
        { title: 'Reports take longer than the work', body: "1-2 days a month per client × 10 clients = nearly a week just packaging data. Your team would rather be optimizing campaigns." },
        { title: 'Client questions are slow', body: "Client emails you Tuesday: « why did CAC spike last week? ». You open 4 tabs, build a 1-tab story, send Wednesday. The answer should have taken 90 seconds." },
        { title: 'Junior team can\'t self-serve', body: "Senior analysts answer the same 10 questions every week because juniors don't have the cross-source fluency to do it themselves." },
      ],
      h2_solution: 'How SmartAnalyst solves it',
      solution: [
        { title: 'One workspace per client', body: "Isolated tenants (RLS-enforced) but switchable in one click. Per-client connectors, branding, recipients." },
        { title: 'Auto-sent reports on the 1st', body: "Monthly PDFs with exec summary, KPIs, channel breakdowns, recommendations. Branded with your agency’s logo and colors." },
        { title: 'Conversational AI = self-serve juniors', body: "« Why did CAC spike last week on Account Y? » → structured answer in 5s. Juniors get unstuck without paging seniors." },
        { title: 'Weekly proactive insights', body: "Monday morning email per workspace + a cross-portfolio digest for the agency owner — who needs attention this week, who's quietly performing." },
      ],
      h2_workflow: 'A typical week',
      workflow: [
        "Monday 8am — proactive insights email lands. 3 client portfolios flagged for attention.",
        "Monday 9am — open the chat on Client A: « what's driving the conv drop? ». Answer in 10 seconds. Brief the account lead.",
        "Tuesday — Client B asks for a Q3-vs-Q2 comparison. You build it in 1 question.",
        "Wednesday-Friday — execute optimizations. Your team isn't spending hours building reports.",
        "1st of the month — monthly PDFs go out automatically to every client at 7am. You add a personal note to a few.",
      ],
      cta_title: 'Built for the agency shape of work.',
      cta_body: '14-day trial, all features, no card required. Add 5 clients on day one.',
    },
    fr: {
      kicker: 'Pour les agences',
      title: 'Gère 20 clients sans 20 dashboards.',
      tagline: 'Agences marketing, équipes performance.',
      hero:
        "Tu diriges une agence marketing. Tu as 5 à 50 clients, chacun avec ses GA4, Meta Ads, Google Ads, Stripe, GSC. Ta taxe de reporting mensuelle se compte en jours, pas en heures. SmartAnalyst est conçu pour cette forme de travail.",
      pains: [
        { title: 'Des logins partout', body: "Tu jongles entre 20+ écrans de connexion pour assembler un seul rapport client. La moitié des captures est dépassée au moment où tu livres les slides." },
        { title: 'Les rapports prennent plus de temps que le boulot', body: "1-2 jours par mois par client × 10 clients = presque une semaine juste à packager de la donnée. Ton équipe préférerait optimiser les campagnes." },
        { title: 'Les questions clients prennent du temps', body: "Le client t’écrit mardi : « pourquoi le CAC a explosé la semaine dernière ? ». Tu ouvres 4 onglets, tu construis une histoire, tu envoies mercredi. La réponse aurait dû prendre 90 secondes." },
        { title: 'Les juniors ne peuvent pas self-serve', body: "Les analystes seniors répondent aux 10 mêmes questions chaque semaine parce que les juniors n’ont pas la fluidité cross-source pour le faire seuls." },
      ],
      h2_solution: 'Comment SmartAnalyst résout ça',
      solution: [
        { title: 'Un workspace par client', body: "Tenants isolés (RLS) mais switchables en 1 clic. Connecteurs, branding, destinataires par client." },
        { title: 'Rapports auto-envoyés le 1ᵉʳ', body: "PDFs mensuels avec résumé exécutif, KPIs, breakdowns par canal, recommandations. Brandés à ton agence." },
        { title: 'L’IA conversationnelle = juniors autonomes', body: "« Pourquoi le CAC a explosé sur le compte Y ? » → réponse structurée en 5s. Les juniors se débloquent sans solliciter les seniors." },
        { title: 'Insights proactifs hebdo', body: "Email lundi matin par workspace + un digest cross-portefeuille pour le boss d’agence — qui mérite ton attention cette semaine, qui performe sans bruit." },
      ],
      h2_workflow: 'Une semaine type',
      workflow: [
        "Lundi 8h — email insights proactifs. 3 portefeuilles clients flagués.",
        "Lundi 9h — ouvre le chat sur le client A : « qu’est-ce qui pèse sur la conversion ? ». Réponse en 10 secondes. Brief à l’account lead.",
        "Mardi — le client B demande une comparaison Q3 vs Q2. Tu la construis en 1 question.",
        "Mercredi-vendredi — exécute les optimisations. Ton équipe ne passe plus des heures à monter des rapports.",
        "1ᵉʳ du mois — les PDFs mensuels partent automatiquement à 7h vers chaque client. Tu ajoutes un mot perso à quelques-uns.",
      ],
      cta_title: 'Construit pour la forme de travail d’une agence.',
      cta_body: 'Essai 14 jours, toutes features, sans carte. Ajoute 5 clients dès le 1ᵉʳ jour.',
    },
  },
  {
    slug: 'freelance',
    icon: '◐',
    en: {
      kicker: 'For freelancers',
      title: 'Be your own analytics department.',
      tagline: 'Solo marketing freelancers managing their own performance.',
      hero:
        "You're a freelance marketer with 2-5 clients. You bill for strategy and execution, not for assembling charts. SmartAnalyst gives you a senior analyst on tap so you can spend your billable hours where they matter.",
      pains: [
        { title: 'Your time = your revenue', body: "Every hour you spend in dashboards is an hour you can't bill or sell. Manual reporting silently eats your margin." },
        { title: 'Clients want monthly reports', body: "They want a PDF with charts and a story by the 5th of every month. Producing that takes you a day. Without it, you look unprofessional." },
        { title: 'You don\'t have a senior to ping', body: "When something looks off, there's no one to gut-check with. You either dig in for 2 hours or ship the question to the client (which doesn't look great)." },
      ],
      h2_solution: 'How SmartAnalyst helps',
      solution: [
        { title: 'Reports without the report-building', body: "Monthly PDFs auto-generated on the 1st. You add a 3-line note and forward. Total time: 5 minutes per client." },
        { title: 'The senior you wished you had', body: "Open the chat. Type the question. Get the answer with sourced numbers. No more burning a Thursday afternoon on « why is this metric weird »." },
        { title: 'Looks like a team of 3', body: "Branded reports + weekly insights = the deliverable cadence of a small agency, run by you alone." },
      ],
      h2_workflow: 'A typical month',
      workflow: [
        "1st — monthly PDFs go out to your 3 clients. You add a personal paragraph to each. 15 minutes total.",
        "Monday mornings — proactive insights tell you which client to look at first this week.",
        "Mid-month — client asks a one-off: « how did the new campaign do? ». You answer from the chat, paste the screenshot into Slack.",
        "End of month — invoices go out. You spent 1 day on reporting this month, not 5.",
      ],
      cta_title: 'Bill for outcomes. Not for charts.',
      cta_body: 'Starter plan is built around the solo freelancer workflow.',
    },
    fr: {
      kicker: 'Pour les freelances',
      title: 'Sois ton propre service analytics.',
      tagline: 'Freelances marketing solo qui gèrent leur propre performance.',
      hero:
        "Tu es freelance marketing avec 2 à 5 clients. Tu factures la stratégie et l’exécution, pas l’assemblage de graphiques. SmartAnalyst te donne un analyste senior à portée de main pour que tes heures facturables aillent là où ça compte.",
      pains: [
        { title: 'Ton temps = ton revenu', body: "Chaque heure passée dans les dashboards est une heure que tu ne peux pas facturer ni vendre. Le reporting manuel grignote ta marge en silence." },
        { title: 'Les clients veulent des rapports mensuels', body: "Ils veulent un PDF avec graphes et histoire le 5 de chaque mois. Le produire te prend 1 jour. Sans ça, tu fais amateur." },
        { title: 'Tu n’as pas de senior à pinger', body: "Quand un truc semble bizarre, personne pour gut-checker. Soit tu creuses 2 heures, soit tu renvoies la question au client (pas top)." },
      ],
      h2_solution: 'Comment SmartAnalyst aide',
      solution: [
        { title: 'Les rapports sans la fabrication', body: "PDFs mensuels auto-générés le 1ᵉʳ. Tu ajoutes 3 lignes et tu transfères. Total : 5 minutes par client." },
        { title: 'Le senior que tu n’as jamais eu', body: "Ouvre le chat. Tape la question. Reçois la réponse avec chiffres sourcés. Fini les jeudis après-midi cramés sur « pourquoi cette métrique est bizarre »." },
        { title: 'Tu as l’air d’une équipe de 3', body: "Rapports brandés + insights hebdo = la cadence de livrables d’une petite agence, opérée par toi seul." },
      ],
      h2_workflow: 'Un mois type',
      workflow: [
        "1ᵉʳ — les PDFs mensuels partent vers tes 3 clients. Tu ajoutes un paragraphe perso à chacun. 15 minutes au total.",
        "Lundi matin — l’insight proactif te dit quel client regarder en premier cette semaine.",
        "Mi-mois — un client te pose une question : « comment a marché la nouvelle campagne ? ». Tu réponds depuis le chat, capture dans Slack.",
        "Fin de mois — les factures partent. Tu as passé 1 jour sur le reporting ce mois-ci, pas 5.",
      ],
      cta_title: 'Facture les résultats. Pas les graphes.',
      cta_body: 'Le plan Starter est conçu pour le workflow freelance solo.',
    },
  },
  {
    slug: 'founder',
    icon: '◯',
    en: {
      kicker: 'For founders',
      title: 'Marketing data, without a data team.',
      tagline: 'Startup & SMB founders running marketing themselves.',
      hero:
        "You're a founder. You're running marketing because you have to, not because you have a data team. SmartAnalyst gives you the answers you'd get from a senior analyst, without the headcount.",
      pains: [
        { title: 'Dashboards are for analysts', body: "GA4, Looker, Mixpanel — built for full-time analysts. You don't have time to learn another tool. You just need the answer." },
        { title: 'Investor updates take half a day', body: "Pulling MRR, CAC, churn, growth rate from 3 different tools every month. Always at 11pm the night before the update is due." },
        { title: 'You ship blind', body: "Without insights you trust, you keep launching campaigns and hoping. The « did that work? » question gets answered late, if at all." },
      ],
      h2_solution: 'How SmartAnalyst helps',
      solution: [
        { title: 'Plain-language questions', body: "« What's my CAC this month? » « How did the email campaign perform? » Type, hit enter, get the answer. No SQL, no metric picker, no analyst." },
        { title: 'Monthly investor-ready summary', body: "Auto-generated exec summary covering MRR, CAC, CVR, ad spend, top channels. Paste into your investor update. 10 minutes instead of half a day." },
        { title: 'Weekly insights = you stay shipping', body: "Monday morning email tells you what's working, what's drifting, what to consider. You stay in execution mode the rest of the week." },
      ],
      h2_workflow: 'A typical month',
      workflow: [
        "1st — monthly summary lands in your inbox. You paste the MRR / CAC / growth lines into your investor update template.",
        "Mondays — proactive insights tell you which channel needs attention this week.",
        "Mid-month — pre-board call: ask the chat « what changed since last meeting? ». Talk track ready in 5 minutes.",
        "End of month — instead of pulling all-nighters, you focused on shipping.",
      ],
      cta_title: 'Get the analyst without the headcount.',
      cta_body: 'Starter plan covers a founder running marketing solo.',
    },
    fr: {
      kicker: 'Pour les fondateurs',
      title: 'Données marketing, sans équipe data.',
      tagline: 'Fondateurs de startup et PME qui font le marketing eux-mêmes.',
      hero:
        "Tu es fondateur. Tu fais le marketing parce qu’il le faut, pas parce que tu as une équipe data. SmartAnalyst te donne les réponses qu’un analyste senior te donnerait, sans le headcount.",
      pains: [
        { title: 'Les dashboards sont faits pour les analystes', body: "GA4, Looker, Mixpanel — pensés pour des analystes plein temps. Tu n’as pas le temps d’apprendre un outil de plus. Tu veux juste la réponse." },
        { title: 'Les updates investisseurs prennent une demi-journée', body: "Extraire MRR, CAC, churn, taux de croissance de 3 outils différents chaque mois. Toujours à 23h la veille de l’update." },
        { title: 'Tu shippes à l’aveugle', body: "Sans insights fiables, tu lances des campagnes en espérant. La question « est-ce que ça a marché ? » se répond tard, voire jamais." },
      ],
      h2_solution: 'Comment SmartAnalyst aide',
      solution: [
        { title: 'Questions en langage naturel', body: "« Quel est mon CAC ce mois-ci ? » « Comment a performé la campagne email ? » Tape, entrée, réponse. Pas de SQL, pas de sélecteur de métriques, pas d’analyste." },
        { title: 'Résumé mensuel prêt pour les investisseurs', body: "Résumé exécutif auto-généré couvrant MRR, CAC, CVR, dépense pub, top canaux. Colle dans ton update investisseurs. 10 minutes au lieu d’une demi-journée." },
        { title: 'Insights hebdo = tu restes en exécution', body: "Email du lundi matin qui te dit ce qui marche, ce qui dérive, ce à quoi penser. Tu restes en mode shipping le reste de la semaine." },
      ],
      h2_workflow: 'Un mois type',
      workflow: [
        "1ᵉʳ — le résumé mensuel arrive dans ta boîte. Tu colles les lignes MRR / CAC / croissance dans ton template d’update investisseurs.",
        "Lundis — l’insight proactif te dit quel canal mérite ton attention cette semaine.",
        "Mi-mois — call board imminent : demande au chat « qu’est-ce qui a changé depuis la dernière réunion ? ». Talk track prêt en 5 minutes.",
        "Fin de mois — au lieu de nuits blanches, tu as focus sur le shipping.",
      ],
      cta_title: 'Récupère l’analyste sans le headcount.',
      cta_body: 'Le plan Starter couvre un fondateur qui fait le marketing solo.',
    },
  },
]

export const USE_CASES_BY_SLUG = Object.fromEntries(USE_CASES.map((u) => [u.slug, u]))
