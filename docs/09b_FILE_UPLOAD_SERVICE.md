# 09b_FILE_UPLOAD_SERVICE.md

## Vue d'ensemble

Service permettant aux utilisateurs d'uploader des fichiers Excel/CSV comme **source de données alternative** aux connecteurs API. Utile pour:
- Données historiques (avant connexion API)
- Données impossibles à extraire des APIs (données propriétaires)
- Tests & démo (forfait gratuit/trial)
- Intégration données custom par forfait payant

**Pour qui:** Backend (file upload) + Frontend (UI)

---

## 1. Endpoints

### POST /api/v1/workspaces/{id}/data-sources/upload

Upload un fichier Excel ou CSV.

```
Content-Type: multipart/form-data

{
  "file": <binary>,
  "source_name": "Historical Data Q1 2025",
  "data_type": "metrics" | "transactions" | "custom"
}

Response:
{
  "file_id": "uuid",
  "source_id": "uuid",
  "status": "processing",
  "rows_detected": 1250,
  "columns_detected": 12,
  "estimated_storage_kb": 245
}
```

### GET /api/v1/workspaces/{id}/data-sources

List all uploaded data sources.

```
Response:
{
  "data_sources": [
    {
      "id": "uuid",
      "name": "Historical Data Q1",
      "type": "metrics",
      "status": "processed",
      "rows": 1250,
      "uploaded_at": "2025-05-15T14:00:00Z",
      "storage_kb": 245,
      "canonical_metrics_count": 150
    }
  ],
  "total_storage_kb": 1024,
  "storage_quota_kb": 5120
}
```

### DELETE /api/v1/workspaces/{id}/data-sources/{source_id}

Delete uploaded data source (frees storage).

---

## 2. File Format Specifications

### Excel Format (.xlsx)

```
Header row (row 1):
| date | metric_key | metric_value | source |
| 2025-01-01 | sessions_all | 1250 | custom |
| 2025-01-01 | spend_paid_social | 450.50 | custom |
...

Requirements:
- Column 1: date (YYYY-MM-DD format)
- Column 2: metric_key (canonical metric name)
- Column 3: metric_value (numeric)
- Column 4: source (optional, defaults to 'custom')
- Max rows: 100,000 (per file)
- Max file size: see quotas per plan

Validation:
- Missing headers → Error
- Invalid date format → Error
- Non-numeric values → Warning (skip row)
- Duplicate metric+date → Last one wins
```

### CSV Format (.csv)

```
date,metric_key,metric_value,source
2025-01-01,sessions_all,1250,custom
2025-01-01,spend_paid_social,450.50,custom
...

Same rules as Excel
```

---

## 3. Processing Pipeline

```javascript
async function processUploadedFile(workspace_id, file) {
  try {
    // 1. Validate file (size, format, MIME type)
    validateFile(file, workspace_id)
    
    // 2. Parse Excel/CSV
    const rows = await parseFile(file)
    
    // 3. Validate header row
    validateHeaders(rows[0])
    
    // 4. Transform to canonical_metrics format
    const metrics = rows.slice(1).map(row => ({
      workspace_id,
      date: parseDate(row[0]),
      metric_key: row[1],
      metric_value: parseFloat(row[2]),
      source: row[3] || 'custom', // User-provided data source
      confidence_score: 100,
      recorded_at: new Date()
    }))
    
    // 5. Bulk insert into canonical_metrics
    await db.canonical_metrics.insertMany(metrics)
    
    // 6. Store file reference
    await db.data_sources.insert({
      workspace_id,
      file_id: uuid(),
      file_name: file.name,
      original_size_kb: file.size / 1024,
      row_count: rows.length - 1,
      metric_count: metrics.length,
      status: 'processed',
      uploaded_at: new Date()
    })
    
    // 7. Clear cache (new data available)
    await redis.del(`health_score_${workspace_id}`)
    
    // 8. Trigger insights generation
    await insightsQueue.add('generate', { workspace_id })
    
    return { success: true, metrics_added: metrics.length }
  } catch (error) {
    logger.error('File upload failed', { workspace_id, error })
    throw error
  }
}
```

---

## 4. Storage Quotas par forfait

```javascript
const STORAGE_QUOTAS = {
  'free': {
    max_total_kb: 0,           // No file uploads on free
    max_file_kb: 0,
    max_files: 0,
    max_rows_per_file: 0,
    features: []
  },
  'starter': {
    max_total_kb: 5 * 1024,    // 5 MB
    max_file_kb: 2 * 1024,     // 2 MB per file
    max_files: 3,
    max_rows_per_file: 10000,
    features: ['csv', 'xlsx'],
    retention_days: 90
  },
  'pro': {
    max_total_kb: 50 * 1024,   // 50 MB
    max_file_kb: 10 * 1024,    // 10 MB per file
    max_files: 10,
    max_rows_per_file: 100000,
    features: ['csv', 'xlsx', 'api_sync'], // Can sync file updates weekly
    retention_days: 365
  },
  'agency': {
    max_total_kb: 500 * 1024,  // 500 MB
    max_file_kb: 100 * 1024,   // 100 MB per file
    max_files: 50,
    max_rows_per_file: 1000000,
    features: ['csv', 'xlsx', 'api_sync', 'direct_db_import'],
    retention_days: 'unlimited'
  }
}
```

---

## 5. Data Source Management

```sql
-- New table: data_sources
CREATE TABLE data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- File info
  file_name TEXT NOT NULL,
  file_type TEXT, -- 'csv', 'xlsx'
  original_size_kb INT,
  
  -- Processing
  status TEXT DEFAULT 'processing', -- 'processing', 'processed', 'error'
  error_message TEXT,
  row_count INT,
  metric_count INT,
  
  -- Storage
  stored_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Based on plan retention
  
  -- Usage
  last_synced_at TIMESTAMPTZ,
  sync_frequency TEXT, -- 'once', 'weekly', 'monthly' (Pro+ only)
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_data_sources_workspace ON data_sources(workspace_id);
```

---

## 6. Versioning & Updates

```
Version 1.0: Single upload, data merged into canonical_metrics
Future (Pro+): File sync capability
- User can configure: "Re-download this file every Monday"
- Auto-detects new rows
- Updates existing metrics or appends new ones
```

---

## 7. UI/UX for Upload

```html
<!-- Upload widget -->
<div class="data-source-upload">
  <h3>Ajouter des données custom</h3>
  
  <div class="upload-area">
    <input type="file" accept=".xlsx, .csv" />
    <p>Drag & drop your Excel/CSV file here</p>
  </div>
  
  <div class="quota-display">
    <p>Stockage utilisé: 245 KB / 5 MB</p>
    <progress value="245" max="5120"></progress>
  </div>
  
  <div class="upload-status">
    <!-- Success / Error messages -->
  </div>
  
  <div class="existing-sources">
    <h4>Vos données importées</h4>
    <table>
      <tr>
        <th>Nom</th>
        <th>Lignes</th>
        <th>Taille</th>
        <th>Importé le</th>
        <th>Action</th>
      </tr>
      <!-- List of uploaded files -->
    </table>
  </div>
</div>
```

---

## 8. Checksum & Deduplication

```javascript
// Prevent duplicate data if user uploads same file twice

function computeFileChecksum(file) {
  // SHA256 of file content
  return crypto.createHash('sha256').update(file.content).digest('hex')
}

async function checkDuplicate(workspace_id, checksum) {
  const existing = await db.data_sources
    .findOne({ workspace_id, file_checksum: checksum })
  
  if (existing) {
    return {
      isDuplicate: true,
      message: `File already imported on ${existing.created_at}`,
      sourceId: existing.id
    }
  }
  return { isDuplicate: false }
}
```

---

## Checklist

- [ ] File upload endpoint (POST)
- [ ] File format validation (Excel, CSV)
- [ ] Parse to canonical_metrics
- [ ] Storage quota enforcement per plan
- [ ] Data source list & delete
- [ ] UI for upload
- [ ] Deduplication check
- [ ] Error handling (user-facing messages)
- [ ] Retention policy (delete after X days)
- [ ] Test with 100KB, 1MB, 10MB files

---

*Dernière mise à jour : Mai 2025*
