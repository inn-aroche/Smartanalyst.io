// Flat dictionary of all user-facing strings, EN + FR.
// `fr` is typed `typeof en` so a missing translation is a compile error.
// Keep keys grouped by prefix (login., dashboard., …) for readability.

const en = {
  // ━━━ Common ━━━
  'common.signOut': 'Sign out',
  'common.email': 'Email',
  'common.password': 'Password',
  'common.you': 'You',
  'common.or': 'or',
  'common.loading': 'Loading…',
  'common.back': 'Back',
  'common.backToSite': 'Back to smartanalyst.io',

  // ━━━ Nav / layout ━━━
  'nav.workspace': 'Workspace',
  'nav.noWorkspace': 'No workspace',
  'nav.dashboard': 'Dashboard',
  'nav.live': 'Smart tag',
  'nav.connectors': 'Connectors',
  'nav.chat': 'Chat',

  // ━━━ Chat ━━━
  'chat.kicker': 'Ask SmartAnalyst',
  'chat.title': 'What do you want to know?',
  'chat.placeholder': 'e.g. Why did Meta CVR drop yesterday?',
  'chat.send': 'Send',
  'chat.thinking': 'Thinking…',
  'chat.emptyState': 'Ask anything about your marketing performance. The first connectors and metric integration are coming — for now SmartAnalyst answers from general marketing knowledge.',
  'chat.suggestions': 'Try',
  'chat.suggestion1': 'How do you compute a blended CAC?',
  'chat.suggestion2': 'What is a healthy LTV/CAC ratio for a SaaS?',
  'chat.suggestion3': 'How do I detect Meta Ads creative fatigue?',
  'chat.error': 'Something went wrong. Try again.',
  'chat.you': 'You',
  'chat.assistant': 'SmartAnalyst',
  'chatWidget.open': 'Open AI assistant',
  'chatWidget.close': 'Close',
  'chatWidget.title': 'Ask SmartAnalyst',
  'chatWidget.greeting': 'Ask me anything about your marketing, your data, or your audit.',
  'nav.reports': 'Reports',
  'nav.files': 'Files',
  'nav.settings': 'Settings',
  'nav.soon': 'soon',

  // ━━━ Locale switcher ━━━
  'locale.label': 'Language',
  'locale.english': 'English',
  'locale.french': 'Français',

  // ━━━ Login ━━━
  'login.welcomeBack': 'Welcome back.',
  'login.subtitle': 'Sign in to your SmartAnalyst workspace.',
  'login.emailPlaceholder': 'you@company.com',
  'login.passwordPlaceholder': '••••••••••••',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.somethingWentWrong': 'Something went wrong',
  'login.newToSmartAnalyst': 'New to SmartAnalyst?',
  'login.createAccount': 'Create an account',
  'login.googleButton': 'Continue with Google',
  'login.googleRedirecting': 'Redirecting…',
  'login.googleStartError': 'Could not start Google sign-in',

  // ━━━ Signup ━━━
  'signup.title': 'Create your workspace.',
  'signup.subtitle': 'Get started in under a minute.',
  'signup.organizationName': 'Organization name',
  'signup.organizationPlaceholder': 'Acme Inc.',
  'signup.workEmail': 'Work email',
  'signup.passwordPlaceholder': 'At least 12 characters',
  'signup.passwordHint': '12+ characters. Use a passphrase you’ll remember.',
  'signup.submit': 'Create account',
  'signup.submitting': 'Creating account…',
  'signup.alreadyHaveAccount': 'Already have an account?',
  'signup.signIn': 'Sign in',
  'signup.googleButton': 'Sign up with Google',

  // ━━━ Auth callback ━━━
  'callback.signingIn': 'Signing you in…',
  'callback.oneSec': 'One sec.',
  'callback.failedTitle': 'Google sign-in failed',
  'callback.backToLogin': 'Back to sign-in',
  'callback.err.accessDenied': 'You denied access to Google.',
  'callback.err.notConfigured':
    'Google sign-in isn’t enabled on the server yet.',
  'callback.err.codeExchange': 'Google rejected the authorization code. Try again.',
  'callback.err.supabase':
    'Supabase rejected the Google session. Check that the provider is enabled.',
  'callback.err.stateInvalid':
    'The link expired. Try again from the sign-in page.',
  'callback.err.stateMissing': 'Invalid link. Try again.',
  'callback.err.missingCodeOrState': 'Invalid Google response. Try again.',
  'callback.err.missingResponse': 'Missing response.',
  'callback.err.incompleteResponse': 'Incomplete response. Try again.',
  'callback.err.malformed': 'Malformed response.',
  'callback.err.generic': 'Google error: {{code}}',

  // ━━━ Dashboard ━━━
  'dashboard.overview': 'Overview',
  'dashboard.greetingNamed': 'Hey {{name}}, here’s what changed.',
  'dashboard.greeting': 'Hey there, here’s what changed.',
  'dashboard.window.7d': '7d',
  'dashboard.window.30d': '30d',
  'dashboard.window.90d': '90d',
  'dashboard.emptyConnectorsTitle': 'Connect a data source to start.',
  'dashboard.emptyConnectorsBody':
    'Plug GA4, Meta Ads or Stripe in 2 clicks. We’ll begin syncing the last 90 days so your dashboard fills up automatically.',
  'dashboard.addConnector': 'Add a connector →',
  'dashboard.couldNotLoad': 'Could not load metrics. {{message}}',
  'dashboard.tile.syncing': 'Syncing…',
  'dashboard.tile.noData': 'No data yet',
  'dashboard.tile.noBaseline': 'vs. previous: no baseline',
  'dashboard.tile.vsPrevious': 'vs. previous period',
  'dashboard.next.01.title': 'Connect more sources',
  'dashboard.next.01.body':
    'The more data you connect, the sharper the AI’s cross-source insights become.',
  'dashboard.next.01.cta': 'Open connectors',
  'dashboard.next.02.title': 'Ask your first question',
  'dashboard.next.02.body':
    'Try “What changed this week?” or “Why did CVR drop yesterday?”.',
  'dashboard.next.02.cta': 'Open chat',
  'dashboard.next.03.title': 'Schedule a weekly report',
  'dashboard.next.03.body':
    'Auto-generated PDF, sent every Monday with an exec summary.',
  'dashboard.next.03.cta': 'Configure',
  'dashboard.tile.sessions': 'Sessions',
  'dashboard.tile.conversions': 'Conversions',
  'dashboard.tile.revenue': 'Revenue',
  'dashboard.tile.adSpend': 'Ad spend',

  // ━━━ Connectors ━━━
  'connectors.kicker': 'Integrations',
  'connectors.title': 'Connect your data sources.',
  'connectors.subtitle':
    '{{available}} live · {{soon}} on the roadmap. Don’t see yours?',
  'connectors.tellUs': 'Tell us',
  'connectors.searchPlaceholder': 'Search integrations…',
  'connectors.category.all': 'All',
  'connectors.category.Analytics': 'Analytics',
  'connectors.category.Advertising': 'Advertising',
  'connectors.category.Payments': 'Payments',
  'connectors.category.CRM': 'CRM',
  'connectors.category.Email & SMS': 'Email & SMS',
  'connectors.category.Ecommerce': 'Ecommerce',
  'connectors.category.Product & Events': 'Product & Events',
  'connectors.category.SEO': 'SEO',
  'connectors.category.Social': 'Social',
  'connectors.category.Support': 'Support',
  'connectors.category.Data warehouse': 'Data warehouse',
  'connectors.category.Spreadsheet & Files': 'Spreadsheet & Files',
  'connectors.section.available': 'Available',
  'connectors.section.soon': 'Coming soon',
  'connectors.emptyResults': 'No integration matches your search.',
  'connectors.badge.connected': 'Connected',
  'connectors.badge.soon': 'Soon',
  'connectors.auth.oauth': 'OAuth',
  'connectors.auth.apiKey': 'API key',
  'connectors.action.connect': 'Connect',
  'connectors.action.opening': 'Opening…',
  'connectors.action.cancel': 'Cancel',
  'connectors.action.disconnect': 'Disconnect',
  'connectors.action.disconnecting': 'Disconnecting…',
  'connectors.action.notifyMe': 'Notify me',
  'connectors.confirmDisconnect': 'Disconnect {{name}}?',
  'connectors.err.startOauth': 'Could not start the OAuth flow',
  'connectors.err.disconnect': 'Could not disconnect',
  'connectors.apikey.label': 'Paste your {{name}} API key',
  'connectors.apikey.save': 'Connect',
  'connectors.apikey.saving': 'Connecting…',
  'connectors.loading': 'Loading the catalog…',
  'connectors.badge.notConfigured': 'OAuth app not configured yet on our side.',
  'connectors.subdomain.label': 'Your Shopify store',

  // ━━━ Live (SmartTag real-time dashboard) ━━━
  'live.kicker': 'Smart tag',
  'live.title': 'What\'s happening on your site, right now.',
  'live.subtitle': 'Events streamed live from your SmartAnalyst tag. No storage in the free tier — refresh resets the view.',
  'live.stat.activeSessions': 'Active sessions',
  'live.stat.pageviews': 'Pageviews',
  'live.stat.clicks': 'Clicks',
  'live.stat.errors': 'Errors',
  'live.recentEvents': 'Recent events',
  'live.windowHint': 'Last 5 minutes',
  'live.empty': 'No events yet — install the tag on your site to start streaming.',
  'live.connecting': 'Connecting to the stream…',
  'live.conn.connecting': 'Connecting',
  'live.conn.connected': 'Live',
  'live.conn.disconnected': 'Disconnected',
  'live.conn.error': 'Connection error',
  'live.conn.unauthorized': 'Unauthorized',
  'live.err.unauthorized': 'Your session does not have access to this workspace\'s live stream.',
  'live.eventType.pageview': 'view',
  'live.eventType.click': 'click',
  'live.eventType.error': 'error',
  'live.eventType.session_start': 'session',
  'live.eventType.custom': 'event',
  'live.install.title': 'Install your SmartTag',
  'live.install.subtitle':
    'Paste this snippet in your site\'s <head> to start receiving events here.',
  'live.install.cta.guide': 'Full install guide',
  'live.install.cta.scroll': 'See events ↓',
  'live.install.cta.audit': 'Audit my site',

  // ━━━ Smart tag onboarding (no events received yet) ━━━
  'live.onboarding.kicker': 'Smart tag setup',
  'live.onboarding.title': 'Active your Smart tag in 3 minutes',
  'live.onboarding.subtitle':
    'One snippet to paste in your site. Real-time analytics, on-demand SEO/GEO audits, zero cookies.',
  'live.onboarding.why.title': 'What the Smart tag gives you',
  'live.onboarding.why.analytics.title': 'Real-time analytics',
  'live.onboarding.why.analytics.body':
    'Pageviews, clicks, errors streaming live — see your traffic as it happens, not the day after.',
  'live.onboarding.why.audit.title': 'On-demand SEO + GEO audit',
  'live.onboarding.why.audit.body':
    'Run a 4-axis audit (SEO, AI search, perf, citation-worthiness) from any page in 30 seconds.',
  'live.onboarding.why.privacy.title': 'No cookie, GDPR-friendly',
  'live.onboarding.why.privacy.body':
    'No cookie banner required. Session ID lives in sessionStorage — cleared at tab close. CNIL-compatible.',
  'live.onboarding.step1.title': 'Copy your snippet',
  'live.onboarding.step1.body':
    'It\'s pre-filled with your workspace write key. Just copy it.',
  'live.onboarding.step2.title': 'Paste it in your <head>',
  'live.onboarding.step2.body':
    'On every page you want to track (or in your shared layout / template). WordPress, Shopify, Webflow, Ghost — see the full guide for step-by-step.',
  'live.onboarding.step2.cta': 'CMS-specific install guide',
  'live.onboarding.step3.title': 'Verify it\'s working',
  'live.onboarding.step3.body':
    'Once installed, open your site in another tab and click around. Then come back here and hit "Test install" — we\'ll detect the first event live.',
  'live.onboarding.step3.button': 'Test install',
  'live.onboarding.step3.checking': 'Listening for events… (up to 30 seconds)',
  'live.onboarding.step3.success': 'Tag detected — redirecting to your dashboard',
  'live.onboarding.step3.timeout':
    'No event received in 30 seconds. Check that the snippet is in your <head> and that you opened your site in another tab.',
  'live.onboarding.step3.retry': 'Retry',

  // ━━━ Settings ━━━
  'settings.kicker': 'Settings',
  'settings.title': 'Account & workspace.',
  'settings.section.profile': 'Profile',
  'settings.section.workspace': 'Workspace',
  'settings.section.security': 'Security',
  'settings.section.session': 'Session',
  'settings.section.language': 'Language',
  'settings.section.dangerZone': 'Danger zone',
  'settings.field.fullName': 'Full name',
  'settings.field.userId': 'User ID',
  'settings.field.workspaceName': 'Name',
  'settings.field.workspaceId': 'Workspace ID',
  'settings.field.yourRole': 'Your role',
  'settings.password.title': 'Password',
  'settings.password.body':
    'Reset your password via the email flow. We’ll send you a magic link.',
  'settings.password.button': 'Reset password',
  'settings.signOut.title': 'Sign out everywhere',
  'settings.signOut.body': 'End this session and invalidate the refresh token.',
  'settings.delete.title': 'Delete workspace',
  'settings.delete.body':
    'Permanently remove this workspace and all its data. This can’t be undone.',
  'settings.delete.button': 'Delete',
  'settings.language.body':
    'Change the language of the interface. Your choice is saved on this device.',
  'settings.section.tracking': 'Tracking — SmartTag',

  // ━━━ Tracking (SmartTag block inside Settings) ━━━
  'tracking.writeKey.label': 'Write key',
  'tracking.writeKey.body':
    'Used by the tracking snippet to identify your workspace. Public-safe — can be exposed in client-side code.',
  'tracking.snippet.title': 'Install snippet',
  'tracking.snippet.body':
    'Paste this in the <head> of every page you want to track. 1.5 KB gzipped, async, zero cookies.',
  'tracking.cta.viewInstall': 'Full install guide',
  'tracking.cta.viewLive': 'See live events',
  'common.copy': 'Copy',
  'common.copied': 'Copied',

  // ━━━ Live polish (filters + sparkline) ━━━
  'live.filter.all': 'All',
  'live.filter.pageview': 'Pageviews',
  'live.filter.click': 'Clicks',
  'live.filter.error': 'Errors',
  'live.filter.session_start': 'Sessions',
  'live.filter.custom': 'Custom',
  'live.chart.title': 'Pageviews per minute',
  'live.chart.empty': 'Waiting for data…',

  // ━━━ Install guide page (/tracking/install) ━━━
  'install.kicker': 'Installation',
  'install.title': 'Install your tracking tag in 3 steps.',
  'install.subtitle':
    'Takes 2 minutes. Works with any CMS — WordPress, Shopify, Webflow, Ghost, or plain HTML.',
  'install.step1.title': '1. Copy your snippet',
  'install.step1.body':
    "It's already filled with your workspace write key. Just copy it.",
  'install.step2.title': "2. Paste it in your site's <head>",
  'install.step2.body': 'Pick your platform for the exact instructions:',
  'install.step2.tab.html': 'Plain HTML',
  'install.step2.tab.wordpress': 'WordPress',
  'install.step2.tab.shopify': 'Shopify',
  'install.step2.tab.webflow': 'Webflow',
  'install.step2.tab.ghost': 'Ghost',
  'install.step2.html.body':
    'Open your site files and paste the snippet just before </head> on every page (or in your shared template / layout file).',
  'install.step2.wordpress.body':
    'WordPress admin → Appearance → Theme File Editor → header.php → paste just before </head>. Or use the free plugin "Insert Headers and Footers": Settings → Insert Headers and Footers → paste in the "Scripts in Header" field.',
  'install.step2.shopify.body':
    'Shopify admin → Online Store → Themes → Actions → Edit code → Layout → theme.liquid → paste just before </head>. Click Save.',
  'install.step2.webflow.body':
    'Webflow → Project Settings → Custom Code → Head Code → paste the snippet → Save → re-publish your site.',
  'install.step2.ghost.body':
    'Ghost admin → Settings → Code injection → Site Header → paste the snippet → Save.',
  'install.step3.title': "3. Verify it's working",
  'install.step3.body':
    'Open your site in a new tab and click around. Then come back here and open the Live page — events should stream in within seconds.',
  'install.step3.cta': 'Open Live page',
  'install.faq.title': 'Frequently asked questions',
  'install.faq.q1': 'Do I need a cookie banner?',
  'install.faq.a1':
    "No. Events are tied to a session ID kept in sessionStorage (cleared when the tab closes). The tag sets no cookies, doesn't track across sessions or sites, and doesn't require consent for analytics under CNIL / PECR guidance. If you also load Google Analytics or Meta Pixel, those still need consent.",
  'install.faq.q2': 'Will it slow down my site?',
  'install.faq.a2':
    'The script is async (non-blocking) and 1.5 KB gzipped — smaller than a favicon. Events are sent via navigator.sendBeacon to never delay page unload. Zero impact on Core Web Vitals.',
  'install.faq.q3': 'What data is collected?',
  'install.faq.a3':
    'Page URLs (path + query keys only, no values), referrer origin only, click selectors (no text content), and any custom events you send via Smartanalyst("track", ...). Emails and phone numbers in custom properties are stripped server-side as a safety net.',
  'install.faq.q4': 'Can I send custom events?',
  'install.faq.a4':
    'Yes — Smartanalyst("track", "signup_completed", { plan: "pro" }). Property values must be strings, numbers, or booleans. Max 20 per event, strings truncated to 200 chars.',
  'install.faq.q5': 'How do I disable auto-pageviews (SPA)?',
  'install.faq.a5':
    'Pass disableAutoPageview: true to Smartanalyst("init", { ... }), then call Smartanalyst("page") manually after each route change.',

  // ━━━ Audit (SEO / GEO on-demand) ━━━
  'nav.audit': 'Audit',
  'audit.kicker': 'Audit',
  'audit.title': 'Audit your site in 5 seconds.',
  'audit.subtitle':
    'SEO + GEO (AI search readiness) + Performance (Core Web Vitals) + AI scoring (Claude evaluates citation-worthiness). 30+ checks in under 30 seconds.',
  'audit.form.url.label': 'URL to audit',
  'audit.form.url.placeholder': 'https://your-site.com',
  'audit.form.run': 'Run audit',
  'audit.form.running': 'Auditing…',
  'audit.form.runningHint': 'Loading the page and analyzing — takes 5 to 10 seconds.',
  'audit.score.label': 'Overall score',
  'audit.score.outOf': '/ 100',
  'audit.summary.pass': 'Pass',
  'audit.summary.warn': 'Warnings',
  'audit.summary.fail': 'Fails',
  'audit.summary.info': 'Info',
  'audit.section.seo': 'SEO findings',
  'audit.section.geo': 'GEO findings (AI search visibility)',
  'audit.section.perf': 'Performance (Core Web Vitals)',
  'audit.section.ai': 'AI readiness (citation by LLMs)',
  'audit.subscore.seo': 'SEO',
  'audit.subscore.geo': 'GEO',
  'audit.subscore.perf': 'Perf',
  'audit.subscore.ai': 'AI',
  'audit.cwv.title': 'Core Web Vitals',
  'audit.severity.pass': 'OK',
  'audit.severity.warn': 'Warn',
  'audit.severity.fail': 'Fail',
  'audit.severity.info': 'Info',
  'audit.findings.recommendation': 'Recommendation',
  'audit.history.title': 'Recent audits',
  'audit.history.empty': 'No audit yet — run your first one above.',
  'audit.history.open': 'Open',
  'audit.error.invalid_url': 'This URL doesn\'t look valid. Use https://example.com.',
  'audit.error.scrape_failed':
    'We couldn\'t reach the site (timeout, DNS, or SSL error). Check the URL and try again.',
  'audit.error.generic': 'Something went wrong running the audit. Try again.',
  'audit.finalUrl': 'Final URL after redirects',
  'audit.httpStatus': 'HTTP status',
} as const

const fr: Record<keyof typeof en, string> = {
  // ━━━ Common ━━━
  'common.signOut': 'Se déconnecter',
  'common.email': 'Email',
  'common.password': 'Mot de passe',
  'common.you': 'Toi',
  'common.or': 'ou',
  'common.loading': 'Chargement…',
  'common.back': 'Retour',
  'common.backToSite': 'Retour sur smartanalyst.io',

  // ━━━ Nav / layout ━━━
  'nav.workspace': 'Espace',
  'nav.noWorkspace': 'Aucun espace',
  'nav.dashboard': 'Tableau de bord',
  'nav.live': 'Smart tag',
  'nav.connectors': 'Connecteurs',
  'nav.chat': 'Chat',

  // ━━━ Chat ━━━
  'chat.kicker': 'Demande à SmartAnalyst',
  'chat.title': 'Que veux-tu savoir ?',
  'chat.placeholder': 'ex : Pourquoi le CVR Meta a chuté hier ?',
  'chat.send': 'Envoyer',
  'chat.thinking': 'Réflexion…',
  'chat.emptyState': 'Pose n’importe quelle question sur ta performance marketing. Les premiers connecteurs + intégration métriques arrivent — pour l’instant SmartAnalyst répond à partir de ses connaissances marketing générales.',
  'chat.suggestions': 'Essaie',
  'chat.suggestion1': 'Comment on calcule un CAC blended ?',
  'chat.suggestion2': 'Quel ratio LTV/CAC sain pour un SaaS ?',
  'chat.suggestion3': 'Comment détecter une fatigue créative Meta ?',
  'chat.error': 'Quelque chose a planté. Réessaie.',
  'chat.you': 'Toi',
  'chat.assistant': 'SmartAnalyst',
  'chatWidget.open': 'Ouvrir l’assistant IA',
  'chatWidget.close': 'Fermer',
  'chatWidget.title': 'Demande à SmartAnalyst',
  'chatWidget.greeting': 'Pose-moi une question sur ton marketing, tes données, ou ton audit.',
  'nav.reports': 'Rapports',
  'nav.files': 'Fichiers',
  'nav.settings': 'Paramètres',
  'nav.soon': 'bientôt',

  // ━━━ Locale switcher ━━━
  'locale.label': 'Langue',
  'locale.english': 'English',
  'locale.french': 'Français',

  // ━━━ Login ━━━
  'login.welcomeBack': 'Bon retour.',
  'login.subtitle': 'Connecte-toi à ton espace SmartAnalyst.',
  'login.emailPlaceholder': 'toi@entreprise.com',
  'login.passwordPlaceholder': '••••••••••••',
  'login.submit': 'Se connecter',
  'login.submitting': 'Connexion…',
  'login.somethingWentWrong': 'Une erreur est survenue',
  'login.newToSmartAnalyst': 'Nouveau sur SmartAnalyst ?',
  'login.createAccount': 'Créer un compte',
  'login.googleButton': 'Continuer avec Google',
  'login.googleRedirecting': 'Redirection…',
  'login.googleStartError': 'Impossible de démarrer la connexion Google',

  // ━━━ Signup ━━━
  'signup.title': 'Crée ton espace de travail.',
  'signup.subtitle': 'Prêt en moins d’une minute.',
  'signup.organizationName': 'Nom de ton organisation',
  'signup.organizationPlaceholder': 'Acme SAS',
  'signup.workEmail': 'Email pro',
  'signup.passwordPlaceholder': 'Au moins 12 caractères',
  'signup.passwordHint':
    '12 caractères minimum. Une passphrase facile à retenir, c’est parfait.',
  'signup.submit': 'Créer le compte',
  'signup.submitting': 'Création…',
  'signup.alreadyHaveAccount': 'Déjà un compte ?',
  'signup.signIn': 'Se connecter',
  'signup.googleButton': 'S’inscrire avec Google',

  // ━━━ Auth callback ━━━
  'callback.signingIn': 'Connexion en cours…',
  'callback.oneSec': 'Une seconde.',
  'callback.failedTitle': 'Connexion Google échouée',
  'callback.backToLogin': 'Retour à la connexion',
  'callback.err.accessDenied': 'Tu as refusé l’accès Google.',
  'callback.err.notConfigured':
    'La connexion Google n’est pas encore activée côté serveur.',
  'callback.err.codeExchange':
    'Google a refusé le code d’autorisation. Réessaie.',
  'callback.err.supabase':
    'Supabase a refusé la session Google. Vérifie que le provider est activé.',
  'callback.err.stateInvalid':
    'Le lien a expiré. Réessaie depuis la page de connexion.',
  'callback.err.stateMissing': 'Lien invalide. Réessaie.',
  'callback.err.missingCodeOrState': 'Réponse Google invalide. Réessaie.',
  'callback.err.missingResponse': 'Réponse manquante.',
  'callback.err.incompleteResponse': 'Réponse incomplète. Réessaie.',
  'callback.err.malformed': 'Réponse mal formée.',
  'callback.err.generic': 'Erreur Google : {{code}}',

  // ━━━ Dashboard ━━━
  'dashboard.overview': 'Vue d’ensemble',
  'dashboard.greetingNamed':
    'Hello {{name}}, voici ce qui a changé.',
  'dashboard.greeting': 'Hello, voici ce qui a changé.',
  'dashboard.window.7d': '7j',
  'dashboard.window.30d': '30j',
  'dashboard.window.90d': '90j',
  'dashboard.emptyConnectorsTitle': 'Connecte une source pour démarrer.',
  'dashboard.emptyConnectorsBody':
    'Branche GA4, Meta Ads ou Stripe en 2 clics. On commence à synchroniser les 90 derniers jours pour remplir ton tableau de bord automatiquement.',
  'dashboard.addConnector': 'Ajouter un connecteur →',
  'dashboard.couldNotLoad':
    'Impossible de charger les métriques. {{message}}',
  'dashboard.tile.syncing': 'Synchronisation…',
  'dashboard.tile.noData': 'Pas encore de données',
  'dashboard.tile.noBaseline': 'vs précédent : pas de base de comparaison',
  'dashboard.tile.vsPrevious': 'vs période précédente',
  'dashboard.next.01.title': 'Connecte plus de sources',
  'dashboard.next.01.body':
    'Plus tu connectes de données, plus les insights cross-sources de l’IA deviennent précis.',
  'dashboard.next.01.cta': 'Ouvrir les connecteurs',
  'dashboard.next.02.title': 'Pose ta première question',
  'dashboard.next.02.body':
    'Essaie “Qu’est-ce qui a changé cette semaine ?” ou “Pourquoi le taux de conversion a chuté hier ?”.',
  'dashboard.next.02.cta': 'Ouvrir le chat',
  'dashboard.next.03.title': 'Planifie un rapport hebdo',
  'dashboard.next.03.body':
    'PDF généré automatiquement, envoyé chaque lundi avec un résumé exécutif.',
  'dashboard.next.03.cta': 'Configurer',
  'dashboard.tile.sessions': 'Sessions',
  'dashboard.tile.conversions': 'Conversions',
  'dashboard.tile.revenue': 'Revenus',
  'dashboard.tile.adSpend': 'Dépenses pub',

  // ━━━ Connectors ━━━
  'connectors.kicker': 'Intégrations',
  'connectors.title': 'Connecte tes sources de données.',
  'connectors.subtitle':
    '{{available}} disponibles · {{soon}} dans la roadmap. La tienne n’y est pas ?',
  'connectors.tellUs': 'Dis-le nous',
  'connectors.searchPlaceholder': 'Rechercher une intégration…',
  'connectors.category.all': 'Toutes',
  'connectors.category.Analytics': 'Analytics',
  'connectors.category.Advertising': 'Publicité',
  'connectors.category.Payments': 'Paiements',
  'connectors.category.CRM': 'CRM',
  'connectors.category.Email & SMS': 'Email & SMS',
  'connectors.category.Ecommerce': 'E-commerce',
  'connectors.category.Product & Events': 'Produit & Événements',
  'connectors.category.SEO': 'SEO',
  'connectors.category.Social': 'Social',
  'connectors.category.Support': 'Support',
  'connectors.category.Data warehouse': 'Data warehouse',
  'connectors.category.Spreadsheet & Files': 'Tableurs & Fichiers',
  'connectors.section.available': 'Disponibles',
  'connectors.section.soon': 'Bientôt',
  'connectors.emptyResults': 'Aucune intégration ne correspond à ta recherche.',
  'connectors.badge.connected': 'Connecté',
  'connectors.badge.soon': 'Bientôt',
  'connectors.auth.oauth': 'OAuth',
  'connectors.auth.apiKey': 'Clé API',
  'connectors.action.connect': 'Connecter',
  'connectors.action.opening': 'Ouverture…',
  'connectors.action.cancel': 'Annuler',
  'connectors.action.disconnect': 'Déconnecter',
  'connectors.action.disconnecting': 'Déconnexion…',
  'connectors.action.notifyMe': 'Me prévenir',
  'connectors.confirmDisconnect': 'Déconnecter {{name}} ?',
  'connectors.err.startOauth': 'Impossible de démarrer le flow OAuth',
  'connectors.err.disconnect': 'Impossible de déconnecter',
  'connectors.apikey.label': 'Colle ta clé API {{name}}',
  'connectors.apikey.save': 'Connecter',
  'connectors.apikey.saving': 'Connexion…',
  'connectors.loading': 'Chargement du catalogue…',
  'connectors.badge.notConfigured': 'App OAuth pas encore configurée côté SmartAnalyst.',
  'connectors.subdomain.label': 'Sous-domaine de ta boutique Shopify',

  // ━━━ Live (SmartTag temps-réel) ━━━
  'live.kicker': 'Smart tag',
  'live.title': 'Ce qui se passe sur ton site, maintenant.',
  'live.subtitle': 'Événements streamés en direct par ton tag SmartAnalyst. Pas de stockage en formule gratuite — un refresh remet à zéro.',
  'live.stat.activeSessions': 'Sessions actives',
  'live.stat.pageviews': 'Pages vues',
  'live.stat.clicks': 'Clics',
  'live.stat.errors': 'Erreurs',
  'live.recentEvents': 'Événements récents',
  'live.windowHint': 'Sur les 5 dernières minutes',
  'live.empty': 'Aucun événement — installe le tag sur ton site pour démarrer le stream.',
  'live.connecting': 'Connexion au flux…',
  'live.conn.connecting': 'Connexion',
  'live.conn.connected': 'En direct',
  'live.conn.disconnected': 'Déconnecté',
  'live.conn.error': 'Erreur de connexion',
  'live.conn.unauthorized': 'Non autorisé',
  'live.err.unauthorized': 'Ta session n\'a pas accès au flux temps-réel de cet espace.',
  'live.eventType.pageview': 'vue',
  'live.eventType.click': 'clic',
  'live.eventType.error': 'erreur',
  'live.eventType.session_start': 'session',
  'live.eventType.custom': 'événement',
  'live.install.title': 'Installe ton SmartTag',
  'live.install.subtitle':
    'Colle ce snippet dans le <head> de ton site pour recevoir des événements ici.',
  'live.install.cta.guide': 'Guide d’installation complet',
  'live.install.cta.scroll': 'Voir les events ↓',
  'live.install.cta.audit': 'Auditer mon site',

  // ━━━ Smart tag onboarding (aucun event reçu) ━━━
  'live.onboarding.kicker': 'Setup du Smart tag',
  'live.onboarding.title': 'Active ton Smart tag en 3 minutes',
  'live.onboarding.subtitle':
    'Un snippet à coller dans ton site. Analytics temps réel, audits SEO/GEO à la demande, zéro cookie.',
  'live.onboarding.why.title': 'Ce que le Smart tag te donne',
  'live.onboarding.why.analytics.title': 'Analytics temps réel',
  'live.onboarding.why.analytics.body':
    'Pages vues, clics, erreurs en direct — vois ton trafic au moment où il se passe, pas le lendemain.',
  'live.onboarding.why.audit.title': 'Audit SEO + GEO à la demande',
  'live.onboarding.why.audit.body':
    'Lance un audit 4 axes (SEO, recherche IA, perf, citabilité) sur n’importe quelle page en 30 secondes.',
  'live.onboarding.why.privacy.title': 'Sans cookie, RGPD-friendly',
  'live.onboarding.why.privacy.body':
    'Pas de bandeau cookies. ID de session en sessionStorage, effacé à la fermeture de l’onglet. Compatible CNIL.',
  'live.onboarding.step1.title': 'Copie ton snippet',
  'live.onboarding.step1.body':
    'Il est déjà rempli avec la clé d’écriture de ton espace. Tu n’as qu’à le copier.',
  'live.onboarding.step2.title': 'Colle-le dans le <head>',
  'live.onboarding.step2.body':
    'Sur chaque page à tracker (ou dans ton template / layout partagé). WordPress, Shopify, Webflow, Ghost — voir le guide pour les étapes exactes.',
  'live.onboarding.step2.cta': 'Guide d’installation par CMS',
  'live.onboarding.step3.title': 'Vérifie que ça marche',
  'live.onboarding.step3.body':
    'Une fois installé, ouvre ton site dans un autre onglet et navigue. Reviens ici et clique « Tester » — on détecte le 1er event en direct.',
  'live.onboarding.step3.button': 'Tester l’installation',
  'live.onboarding.step3.checking': 'Écoute des événements en cours… (jusqu’à 30 secondes)',
  'live.onboarding.step3.success': 'Tag détecté — redirection vers ton dashboard',
  'live.onboarding.step3.timeout':
    'Aucun event reçu après 30 secondes. Vérifie que le snippet est bien dans ton <head> et que tu as bien ouvert ton site dans un autre onglet.',
  'live.onboarding.step3.retry': 'Réessayer',

  // ━━━ Settings ━━━
  'settings.kicker': 'Paramètres',
  'settings.title': 'Compte & espace.',
  'settings.section.profile': 'Profil',
  'settings.section.workspace': 'Espace',
  'settings.section.security': 'Sécurité',
  'settings.section.session': 'Session',
  'settings.section.language': 'Langue',
  'settings.section.dangerZone': 'Zone dangereuse',
  'settings.field.fullName': 'Nom complet',
  'settings.field.userId': 'ID utilisateur',
  'settings.field.workspaceName': 'Nom',
  'settings.field.workspaceId': 'ID de l’espace',
  'settings.field.yourRole': 'Ton rôle',
  'settings.password.title': 'Mot de passe',
  'settings.password.body':
    'Réinitialise ton mot de passe par email. On t’envoie un lien magique.',
  'settings.password.button': 'Réinitialiser le mot de passe',
  'settings.signOut.title': 'Se déconnecter partout',
  'settings.signOut.body':
    'Termine cette session et invalide le refresh token.',
  'settings.delete.title': 'Supprimer l’espace',
  'settings.delete.body':
    'Supprime définitivement cet espace et toutes ses données. Action irréversible.',
  'settings.delete.button': 'Supprimer',
  'settings.language.body':
    'Change la langue de l’interface. Ton choix est gardé sur cet appareil.',
  'settings.section.tracking': 'Tracking — SmartTag',

  // ━━━ Tracking (bloc SmartTag dans Settings) ━━━
  'tracking.writeKey.label': 'Clé d’écriture',
  'tracking.writeKey.body':
    'Utilisée par le snippet de tracking pour identifier ton espace. Publique — peut être exposée côté client sans risque.',
  'tracking.snippet.title': 'Snippet à installer',
  'tracking.snippet.body':
    'Colle-le dans le <head> de chaque page à tracker. 1,5 Ko gzippé, asynchrone, zéro cookie.',
  'tracking.cta.viewInstall': 'Guide d’installation complet',
  'tracking.cta.viewLive': 'Voir le live',
  'common.copy': 'Copier',
  'common.copied': 'Copié',

  // ━━━ Live polish (filtres + sparkline) ━━━
  'live.filter.all': 'Tout',
  'live.filter.pageview': 'Vues',
  'live.filter.click': 'Clics',
  'live.filter.error': 'Erreurs',
  'live.filter.session_start': 'Sessions',
  'live.filter.custom': 'Custom',
  'live.chart.title': 'Pages vues par minute',
  'live.chart.empty': 'En attente de données…',

  // ━━━ Guide d’installation (/tracking/install) ━━━
  'install.kicker': 'Installation',
  'install.title': 'Installe ton tag en 3 étapes.',
  'install.subtitle':
    '2 minutes. Compatible avec n’importe quel CMS — WordPress, Shopify, Webflow, Ghost, ou HTML brut.',
  'install.step1.title': '1. Copie ton snippet',
  'install.step1.body':
    'Il est déjà rempli avec la clé d’écriture de ton espace. Tu n’as qu’à le copier.',
  'install.step2.title': '2. Colle-le dans le <head> de ton site',
  'install.step2.body': 'Choisis ta plateforme pour les instructions exactes :',
  'install.step2.tab.html': 'HTML brut',
  'install.step2.tab.wordpress': 'WordPress',
  'install.step2.tab.shopify': 'Shopify',
  'install.step2.tab.webflow': 'Webflow',
  'install.step2.tab.ghost': 'Ghost',
  'install.step2.html.body':
    'Ouvre les fichiers de ton site et colle le snippet juste avant </head> sur chaque page (ou dans ton template / layout partagé).',
  'install.step2.wordpress.body':
    'WordPress admin → Apparence → Éditeur de fichiers du thème → header.php → coller juste avant </head>. Ou via le plugin gratuit « Insert Headers and Footers » : Réglages → Insert Headers and Footers → champ « Scripts in Header ».',
  'install.step2.shopify.body':
    'Shopify admin → Boutique en ligne → Thèmes → Actions → Modifier le code → Layout → theme.liquid → coller juste avant </head>. Enregistrer.',
  'install.step2.webflow.body':
    'Webflow → Project Settings → Custom Code → Head Code → coller le snippet → Save → republier le site.',
  'install.step2.ghost.body':
    'Ghost admin → Settings → Code injection → Site Header → coller le snippet → Save.',
  'install.step3.title': '3. Vérifie que ça marche',
  'install.step3.body':
    'Ouvre ton site dans un nouvel onglet et navigue. Reviens ensuite ici et ouvre la page Live — tu dois voir des événements apparaître en quelques secondes.',
  'install.step3.cta': 'Ouvrir la page Live',
  'install.faq.title': 'Questions fréquentes',
  'install.faq.q1': 'Faut-il un bandeau cookies ?',
  'install.faq.a1':
    'Non. Les événements sont liés à un ID de session stocké en sessionStorage (effacé à la fermeture de l’onglet). Le tag ne pose aucun cookie, ne suit pas entre sessions ou entre sites, et n’a pas besoin de consentement pour l’analytique selon les lignes directrices CNIL / ePrivacy. Si tu charges aussi Google Analytics ou Meta Pixel à côté, eux nécessitent toujours du consentement.',
  'install.faq.q2': 'Est-ce que ça ralentit mon site ?',
  'install.faq.a2':
    'Le script est asynchrone (non-bloquant) et pèse 1,5 Ko gzippé — moins qu’un favicon. Les événements sont envoyés via navigator.sendBeacon pour ne jamais retarder la fermeture de la page. Aucun impact sur les Core Web Vitals.',
  'install.faq.q3': 'Quelles données sont collectées ?',
  'install.faq.a3':
    'URLs des pages (path + clés de query uniquement, pas les valeurs), origine du référent uniquement, sélecteurs de clics (pas le contenu texte), et tout événement custom envoyé via Smartanalyst("track", ...). Les emails et numéros de téléphone dans les propriétés custom sont retirés côté serveur en filet de sécurité.',
  'install.faq.q4': 'Puis-je envoyer des événements custom ?',
  'install.faq.a4':
    'Oui — Smartanalyst("track", "signup_completed", { plan: "pro" }). Les valeurs doivent être des strings, nombres ou booléens. Max 20 propriétés par événement, strings tronquées à 200 caractères.',
  'install.faq.q5': 'Comment désactiver les pageviews auto (SPA) ?',
  'install.faq.a5':
    'Passe disableAutoPageview: true à Smartanalyst("init", { ... }) puis appelle Smartanalyst("page") manuellement à chaque changement de route.',

  // ━━━ Audit (SEO / GEO on-demand) ━━━
  'nav.audit': 'Audit',
  'audit.kicker': 'Audit',
  'audit.title': 'Audite ton site en 5 secondes.',
  'audit.subtitle':
    'SEO + GEO (visibilité dans les moteurs IA) + Performance (Core Web Vitals) + scoring IA (Claude évalue la citabilité). 30+ checks en moins de 30 secondes.',
  'audit.form.url.label': 'URL à auditer',
  'audit.form.url.placeholder': 'https://ton-site.com',
  'audit.form.run': 'Lancer l’audit',
  'audit.form.running': 'Audit en cours…',
  'audit.form.runningHint': 'Chargement de la page et analyse — 5 à 10 secondes.',
  'audit.score.label': 'Score global',
  'audit.score.outOf': '/ 100',
  'audit.summary.pass': 'OK',
  'audit.summary.warn': 'À surveiller',
  'audit.summary.fail': 'À corriger',
  'audit.summary.info': 'Info',
  'audit.section.seo': 'Findings SEO',
  'audit.section.geo': 'Findings GEO (visibilité IA)',
  'audit.section.perf': 'Performance (Core Web Vitals)',
  'audit.section.ai': 'AI readiness (citation par les LLMs)',
  'audit.subscore.seo': 'SEO',
  'audit.subscore.geo': 'GEO',
  'audit.subscore.perf': 'Perf',
  'audit.subscore.ai': 'IA',
  'audit.cwv.title': 'Core Web Vitals',
  'audit.severity.pass': 'OK',
  'audit.severity.warn': 'À voir',
  'audit.severity.fail': 'Fail',
  'audit.severity.info': 'Info',
  'audit.findings.recommendation': 'Recommandation',
  'audit.history.title': 'Audits récents',
  'audit.history.empty': 'Pas encore d’audit — lance le premier ci-dessus.',
  'audit.history.open': 'Ouvrir',
  'audit.error.invalid_url': 'Cette URL n’a pas l’air valide. Utilise https://example.com.',
  'audit.error.scrape_failed':
    'On n’arrive pas à joindre le site (timeout, DNS, ou erreur SSL). Vérifie l’URL et réessaie.',
  'audit.error.generic': 'Quelque chose a planté pendant l’audit. Réessaie.',
  'audit.finalUrl': 'URL finale après redirections',
  'audit.httpStatus': 'Code HTTP',
}

export const STRINGS = { en, fr }
