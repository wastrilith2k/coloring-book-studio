# Coloring Book Studio

An AI-powered coloring book creation platform designed for indie authors publishing on Amazon KDP. Brainstorm concepts with AI chat, generate print-ready coloring pages across multiple AI models, manage costs, and export KDP-compliant PDFs -- all from one interface.

![React](https://img.shields.io/badge/React-19-blue)
![Vite](https://img.shields.io/badge/Vite-7-purple)
![AWS](https://img.shields.io/badge/AWS-CDK-orange)
![License](https://img.shields.io/badge/License-MIT-green)

## What It Does

Coloring Book Studio is a full workflow tool for creating coloring books from concept to print-ready PDF:

1. **Brainstorm** a book concept with AI (theme, audience, page count)
2. **Generate** black-and-white coloring page illustrations using multiple AI models
3. **Curate** by generating variations, approving your favorites, and iterating on prompts
4. **Export** as KDP-ready interior PDF, cover PDF, or image ZIP

The app is multi-user with Cognito authentication. The first user to sign up becomes the admin and can control which AI models are available and monitor generation costs across all users.

## App Features

### Book Creation Wizard
- Choose from 6 preset themes (Enchanted Forest, Space Adventure, Ocean World, Dinosaur Land, Fairy Tales, Farm Life) or enter a custom theme
- Select a target audience (Toddlers 2-4, Kids 5-8, Tweens 9-12, Adults) which adjusts complexity
- Set page count (5-50 pages)
- AI generates a complete book concept: title, tagline, description, and scene prompts for every page
- Regenerate individual pages or the entire concept before saving

### Book Studio (Main Editor)
- **Left sidebar**: Book title, approval progress counter, download button, book notes, and scrollable page list with thumbnails
- **Prompt panel**: Edit page title, character style guide, scene/prompt, caption, and notes per page. AI can auto-generate prompts that fit the book's theme.
- **Image carousel**: Browse generated image attempts, generate new ones, approve/reject, download or delete individual images
- **Cover page**: Dedicated cover workflow with auto-generated cover prompt based on book title and tagline

### Image Generation
- **Multiple AI models** with a dropdown selector on the generate screen:
  - **GPT Image Mini** (OpenAI) -- Fast and cheap (~$0.005/image), 1024x1536 portrait
  - **GPT Image 1** (OpenAI) -- Higher quality (~$0.015/image), 1024x1536 portrait
  - **Gemini Flash** (Google) -- Multimodal generation (~$0.07/image)
  - **Gemini 3.1 Flash** (Google) -- Preview model (~$0.07/image)
- All prompts automatically include a coloring-book style hint: thick clean outlines, no shading, no filled colors, pure white background
- Copyright/safety filter retry: if a prompt is blocked, the system automatically retries with a sanitized version
- Up to 3 automatic retries on generation failure
- Images stored in S3 with presigned URLs

### Print Pipeline (300 DPI)
- When you approve an image, it is automatically **upscaled to 2550x3300px (8.5x11" at 300 DPI)** using Sharp with Lanczos3 resampling
- White background fill for any transparency
- Print version stored separately with `-print.png` suffix
- Original generation kept for fast browsing; print version used in downloads

### KDP Export
The download modal offers three options, each tailored for Amazon KDP:

- **KDP Interior PDF** -- All coloring pages (no cover) in an 8.5x11" PDF at 300 DPI. Upload directly as KDP manuscript interior. Pages fill the full trim area.
- **KDP Cover PDF** -- Front cover as a single-page PDF. KDP requires covers uploaded separately.
- **Images ZIP** -- All approved images as individual 300 DPI PNGs for manual arrangement or use outside KDP.

### AI Chat Assistant
- Streaming chat via WebSocket (falls back to HTTP if WebSocket unavailable)
- Context-aware: when a book is open, the chat knows the title, concept, and all page scenes
- Powered by OpenRouter (Gemini 2.0 Flash by default)
- Useful for brainstorming new scenes, refining prompts, or getting creative direction
- Chat history persisted in session storage

### Admin Panel (Admin Only)
The first user to sign up automatically becomes the admin. The admin sees a Settings button in the top bar that opens a full admin dashboard:

- **Cost summary cards**: Total spent, total images generated, number of users, average cost per image
- **Daily usage chart** (last 30 days): Bar chart of images generated and cost per day
- **By-model breakdown**: Table showing images and total cost per AI model
- **Per-user usage reports**: Click any user to expand a day-by-day breakdown showing date, image count, cost, and which models were used. Shows user email (from Cognito JWT).
- **Model toggles**: Enable or disable AI models for all users. At least one must remain enabled. Changes apply immediately.

Every successful image generation is logged to a `generation_log` table with user ID, email, model, and cost. This data persists even if images are later deleted, giving accurate lifetime cost tracking.

### Other Features
- **Dark/light theme** toggle (persisted in localStorage)
- **Book library** with dropdown in the top bar, book deletion with confirmation
- **Book notes** (global) and **page notes** (per page) for keeping track of ideas
- **Page management**: Add or delete pages from the sidebar
- **Prompt guide tooltips** for crafting effective coloring page prompts

## Tech Stack

### Frontend
- **React 19** with Vite 7
- **AWS Amplify** (v6) for Cognito authentication UI
- **pdf-lib** for client-side PDF generation
- **jszip** for client-side ZIP creation
- **Lucide React** icons
- Custom CSS (~2800 lines) with CSS variables for theming

### Backend (AWS Lambda)
- **HTTP API Gateway** with Cognito JWT authorizer
- **WebSocket API Gateway** with custom JWT authorizer for streaming chat
- **Lambda** functions (Node.js 20) -- single function handles all HTTP routes, separate function for WebSocket
- **Turso** (libSQL/SQLite) database with auto-migrating schema
- **S3** for image storage with presigned URLs (1-hour expiry)
- **Sharp** for image upscaling (Lanczos3 resampling to 300 DPI)
- **OpenRouter** for AI chat (streaming SSE + non-streaming)
- **Google Gemini API** for image generation (direct REST)
- **OpenAI API** for image generation (GPT Image 1 / Mini)
- **SSM Parameter Store** for secrets (loaded once per cold start)
- **CloudFront** for frontend hosting with SPA routing

### Infrastructure
- **AWS CDK** (TypeScript) -- single stack deploys everything:
  - Cognito User Pool with self-signup
  - S3 buckets (images: retained on delete, frontend: auto-destroyed)
  - CloudFront distribution with SPA fallback
  - HTTP API Gateway + WebSocket API Gateway
  - Three Lambda functions (API, WebSocket, WS Authorizer)
  - SSM Parameter Store read permissions
  - Rate limiting: 100 req/s burst, 50 req/s sustained

### Database Schema
- `books` -- title, concept, tagLine, cover_url, notes
- `pages` -- title, scene, prompt, character_style, image_url, sort_order, caption, notes
- `image_attempts` -- page_id, url, attempt_number, approved
- `cover_attempts` -- book_id, url, attempt_number, approved
- `admin_settings` -- key/value store for global config (enabled models, admin user ID)
- `generation_log` -- user_id, user_email, model_id, cost_cents, created_at (persists after image deletion)
- `settings` -- per-user settings (reserved for future use)

## Prerequisites

- Node.js 18+
- npm
- AWS account with CDK bootstrapped (`npx cdk bootstrap`)
- [OpenRouter API Key](https://openrouter.ai/) -- for AI chat
- [Gemini API Key](https://aistudio.google.com/apikey) -- for Gemini image generation
- [OpenAI API Key](https://platform.openai.com/api-keys) -- for GPT Image generation
- [Turso Database](https://turso.tech/) -- free tier works

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/wastrilith2k/coloring-book-studio.git
   cd coloring-book-studio
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd lambda && npm install && cd ..
   cd infra && npm install && cd ..
   ```

3. **Configure secrets in AWS SSM Parameter Store**
   ```bash
   aws ssm put-parameter --name "/coloring-book-studio/TURSO_DATABASE_URL" --value "libsql://your-db.turso.io" --type SecureString
   aws ssm put-parameter --name "/coloring-book-studio/TURSO_AUTH_TOKEN" --value "your-token" --type SecureString
   aws ssm put-parameter --name "/coloring-book-studio/OPENROUTER_API_KEY" --value "sk-or-..." --type SecureString
   aws ssm put-parameter --name "/coloring-book-studio/GEMINI_API_KEY" --value "AIza..." --type SecureString
   aws ssm put-parameter --name "/coloring-book-studio/OPENAI_API_KEY" --value "sk-..." --type SecureString
   ```

4. **Deploy infrastructure**
   ```bash
   npm run cdk:deploy
   ```
   Note the stack outputs -- you'll need the API URL, WebSocket URL, User Pool ID, and Client ID.

5. **Configure frontend environment**
   ```bash
   cp .env.example .env
   ```
   Fill in the values from CDK outputs.

6. **Deploy frontend**
   ```bash
   FRONTEND_BUCKET=<bucket-name> DISTRIBUTION_ID=<dist-id> npm run deploy:frontend
   ```

## Local Development

```bash
npm run dev
```

The frontend dev server runs at `http://localhost:5173` and connects to your deployed API Gateway endpoints configured in `.env`.

## Environment Variables

### Frontend (.env)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | HTTP API Gateway endpoint |
| `VITE_WS_URL` | WebSocket API Gateway endpoint |
| `VITE_USER_POOL_ID` | Cognito User Pool ID |
| `VITE_USER_POOL_CLIENT_ID` | Cognito User Pool Client ID |
| `VITE_COGNITO_DOMAIN` | Cognito hosted UI domain |

### Lambda (SSM Parameter Store: /coloring-book-studio/*)

| Parameter | Description |
|-----------|-------------|
| `TURSO_DATABASE_URL` | Turso database URL |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `OPENROUTER_API_KEY` | OpenRouter API key (chat) |
| `GEMINI_API_KEY` | Google Gemini API key (image gen) |
| `OPENAI_API_KEY` | OpenAI API key (GPT Image gen) |

### Set by CDK (automatic)

| Variable | Description |
|----------|-------------|
| `S3_BUCKET_NAME` | Image storage bucket |
| `ALLOWED_ORIGINS` | CORS origins (CloudFront URL) |
| `USER_POOL_ID` | Cognito User Pool ID (WS auth) |
| `USER_POOL_CLIENT_ID` | Cognito Client ID (WS auth) |

## API Endpoints

All endpoints require `Authorization: Bearer <cognito-id-token>`.

### Books
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/books` | List user's books |
| GET | `/api/books/:id` | Get book with pages |
| POST | `/api/books` | Create book from concept |
| PUT | `/api/books/:id` | Update book (notes) |
| DELETE | `/api/books/:id` | Delete book and all data |
| GET | `/api/books/:id/download` | Get presigned URLs for all approved images |
| POST | `/api/books/:id/cleanup` | Delete non-approved image attempts |

### Pages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/books/:id/pages` | Add pages to book |
| PUT | `/api/pages/:id` | Update page fields |
| DELETE | `/api/pages/:id` | Delete page |

### Images
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pages/:id/images` | List image attempts |
| POST | `/api/pages/:id/images` | Save generated image |
| POST | `/api/pages/:pageId/images/:imageId/approve` | Approve/reject (triggers 300 DPI upscale) |
| DELETE | `/api/pages/:pageId/images/:imageId` | Delete attempt |

### Covers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/books/:id/cover/images` | List cover attempts |
| POST | `/api/books/:id/cover/images` | Save cover image |
| POST | `/api/books/:id/cover/images/:imageId/approve` | Approve/reject cover |
| DELETE | `/api/books/:id/cover/images/:imageId` | Delete cover attempt |

### Generation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate-image` | Generate image (body: `{prompt, modelId}`) |
| POST | `/api/ideas` | Generate book concept |
| POST | `/api/ideas/page` | Regenerate single page |
| POST | `/api/chat` | Chat completion (HTTP fallback) |

### Settings & Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get enabled models + admin status |
| GET | `/api/admin/stats` | Generation cost stats (admin only) |
| PUT | `/api/admin/models` | Update enabled models (admin only) |

### WebSocket Actions
| Action | Description |
|--------|-------------|
| `sendMessage` | Stream chat response via OpenRouter |
| `generateIdeas` | Stream book concept generation |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build frontend for production |
| `npm run deploy:frontend` | Build + sync S3 + invalidate CloudFront |
| `npm run cdk:deploy` | Deploy full AWS infrastructure |
| `npm run cdk:diff` | Preview infrastructure changes |

## Usage Workflow

1. **Sign up** -- First user becomes admin automatically
2. **Create a Book** -- Wizard: pick theme + audience + page count, AI generates full concept
3. **Refine Prompts** -- Edit page titles, scenes, and prompts; use AI generate button for suggestions
4. **Generate Images** -- Pick a model from the dropdown, click Generate. Try multiple attempts per page.
5. **Approve Favorites** -- Click Select on the best image for each page (auto-upscales to 300 DPI)
6. **Generate Cover** -- Switch to the Cover page, customize the prompt, generate and approve
7. **Download for KDP** -- Once all pages are approved, click "Download for KDP" and choose Interior PDF, Cover PDF, or Images ZIP
8. **Upload to KDP** -- Upload the interior PDF as your manuscript and the cover PDF as your cover on kdp.amazon.com

## License

MIT
