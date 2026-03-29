# FieldMind — Project Notes

## What It Is
AI-powered HVAC diagnostic web app. Helps HVAC techs and homeowners diagnose issues, size systems, estimate jobs, and vent frustrations. Built on Joe's real-world HVAC experience from running his own company.

## The Goal
Replace Joe's $72k/year maintenance tech job with product revenue. Early retirement.

## Live URLs
- Production: https://fieldmind.net (custom domain, purchased 2026-03-28 via Netlify)
- Fallback: https://fieldmind-app.netlify.app
- GitHub: https://github.com/joesnobord/fieldmind
- Netlify admin: https://app.netlify.com/projects/fieldmind-app

## Stack
- Frontend: Vanilla HTML/CSS/JS (single file — index.html)
- Backend: Netlify Functions (Node.js)
- AI: Anthropic Claude (claude-haiku-4-5-20251001)
- Hosting: Netlify (auto-deploy from GitHub main branch)
- Deploy pipeline: GitHub Actions → Netlify CLI

## Deploy Flow
Push to `main` → GitHub Action runs → Netlify deploys automatically. Takes ~60 seconds.

## API Keys (stored in Netlify env vars + TOOLS.md)
- Anthropic key: server-side only (users don't need their own)
- Netlify token: in TOOLS.md
- GitHub token: in TOOLS.md

## App Structure
5 modes (tabs):
1. **Diagnostics** — system info sidebar + diagnostic quick prompts
2. **System Sizing** — climate/home info for load calc guidance
3. **Installation** — job type, system type, lineset, refrigerant info
4. **Job Estimating** — pricing guidance based on region/tier/job type
5. **Tech Frustrations** — vent mode, supportive tone, no fields

## Key Features
- Frustration meter (1-10) — adjusts AI tone/urgency accordingly
- System context sidebar — feeds structured info to AI silently
- "How do I know?" expandable helpers — critical for homeowner users
- Live "what AI sees" panel — shows confidence level
- Photo upload — vision-capable, Claude can analyze images
- Server-side API key — users just chat, no setup required

## Decisions Made
- **BYOK → server-side key** (2026-03-28): Switched to Joe paying for API, users get free access during beta
- **GitHub Actions deploy** (2026-03-28): Netlify's native GitHub integration required browser OAuth, worked around with CLI action
- **Claude Haiku** (current model): Fast and cheap for beta. Consider upgrading to Sonnet for more complex diagnosis accuracy later.
- **Single HTML file**: Keeps it simple. May need to split as app grows.

## Monetization (TBD)
Not yet implemented. Options:
- Freemium: basic free, pro paid ($X/month)
- Credit packs: homeowners buy diagnosis credits
- Contractor tier: monthly subscription, advanced features, job history
- White-label: sell to HVAC companies for their own branded tool

## Roadmap Ideas
- [ ] User accounts / saved conversation history
- [ ] Refrigerant pressure-temperature charts built in
- [ ] Parts lookup / supplier integration
- [ ] Contractor directory / lead gen
- [ ] Mobile app (PWA first, native later)
- [ ] Subscription/payment (Stripe)
- [ ] Custom domain (fieldmind.ai or similar)

## Known Issues / Tech Debt
- Single HTML file is getting large — consider splitting CSS/JS
- No error logging/monitoring yet (add Sentry or similar)
- No rate limiting on the API function (could get expensive if abused)
- Conversation history grows unbounded — could hit token limits on long chats
