# IntellMeet — AI-Powered Meeting & Collaboration Platform

IntellMeet is a full-stack MERN application for video meetings that stay useful after the call ends: browser-based WebRTC video, real-time chat, screen sharing, consent-first recording, transcription, translation, AI summaries with reviewable action items, task management, and natural-language search across past meetings.

The repository contains the React frontend (`client/`) and the Node.js backend (`server/`). They are deployed independently.

- **Frontend:** Vercel
- **Backend:** Render (free tier, kept awake with an uptime monitor)
- **Database:** MongoDB Atlas

---

## Features

### Meetings
- Instant and scheduled meetings, a shareable meeting link and room code, workspaces, invitations by email
- Pre-join screen with camera/microphone preview
- WebRTC audio and video (mesh), screen sharing, emoji reactions
- Real-time chat with persisted history and a per-sender rate limit
- Adaptive video quality that reacts to the network, with a "weak connection" indicator
- Microphone processing for clearer voice (noise suppression, echo cancellation, auto gain)
- Profile-picture avatars shown in a tile when someone's camera is off
- Responsive meeting room: full-screen video stage, side panel for chat and participants, 2-column grid on phones, pinned layout when someone shares their screen
- Leave controls: participants get a simple Leave button; the host gets a menu with **End meeting for all**, **Leave meeting**, and **Cancel**

### Host controls and access
- Waiting room (lobby) with admit / deny
- Mute a participant, turn off a camera, mute all, remove a participant
- Seminar mode: only the host speaks and shows video; the transcript, summary and recording are private to the host
- Open-link or invite-only visibility
- Meeting access is recomputed on every request; it is never cached

### Reliability
- Automatic reconnect with ICE restart and perfect-negotiation signaling
- Stale-session cleanup: when a device reconnects, its old socket is probed and removed so you do not see duplicate "Connecting…" tiles of yourself or others
- A user can keep a second live device in the same room; it is labelled "(other device)"

### AI features
- Transcription with Groq (post-meeting, not live)
- Translation, summaries, action items and embeddings with Google Gemini
- Action items are saved as reviewable tasks; owners and deadlines stay empty unless stated in the transcript
- Hybrid search (keyword + semantic, merged with Reciprocal Rank Fusion) with citations that open the original meeting at the exact moment
- Any feature without its API key shows a clear "Not configured" state instead of fake output

### Accounts and platform
- JWT authentication, protected routes, roles, login-attempt tracking, security event log
- Profile settings with avatar upload and language preferences
- Day and true-black night themes with no flash on load

---

## Technology stack

**Client:** React 18, Vite, React Router, Tailwind CSS (custom design tokens), Framer Motion, lucide-react, react-hot-toast, Axios, Socket.IO Client, WebRTC, Vitest, Testing Library.

**Server:** Node.js, Express, MongoDB/Mongoose, Socket.IO, JWT, Zod, Multer, Cloudinary (avatars), FFmpeg, Groq, Google Gemini, Vitest.

---

## Architecture

```text
Browser
  └── client/ (Vercel)
       ├── HTTPS REST API requests ──────┐
       ├── Socket.IO events (signaling,  │
       │   chat, presence, host actions) ┤
       └── WebRTC media (peer to peer)   │
                                         v
                              server/ (Render)
                                 ├── MongoDB Atlas
                                 ├── Groq API (transcription)
                                 └── Google Gemini API (AI / language / search)
```

Socket.IO carries signaling and application events only; media flows directly between browsers. Room presence is held in memory, so the server runs as a **single process**.

---

## Repository structure

Generated folders (`node_modules/`, `dist/`, `.git/`) are omitted.

```text
IntellMeet/
├── server/
│   ├── config/          aiConfig · cloudinary · cors · db
│   ├── controllers/     ai · auth · meeting · meetingSearch · task · user · workspace
│   ├── middleware/      aiRateLimiter · auth · errorHandler · meetingAccess · meetingLiveAccess ·
│   │                    role · uploadAudio · uploadAvatar · validate
│   ├── models/          ChatMessage · LoginAttempt · Meeting · Recording · SecurityEvent · Summary ·
│   │                    Task · Transcript · TranscriptSegment · Translation · User · Workspace
│   ├── routes/          ai · auth · languages · meetings · meetingSearch · summary · tasks ·
│   │                    transcription · translation · users · workspaces
│   ├── scripts/         backfillEmbeddings · ensureIndexes · seedAdmin · seedDemo
│   ├── services/
│   │   ├── access/      authorizedMeetings        (single source of truth for who can see a meeting)
│   │   ├── ai/          providers (gemini, groq) · audio · embedding · languages · meetingSearch ·
│   │   │                promptTemplates · summary · transcription · translation
│   │   ├── meetingService.js
│   │   └── security.js
│   ├── sockets/         chat · host · index · presence · reactions · signaling
│   ├── tests/           automated tests + pipeline.live.js (live provider test)
│   ├── utils/           aiErrors · apiResponse · generateToken · languagePrefs · realtime · session
│   ├── app.js · server.js · eslint.config.js · vitest.config.js · vitest.live.config.js · package.json
│
└── client/
    ├── public/          screenshots · videos
    ├── src/
    │   ├── components/
    │   │   ├── common/      AppShell · AuthLayout · Avatar · BentoGrid · EmptyState · Modal · Navbar ·
    │   │   │                NotConfigured · ProtectedRoute · Sidebar · Skeleton · StatusBadge
    │   │   ├── landing/     marketing page sections
    │   │   ├── language/    LanguageIndicator · LanguageSelect · LanguageSettingsPanel · TranslationToggle
    │   │   ├── meeting/     ChatPanel · ConsentBanner · MeetingControls · MeetingLinkBox · ParticipantList ·
    │   │   │                PreJoin · ReactionButton · ReactionLayer · RecorderControl · RoomLayout ·
    │   │   │                ScreenShareButton · VideoGrid · VideoTile
    │   │   ├── search/      AnswerCard · ExampleQuestions · InsufficientEvidence · SearchBar · SearchFilters · SourceCard
    │   │   ├── summary/     ActionItemList · SummaryLanguageSelect · SummaryPanel
    │   │   ├── tasks/       TaskBoard · TaskCard
    │   │   └── transcript/  ProcessingState · TranscriptionControls · TranscriptSegment · TranscriptViewer
    │   ├── context/     Auth · Socket · Theme
    │   ├── hooks/       useAIStatus · useAuth · useMeetingSearch · usePoll · useReactions · useRecorder ·
    │   │                useSocket · useTheme · useTranscript · useWebRTC
    │   ├── lib/         aiHelpers · avatar · meetingForm · meetingLink · micProcessing · reactions ·
    │   │                rtcQuality · securityEvents
    │   ├── pages/       CreateMeeting · Dashboard · Home · Landing · Login · MeetingDetail · MeetingHistory ·
    │   │                MeetingRoom · MeetingSearch · NotFound · Register · Settings · Tasks · Workspaces
    │   ├── services/    one file per API group
    │   ├── styles/      bento · glass · landing · motion · reactions · tokens
    │   └── App.jsx · index.css · main.jsx
    ├── tests/           frontend tests and setup.js
    └── eslint.config.js · index.html · package.json · postcss.config.js · tailwind.config.js · vercel.json · vite.config.js
```

---

## Getting started

### Requirements
- Node.js 20+ and npm
- MongoDB Atlas or a local MongoDB instance
- Optional: Groq API key (transcription), Google Gemini API key (translation, summaries, search answers, embeddings), Cloudinary account (avatar uploads)

### 1. Clone

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd IntellMeet
```

### 2. Backend

```bash
cd server
npm install
```

Create `.env` from the template.

**PowerShell**
```powershell
Copy-Item .env.example .env
```

**macOS / Linux**
```bash
cp .env.example .env
```

Set at least `MONGO_URI` and a `JWT_SECRET` of 32+ characters. Add provider keys to enable the matching features. Then:

```bash
npm run dev
```

The API runs on `http://localhost:5000`. Optional: `npm run seed:admin` creates the admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### 3. Frontend

In a second terminal:

```bash
cd client
npm install
```

Create `client/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

```bash
npm run dev
```

The app runs on `http://localhost:5173`. To try a call, open the meeting link in a second browser profile or an incognito window with a different account.

---

## Environment variables

Real `.env` files must never be committed. Only non-secret values may use the `VITE_` prefix, because they are bundled into the browser code.

### Client

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | REST API base URL |
| `VITE_SOCKET_URL` | Socket.IO server origin |

### Server

| Variable | Purpose |
|---|---|
| `PORT` | API port, default `5000` |
| `NODE_ENV` | Set to `production` when deployed |
| `CLIENT_URL` | Allowed frontend origin(s) for CORS |
| `MONGO_URI` | MongoDB connection string (required) |
| `JWT_SECRET` | Token signing secret, 32+ random characters (required) |
| `JWT_EXPIRE` | Token lifetime |
| `STORAGE_DIR` | Recording storage directory, default `./storage` |
| `GROQ_API_KEY` | Enables transcription |
| `GEMINI_API_KEY` | Enables translation, summaries, search answers and embeddings |
| `TRANSCRIPTION_MODEL`, `LANGUAGE_MODEL` | Provider model names |
| `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` | Embedding settings |
| `STUN_URLS`, `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | WebRTC ICE servers |
| `MAX_AUDIO_MB`, `MAX_AUDIO_MINUTES` | Audio upload and processing limits |
| `MAX_UPLOAD_MB`, `MAX_AVATAR_MB` | Recording and avatar upload limits |
| `MAX_ROOM_PEERS` | Mesh room size limit |
| `SEARCH_MAX_QUERY_CHARS`, `SEARCH_MAX_SEGMENTS`, `SEARCH_MAX_CONTEXT_CHARS` | Search bounds |
| `SEARCH_VECTOR_CANDIDATES`, `SEARCH_MIN_SIMILARITY`, `ATLAS_VECTOR_INDEX` | Semantic search settings |
| `AI_RATE_LIMIT_PER_MIN`, `AI_REQUEST_TIMEOUT_MS` | AI rate limit and provider timeout |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used only by the admin seed script |

Cloudinary credentials for avatar uploads are read in `server/config/cloudinary.js`; `server/.env.example` lists the exact variable names.

---

## Scripts

Run from `client/` or `server/`.

### Client

| Command | Purpose |
|---|---|
| `npm run dev` | Vite development server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview the production build |
| `npm test` | Run frontend tests |
| `npm run lint` | ESLint |

### Server

| Command | Purpose |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm start` | Start the API |
| `npm test` | Backend tests (database tests need `TEST_MONGO_URI`) |
| `npm run test:live` | Live provider tests (need provider keys and `LIVE_AUDIO_PATH`) |
| `npm run lint` | ESLint |
| `npm run seed:admin` | Create the admin user |
| `npm run seed:demo` | Development-only sample data |
| `npm run db:ensure-indexes` | Create database indexes |
| `npm run db:backfill-embeddings` | Embed transcript segments that have no embedding yet |

Check each `package.json` for the exact scripts in your checkout.

---

## Testing

```bash
# Frontend
cd client
npm test
npm run build

# Backend (separate terminal)
cd server
npm test
```

Use a dedicated database for `TEST_MONGO_URI`, never production data. Live provider tests call external APIs and use provider quota. The frontend pipeline ("Frontend Checks") runs the client tests, so run `npm test` in `client/` before pushing.

---

## Deployment

### Frontend on Vercel
1. Import the repository and set **Root Directory** to `client`.
2. Framework: Vite; build command `npm run build`; output directory `dist`.
3. Set `VITE_API_URL` (for example `https://YOUR-API/api`) and `VITE_SOCKET_URL` (`https://YOUR-API`).
4. Deploy. `vercel.json` handles single-page-app routing.

### Backend on Render
1. Create a Web Service from the same repository with **Root Directory** `server`.
2. Build command `npm install`; start command `npm start`.
3. Set `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL` (your Vercel origin) and any AI or WebRTC variables.
4. Run **one instance only**, because room presence is in memory.
5. Free instances sleep when idle. Point an uptime monitor at the API's health URL to keep it awake and avoid a long first load.

**Storage:** files on hosted services may be ephemeral. Use persistent or object storage for recordings and keep backups separate from the primary database.

---

## Security and privacy

- Never commit `.env` files, keys, database credentials, tokens or private uploads. If a secret was ever committed, rotate it; deleting the file does not remove it from Git history.
- AI provider keys live only on the server.
- Search permissions are enforced inside the database query, and every citation is rebuilt from server records before it is returned.
- Original transcripts are never modified; translations are stored separately and labelled.
- Requests are validated with Zod; `$`-prefixed keys are rejected; AI output is schema-validated.
- Auth rate limiting and a security-event log are included.
- Recording needs explicit consent before it starts; participants see a visible recording notice.
- Review the data terms of Groq and Google before sending confidential recordings or transcripts to them.

---

## Known limitations

- **Mesh WebRTC** suits small meetings (default limit about six people). Larger meetings need an SFU.
- **TURN:** the default setup uses STUN only. Peers behind strict firewalls or symmetric NATs may fail to connect until a TURN server is configured through `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL`.
- **Single server process:** room presence and lobbies are held in memory.
- Transcription is post-meeting, not live, and there is no speaker identification.
- The in-app vector search fallback suits smaller workloads; larger deployments should use Atlas Vector Search or a dedicated vector store.
- AI features depend on provider keys, quotas and availability.
- Render's free tier sleeps when idle; a monitor reduces but does not remove cold starts.

---

## License

Add a `LICENSE` file if you plan to distribute or open-source this project. Without one, others do not automatically have permission to reuse the code.