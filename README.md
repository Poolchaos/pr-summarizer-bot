# PR Summarizer Bot

> A GitHub App that automatically generates AI-powered summaries of pull requests

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)

## Features

- 🤖 **AI-Powered Summaries**: Automatically generates concise PR summaries using GPT-4o or Claude
- ⚡ **Real-time Processing**: Summaries posted within seconds of PR creation
- 🔒 **Secure**: No storage of repository code, ephemeral processing only
- 🎯 **Customizable**: Configure via `.github/pr-summarizer.yml` in your repository
- 📊 **Smart Analysis**: Extracts What/Why/Impact/Notes from diffs and commit messages
- 🚫 **Hallucination Prevention**: Detects insufficient context and requests more information

## Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Redis (for caching and rate limiting)
- OpenAI or Anthropic API key
- GitHub App credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/Poolchaos/pr-summarizer-bot.git
cd pr-summarizer-bot

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# See Environment Variables section below
```

### Environment Variables

```bash
# GitHub App Configuration
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# LLM Provider (choose one)
LLM_PROVIDER=openai  # or 'anthropic'
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Optional Configuration
MAX_DIFF_SIZE_LINES=5000
RATE_LIMIT_WINDOW_SECONDS=10
RATE_LIMIT_MAX_REQUESTS=1
```

### Running Locally

```bash
# Development mode with auto-reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Build for production
npm run build

# Start production server
npm start
```

## Configuration

Create `.github/pr-summarizer.yml` in your repository:

```yaml
# Enable/disable the bot
enabled: true

# Events to summarize
autoSummarizeOn:
  - opened
  - synchronize

# Skip PRs with these labels
ignoreLabels:
  - wip
  - draft

# Maximum diff size (lines)
maxDiffSize: 5000
```

## How It Works

1. **PR Event**: User opens/updates a pull request
2. **Fetch Context**: Bot retrieves diff, commits, and PR description
3. **Generate Summary**: LLM analyzes changes and generates structured summary
4. **Post Comment**: Summary posted as collapsible Markdown comment
5. **Cache Result**: Summary cached for 24 hours to reduce API costs

## Architecture

```
GitHub PR Event → Probot App → Rate Limiter (Redis) →
Fetch Diff → Validate Size → Check Cache →
LLM Summarizer → Format Markdown → Post Comment
```

### Components

- `src/index.ts` - Probot app entry point
- `src/handlers/pullRequest.ts` - PR event orchestration
- `src/services/github.ts` - GitHub API wrapper
- `src/services/summarizer.ts` - LLM integration
- `src/services/cache.ts` - Redis caching and rate limiting
- `src/utils/formatter.ts` - Markdown template generator
- `src/utils/validator.ts` - Input validation and sanitization

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm test -- --coverage

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix
```

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions including:

- GitHub App registration and configuration
- Environment setup for different platforms
- Redis deployment options
- Production security checklist
- Monitoring and troubleshooting

### Quick Deploy Options

**Vercel:**
```bash
npm i -g vercel
vercel --prod
```

**Railway:**
```bash
npm i -g @railway/cli
railway up
```

**Docker:**
```bash
docker build -t pr-summarizer-bot .
docker run -p 3000:3000 --env-file .env pr-summarizer-bot
```

## Security

- ✅ No repository code stored (ephemeral processing)
- ✅ Secrets managed via environment variables only
- ✅ Rate limiting (1 PR per 10 seconds per repository)
- ✅ Input sanitization (prompt injection protection)
- ✅ Audit logging (7-day retention)
- ✅ HTTPS/TLS required for all external communication

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

[MIT](LICENSE)

## Support

- 📖 [Documentation](https://github.com/Poolchaos/pr-summarizer-bot/wiki)
- 🐛 [Report Bug](https://github.com/Poolchaos/pr-summarizer-bot/issues)
- 💡 [Request Feature](https://github.com/Poolchaos/pr-summarizer-bot/issues)

## Acknowledgments

- Built with [Probot](https://probot.github.io/)
- Powered by [LangChain.js](https://js.langchain.com/)
- LLM providers: [OpenAI](https://openai.com/), [Anthropic](https://anthropic.com/)
