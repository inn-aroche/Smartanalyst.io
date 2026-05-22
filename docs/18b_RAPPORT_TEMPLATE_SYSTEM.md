# 18b_RAPPORT_TEMPLATE_SYSTEM.md

## Vue d'ensemble

Système de **templates modulaires réutilisables** + **personnalisation cas par cas** avec **QA automatisée** pour garantir qualité de rendu constante.

**Stratégie:** 80% réutilisable (composants) + 20% personnalisé (données + thème)

**Pour qui:** Backend (template rendering), Frontend (report preview), Product (quality standards)

---

## 1. Architecture Templates

### Hiérarchie (composition pattern)

```
report-master.html (container)
├─ header.html (logo, date, workspace branding)
├─ executive-summary.html (AI-generated overview)
├─ performance-overview.html (health score + main KPIs)
├─ section-ga4.html (GA4 metrics + trends)
├─ section-meta-ads.html (Meta Ads performance)
├─ section-google-ads.html (Google Ads performance)
├─ section-stripe.html (Revenue + churn analysis)
├─ section-search-console.html (SEO data)
├─ alerts-and-insights.html (top 5 insights)
├─ benchmark-comparison.html (vs industry)
├─ recommendations.html (next steps)
└─ footer.html (signature, white-label info)
```

### Master Template (`src/templates/report-master.html`)

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{reportTitle}} - {{workspaceName}}</title>
  <style>
    {{#include styles.css}}
  </style>
</head>
<body class="report {{theme}}">
  
  <!-- HEADER with white-label config -->
  {{#include header.html}}
  
  <!-- EXECUTIVE SUMMARY (AI-generated) -->
  {{#include executive-summary.html}}
  
  <!-- MAIN PERFORMANCE VIEW -->
  {{#include performance-overview.html}}
  
  <!-- DYNAMIC SECTIONS (based on connected connectors) -->
  {{#if connectors.ga4}}
    {{#include section-ga4.html}}
  {{/if}}
  
  {{#if connectors.meta_ads}}
    {{#include section-meta-ads.html}}
  {{/if}}
  
  {{#if connectors.google_ads}}
    {{#include section-google-ads.html}}
  {{/if}}
  
  {{#if connectors.stripe}}
    {{#include section-stripe.html}}
  {{/if}}
  
  <!-- INSIGHTS & ALERTS -->
  {{#include alerts-and-insights.html}}
  
  <!-- BENCHMARK -->
  {{#include benchmark-comparison.html}}
  
  <!-- RECOMMENDATIONS -->
  {{#include recommendations.html}}
  
  <!-- FOOTER -->
  {{#include footer.html}}
  
  <!-- Page breaks for PDF -->
  <script>
    // Auto page break logic
    document.querySelectorAll('.page-break').forEach(el => {
      el.style.pageBreakAfter = 'always'
    })
  </script>
</body>
</html>
```

---

## 2. Composants Modulaires (réutilisables)

### Component 1: Header (white-label)

```html
<!-- src/templates/components/header.html -->

<header class="report-header" style="background-color: {{brandColor}}">
  <div class="logo-section">
    {{#if logoUrl}}
      <img src="{{logoUrl}}" alt="{{workspaceName}}" class="logo" />
    {{else}}
      <div class="logo-placeholder">{{workspaceName}}</div>
    {{/if}}
  </div>
  
  <div class="header-info">
    <h1>{{reportTitle}}</h1>
    <p class="period">{{periodStart}} → {{periodEnd}}</p>
    <p class="generated-date">Généré le {{generatedDate}}</p>
  </div>
  
  <style scoped>
    .report-header {
      padding: 40px;
      color: white;
      font-family: {{fontFamily}};
      border-bottom: 3px solid {{accentColor}};
    }
    .logo {
      max-height: 80px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 32px;
      margin: 0 0 10px 0;
    }
    .period {
      font-size: 18px;
      opacity: 0.9;
    }
  </style>
</header>
```

### Component 2: KPI Card (réutilisable)

```html
<!-- src/templates/components/kpi-card.html -->

<div class="kpi-card {{trendClass}}">
  <div class="kpi-header">
    <h3>{{kpiName}}</h3>
    <span class="source-badge">{{source}}</span>
  </div>
  
  <div class="kpi-value">
    {{#if isPercentage}}
      {{value}}%
    {{else}}
      {{formattedValue}}
    {{/if}}
  </div>
  
  <div class="kpi-trend {{trendDirection}}">
    {{#if trendUp}}
      ↑ +{{trendPercent}}%
    {{else if trendDown}}
      ↓ {{trendPercent}}%
    {{else}}
      → {{trendPercent}}%
    {{/if}}
  </div>
  
  <div class="kpi-sparkline">
    {{#include sparkline-chart.html data=sparklineData}}
  </div>
  
  {{#if benchmark}}
    <div class="kpi-benchmark">
      vs industrie: {{benchmark.value}} ({{benchmark.percentile}}e percentile)
    </div>
  {{/if}}
  
  <style scoped>
    .kpi-card {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      margin: 15px 0;
      background: #f9f9f9;
    }
    .kpi-card.positive {
      border-left: 4px solid #10b981;
    }
    .kpi-card.negative {
      border-left: 4px solid #ef4444;
    }
    .kpi-card.neutral {
      border-left: 4px solid #6b7280;
    }
    .kpi-value {
      font-size: 28px;
      font-weight: bold;
      color: {{primaryColor}};
      margin: 10px 0;
    }
    .kpi-trend {
      font-size: 14px;
      color: #6b7280;
    }
    .kpi-trend.up {
      color: #10b981;
    }
    .kpi-trend.down {
      color: #ef4444;
    }
  </style>
</div>
```

### Component 3: Section Header (réutilisable)

```html
<!-- src/templates/components/section-header.html -->

<div class="section-header">
  <h2>{{sectionTitle}}</h2>
  {{#if sectionDescription}}
    <p class="section-description">{{sectionDescription}}</p>
  {{/if}}
  <div class="section-divider"></div>
</div>

<style scoped>
  .section-header {
    margin: 40px 0 20px 0;
    padding-bottom: 20px;
  }
  h2 {
    font-size: 24px;
    color: {{primaryColor}};
    margin: 0 0 10px 0;
  }
  .section-description {
    font-size: 14px;
    color: #6b7280;
    margin: 5px 0;
  }
  .section-divider {
    height: 2px;
    background: linear-gradient(to right, {{primaryColor}}, transparent);
    margin-top: 15px;
  }
</style>
```

### Component 4: Insight Box (réutilisable)

```html
<!-- src/templates/components/insight-box.html -->

<div class="insight-box {{level}}">
  <div class="insight-header">
    <span class="level-badge {{level}}">{{level}}</span>
    <span class="source-badge">{{source}}</span>
  </div>
  
  <h4>{{title}}</h4>
  
  <div class="insight-fact">
    <strong>Le fait:</strong> {{fact}}
  </div>
  
  <div class="insight-context">
    <strong>Contexte:</strong> {{context}}
  </div>
  
  <div class="insight-recommendation">
    <strong>Recommandation:</strong> {{recommendation}}
  </div>
  
  <style scoped>
    .insight-box {
      border-left: 4px solid #6b7280;
      padding: 15px;
      margin: 15px 0;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .insight-box.ALERTE {
      border-left-color: #ef4444;
      background: #fef2f2;
    }
    .insight-box.OPPORTUNITÉ {
      border-left-color: #f59e0b;
      background: #fffbeb;
    }
    .insight-box.TENDANCE {
      border-left-color: #3b82f6;
      background: #eff6ff;
    }
    .level-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      margin-right: 10px;
    }
    .level-badge.ALERTE {
      background: #ef4444;
      color: white;
    }
    .level-badge.OPPORTUNITÉ {
      background: #f59e0b;
      color: white;
    }
    .level-badge.TENDANCE {
      background: #3b82f6;
      color: white;
    }
    h4 {
      margin: 10px 0 15px 0;
      color: {{primaryColor}};
    }
    .insight-fact, .insight-context, .insight-recommendation {
      margin: 10px 0;
      font-size: 14px;
      line-height: 1.6;
    }
  </style>
</div>
```

### Component 5: Chart (réutilisable)

```html
<!-- src/templates/components/chart.html -->

<div class="chart-container">
  <h4>{{chartTitle}}</h4>
  
  {{#if chartType == 'bar'}}
    <canvas id="chart-{{chartId}}" class="bar-chart"></canvas>
  {{else if chartType == 'line'}}
    <canvas id="chart-{{chartId}}" class="line-chart"></canvas>
  {{else if chartType == 'sparkline'}}
    <svg class="sparkline" viewBox="0 0 {{sparklineWidth}} {{sparklineHeight}}">
      <polyline points="{{sparklinePoints}}" />
    </svg>
  {{/if}}
  
  <script>
    // Chart.js rendering (for PDF, convert to canvas)
    if (document.getElementById('chart-{{chartId}}')) {
      const ctx = document.getElementById('chart-{{chartId}}').getContext('2d')
      new Chart(ctx, {
        type: '{{chartType}}',
        data: {{chartData}},
        options: {{chartOptions}}
      })
    }
  </script>
</div>

<style scoped>
  .chart-container {
    margin: 20px 0;
    padding: 20px;
    background: white;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
  }
  h4 {
    margin: 0 0 15px 0;
    color: {{primaryColor}};
  }
  canvas {
    max-width: 100%;
  }
  .sparkline {
    width: 100%;
    height: 60px;
    stroke: {{accentColor}};
    stroke-width: 2;
    fill: none;
  }
</style>
```

---

## 3. Section Templates (cas spécifiques)

### GA4 Section (exemple)

```html
<!-- src/templates/sections/section-ga4.html -->

<div class="page-break">
  {{#include components/section-header.html 
    sectionTitle="Traffic & Comportement"
    sectionDescription="Données Google Analytics (30 derniers jours)"
  }}
  
  <div class="kpi-grid">
    {{#each ga4Metrics}}
      {{#include components/kpi-card.html 
        kpiName=this.name
        value=this.value
        trendPercent=this.variation
        source="GA4"
        sparklineData=this.sparkline
        benchmark=this.benchmark
      }}
    {{/each}}
  </div>
  
  {{#include components/chart.html
    chartTitle="Sessions sur 30 jours"
    chartType="line"
    chartData=ga4SessionsChart
  }}
  
  <div class="section-breakdown">
    <h4>Répartition par canal</h4>
    {{#include components/chart.html
      chartType="bar"
      chartData=ga4ChannelBreakdown
    }}
  </div>
  
  {{#if ga4TopPages}}
    <div class="top-pages">
      <h4>Pages populaires</h4>
      <table>
        <thead>
          <tr>
            <th>Page</th>
            <th>Vues</th>
            <th>Conversions</th>
            <th>Taux conversion</th>
          </tr>
        </thead>
        <tbody>
          {{#each ga4TopPages}}
            <tr>
              <td>{{this.path}}</td>
              <td>{{this.views}}</td>
              <td>{{this.conversions}}</td>
              <td>{{this.conversionRate}}%</td>
            </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
  {{/if}}
</div>

<style scoped>
  .kpi-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin: 20px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
  }
  th, td {
    border: 1px solid #e0e0e0;
    padding: 12px;
    text-align: left;
  }
  th {
    background: #f3f4f6;
    font-weight: bold;
  }
  tr:nth-child(even) {
    background: #f9f9f9;
  }
</style>
```

---

## 4. Contexte d'injection (Handlebars)

### Variables disponibles (toujours injectées)

```javascript
{
  // Report metadata
  reportTitle: "Rapport Marketing - Mai 2025",
  periodStart: "2025-05-01",
  periodEnd: "2025-05-31",
  generatedDate: "2025-06-01",
  
  // Workspace branding
  workspaceName: "Mon Agence",
  logoUrl: "https://storage.../logo.png",
  brandColor: "#6366f1",
  accentColor: "#10b981",
  primaryColor: "#1f2937",
  fontFamily: "Inter, sans-serif",
  
  // Connectors status
  connectors: {
    ga4: true,
    meta_ads: true,
    google_ads: false,
    stripe: true,
    search_console: false
  },
  
  // Data (sourced from canonical_metrics)
  ga4Metrics: [
    {
      name: "Sessions",
      value: 12480,
      variation: 18,
      sparkline: [...],
      benchmark: { value: 10000, percentile: 65 }
    },
    ...
  ],
  
  ga4SessionsChart: { /* Chart.js config */ },
  ga4ChannelBreakdown: { /* Chart.js config */ },
  ga4TopPages: [ { path: "/products", views: 3240, ... }, ... ],
  
  // Insights (generated by Claude)
  insights: [
    {
      level: "ALERTE",
      title: "Trafic organique en baisse",
      fact: "Sessions organiques: -22% vs mois précédent",
      context: "Probablement lié à la réduction du contenu SEO",
      recommendation: "Rédiger 5 articles blog avant 15 juin"
    },
    ...
  ],
  
  // Benchmark
  benchmark: {
    sector: "e-commerce",
    roas_vs_industry: { user_value: 3.2, industry_avg: 2.8, percentile: 72 }
  },
  
  // Recommendations (AI-generated)
  recommendations: [
    { priority: 1, action: "...", timing: "Cette semaine" },
    ...
  ]
}
```

---

## 5. Rendu PDF avec QA

### Fonction de rendu (Playwright)

```javascript
// src/services/reportRenderer.js

async function renderReportToPDF(reportData) {
  // 1. COMPILE Handlebars template
  const context = buildReportContext(reportData)
  const html = Handlebars.compile(fs.readFileSync('src/templates/report-master.html'))(context)
  
  // 2. QA: Validate HTML
  validateHTML(html) // Throws if missing required sections
  
  // 3. RENDER with Playwright
  const browser = await playwright.chromium.launch()
  const page = await browser.newPage()
  
  await page.setContent(html, { waitUntil: 'networkidle' })
  
  // 4. QA: Screenshot for preview
  const preview = await page.screenshot({ path: `/tmp/report-preview.png` })
  
  // 5. CONVERT to PDF
  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: {
      top: '20mm',
      right: '15mm',
      bottom: '20mm',
      left: '15mm'
    },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>', // Blank, we handle in HTML
    footerTemplate: `
      <div style="font-size: 10px; color: #999; padding: 0 20mm;">
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        <span style="float: right;">© {{workspaceName}}</span>
      </div>
    `
  })
  
  await browser.close()
  
  return { pdfBuffer, preview }
}
```

### Validation QA

```javascript
// src/services/reportQA.js

function validateHTML(html) {
  const requiredSections = [
    'report-header',
    'executive-summary',
    'performance-overview',
    'alerts-and-insights'
  ]
  
  requiredSections.forEach(section => {
    if (!html.includes(`class="${section}"`) && !html.includes(`id="${section}"`)) {
      throw new Error(`Missing required section: ${section}`)
    }
  })
  
  // Validate images load
  const imgRegex = /<img[^>]*src="([^"]*)"/g
  let match
  while ((match = imgRegex.exec(html))) {
    if (match[1].startsWith('http') && !isValidUrl(match[1])) {
      throw new Error(`Invalid image URL: ${match[1]}`)
    }
  }
  
  // Validate colors are valid
  const colorRegex = /color:\s*([#a-f0-9]{6,7})/gi
  while ((match = colorRegex.exec(html))) {
    if (!isValidHexColor(match[1])) {
      throw new Error(`Invalid color: ${match[1]}`)
    }
  }
  
  return true
}

function validateReportQuality(pdfBuffer, context) {
  const checks = {
    hasContent: pdfBuffer.length > 50000, // At least 50KB
    hasImages: context.logoUrl !== null,
    hasBranding: context.brandColor !== '#000000',
    hasInsights: context.insights.length > 0,
    hasRecommendations: context.recommendations.length > 0,
    allConnectorsRepresented: Object.values(context.connectors).some(v => v === true)
  }
  
  const passed = Object.values(checks).filter(v => v === true).length
  const score = (passed / Object.keys(checks).length) * 100
  
  if (score < 70) {
    throw new Error(`Report quality score too low: ${score}%`)
  }
  
  return { score, checks }
}
```

---

## 6. Template Variants (cas par cas)

### Variante 1: Executive Only (quick report)

```javascript
// Cas: Utilisateur veut juste résumé exécutif
renderReportVariant('executive-only', {
  includeCharts: false,
  includeDetailedSections: false,
  maxPages: 2
})
```

Template:
```html
{{#include components/header.html}}
{{#include executive-summary.html}}
{{#include alerts-and-insights.html max=5}}
{{#include recommendations.html}}
{{#include footer.html}}
```

### Variante 2: Full Technical (pour agence)

```javascript
renderReportVariant('full-technical', {
  includeCharts: true,
  includeDetailedSections: true,
  includeRawData: true,
  maxPages: null // Unlimited
})
```

Template: Tous les composants + data tables

### Variante 3: Client-Friendly (simple, colorful)

```javascript
renderReportVariant('client-friendly', {
  simplifyLanguage: true,
  largerFonts: true,
  moreEmojis: true,
  lessJargon: true
})
```

---

## 7. Checklist QA avant envoi

```
AVANT D'ENVOYER LE RAPPORT:

Visual Quality:
□ Logo appears (colored, not stretched)
□ Colors match brand (header, badges, charts)
□ Fonts readable (16px min, 1.5 line-height)
□ Images load (no broken image icons)
□ Charts render correctly (not skewed, legend visible)
□ Page breaks appear (not mid-sentence)
□ Footer visible on each page

Content Quality:
□ Executive summary < 200 words
□ All insights have 3 elements (fact + context + recommendation)
□ Recommendations are actionable (with timing)
□ Benchmark comparisons make sense (same sector)
□ Data is consistent (sum of parts = total)

Data Accuracy:
□ All metrics sourced from canonical_metrics
□ Dates match report period (start-end)
□ Numbers match dashboard (no discrepancies)
□ Connectors shown match enabled connectors

Compliance:
□ White-label correct (logo, colors, no SmartAnalyst branding if pro+)
□ Recipient email correct
□ Privacy: no API keys or secrets in PDF
□ Accessibility: all images have alt text
□ Mobile-friendly: PDF renders on mobile

Technical:
□ PDF size < 10MB
□ File renders in all browsers (Chrome, Firefox, Safari)
□ Mobile reader works (iOS, Android)
□ Download speed < 3 seconds

Sign-off:
□ All checks passed
□ Quality score > 80%
□ Ready to send
```

---

## 8. Template Registry

```javascript
// src/templates/registry.js

const REPORT_TEMPLATES = {
  'default': {
    name: 'Standard Monthly Report',
    sections: ['ga4', 'meta_ads', 'google_ads', 'stripe'],
    qa_weight: 'full'
  },
  'executive-only': {
    name: 'Executive Summary Only',
    sections: ['executive_summary', 'insights', 'recommendations'],
    qa_weight: 'light'
  },
  'performance-focused': {
    name: 'Performance Deep Dive',
    sections: ['ga4', 'meta_ads', 'google_ads', 'benchmark'],
    qa_weight: 'full'
  },
  'ecommerce-focused': {
    name: 'E-commerce Metrics',
    sections: ['shopify', 'stripe', 'ga4', 'meta_ads'],
    qa_weight: 'full'
  },
  'saas-focused': {
    name: 'SaaS Metrics',
    sections: ['stripe', 'ga4', 'google_ads'],
    qa_weight: 'full'
  }
}

function getTemplate(templateKey, workspaceSector) {
  // Auto-select template based on sector if default
  if (templateKey === 'default') {
    if (workspaceSector === 'ecommerce') {
      return REPORT_TEMPLATES['ecommerce-focused']
    } else if (workspaceSector === 'saas') {
      return REPORT_TEMPLATES['saas-focused']
    }
  }
  
  return REPORT_TEMPLATES[templateKey] || REPORT_TEMPLATES['default']
}
```

---

## Prochaine étape

Lire **18c_RAPPORT_VISUALIZATION_QA.md** (prochaine doc) pour system QA complet.

---

*Dernière mise à jour : Mai 2025*
