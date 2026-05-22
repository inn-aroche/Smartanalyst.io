# Report Generation

## Trigger
- Manual: POST /api/v1/reports/generate
- Auto: 1st of month (configured)

## Flow
1. Fetch metrics
2. Generate insights
3. Create HTML (Handlebars)
4. Convert to PDF (Playwright)
5. Upload to Storage
6. Send via email

---
