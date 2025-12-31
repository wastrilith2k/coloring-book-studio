# Coloring Book Studio

An AI-powered coloring book creation tool that uses Google's Gemini models to brainstorm book concepts and generate coloring page illustrations.

![React](https://img.shields.io/badge/React-19-blue)
![Vite](https://img.shields.io/badge/Vite-7-purple)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **AI Chat Assistant** – Brainstorm coloring book ideas with Gemini 2.0 Flash via streaming chat
- **Concept Generator** – Generate complete book outlines with themes, scenes, and prompts
- **Image Generation** – Create coloring page illustrations using Gemini's image generation model
- **Book Library** – Save and manage multiple coloring book projects
- **Image Management** – Generate multiple variations, approve favorites, and track attempts
- **Cover Generation** – Create book covers with the same AI workflow
- **Export** – Download completed books as ZIP archives
- **Cloud Storage** – Images stored on Cloudinary for persistence

## Tech Stack

- **Frontend**: React 19, Vite, Lucide Icons, Vercel AI SDK
- **Backend**: Express.js, better-sqlite3
- **AI**: Google Gemini API (2.0 Flash for chat, 2.5 Flash Preview for images)
- **Storage**: Cloudinary (images), SQLite (metadata)

## Prerequisites

- Node.js 18+
- npm or yarn
- [Google AI Studio API Key](https://aistudio.google.com/apikey)
- [Cloudinary Account](https://cloudinary.com/) (free tier works)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/coloring-book-studio.git
   cd coloring-book-studio
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your API keys:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key
   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_MODEL=gemini-2.5-flash-preview-09-2025
   GEMINI_CHAT_MODEL=gemini-2.0-flash
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

4. **Start the development servers**

   In one terminal, start the backend:
   ```bash
   npm run server
   ```

   In another terminal, start the frontend:
   ```bash
   npm run dev
   ```

5. **Open the app**

   Navigate to [http://localhost:5173](http://localhost:5173)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run server` | Start Express backend |
| `npm run seed:bakery` | Seed database with sample book |
| `npm run lint` | Run ESLint |

## Project Structure

```
coloring-book-studio/
├── src/
│   ├── components/
│   │   ├── BookViewer.jsx     # Main book editing interface
│   │   ├── ChatPanel.jsx      # AI chat and concept generator
│   │   └── ImageGenerator.jsx # Image generation component
│   ├── App.jsx                # Main application
│   ├── App.css                # Styles
│   └── main.jsx               # Entry point
├── server/
│   ├── index.js               # Express server & API routes
│   ├── db.js                  # SQLite database setup
│   └── seed-bakery.js         # Database seeder
├── data/
│   └── bakeryWitch.js         # Sample book data for seeding
└── public/                    # Static assets
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/books` | List all books |
| GET | `/api/books/:id` | Get book with pages |
| POST | `/api/books` | Create new book |
| DELETE | `/api/books/:id` | Delete book |
| GET | `/api/books/:id/download` | Download book as ZIP |
| POST | `/api/chat` | Stream chat with Gemini |
| POST | `/api/ideas` | Generate book concept |
| POST | `/api/pages/:id` | Update page |
| DELETE | `/api/pages/:id` | Delete page |
| POST | `/api/upload` | Upload image to Cloudinary |
| GET/POST/DELETE | `/api/pages/:id/attempts` | Manage image attempts |
| GET/POST/DELETE | `/api/books/:id/cover-attempts` | Manage cover attempts |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_GEMINI_API_KEY` | Gemini API key (frontend) | Yes |
| `GEMINI_API_KEY` | Gemini API key (backend) | Yes |
| `GEMINI_MODEL` | Model for image generation | No (default: gemini-1.5-flash) |
| `GEMINI_CHAT_MODEL` | Model for chat | No (default: gemini-2.0-flash) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Yes |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes |
| `CLOUDINARY_FOLDER` | Cloudinary folder | No (default: coloring-book-studio) |
| `PORT` | Server port | No (default: 8788) |
| `SQLITE_PATH` | Custom database path | No |

## Usage

1. **Create a Book Concept**
   - Use the chat panel to brainstorm ideas with the AI
   - Or use the concept generator with a theme, audience, and page count
   - Save the generated concept to your library

2. **Generate Images**
   - Select a book from the library
   - Click on any page to generate coloring page illustrations
   - Generate multiple variations and approve your favorites

3. **Export**
   - Once all pages have approved images, download the book as a ZIP

## License

MIT

## Acknowledgments

- [Google Gemini](https://ai.google.dev/) for AI capabilities
- [Cloudinary](https://cloudinary.com/) for image hosting
- [Lucide](https://lucide.dev/) for icons
- [Vercel AI SDK](https://sdk.vercel.ai/) for chat streaming
