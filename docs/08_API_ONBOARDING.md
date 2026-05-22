# 08_API_ONBOARDING.md

## Overview
Complete onboarding flow: signup → URL scraping → business profile detection → first connector → first insights.

## Endpoints

### POST /api/v1/onboarding/start
Initialize onboarding, start URL scraping in background.

### GET /api/v1/onboarding/status/{workspaceId}
Check scraping status.

### POST /api/v1/onboarding/confirm
User confirms/corrects detected profile. Creates workspace with profile.

### POST /api/v1/onboarding/select-connector
User selects first connector to connect.

## URL Scraping

```javascript
// Uses Playwright + Claude Haiku

async function scrapeWebsite(url) {
  try {
    const browser = await playwright.chromium.launch({ headless: true })
    const page = await browser.newPage()
    
    // Load with 8s timeout
    await page.goto(url, { waitUntil: 'networkidle', timeout: 8000 })
    
    // Extract content
    const title = await page.title()
    const headings = await page.$$eval('h1, h2', els => els.map(e => e.textContent))
    const html = await page.content()
    
    await browser.close()
    
    return { title, headings, html }
  } catch (error) {
    // Timeout or network error → fallback to manual
    return null
  }
}
```

## Business Profile Detection

Claude Haiku analyzes scraped content and returns:
```json
{
  "sector": "ecommerce",
  "market": "b2c",
  "brand_keywords": ["fashion", "sustainable"],
  "description": "Online fashion retailer",
  "detected_tools": { "shopify": true, "ga4": true },
  "confidence_score": 85
}
```

## Fallback (if scraping fails)

```html
<form>
  <select name="sector">
    <option>E-commerce</option>
    <option>SaaS</option>
  </select>
  <select name="market">
    <option>B2C</option>
    <option>B2B</option>
  </select>
  <button>Continue</button>
</form>
```

## Timeline

- 0:00 - User clicks "Start onboarding"
- 0:30 - URL scraped, analysis starts
- 1:15 - Profile detected, shown to user
- 2:00 - User confirms
- 2:30 - OAuth redirect for first connector
- 3:45 - Data pull completes
- 4:15 - First insights visible

**Rule: First insight < 3 minutes after signup.**

---
