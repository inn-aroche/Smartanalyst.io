# 18c_RAPPORT_VISUALIZATION_QA.md

## Vue d'ensemble

**Système QA complet et automatisé** pour garantir qualité de rendu constante sur tous les rapports.

**Principe:** Tests avant sending + feedback loop + continuous improvement

**Pour qui:** QA engineers, backend devs, product managers

---

## 1. Pipeline QA (6 étapes)

```
1. HTML Validation
   ↓
2. Accessibility Check (WCAG 2.1 AA)
   ↓
3. Visual Regression Test (screenshot comparison)
   ↓
4. Content Quality Check (insights, data completeness)
   ↓
5. Performance Check (PDF size, render time)
   ↓
6. Final Sign-off (human review for edge cases)
```

---

## 2. Stage 1: HTML Validation

### Checklist automatisée

```javascript
// src/qa/validators/htmlValidator.js

class HTMLValidator {
  validate(html, context) {
    const errors = []
    const warnings = []
    
    // Required sections
    const requiredSections = [
      { id: 'report-header', minLines: 5 },
      { id: 'executive-summary', minLines: 10 },
      { id: 'performance-overview', minLines: 15 },
      { id: 'alerts-and-insights', minLines: 5 }
    ]
    
    requiredSections.forEach(section => {
      const sectionRegex = new RegExp(
        `class=["']([^"']*${section.id}[^"']*)["']|id=["']${section.id}["']`,
        'i'
      )
      
      if (!sectionRegex.test(html)) {
        errors.push(`Missing required section: ${section.id}`)
      }
    })
    
    // Validate Handlebars variables are replaced
    const unreplacedVars = html.match(/{{[^}]+}}/g)
    if (unreplacedVars && unreplacedVars.length > 0) {
      errors.push(`Unreplaced Handlebars variables: ${unreplacedVars.join(', ')}`)
    }
    
    // Validate image URLs
    const imgRegex = /<img[^>]*src="([^"]*)"/g
    let imgMatch
    while ((imgMatch = imgRegex.exec(html))) {
      const url = imgMatch[1]
      if (url.startsWith('http')) {
        if (!isValidUrl(url)) {
          errors.push(`Invalid image URL: ${url}`)
        }
      } else if (!url.startsWith('data:')) {
        warnings.push(`Relative image path (may break in PDF): ${url}`)
      }
    }
    
    // Validate CSS colors
    const colorRegex = /(color|background-color|border-color):\s*([#a-f0-9]{6,7}|rgb\([^)]+\))/gi
    let colorMatch
    const colors = new Set()
    while ((colorMatch = colorRegex.exec(html))) {
      colors.add(colorMatch[2])
      if (!isValidColor(colorMatch[2])) {
        errors.push(`Invalid color: ${colorMatch[2]}`)
      }
    }
    
    // Validate table structure
    const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/g) || []
    tables.forEach((table, idx) => {
      if (!/<th/.test(table)) {
        warnings.push(`Table ${idx} missing <th> headers`)
      }
      const rows = table.match(/<tr[^>]*>/g) || []
      if (rows.length < 2) {
        warnings.push(`Table ${idx} has less than 2 rows (might be empty)`)
      }
    })
    
    // Validate links are not broken
    const linkRegex = /<a[^>]*href="([^"]*)"/g
    let linkMatch
    while ((linkMatch = linkRegex.exec(html))) {
      const url = linkMatch[1]
      if (url.startsWith('http') && !isValidUrl(url)) {
        errors.push(`Invalid link URL: ${url}`)
      }
    }
    
    // Validate brand colors are used
    if (context.brandColor && !html.includes(context.brandColor)) {
      warnings.push(`Brand color not used in report: ${context.brandColor}`)
    }
    
    // Validate all connected data sources are represented
    const enabledConnectors = Object.entries(context.connectors)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
    
    enabledConnectors.forEach(connector => {
      if (!html.includes(`section-${connector}`) && !html.includes(connector.toUpperCase())) {
        warnings.push(`Connector ${connector} enabled but not represented in report`)
      }
    })
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: ((Object.keys(context.connectors).length - errors.length) / Object.keys(context.connectors).length) * 100
    }
  }
}
```

### Quand valider

```javascript
async function renderReportToPDF(reportData) {
  const html = compileTemplate(reportData)
  
  // Stage 1: HTML Validation
  const validation = new HTMLValidator().validate(html, reportData)
  
  if (!validation.valid) {
    console.error('HTML Validation failed:', validation.errors)
    throw new Error(`Report generation failed: ${validation.errors[0]}`)
  }
  
  if (validation.warnings.length > 0) {
    console.warn('Warnings:', validation.warnings)
    // Log but don't block
  }
  
  // Continue to next stage...
}
```

---

## 3. Stage 2: Accessibility Check (WCAG 2.1 AA)

### Checklist automatisée (axe-core)

```javascript
// src/qa/validators/accessibilityValidator.js

const axe = require('axe-core')

class AccessibilityValidator {
  async validate(page) {
    // Run axe accessibility scan
    const results = await axe.run(page, {
      runOnly: {
        type: 'tag',
        values: ['wcag2aa', 'wcag21aa']
      }
    })
    
    const errors = results.violations.map(violation => ({
      type: 'ERROR',
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map(node => node.html)
    }))
    
    const warnings = results.incomplete.map(incomplete => ({
      type: 'REVIEW',
      id: incomplete.id,
      description: incomplete.description,
      nodes: incomplete.nodes.map(node => node.html)
    }))
    
    // Specific checks
    const manualChecks = await runManualAccessibilityChecks(page)
    
    return {
      valid: errors.length === 0,
      errors,
      warnings: [...warnings, ...manualChecks],
      score: ((
        results.passes.length / 
        (results.passes.length + results.violations.length + results.incomplete.length)
      ) * 100).toFixed(1)
    }
  }
}

async function runManualAccessibilityChecks(page) {
  const checks = []
  
  // 1. Check heading hierarchy (h1 → h2 → h3, no jumps)
  const headings = await page.$$eval('h1, h2, h3, h4', els => 
    els.map(el => ({ tag: el.tagName, text: el.textContent }))
  )
  
  let lastLevel = 0
  headings.forEach(heading => {
    const level = parseInt(heading.tag[1])
    if (level > lastLevel + 1) {
      checks.push({
        type: 'REVIEW',
        description: `Heading hierarchy jump: ${heading.tag} after h${lastLevel}`
      })
    }
    lastLevel = level
  })
  
  // 2. Check all images have alt text
  const imagesWithoutAlt = await page.$$eval('img:not([alt])', els => els.length)
  if (imagesWithoutAlt > 0) {
    checks.push({
      type: 'ERROR',
      description: `${imagesWithoutAlt} images missing alt text`
    })
  }
  
  // 3. Check color contrast (text should be at least 4.5:1 for normal, 3:1 for large)
  const contrastIssues = await page.evaluate(() => {
    // Simple contrast check (would need full implementation)
    const textElements = document.querySelectorAll('body, p, span, h1, h2, h3')
    const issues = []
    textElements.forEach(el => {
      const computed = window.getComputedStyle(el)
      // Would use contrast library here
      // if (contrast(computed.color, computed.backgroundColor) < 4.5) {
      //   issues.push(el.textContent.substring(0, 20))
      // }
    })
    return issues
  })
  
  if (contrastIssues.length > 0) {
    checks.push({
      type: 'REVIEW',
      description: `Potential contrast issues found (manual review recommended)`
    })
  }
  
  // 4. Check links are distinguishable from text
  const links = await page.$$eval('a', els => els.length)
  const underlinedLinks = await page.$$eval('a[style*="text-decoration"]', els => els.length)
  
  if (links > 0 && underlinedLinks === 0) {
    checks.push({
      type: 'REVIEW',
      description: `Links should be underlined or use different styling (found ${links} links)`
    })
  }
  
  // 5. Check form labels
  const inputs = await page.$$eval('input', els => els.length)
  const labeledInputs = await page.$$eval('input[id]', els => 
    els.filter(el => document.querySelector(`label[for="${el.id}"]`)).length
  )
  
  if (inputs > 0 && labeledInputs < inputs) {
    checks.push({
      type: 'REVIEW',
      description: `${inputs - labeledInputs} inputs missing associated labels`
    })
  }
  
  return checks
}
```

### Quand valider

```javascript
async function renderReportToPDF(reportData) {
  const browser = await playwright.chromium.launch()
  const page = await browser.newPage()
  
  await page.setContent(html, { waitUntil: 'networkidle' })
  
  // Stage 2: Accessibility Check
  const accessibility = await new AccessibilityValidator().validate(page)
  
  if (!accessibility.valid) {
    console.error('Accessibility Check failed:', accessibility.errors)
    throw new Error(`Report accessibility failed`)
  }
  
  if (accessibility.warnings.length > 0) {
    console.warn('Accessibility Warnings:', accessibility.warnings)
  }
}
```

---

## 4. Stage 3: Visual Regression Testing

### Screenshot comparison (baseline vs current)

```javascript
// src/qa/validators/visualRegressionValidator.js

class VisualRegressionValidator {
  async validate(page, templateName, context) {
    // Take current screenshot
    const currentScreenshot = await page.screenshot({ 
      fullPage: true,
      path: `/tmp/report-current-${templateName}.png`
    })
    
    // Load baseline screenshot
    const baselinePath = `src/qa/baselines/${templateName}-${context.theme || 'default'}.png`
    
    if (!fs.existsSync(baselinePath)) {
      // First run: create baseline
      fs.copyFileSync(`/tmp/report-current-${templateName}.png`, baselinePath)
      return {
        valid: true,
        isBaseline: true,
        message: 'Baseline created (first run)'
      }
    }
    
    const baselineScreenshot = fs.readFileSync(baselinePath)
    
    // Compare using pixelmatch
    const diff = await compareScreenshots(currentScreenshot, baselineScreenshot)
    
    const diffPercentage = (diff.count / (diff.width * diff.height)) * 100
    
    // Allow 2% pixel difference (anti-aliasing, rendering differences)
    const threshold = 2.0
    
    return {
      valid: diffPercentage < threshold,
      diffPercentage: diffPercentage.toFixed(2),
      threshold,
      screenshot: currentScreenshot,
      message: diffPercentage < threshold 
        ? `Visual match (${diffPercentage.toFixed(2)}% diff)`
        : `Visual regression detected (${diffPercentage.toFixed(2)}% diff vs threshold ${threshold}%)`
    }
  }
}

async function compareScreenshots(current, baseline) {
  const { PNG } = require('pngjs')
  const pixelmatch = require('pixelmatch')
  
  const currentImg = PNG.sync.read(current)
  const baselineImg = PNG.sync.read(baseline)
  
  const { width, height } = currentImg
  const diff = new PNG({ width, height })
  
  const count = pixelmatch(
    currentImg.data,
    baselineImg.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 } // 10% color difference threshold per pixel
  )
  
  return { count, width, height, diff }
}
```

### Quand valider (par template + theme)

```javascript
async function renderReportToPDF(reportData) {
  // ... previous stages ...
  
  // Stage 3: Visual Regression Testing
  const visualRegression = await new VisualRegressionValidator()
    .validate(page, reportData.templateName, reportData)
  
  if (!visualRegression.valid) {
    console.error('Visual regression detected:', visualRegression.message)
    // Generate diff image for review
    const diffPath = `/tmp/report-diff-${Date.now()}.png`
    fs.writeFileSync(diffPath, visualRegression.diff)
    console.log(`Diff saved to: ${diffPath}`)
    
    // In production: alert or require manual approval
    await notifyQATeam({
      type: 'VISUAL_REGRESSION',
      message: visualRegression.message,
      diffPath,
      templateName: reportData.templateName
    })
  }
}
```

---

## 5. Stage 4: Content Quality Check

### Completeness & accuracy

```javascript
// src/qa/validators/contentQualityValidator.js

class ContentQualityValidator {
  validate(context, html) {
    const checks = {
      executive_summary_length: this.checkExecutiveSummaryLength(html),
      insights_complete: this.checkInsightsComplete(context),
      recommendations_actionable: this.checkRecommendationsActionable(context),
      data_accuracy: this.checkDataAccuracy(context),
      benchmark_relevance: this.checkBenchmarkRelevance(context),
      branding_consistent: this.checkBrandingConsistent(html, context)
    }
    
    const passed = Object.values(checks).filter(c => c.valid).length
    const total = Object.keys(checks).length
    const score = (passed / total) * 100
    
    return {
      valid: score >= 80,
      score: score.toFixed(1),
      checks
    }
  }
  
  checkExecutiveSummaryLength(html) {
    // Extract executive summary text
    const summaryMatch = html.match(
      /<div[^>]*class="[^"]*executive-summary[^"]*"[^>]*>[\s\S]*?<\/div>/i
    )
    
    if (!summaryMatch) {
      return { valid: false, message: 'Executive summary not found' }
    }
    
    const text = summaryMatch[0]
      .replace(/<[^>]+>/g, '') // Strip HTML
      .trim()
    
    const wordCount = text.split(/\s+/).length
    
    if (wordCount < 50) {
      return { valid: false, message: `Executive summary too short (${wordCount} words, min 50)` }
    }
    if (wordCount > 300) {
      return { valid: false, message: `Executive summary too long (${wordCount} words, max 300)` }
    }
    
    return { valid: true, message: `Executive summary OK (${wordCount} words)` }
  }
  
  checkInsightsComplete(context) {
    const required = ['fact', 'context', 'recommendation']
    const errors = []
    
    context.insights.forEach((insight, idx) => {
      required.forEach(field => {
        if (!insight[field] || insight[field].trim().length === 0) {
          errors.push(`Insight ${idx + 1} missing ${field}`)
        }
      })
    })
    
    if (context.insights.length < 3) {
      errors.push(`Only ${context.insights.length} insights (min 3)`)
    }
    
    return {
      valid: errors.length === 0,
      message: errors.length === 0 
        ? `${context.insights.length} complete insights`
        : errors.join('; ')
    }
  }
  
  checkRecommendationsActionable(context) {
    const errors = []
    
    context.recommendations.forEach((rec, idx) => {
      // Check for action verbs
      const actionVerbs = ['implement', 'increase', 'reduce', 'create', 'optimize', 'test', 'review']
      const hasActionVerb = actionVerbs.some(verb => 
        rec.action.toLowerCase().includes(verb)
      )
      
      if (!hasActionVerb) {
        errors.push(`Recommendation ${idx + 1} not actionable`)
      }
      
      // Check for timing
      if (!rec.timing || rec.timing.trim().length === 0) {
        errors.push(`Recommendation ${idx + 1} missing timing`)
      }
    })
    
    return {
      valid: errors.length === 0,
      message: errors.length === 0
        ? `${context.recommendations.length} actionable recommendations`
        : errors.join('; ')
    }
  }
  
  checkDataAccuracy(context) {
    const errors = []
    
    // Verify metrics are from canonical_metrics (not hardcoded)
    // This is a sample check; in practice, you'd query the DB
    if (!context.dataSourceId) {
      errors.push('Data source tracking missing')
    }
    
    // Verify report period matches data
    const start = new Date(context.periodStart)
    const end = new Date(context.periodEnd)
    const days = (end - start) / (1000 * 60 * 60 * 24)
    
    if (days < 1 || days > 365) {
      errors.push(`Invalid date range: ${days} days`)
    }
    
    // Verify sums add up
    if (context.ga4Metrics && context.ga4Metrics.length > 0) {
      const total = context.ga4Metrics.reduce((sum, m) => sum + m.value, 0)
      if (total === 0) {
        errors.push('GA4 metrics sum to zero (data may be missing)')
      }
    }
    
    return {
      valid: errors.length === 0,
      message: errors.length === 0 ? 'Data accuracy OK' : errors.join('; ')
    }
  }
  
  checkBenchmarkRelevance(context) {
    if (!context.benchmark) {
      return { valid: false, message: 'Benchmark data missing' }
    }
    
    if (context.benchmark.sector !== context.workspaceSector) {
      return { 
        valid: false, 
        message: `Benchmark sector (${context.benchmark.sector}) doesn't match workspace (${context.workspaceSector})`
      }
    }
    
    return { valid: true, message: 'Benchmark relevant' }
  }
  
  checkBrandingConsistent(html, context) {
    const errors = []
    
    // Check primary color is used
    if (!html.includes(context.brandColor)) {
      errors.push(`Brand color not used: ${context.brandColor}`)
    }
    
    // Check logo appears (if configured)
    if (context.logoUrl && !html.includes(context.logoUrl)) {
      errors.push('Logo not included in report')
    }
    
    // Check white-label is respected
    if (context.plan !== 'agency' && html.includes('SmartAnalyst')) {
      if (context.plan === 'free') {
        // OK to include SmartAnalyst branding
      } else {
        errors.push('SmartAnalyst branding should not appear on this plan')
      }
    }
    
    return {
      valid: errors.length === 0,
      message: errors.length === 0 ? 'Branding consistent' : errors.join('; ')
    }
  }
}
```

### Quand valider

```javascript
async function renderReportToPDF(reportData) {
  // ... previous stages ...
  
  // Stage 4: Content Quality Check
  const contentQuality = new ContentQualityValidator()
    .validate(reportData, html)
  
  if (!contentQuality.valid) {
    console.warn('Content quality score low:', contentQuality.score)
    Object.entries(contentQuality.checks).forEach(([check, result]) => {
      if (!result.valid) {
        console.warn(`  - ${check}: ${result.message}`)
      }
    })
    
    // Warn but don't block (could be acceptable)
    if (contentQuality.score < 60) {
      throw new Error('Content quality too low')
    }
  }
}
```

---

## 6. Stage 5: Performance Check

### PDF size & render time

```javascript
// src/qa/validators/performanceValidator.js

class PerformanceValidator {
  validate(pdfBuffer, renderStartTime, context) {
    const renderTime = Date.now() - renderStartTime
    const pdfSizeKb = pdfBuffer.length / 1024
    const pdfSizeMb = pdfSizeKb / 1024
    
    const checks = {
      render_time: {
        valid: renderTime < 10000, // 10 seconds
        actual: renderTime,
        threshold: 10000,
        message: `Rendered in ${renderTime}ms`
      },
      pdf_size: {
        valid: pdfSizeKb < 10240, // 10 MB
        actual: pdfSizeKb,
        threshold: 10240,
        message: `PDF size: ${pdfSizeMb.toFixed(1)}MB`
      }
    }
    
    // Calculate expected size based on sections
    const expectedSizeKb = this.estimateExpectedSize(context)
    
    if (pdfSizeKb > expectedSizeKb * 1.5) {
      checks.pdf_size.message += ` (${(pdfSizeKb / expectedSizeKb).toFixed(1)}x expected, may contain large images)`
    }
    
    const passed = Object.values(checks).filter(c => c.valid).length
    const total = Object.keys(checks).length
    
    return {
      valid: passed === total,
      score: (passed / total) * 100,
      checks,
      metrics: {
        renderTimeMs: renderTime,
        pdfSizeKb,
        pdfSizeMb
      }
    }
  }
  
  estimateExpectedSize(context) {
    // Base size for structure + text
    let estimatedKb = 200
    
    // Add for each section
    const sectionsEnabled = Object.values(context.connectors).filter(v => v).length
    estimatedKb += sectionsEnabled * 300
    
    // Add for images (if logo, charts)
    if (context.logoUrl) estimatedKb += 100
    if (context.ga4SessionsChart) estimatedKb += 150
    
    return estimatedKb
  }
}
```

---

## 7. Stage 6: Final Sign-off

### Automated scoring + human review

```javascript
// src/qa/finalSignoff.js

async function generateFinalSignoff(reportData, allValidations) {
  const scores = {
    html_validation: allValidations.html.score || 0,
    accessibility: allValidations.accessibility.score || 0,
    visual_regression: allValidations.visualRegression.valid ? 100 : 0,
    content_quality: allValidations.contentQuality.score || 0,
    performance: allValidations.performance.score || 0
  }
  
  const overallScore = Object.values(scores).reduce((a, b) => a + b) / Object.keys(scores).length
  
  const signoff = {
    reportId: reportData.id,
    timestamp: new Date().toISOString(),
    overallScore: overallScore.toFixed(1),
    status: overallScore >= 80 ? 'APPROVED' : 'REVIEW_REQUIRED',
    scoreBreakdown: scores,
    issues: getAllIssues(allValidations),
    recommendation: getRecommendation(overallScore)
  }
  
  // Log for audit
  await db.report_qa_logs.insert(signoff)
  
  return signoff
}

function getRecommendation(score) {
  if (score >= 95) return 'AUTO_SEND_NOW'
  if (score >= 80) return 'READY_FOR_REVIEW'
  if (score >= 60) return 'NEEDS_IMPROVEMENTS'
  return 'BLOCK_AND_INVESTIGATE'
}

async function sendReportWithSignoff(reportData, signoff) {
  if (signoff.status === 'APPROVED') {
    // Send immediately
    await sendReportEmail(reportData)
    return { sent: true, method: 'AUTO' }
  } else if (signoff.status === 'REVIEW_REQUIRED') {
    // Queue for manual review
    await queueForReview(reportData, signoff)
    return { sent: false, reason: 'PENDING_REVIEW' }
  } else {
    // Block and alert
    await alertQATeam(reportData, signoff)
    return { sent: false, reason: 'BLOCKED' }
  }
}
```

---

## 8. QA Checklist (Human Review)

```
FINAL SIGN-OFF CHECKLIST (before sending):

Visual Quality:
□ Logo clear and properly sized (not stretched, not pixelated)
□ Header colors match workspace branding
□ All fonts readable (16px+ body, proper contrast)
□ Charts render correctly (no cut-off, legends visible)
□ Page breaks appear naturally (not mid-sentence)
□ Footer visible on all pages with correct info

Content Accuracy:
□ All metrics match dashboard (spot-check 3-5 values)
□ Dates match report period (no off-by-one)
□ Insights are specific (not generic)
□ Recommendations have timeline (not "soon", but "by June 15")
□ Benchmark comparison makes sense (same sector)

Completeness:
□ All enabled connectors represented
□ Executive summary present and readable
□ At least 3 insights with fact/context/recommendation
□ At least 2 actionable recommendations
□ Charts present (if data available)

Compliance:
□ No API keys, secrets, or PII in PDF
□ White-label correct (logo, no unwanted branding)
□ Recipient email verified
□ Accessibility OK (no red flags from axe)
□ Mobile-friendly format

Testing:
□ PDF opens in Chrome
□ PDF opens in Adobe Reader
□ PDF opens on mobile (iOS/Android reader)
□ File size reasonable (< 10MB)
□ Renders within 10 seconds
□ QA score >= 80%

Performance:
□ No broken images (all load)
□ No broken links
□ Render time acceptable
□ File downloads smoothly

Sign-off:
□ All checks passed
□ No critical issues
□ QA recommendation: {{recommendation}}
□ Ready to send
□ Signed by: [Reviewer Name]
□ Timestamp: [Date/Time]
```

---

## 9. QA Dashboard (monitoring)

```javascript
// src/qa/qaReporter.js

async function getQAMetrics(timerange = '7days') {
  const reports = await db.report_qa_logs
    .select('*')
    .where('timestamp', '>', timerange)
  
  const metrics = {
    total_reports_generated: reports.length,
    average_qa_score: (
      reports.reduce((sum, r) => sum + r.overallScore, 0) / reports.length
    ).toFixed(1),
    approval_rate: (
      reports.filter(r => r.status === 'APPROVED').length / reports.length * 100
    ).toFixed(1),
    common_issues: getCommonIssues(reports),
    by_template: groupByTemplate(reports),
    by_workspace: groupByWorkspace(reports)
  }
  
  return metrics
}

function getCommonIssues(reports) {
  const issueMap = {}
  
  reports.forEach(report => {
    report.issues.forEach(issue => {
      issueMap[issue.type] = (issueMap[issue.type] || 0) + 1
    })
  })
  
  return Object.entries(issueMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10) // Top 10
}
```

---

## 10. Continuous Improvement Loop

```
Weekly QA Review:
1. Analyze QA metrics (score trends, common issues)
2. Identify patterns (e.g., "chartData missing in 30% of reports")
3. Update templates (fix recurring issues)
4. Update baselines (if visual changes are intentional)
5. Alert dev team (if code issues detected)

Monthly QA Review:
1. Review all blocking issues
2. Update thresholds (if 95% passing, tighten QA)
3. Train team on new patterns
4. Improve test coverage
5. Plan template improvements
```

---

## Summary: QA Pipeline

| Stage | Tool | Threshold | Auto/Manual |
|-------|------|-----------|-------------|
| 1. HTML Validation | Custom parser | 0 errors | Auto |
| 2. Accessibility | axe-core | WCAG 2.1 AA | Auto |
| 3. Visual Regression | pixelmatch | < 2% diff | Auto + Manual |
| 4. Content Quality | Custom validator | >= 80% | Auto |
| 5. Performance | Metrics check | < 10s, < 10MB | Auto |
| 6. Final Sign-off | Human review | >= 80% score | Manual |

**Result:** Consistent, high-quality reports every time. 🚀

---

*Dernière mise à jour : Mai 2025*
