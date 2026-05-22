# 18f_RAPPORT_CODING_STRATEGY.md

## Vue d'ensemble

**Ordre de codage optimal** pour implémenter le système de templates + génération PDF sans dépendances circulaires.

**Réponse directe à ta question finale:** Les 2 en parallèle, mais avec cet ordre strict.

---

## La question

> Quelle brique de ce système de visualisation te semble la plus urgente à coder pour le premier livrable: 
> 1. la structure HTML globale avec Handlebars (report-master.html)
> 2. le script Node.js/Playwright qui va gérer la compilation et la génération du fichier PDF?

**Réponse:** **Les deux en parallèle, MAIS dans cet ordre de priorité:**

```
SEMAINE 1:
├─ JOUR 1-2: HTML structure FIRST (report-master.html)
│             └─ Sans données, juste structure
├─ JOUR 3-4: CSS styles (styles.css) + page breaks (18d)
├─ JOUR 4-5: Composants réutilisables (5 composants)
└─ JOUR 5: Mock data pour tests

SEMAINE 2:
├─ JOUR 6-7: Script Node.js/Playwright
│             └─ Compilation Handlebars
│             └─ Rendering HTML
│             └─ PDF generation
├─ JOUR 8-9: QA validators (Stages 1-6)
└─ JOUR 10: Integration + tests end-to-end
```

---

## RAISON: Dependency Graph

```
report-master.html
├─ depends on: components/header.html
├─ depends on: components/kpi-card.html
├─ depends on: components/insight-box.html
├─ depends on: components/chart.html
├─ depends on: components/footer.html
└─ depends on: sections/section-ga4.html, etc.

styles.css
├─ imports: @media print rules
├─ imports: page-break CSS (CRITICAL - 18d)
└─ imports: component styles

Playwright script
├─ depends on: report-master.html ✅ (DOIT être prêt)
├─ depends on: styles.css ✅ (DOIT être prêt)
└─ depends on: mock data (easy)

QA Validators
└─ depends on: Playwright script ✅ (DOIT être prêt)
```

**Si tu commences par le script Node.js, tu vas:**
- 1️⃣ Générer du HTML qui n'existe pas encore
- 2️⃣ Te battre avec des path relatifs
- 3️⃣ Refactoriser 3 fois

**Si tu commences par le HTML, tu vas:**
- 1️⃣ Avoir une structure testable statiquement
- 2️⃣ Valider le CSS avant le PDF
- 3️⃣ Passer le script qui « juste » appelle Playwright

---

## PLAN DÉTAILLÉ: Semaine 1

### JOUR 1-2: HTML Master + Components structure

**Cible:** Avoir un repo avec des fichiers HTML statiques validables

```bash
src/
├─ templates/
│  ├─ report-master.html          ← START HERE
│  ├─ components/
│  │  ├─ header.html
│  │  ├─ kpi-card.html
│  │  ├─ section-header.html
│  │  ├─ insight-box.html
│  │  ├─ chart.html
│  │  └─ footer.html
│  ├─ sections/
│  │  ├─ section-ga4.html
│  │  ├─ section-meta-ads.html
│  │  ├─ section-stripe.html
│  │  └─ section-executive-summary.html
│  └─ styles.css                  ← CSS GLOBAL
└─ data/
   └─ mockData.json               ← Mock data (hardcoded)
```

**Task 1: report-master.html**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{reportTitle}}</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body class="report {{theme}}">
  
  <!-- Header -->
  <header class="report-header">
    {{#include ./components/header.html}}
  </header>
  
  <!-- Executive Summary -->
  <section class="report-section executive-summary-section">
    {{#include ./sections/section-executive-summary.html}}
  </section>
  
  <!-- Main Content -->
  <main class="report-content">
    
    <!-- GA4 Section -->
    {{#if connectors.ga4}}
    <section class="page-break ga4-section">
      {{#include ./sections/section-ga4.html}}
    </section>
    {{/if}}
    
    <!-- Meta Ads Section -->
    {{#if connectors.meta_ads}}
    <section class="page-break meta-ads-section">
      {{#include ./sections/section-meta-ads.html}}
    </section>
    {{/if}}
    
    <!-- Stripe Section -->
    {{#if connectors.stripe}}
    <section class="page-break stripe-section">
      {{#include ./sections/section-stripe.html}}
    </section>
    {{/if}}
    
  </main>
  
  <!-- Footer -->
  <footer class="report-footer">
    {{#include ./components/footer.html}}
  </footer>
  
</body>
</html>
```

**Task 2: Chaque component (5 fichiers)**

Suivre le pattern du doc 18b (header.html, kpi-card.html, etc.)

**Task 3: Chaque section (4 fichiers)**

```html
<!-- section-ga4.html -->
<div class="section-ga4">
  {{#include ../components/section-header.html 
    sectionTitle="Traffic & Comportement"
  }}
  
  <div class="kpi-grid">
    {{#each ga4Metrics}}
      {{#include ../components/kpi-card.html}}
    {{/each}}
  </div>
  
  {{#include ../components/chart.html chartId="ga4-sessions"}}
</div>
```

**Task 4: Validation**

```bash
# Vérifier que HTML est valide (pas de Handlebars errors, juste structure)
npm run validate:html src/templates/report-master.html

# Vérifier que tous les includes existent
npm run check:includes src/templates/report-master.html
```

---

### JOUR 3-4: CSS + Page breaks (18d)

**Cible:** Avoir du CSS prêt pour le headless Playwright

```css
/* src/templates/styles.css */

:root {
  --primary-color: #6366f1;
  --accent-color: #10b981;
  --danger-color: #ef4444;
  --warning-color: #f59e0b;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1f2937;
}

/* CRITICAL: Page break rules (from 18d) */
@media print {
  /* ... all page-break CSS from 18d ... */
  
  .kpi-card,
  .insight-box,
  .chart-container,
  table {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  
  .page-break {
    break-before: page;
    page-break-before: always;
  }
  
  /* ... rest from 18d ... */
}

/* Component styles */
.report-header {
  background: var(--primary-color);
  color: white;
  padding: 40px;
}

.kpi-card {
  border: 1px solid #e0e0e0;
  padding: 20px;
  margin: 15px 0;
  break-inside: avoid;
}

/* ... all component styles ... */
```

**Task 5: Validation du CSS**

```bash
npm run validate:css src/templates/styles.css
# → Vérifier: pas de syntax errors, break-inside: avoid présent, etc.
```

---

### JOUR 4-5: Mock data + Test statique

**Cible:** Pouvoir previewer le rapport en statique (browser ou HTML)

```javascript
// src/data/mockData.json
{
  "reportTitle": "Rapport Marketing - Mai 2025",
  "periodStart": "2025-05-01",
  "periodEnd": "2025-05-31",
  "workspaceName": "Demo Agency",
  "brandColor": "#6366f1",
  
  "connectors": {
    "ga4": true,
    "meta_ads": true,
    "stripe": true
  },
  
  "ga4Metrics": [
    { "name": "Sessions", "value": 12480, "variation": 18, "sparkline": [...] },
    { "name": "Users", "value": 8940, "variation": 15 },
    { "name": "Conversions", "value": 147, "variation": 8 }
  ],
  
  "metaAdsMetrics": [
    { "name": "Spend", "value": 1840, "variation": -5 },
    { "name": "ROAS", "value": 3.2, "variation": -11 }
  ],
  
  "insights": [
    {
      "level": "ALERTE",
      "title": "Trafic organique en baisse",
      "fact": "Sessions organiques: -22% vs mois précédent",
      "context": "Probablement lié à la réduction du contenu SEO",
      "recommendation": "Rédiger 5 articles blog avant 15 juin"
    }
  ]
}
```

**Task 6: Preview statique**

```bash
# Compiler avec mock data
npm run compile:html -- --data src/data/mockData.json --output test-report.html

# Ouvrir dans le browser
open test-report.html

# Valider visually:
# ✓ Layout OK?
# ✓ Fonts readable?
# ✓ Colors correct?
# ✓ Page breaks où attendus?
```

---

## PLAN DÉTAILLÉ: Semaine 2

### JOUR 6-7: Script Node.js + Playwright

**Cible:** Avoir un script qui prend du HTML + le convertit en PDF

```javascript
// src/services/reportRenderer.js

const Handlebars = require('handlebars')
const playwright = require('@playwright/test')
const fs = require('fs')

async function renderReportToPDF(reportData) {
  // 1. COMPILE Handlebars
  const templatePath = 'src/templates/report-master.html'
  const templateSource = fs.readFileSync(templatePath, 'utf-8')
  const template = Handlebars.compile(templateSource)
  
  // Register partials (components, sections)
  registerPartials()
  
  // Compile with data
  const html = template(reportData)
  
  // 2. RENDER with Playwright
  const browser = await playwright.chromium.launch({ headless: true })
  const page = await browser.newPage()
  
  await page.setContent(html, { waitUntil: 'networkidle' })
  
  // 3. WAIT FOR CANVAS (from 18d fix)
  await page.waitForFunction(() => {
    const canvases = document.querySelectorAll('canvas')
    if (canvases.length === 0) return true
    return Array.from(canvases).every(canvas => {
      const ctx = canvas.getContext('2d')
      const imageData = ctx.getImageData(0, 0, 1, 1).data
      return imageData[3] > 0
    })
  }, { timeout: 5000 })
  
  // 4. GENERATE PDF
  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    displayHeaderFooter: false
  })
  
  await browser.close()
  
  return pdfBuffer
}

function registerPartials() {
  const componentsDir = 'src/templates/components'
  fs.readdirSync(componentsDir).forEach(file => {
    const name = file.replace('.html', '')
    const path = `${componentsDir}/${file}`
    const content = fs.readFileSync(path, 'utf-8')
    Handlebars.registerPartial(name, content)
  })
  
  const sectionsDir = 'src/templates/sections'
  fs.readdirSync(sectionsDir).forEach(file => {
    const name = file.replace('.html', '')
    const path = `${sectionsDir}/${file}`
    const content = fs.readFileSync(path, 'utf-8')
    Handlebars.registerPartial(name, content)
  })
}
```

**Task 7: API endpoint**

```javascript
// src/routes/reports.js

router.post('/api/v1/reports/generate', async (req, res) => {
  try {
    const { workspace_id, client_id } = req.body
    
    // Fetch data from canonical_metrics
    const reportData = await buildReportContext(workspace_id, client_id)
    
    // Render to PDF
    const pdfBuffer = await renderReportToPDF(reportData)
    
    // Upload to Storage
    const pdfUrl = await uploadToStorage(pdfBuffer, workspace_id)
    
    // Save report record
    const report = await db.reports.insert({
      workspace_id,
      client_id,
      pdf_url: pdfUrl,
      status: 'ready',
      created_at: new Date()
    })
    
    res.json({ reportId: report.id, pdfUrl })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
```

**Task 8: Test end-to-end**

```bash
npm run test:report-render -- --data src/data/mockData.json

# Check:
# ✓ PDF generated?
# ✓ PDF opens in reader?
# ✓ All pages present?
# ✓ File size < 10MB?
```

---

### JOUR 8-9: QA Validators (Stages 1-6)

**Cible:** Automatiser la validation avant d'envoyer

Implémenter les 6 stages du doc 18c (ou 18d pour stages corrigés):

1. HTML Validation
2. Accessibility
3. Structural Validation (remplace Visual Regression)
4. Content Quality + AI Fact-Checking
5. Performance
6. Sign-off

```bash
npm run test:qa -- --report report-sample.pdf

# Output:
# Stage 1: HTML Validation ✓
# Stage 2: Accessibility ✓
# Stage 3: Structural ✓
# Stage 4: Content Quality ✓
# Stage 5: Performance ✓
# Stage 6: Sign-off ✓
# Overall Score: 92%
# Recommendation: AUTO_SEND
```

---

### JOUR 10: Integration + End-to-end

**Cible:** Le système fonctionne de bout en bout

```bash
# Full test: données → HTML → PDF → QA → approval
npm run test:e2e:report

# Checklist:
# □ Data sync works
# □ HTML compilation works
# □ Playwright rendering works
# □ QA validation works
# □ Auto-send logic works
# □ Manual review queue works
# □ PDF upload works
# □ Email sending works
```

---

## Timeline complet (4 semaines)

```
SEMAINE 1: HTML + CSS
├─ J1-2: report-master.html + components (5 files)
├─ J3-4: CSS avec page breaks (critical from 18d)
├─ J4-5: Mock data + preview statique
└─ FIN: HTML validé, visually correct, prêt pour PDF

SEMAINE 2: Rendering + QA
├─ J6-7: Script Node/Playwright + API endpoint
├─ J8-9: QA validators (stages 1-6)
└─ J10: Integration end-to-end + tests

SEMAINE 3: Advanced Features (18e)
├─ J11-12: AI Fact-checking (Stage 4 extension)
├─ J13-14: Multi-currency support
└─ J15: Multi-location support (variants)

SEMAINE 4: Production hardening
├─ J16-17: Performance tuning (reduce PDF size, faster render)
├─ J18-19: Error handling + edge cases
├─ J20: Load testing + stress testing
└─ READY FOR PRODUCTION
```

---

## Summary: Réponse à ta question

**Tu as demandé:** HTML ou Script Playwright d'abord?

**Je réponds:** HTML FIRST, mais voici pourquoi:

```
✅ HTML FIRST (Jour 1-5):
   └─ Structure testable sans dépendances
   └─ CSS validable statiquement
   └─ Preview statique possible
   └─ Facile de travailler en parallèle (5 devs = 5 composants)

⚠️ Script Playwright (Jour 6-10):
   └─ Prend le HTML comme input
   └─ Pas d'ambiguïté: "est-ce que c'est le HTML ou le script?"
   └─ Plus simple à debugger (tu vois d'abord le HTML généré)

❌ Script Playwright FIRST:
   └─ Tu dois inventer le HTML au fur et à mesure
   └─ Refactoring cyclique (CSS → HTML → PDF → oups CSS cassé)
   └─ Dépendances circulaires
   └─ Temps perdu à déboguer "c'est le HTML ou le script?"
```

---

## Final checklist avant de coder

```
Jour 1 (avant de coder):
□ Lire 18b (templates modulaires) ← Structure
□ Lire 18d (production fixes) ← CSS + page breaks
□ Lire 18e (advanced features) ← Futur
□ Créer mock data ← Test
□ Configurer repo structure ← Prêt

Jour 1 START:
□ report-master.html (structure)
□ 5 components (header, kpi-card, insight-box, chart, footer)
□ 4 sections (ga4, meta_ads, stripe, executive-summary)
□ styles.css (avec page break rules from 18d)

Validation avant Playwright:
□ npm run validate:html ✓
□ npm run check:includes ✓
□ npm run validate:css ✓
□ Open in browser ✓
□ Looks good? ✓

ALORS et SEULEMENT ALORS: Script Playwright
```

---

*Dernière mise à jour : Mai 2025*
