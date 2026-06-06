# LinkedIn Auto Poster

Production-ready automated LinkedIn publishing system built with **Next.js 15**, **TypeScript**, and **GitHub Actions**. Publishes one post per day from a JSON content file — no database required.

## Features

- Daily automated publishing via GitHub Actions cron
- LinkedIn UGC Posts API integration with retry logic
- GitHub Contents API for persistent JSON state (Vercel-safe)
- Preview and status APIs for monitoring campaign progress
- Duplicate prevention — never reposts already-published content
- Automatic hashtag appending to post text
- Scales from 10 to 30+ posts without code changes
- Structured logging for publish success/failure

## Project Structure

```
linkedin-auto-poster/
├── app/api/
│   ├── publish/route.ts    # GET — publish next unpublished post
│   ├── preview/route.ts    # GET — preview next post
│   └── status/route.ts     # GET — campaign status
├── lib/
│   ├── linkedin.ts         # LinkedIn UGC Posts API client
│   ├── github.ts           # GitHub Contents API persistence
│   ├── posts.ts            # Content loading, publishing logic
│   └── logger.ts           # Structured logging
├── data/content.json       # Your 10-day content campaign
├── types/post.ts           # TypeScript interfaces
└── .github/workflows/publish.yml
```

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/linkedin-auto-poster.git
cd linkedin-auto-poster
npm install
cp .env.example .env.local
```

### 2. Configure environment variables

Edit `.env.local`:

```env
LINKEDIN_TOKEN=your_access_token
LINKEDIN_PERSON_ID=your_person_id
GITHUB_TOKEN=your_github_pat
GITHUB_OWNER=your_username
GITHUB_REPO=linkedin-auto-poster
USE_LOCAL_STORAGE=true   # use local JSON during development
```

### 3. Replace content

Replace `data/content.json` with your own structured JSON. Each item in `days[]` must include:

```json
{
  "day": 1,
  "title": "Post Title",
  "topic": "Topic Category",
  "linkedinPost": "Your post text...",
  "hashtags": ["AI", "Tech"],
  "metricsHighlighted": ["metric 1"],
  "imageSuggestion": "Optional image idea",
  "posted": false,
  "postedAt": null
}
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and test the API endpoints:

| Endpoint | Description |
|---|---|
| `GET /api/status` | Campaign progress |
| `GET /api/preview` | Next post preview with hashtags |
| `GET /api/publish` | Publish the next unpublished post |

## LinkedIn Developer App Setup

1. Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers/)
2. Create a new app and associate it with your LinkedIn Page (if required)
3. Under **Products**, request access to **Share on LinkedIn** (w_member_social scope)
4. Under **Auth**, add redirect URLs if using OAuth flow
5. Generate an access token with `w_member_social` permission

### Getting your Person ID

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.linkedin.com/v2/userinfo
```

Use the `sub` field as your `LINKEDIN_PERSON_ID`.

### Token notes

- Personal access tokens expire. For production, implement OAuth 2.0 refresh token flow or use LinkedIn's token management
- The app uses the [UGC Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/ugc-post-api) endpoint

## GitHub Token Setup

Create a [Personal Access Token (classic)](https://github.com/settings/tokens) with:

- `repo` scope (full control of private repositories)

Or for public repos only:

- `public_repo` scope

Required secrets/variables:

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | PAT with repo write access |
| `GITHUB_OWNER` | Your GitHub username or org |
| `GITHUB_REPO` | Repository name |
| `GITHUB_BRANCH` | Branch name (default: `main`) |
| `GITHUB_CONTENT_PATH` | Path to JSON (default: `data/content.json`) |

### Why GitHub for storage?

Vercel's filesystem is **ephemeral** — writes don't persist between deployments or function invocations. The GitHub Contents API commits updated `content.json` back to your repo after each publish, making state durable and auditable.

## Vercel Deployment

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Set environment variables in Vercel dashboard:

```
LINKEDIN_TOKEN
LINKEDIN_PERSON_ID
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
PUBLISH_SECRET
```

4. **Do not** set `USE_LOCAL_STORAGE` in production
5. Deploy

The app uses the Node.js runtime (`export const runtime = "nodejs"`) for full filesystem and fetch API support.

## GitHub Actions Automation

The workflow at `.github/workflows/publish.yml` runs daily at **09:00 UTC**.

### Required GitHub Secrets

| Secret | Value |
|---|---|
| `VERCEL_DEPLOY_URL` | `https://your-app.vercel.app` |
| `PUBLISH_SECRET` | Same value as Vercel `PUBLISH_SECRET` |

### Manual trigger

Go to **Actions → Daily LinkedIn Publish → Run workflow** to publish immediately.

### Customize schedule

Edit the cron expression in `publish.yml`:

```yaml
schedule:
  - cron: "0 9 * * *"   # 09:00 UTC daily
```

Use [crontab.guru](https://crontab.guru/) to build custom schedules.

## API Reference

### `GET /api/publish`

Publishes the first unpublished post (sorted by `day`).

**Auth** (optional): `Authorization: Bearer {PUBLISH_SECRET}`

**Success response:**

```json
{
  "success": true,
  "day": 1,
  "title": "The AI Engineering Mindset",
  "linkedInPostId": "urn:li:share:123456",
  "postedAt": "2026-06-07T09:00:00.000Z",
  "message": "Successfully published day 1: The AI Engineering Mindset"
}
```

**409 response:** All posts already published.

### `GET /api/preview`

Returns the next unpublished post with hashtags appended.

### `GET /api/status`

Returns campaign progress:

```json
{
  "success": true,
  "status": {
    "totalPosts": 10,
    "postedCount": 3,
    "remainingCount": 7,
    "completionPercentage": 30,
    "nextScheduledPost": { "day": 4, "title": "..." },
    "campaignComplete": false
  }
}
```

## Error Handling

| Scenario | Behavior |
|---|---|
| LinkedIn API 429/5xx | Exponential backoff retry (3 attempts) |
| GitHub API 429/5xx | Exponential backoff retry (3 attempts) |
| Already posted | 409 — duplicate prevention |
| Empty post text | 400 — validation error |
| Post > 3000 chars | 400 — LinkedIn limit enforced |
| LinkedIn succeeds, GitHub fails | 500 — logged with post ID for manual reconciliation |
| Unauthorized publish | 401 — when `PUBLISH_SECRET` is set |

## Extending to 30+ Posts

Add more entries to the `days[]` array in `content.json`. No code changes needed. The system:

- Finds the first `posted: false` entry by `day` order
- Updates `timeline[]` status on publish
- Tracks progress via `/api/status`

## Local Development Tips

```bash
# Type check
npm run typecheck

# Build for production
npm run build

# Test status endpoint
curl http://localhost:3000/api/status

# Test preview
curl http://localhost:3000/api/preview

# Test publish (requires LinkedIn credentials)
curl http://localhost:3000/api/publish
```

Set `USE_LOCAL_STORAGE=true` to read/write `data/content.json` locally without GitHub API calls.

## License

MIT
