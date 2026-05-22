# 09c_CONNECTOR_EXTENSIONS.md

## Vue d'ensemble

Roadmap complète des 50+ connecteurs SmartAnalyst. Les 5 connecteurs P1 (GA4, Meta Ads, Google Ads, Stripe, Search Console) sont documentés en détail ailleurs. Ce document couvre les 45+ connecteurs restants, organisés par phase et priorité.

**Pour qui:** Backend (connector implementation), Product (roadmap planning).

---

## Phase 1 MVP (5 connecteurs) — LIVE

- [x] **GA4** (Google Analytics 4) — doc 10
- [x] **Meta Ads** (Facebook Ads Manager) — doc 11
- [x] **Google Ads** (Google Advertising) — doc 12
- [x] **Stripe** (Billing & payments) — doc 13
- [x] **Google Search Console** (SEO data) — doc 14

---

## Phase 2 (Weeks 4-7) — PRIORITAIRE

### E-commerce & Retail

**1. Shopify**
- OAuth flow
- Endpoints: Products, Orders, Revenue, Customers
- Normalized to: spend_ecommerce, revenue_product, conversion_rate_product
- Effort: Medium (REST API straightforward)

**2. WooCommerce**
- API Key auth
- Endpoints: Products, Orders, Customers, Analytics
- Normalized to: revenue_ecommerce, product_views, add_to_cart
- Effort: Medium

**3. Mailchimp**
- OAuth
- Endpoints: Campaigns, Lists, Subscribers, Performance
- Normalized to: email_subscribers, email_opens, email_clicks, email_revenue
- Effort: Low (simple API)

**4. Brevo** (formerly Sendinblue)
- API Key
- Endpoints: Campaigns, Contacts, Email stats
- Normalized to: email_bounces, email_unsubscribes
- Effort: Low

### Paid Social (Extended)

**5. TikTok Ads**
- OAuth (TikTok Business API)
- Endpoints: Campaigns, Ads, Analytics
- Normalized to: spend_tiktok, impressions_tiktok, ctr_tiktok, roas_tiktok
- Effort: Medium

**6. LinkedIn Ads**
- OAuth (LinkedIn Campaign Manager)
- Endpoints: Campaigns, Analytics, Leads
- Normalized to: spend_linkedin, leads_generated, cpc_linkedin, ctr_linkedin
- Effort: Medium

**7. Pinterest Ads**
- OAuth
- Endpoints: Campaigns, Pins, Analytics
- Normalized to: spend_pinterest, impressions_pinterest, clicks_pinterest, ctr_pinterest
- Effort: Medium

### CRM & Marketing Automation

**8. HubSpot**
- OAuth + API Key
- Endpoints: Contacts, Deals, Campaigns, Email sequences
- Normalized to: crm_contacts, deals_value, email_opened, email_clicked
- Effort: Medium (large API surface)

**9. Salesforce**
- OAuth
- Endpoints: Opportunities, Leads, Accounts
- Normalized to: pipeline_value, deal_win_rate, lead_velocity
- Effort: High (complex API)

**10. Klaviyo**
- API Key
- Endpoints: Email campaigns, SMS, Flows, Analytics
- Normalized to: email_revenue, sms_revenue, email_churn
- Effort: Low

---

## Phase 3 (Weeks 8-12) — IMPORTANTS

### Advertising Platforms

**11. Microsoft Ads**
- OAuth (Azure AD)
- Endpoints: Campaigns, Ads, Keywords
- Normalized to: spend_microsoft, clicks_microsoft, ctr_microsoft, roas_microsoft
- Effort: Medium

**12. Amazon Ads**
- OAuth
- Endpoints: Campaigns, Keywords, Performance
- Normalized to: spend_amazon, acos_amazon, roas_amazon
- Effort: Medium

**13. Snapchat Ads**
- OAuth
- Endpoints: Campaigns, Ads, Insights
- Normalized to: spend_snapchat, impressions_snapchat, ctr_snapchat
- Effort: Medium

### Analytics & Tracking

**14. Matomo** (self-hosted or cloud)
- API Token
- Endpoints: Visits, Conversions, Goals, Custom events
- Normalized to: sessions_all, conversions_total, goal_value
- Effort: Medium

**15. Plausible Analytics**
- API Key
- Endpoints: Visitors, Pageviews, Goals, Sources
- Normalized to: sessions_all, bounce_rate_all, goal_completion
- Effort: Low

**16. Fathom Analytics**
- API Key
- Lightweight analytics
- Normalized to: pageviews, visitors, conversions
- Effort: Low

**17. Mixpanel**
- API Key / OAuth
- Endpoints: Events, Cohorts, Funnels, Retention
- Normalized to: event_count, conversion_funnel, user_retention
- Effort: Medium

### E-commerce Platforms (Alternative)

**18. BigCommerce**
- OAuth
- Endpoints: Orders, Products, Customers
- Normalized to: revenue_ecommerce, product_sales, customer_ltv
- Effort: Medium

**19. Magento 2**
- API Token
- Endpoints: Orders, Customers, Products
- Normalized to: revenue_ecommerce, order_count
- Effort: Medium

**20. PrestaShop**
- API Token
- REST API
- Normalized to: revenue_ecommerce, order_value
- Effort: Low

---

## Phase 4 (Months 4-5) — NICE-TO-HAVE

### Subscription & SaaS Metrics

**21. Chargebee**
- API Key
- Subscription management, MRR, churn
- Normalized to: revenue_recurring, mrr, churn_rate_subscription
- Effort: Medium

**22. Recurly**
- API Key
- Subscription data, revenue metrics
- Normalized to: revenue_recurring, arr, dunning_success
- Effort: Medium

**23. PaddleHQ** (formerly Paddle.com)
- API Key
- Revenue, customers, subscriptions
- Normalized to: revenue_total, transaction_count
- Effort: Low

### Customer Support & Feedback

**24. Intercom**
- OAuth
- Conversations, NPS, Surveys
- Normalized to: support_conversations, nps_score, satisfaction
- Effort: Medium

**25. Zendesk**
- OAuth
- Tickets, CSAT, resolution time
- Normalized to: support_tickets, csat_score, resolution_time
- Effort: Medium

**26. Typeform**
- API Key
- Form responses, completion rate
- Normalized to: survey_responses, completion_rate, nps
- Effort: Low

### Content & SEO Tools

**27. SEMrush API**
- API Key
- Keywords, backlinks, competitors
- Normalized to: keyword_rankings, backlink_count, domain_authority
- Effort: High (complex data)

**28. Ahrefs API** (if available)
- API Key
- Similar to SEMrush
- Effort: High

**29. Moz API**
- OAuth / API Key
- Rankings, domain authority, link data
- Normalized to: keyword_rankings, domain_authority
- Effort: Medium

### Marketplace & Seller Platforms

**30. Amazon Seller Central**
- OAuth / API Token
- Orders, sales, inventory
- Normalized to: revenue_marketplace, order_count, inventory_value
- Effort: High (complex auth)

**31. eBay**
- OAuth
- Orders, sales, inventory
- Normalized to: revenue_marketplace, sold_items
- Effort: Medium

**32. Etsy**
- OAuth
- Shop stats, orders, listings
- Normalized to: revenue_marketplace, shop_views, shop_favorites
- Effort: Medium

### Affiliate & Partnership Platforms

**33. Impact (formerly Impact Radius)**
- API Key
- Affiliate campaigns, performance
- Normalized to: revenue_affiliate, affiliate_commission
- Effort: Medium

**34. ShareASale**
- API Key / OAuth
- Merchant data, affiliate performance
- Effort: Low

**35. Refersion**
- API Token
- Influencer campaigns, affiliate sales
- Normalized to: revenue_influencer, influencer_commission
- Effort: Low

### HR & Team Analytics

**36. Guidepoint** (HR insights)
- API Token
- Team engagement, retention
- Normalized to: team_engagement_score, turnover_rate
- Effort: Low

---

## Roadmap Phase 5 (Mois 6+) — FUTURE

### Advanced Analytics

**37-40. Data Warehouse Connectors**
- BigQuery
- Redshift
- Snowflake
- Databricks

### Custom Webhooks

**41-45. User-Provided Data Sources**
- Generic webhook endpoint (user sends POST with metric data)
- Fixed schema validation
- Used for bespoke business metrics

### AI-Powered Connectors (Experimental)

**46-50. Future Connectors (TBD)**
- Slack analytics
- Asana project tracking
- Jira issue tracking
- Calendly booking data
- Custom GraphQL endpoints

---

## Connector Implementation Pattern

All connectors follow the **BaseConnector class** (doc 15):

```javascript
// Template for new connector

class [ConnectorName]Connector extends BaseConnector {
  
  async fetchData({ startDate, endDate }) {
    // 1. Auth (OAuth or API key from Vault)
    const token = await this.getToken()
    
    // 2. Call API with date range
    const response = await fetch(`https://api.example.com/data`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: { startDate, endDate }
    })
    
    // 3. Return raw data
    return response.json()
  }
  
  async normalizeData(rawData) {
    // 4. Transform to canonical_metrics
    const metrics = []
    
    for (const item of rawData.items) {
      metrics.push({
        workspace_id: this.workspaceId,
        date: item.date,
        metric_key: 'spend_example', // Map to canonical
        metric_value: item.amount,
        source: 'example_connector',
        confidence_score: 100
      })
    }
    
    return { workspace_id: this.workspaceId, metrics }
  }
  
  async testConnection() {
    // 5. Verify credentials valid
    try {
      await this.fetchData({ startDate: '2025-01-01', endDate: '2025-01-02' })
      return true
    } catch (error) {
      return false
    }
  }
  
  async _doRefresh() {
    // 6. Refresh OAuth token if needed
    const newToken = await refreshOAuthToken(this.connector.refresh_token)
    await db.connectors.update(this.connector.id, { access_token: newToken })
  }
}
```

---

## Connector Priority Matrix

```
High Impact (many users want it):
├─ Shopify (e-commerce)
├─ HubSpot (CRM)
├─ LinkedIn Ads (B2B)
├─ Microsoft Ads (enterprise)
└─ TikTok Ads (trend)

Medium Impact:
├─ WooCommerce
├─ Klaviyo
├─ Pinterest Ads
├─ Mailchimp
└─ Matomo

Low Impact:
├─ Brevo
├─ Plausible
├─ Fathom
└─ Typeform
```

---

## Implementation Effort vs Demand

| Connector | Effort | Demand | Priority |
|-----------|--------|--------|----------|
| Shopify | Medium | High | P1 |
| HubSpot | Medium | High | P1 |
| TikTok Ads | Medium | High | P1 |
| LinkedIn Ads | Medium | High | P1 |
| WooCommerce | Medium | Medium | P2 |
| Mailchimp | Low | Medium | P2 |
| Klaviyo | Low | Medium | P2 |
| Matomo | Medium | Low | P3 |
| BigQuery | High | High | P4 |
| Salesforce | High | Medium | P4 |

---

## Launch Strategy

**Week 1-3 (Phase 1):** 5 connecteurs P1 (GA4, Meta, Google Ads, Stripe, SC)  
**Week 4-7 (Phase 2):** 10 connecteurs (Shopify, HubSpot, TikTok, LinkedIn, etc.)  
**Week 8-12 (Phase 3):** 15+ connecteurs (analytics, e-commerce alt, CRM)  
**Month 4-5:** Data warehouse + custom webhooks  
**Roadmap:** 50+ connecteurs total

---

## Checklist pour nouveau connecteur

- [ ] OAuth ou API key configured
- [ ] API documentation reviewed
- [ ] Rate limits understood
- [ ] fetchData() implemented
- [ ] normalizeData() maps to canonical_metrics
- [ ] testConnection() works
- [ ] Error handling for 401, 429, 5xx
- [ ] Token refresh logic (if OAuth)
- [ ] Tested locally with real data
- [ ] Documented in this file + specific doc

---

*Dernière mise à jour : Mai 2025*
