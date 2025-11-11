# Deployment Guide

Complete deployment instructions for PR Summarizer Bot.

## Prerequisites

- Node.js 18+ and npm 9+
- Redis instance (local, cloud, or managed service)
- GitHub App credentials
- OpenAI API key (or Anthropic API key)
- Target deployment platform (Vercel, Railway, Docker, or custom)

---

## 1. GitHub App Registration

### Create GitHub App

1. Navigate to: `https://github.com/settings/apps/new`
2. Fill in required fields:

**Basic Information:**
- **GitHub App name**: `PR Summarizer Bot` (or custom name)
- **Homepage URL**: Your deployment URL or repository URL
- **Webhook URL**: `https://your-deployment-url.com/api/github/webhooks`
- **Webhook secret**: Generate random string (save for `.env`)

**Permissions:**
- Repository permissions:
  - **Pull requests**: Read & write
  - **Contents**: Read-only
  - **Metadata**: Read-only

**Subscribe to events:**
- [x] Pull request

**Where can this GitHub App be installed?**
- Choose: "Any account" (public) or "Only on this account" (private)

3. Click **Create GitHub App**

### Generate Private Key

1. On the app settings page, scroll to "Private keys"
2. Click **Generate a private key**
3. Download `.pem` file (save securely)
4. Convert to single-line format for `.env`:
   ```bash
   awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' path/to/downloaded-key.pem
   ```

### Get App ID

- On app settings page, note the **App ID** (numeric value)

### Install the App

1. Click "Install App" tab
2. Select repository or organization
3. Choose "All repositories" or "Only select repositories"
4. Complete installation

---

## 2. Environment Configuration

### Create `.env` File

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### Configure Required Variables

```bash
# GitHub App Configuration
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret_from_step_1

# LLM Provider Configuration
LLM_PROVIDER=openai  # or 'anthropic'
OPENAI_API_KEY=sk-proj-...  # From OpenAI dashboard

# Redis Configuration
REDIS_URL=redis://localhost:6379  # Update for production

# Server Configuration
PORT=3000
NODE_ENV=production

# Optional: Rate Limiting
RATE_LIMIT_WINDOW_SECONDS=10
RATE_LIMIT_MAX_REQUESTS=1

# Optional: Processing Limits
MAX_DIFF_SIZE_LINES=5000
SUMMARIZER_TIMEOUT_MS=90000
```

### Variable Descriptions

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_APP_ID` | ✅ | Numeric App ID from GitHub App settings |
| `GITHUB_PRIVATE_KEY` | ✅ | Private key in PEM format (single-line with `\n`) |
| `GITHUB_WEBHOOK_SECRET` | ✅ | Webhook secret from GitHub App settings |
| `LLM_PROVIDER` | ✅ | `openai` or `anthropic` |
| `OPENAI_API_KEY` | Conditional | Required if `LLM_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` | Conditional | Required if `LLM_PROVIDER=anthropic` |
| `REDIS_URL` | ✅ | Redis connection string |
| `PORT` | Optional | Server port (default: 3000) |
| `NODE_ENV` | Optional | `development` or `production` |

---

## 3. Redis Deployment

### Option 1: Local Redis (Development)

```bash
# Install Redis (macOS)
brew install redis
brew services start redis

# Install Redis (Windows via WSL2 or Docker)
docker run -d -p 6379:6379 redis:alpine

# Verify connection
redis-cli ping
# Expected: PONG
```

### Option 2: Managed Redis (Production)

**Recommended Providers:**

- **Upstash**: Serverless Redis, generous free tier
  ```bash
  # Get connection string from Upstash dashboard
  REDIS_URL=rediss://default:password@region.upstash.io:6379
  ```

- **Redis Labs**: Managed Redis, 30MB free tier
  ```bash
  REDIS_URL=redis://user:password@redis-instance.cloud.redislabs.com:12345
  ```

- **Railway**: Redis addon (if deploying on Railway)
  ```bash
  # Auto-configured via Railway environment variables
  ```

### Verify Redis Connection

```bash
npm run test:redis  # If test script exists
# Or manually test:
node -e "const Redis = require('ioredis'); const redis = new Redis(process.env.REDIS_URL); redis.ping().then(console.log).catch(console.error).finally(() => redis.quit());"
```

---

## 4. Deployment Platforms

### Option 1: Vercel (Serverless)

**Setup:**
1. Install Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Configure: `vercel`
4. Add environment variables via Vercel dashboard or CLI:
   ```bash
   vercel env add GITHUB_APP_ID
   vercel env add GITHUB_PRIVATE_KEY
   vercel env add GITHUB_WEBHOOK_SECRET
   vercel env add OPENAI_API_KEY
   vercel env add REDIS_URL
   ```

**Deploy:**
```bash
vercel --prod
```

**Notes:**
- Vercel supports long-running functions (up to 60s on Pro)
- Use managed Redis (Upstash recommended for serverless)
- Update GitHub App webhook URL to Vercel deployment URL

### Option 2: Railway (Container-based)

**Setup:**
1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Initialize: `railway init`
4. Add Redis addon: `railway add redis`
5. Add environment variables via Railway dashboard

**Deploy:**
```bash
railway up
```

**Notes:**
- Railway provides managed Redis automatically
- Supports long-running processes
- Auto-scales based on usage

### Option 3: Docker (Self-hosted)

**Build Image:**
```bash
docker build -t pr-summarizer-bot .
```

**Run with Docker Compose:**

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

**Start Services:**
```bash
docker-compose up -d
```

**View Logs:**
```bash
docker-compose logs -f app
```

### Option 4: Custom Server (VPS/Cloud)

**Prerequisites:**
- Ubuntu 20.04+ or equivalent
- Node.js 18+ installed
- Redis installed or managed service
- Nginx or Caddy for reverse proxy
- SSL certificate (Let's Encrypt recommended)

**Setup Process:**
```bash
# 1. Clone repository
git clone https://github.com/Poolchaos/pr-summarizer-bot.git
cd pr-summarizer-bot

# 2. Install dependencies
npm ci --production

# 3. Build application
npm run build

# 4. Configure environment
cp .env.example .env
nano .env  # Edit with production values

# 5. Install PM2 for process management
npm i -g pm2

# 6. Start application
pm2 start npm --name "pr-summarizer-bot" -- start

# 7. Configure PM2 startup
pm2 startup
pm2 save
```

**Nginx Configuration** (`/etc/nginx/sites-available/pr-summarizer-bot`):
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site and configure SSL:
```bash
sudo ln -s /etc/nginx/sites-available/pr-summarizer-bot /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.com
sudo systemctl reload nginx
```

---

## 5. Post-Deployment Verification

### Verify GitHub App Webhook

1. Go to GitHub App settings → "Advanced" tab
2. Check "Recent Deliveries"
3. Verify webhook deliveries show "200 OK"

### Test PR Summary Generation

1. Create test repository
2. Install GitHub App on test repository
3. Open a pull request with meaningful changes
4. Verify bot posts summary comment within 30 seconds

### Check Application Health

**Endpoint:** `GET /health` (if implemented)

Expected response:
```json
{
  "status": "healthy",
  "redis": "connected",
  "timestamp": "2025-11-11T12:00:00Z"
}
```

### Monitor Logs

**Vercel:**
```bash
vercel logs --follow
```

**Railway:**
```bash
railway logs
```

**Docker:**
```bash
docker-compose logs -f app
```

**PM2:**
```bash
pm2 logs pr-summarizer-bot
```

---

## 6. Production Security Checklist

### Environment Security
- [ ] All secrets stored in environment variables (never in code)
- [ ] `.env` file excluded from git (verify `.gitignore`)
- [ ] Private key stored securely with restricted access
- [ ] Webhook secret is random and strong (32+ characters)

### GitHub App Security
- [ ] App permissions follow principle of least privilege
- [ ] Webhook URL uses HTTPS
- [ ] Webhook secret configured and validated
- [ ] App installed only on intended repositories

### Network Security
- [ ] Application served over HTTPS/TLS
- [ ] Redis connection encrypted (TLS) if remote
- [ ] Rate limiting configured (`RATE_LIMIT_MAX_REQUESTS`)
- [ ] Input sanitization enabled (built-in)

### Operational Security
- [ ] Audit logging enabled (7-day retention via Redis)
- [ ] Error messages don't expose secrets or internals
- [ ] Dependencies regularly updated (`npm audit`)
- [ ] LLM API keys have spending limits configured

### Compliance
- [ ] No repository code stored (ephemeral processing only)
- [ ] Summary cache respects retention policy (24 hours)
- [ ] Audit logs retained for compliance period (7 days)
- [ ] Data classification applied (no PII in logs)

---

## 7. Monitoring and Troubleshooting

### Key Metrics to Monitor

- **Webhook delivery success rate** (GitHub App settings)
- **LLM API response times** (logs)
- **Redis connection health** (ping interval)
- **Rate limit hit rate** (Redis keys: `rate-limit:*`)
- **Circuit breaker trips** (LLM failures)
- **Summary cache hit rate** (Redis keys: `summary:*`)

### Common Issues

**Issue: Webhook deliveries failing (non-200 status)**
- Verify webhook URL is correct and accessible
- Check server logs for errors
- Verify webhook secret matches `.env`
- Ensure server is running and responsive

**Issue: Bot not posting comments**
- Verify GitHub App has "Pull requests: Read & write" permission
- Check LLM API key is valid and has quota
- Review application logs for errors
- Verify rate limiting isn't blocking requests

**Issue: Redis connection failures**
- Verify `REDIS_URL` is correct
- Check Redis server is running and accessible
- Verify network security groups allow connection
- Test connection with `redis-cli` or similar

**Issue: LLM timeouts or errors**
- Verify API key is valid
- Check LLM provider status page
- Verify `SUMMARIZER_TIMEOUT_MS` is reasonable (default: 90s)
- Review circuit breaker state (resets after 1 minute)

**Issue: "NEEDS_INPUT" responses**
- PR diff may be too small or trivial
- Commit messages may lack context
- Adjust summary prompt if needed (code customization)

### Debug Mode

Enable verbose logging:
```bash
LOG_LEVEL=debug npm start
```

---

## 8. Scaling Considerations

### Single Instance Limits
- Handles ~100-200 PRs/hour (depends on LLM provider)
- Limited by LLM API rate limits and Redis throughput

### Horizontal Scaling
- Deploy multiple instances behind load balancer
- Redis serves as shared state (cache, rate limiting)
- Ensure webhook URL routes to all instances

### Cost Optimization
- Use summary caching (24h TTL) to reduce LLM API calls
- Configure rate limiting to prevent abuse
- Monitor LLM token usage and set spending alerts
- Consider cheaper LLM models for simple PRs

### Performance Tuning
- Adjust `MAX_DIFF_SIZE_LINES` to skip huge PRs
- Reduce `SUMMARIZER_TIMEOUT_MS` for faster failures
- Increase Redis memory if cache hit rate is low
- Use Redis Cluster for high-throughput scenarios

---

## 9. Maintenance

### Regular Tasks

**Weekly:**
- Review webhook delivery logs
- Check LLM API usage and costs
- Monitor Redis memory usage

**Monthly:**
- Update dependencies: `npm update`
- Review and rotate secrets
- Audit application logs for errors

**Quarterly:**
- Review GitHub App permissions
- Update Node.js runtime version
- Conduct security audit: `npm audit`

### Backup and Recovery

**Configuration Backup:**
```bash
# Backup environment variables (redact secrets before storing)
cp .env .env.backup
```

**Redis Backup** (if self-hosted):
```bash
# Manual backup
redis-cli BGSAVE
# Backup file: /var/lib/redis/dump.rdb
```

**Disaster Recovery:**
1. Redeploy application from git repository
2. Restore environment variables from secure storage
3. Verify GitHub App webhook URL
4. Test with sample PR

---

## 10. Support and Resources

### Documentation
- [Probot Documentation](https://probot.github.io/docs/)
- [GitHub Apps Guide](https://docs.github.com/en/apps)
- [LangChain.js Docs](https://js.langchain.com/docs/)

### Community
- [GitHub Issues](https://github.com/Poolchaos/pr-summarizer-bot/issues)
- [Discussions](https://github.com/Poolchaos/pr-summarizer-bot/discussions)

### Commercial Support
Contact repository maintainer for enterprise support options.
