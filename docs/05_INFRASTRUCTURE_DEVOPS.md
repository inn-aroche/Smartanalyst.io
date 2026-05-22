# 05_INFRASTRUCTURE_DEVOPS.md

## Vue d'ensemble
Configuration complète VPS Hostinger + PM2 + Nginx + Redis + monitoring.

## 1. VPS Bootstrap (Ubuntu 24.04)

```bash
#!/bin/bash
# Bootstrap script for new VPS

# Update system
apt-get update && apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# Install Redis
apt-get install -y redis-server
systemctl enable redis-server
systemctl start redis-server

# Install PM2
npm install -g pm2
pm2 startup
pm2 save

# Install Nginx
apt-get install -y nginx
systemctl enable nginx

# Install Certbot (SSL)
apt-get install -y certbot python3-certbot-nginx

# Setup firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

echo "✅ VPS bootstrap complete"
```

## 2. PM2 Configuration

```javascript
// ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'smartanalyst-app',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'smartanalyst-scheduler',
      script: 'src/scheduler/jobs.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: 'production' }
    }
  ]
}
```

## 3. Nginx Configuration

```nginx
# /etc/nginx/sites-available/smartanalyst

upstream smartanalyst_app {
  server 127.0.0.1:3000;
}

server {
  listen 80;
  server_name app.smartanalyst.io;
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name app.smartanalyst.io;

  ssl_certificate /etc/letsencrypt/live/app.smartanalyst.io/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.smartanalyst.io/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  location / {
    proxy_pass http://smartanalyst_app;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
  }

  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
  }
}
```

## 4. Environment variables checklist

```bash
# .env
PORT=3000
NODE_ENV=production
APP_URL=https://app.smartanalyst.io
JWT_SECRET=[64 random chars]

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# Redis
REDIS_URL=redis://localhost:6379

# API Keys
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
META_APP_ID=...
META_APP_SECRET=...
```

## 5. Monitoring

```javascript
// Basic health check endpoint
app.get('/<health>', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  })
})
```

---

