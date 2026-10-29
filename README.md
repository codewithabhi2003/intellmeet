# IntellMeet — AI-Powered Meeting & Collaboration Platform

IntellMeet is a full-stack meeting and collaboration application with browser-based video meetings, real-time chat, screen sharing, consent-first recording, transcription, translation, AI-generated summaries, reviewable action items, task management, and search across past meetings.

This repository contains both the React frontend and Node.js backend. They can be deployed independently.

## Features

- User authentication and protected routes
- Workspaces, meeting creation, meeting history, and participant permissions
- WebRTC audio/video and screen sharing
- Socket.IO chat, signaling, presence, and reactions
- Consent-first recording and audio upload
- AI transcription using Groq
- Translation, summaries, action items, and embeddings using Google Gemini
- Search across authorized meeting content with source citations
- Profile settings, language preferences, responsive UI, and day/night themes

## Technology stack

**Client:** React 18, Vite, React Router, Tailwind CSS, Axios, Socket.IO Client, WebRTC, Framer Motion, Vitest, Testing Library.

**Server:** Node.js, Express, MongoDB/Mongoose, Socket.IO, JWT, Zod, Multer, FFmpeg, Groq, Google Gemini, Vitest.

## Architecture

```text
Browser
  └── client/ (Vercel)
       ├── HTTPS REST API requests ──────┐
       ├── Socket.IO real-time events ───┤
       └── WebRTC media connections      │
                                         v
                              server/ (Render)
                                 ├── MongoDB Atlas
                                 ├── Groq API (transcription)
                                 └── Google Gemini API (AI/language features)
```

Socket.IO handles signaling and real-time application events; it does not relay all WebRTC media itself. TURN may be needed on restrictive networks.

## Repository structure

The tree lists source files, tests, configuration, and assets. Generated folders such as `node_modules/`, `dist/`, and `.git/` are omitted.

```text
intellmeet/
├── client/
│   ├── public/
│   │   ├── screenshots/
│   │   │   ├── meeting-search.png
│   │   │   ├── meeting-summary.png
│   │   │   ├── meeting-tasks.png
│   │   │   └── meeting-transcript.png
│   │   └── videos/
│   │       ├── intellmeet-hero-dark.jpg
│   │       ├── intellmeet-hero-dark.mp4
│   │       ├── intellmeet-hero-light.jpg
│   │       └── intellmeet-hero-light.mp4
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── AppShell.jsx
│   │   │   │   ├── AuthLayout.jsx
│   │   │   │   ├── Avatar.jsx
│   │   │   │   ├── BentoGrid.jsx
│   │   │   │   ├── EmptyState.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   ├── Navbar.jsx
│   │   │   │   ├── NotConfigured.jsx
│   │   │   │   ├── ProtectedRoute.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── Skeleton.jsx
│   │   │   │   └── StatusBadge.jsx
│   │   │   ├── landing/
│   │   │   │   ├── AuroraBackground.jsx
│   │   │   │   ├── DemoVideo.jsx
│   │   │   │   ├── Features.jsx
│   │   │   │   ├── FinalCta.jsx
│   │   │   │   ├── GlassPage.jsx
│   │   │   │   ├── Hero.jsx
│   │   │   │   ├── HeroMock.jsx
│   │   │   │   ├── HowItWorks.jsx
│   │   │   │   ├── LandingFooter.jsx
│   │   │   │   ├── LandingNav.jsx
│   │   │   │   ├── LandingPage.example.jsx
│   │   │   │   ├── Logo.jsx
│   │   │   │   ├── MarqueeBelt.jsx
│   │   │   │   ├── Reveal.jsx
│   │   │   │   ├── Trust.jsx
│   │   │   │   └── useThemeMode.js
│   │   │   ├── language/
│   │   │   │   ├── LanguageIndicator.jsx
│   │   │   │   ├── LanguageSelect.jsx
│   │   │   │   ├── LanguageSettingsPanel.jsx
│   │   │   │   └── TranslationToggle.jsx
│   │   │   ├── meeting/
│   │   │   │   ├── ChatPanel.jsx
│   │   │   │   ├── ConsentBanner.jsx
│   │   │   │   ├── MeetingControls.jsx
│   │   │   │   ├── ParticipantList.jsx
│   │   │   │   ├── PreJoin.jsx
│   │   │   │   ├── ReactionButton.jsx
│   │   │   │   ├── ReactionLayer.jsx
│   │   │   │   ├── RecorderControl.jsx
│   │   │   │   ├── RoomLayout.jsx
│   │   │   │   ├── ScreenShareButton.jsx
│   │   │   │   ├── VideoGrid.jsx
│   │   │   │   └── VideoTile.jsx
│   │   │   ├── search/
│   │   │   │   ├── AnswerCard.jsx
│   │   │   │   ├── ExampleQuestions.jsx
│   │   │   │   ├── InsufficientEvidence.jsx
│   │   │   │   ├── SearchBar.jsx
│   │   │   │   ├── SearchFilters.jsx
│   │   │   │   └── SourceCard.jsx
│   │   │   ├── summary/
│   │   │   │   ├── ActionItemList.jsx
│   │   │   │   ├── SummaryLanguageSelect.jsx
│   │   │   │   └── SummaryPanel.jsx
│   │   │   ├── tasks/
│   │   │   │   ├── TaskBoard.jsx
│   │   │   │   └── TaskCard.jsx
│   │   │   └── transcript/
│   │   │       ├── ProcessingState.jsx
│   │   │       ├── TranscriptionControls.jsx
│   │   │       ├── TranscriptSegment.jsx
│   │   │       └── TranscriptViewer.jsx
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   ├── SocketContext.jsx
│   │   │   └── ThemeContext.jsx
│   │   ├── hooks/
│   │   │   ├── useAIStatus.js
│   │   │   ├── useAuth.js
│   │   │   ├── useMeetingSearch.js
│   │   │   ├── usePoll.js
│   │   │   ├── useReactions.js
│   │   │   ├── useRecorder.js
│   │   │   ├── useSocket.js
│   │   │   ├── useTheme.js
│   │   │   ├── useTranscript.js
│   │   │   └── useWebRTC.js
│   │   ├── lib/
│   │   │   ├── aiHelpers.js
│   │   │   ├── avatar.js
│   │   │   ├── meetingForm.js
│   │   │   └── reactions.js
│   │   ├── pages/
│   │   │   ├── CreateMeeting.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Home.jsx
│   │   │   ├── Landing.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── MeetingDetail.jsx
│   │   │   ├── MeetingHistory.jsx
│   │   │   ├── MeetingRoom.jsx
│   │   │   ├── MeetingSearch.jsx
│   │   │   ├── NotFound.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Settings.jsx
│   │   │   ├── Tasks.jsx
│   │   │   └── Workspaces.jsx
│   │   ├── services/
│   │   │   ├── aiService.js
│   │   │   ├── api.js
│   │   │   ├── authService.js
│   │   │   ├── meetingAiService.js
│   │   │   ├── meetingService.js
│   │   │   ├── searchService.js
│   │   │   ├── taskService.js
│   │   │   ├── userService.js
│   │   │   └── workspaceService.js
│   │   ├── styles/
│   │   │   ├── bento.css
│   │   │   ├── glass.css
│   │   │   ├── landing.css
│   │   │   ├── motion.css
│   │   │   ├── reactions.css
│   │   │   └── tokens.css
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── tests/
│   │   ├── aiHelpers.test.js
│   │   ├── aiPanels.test.jsx
│   │   ├── appShell.test.jsx
│   │   ├── landing.test.jsx
│   │   ├── meetingDetail.test.jsx
│   │   ├── meetingForm.test.js
│   │   ├── meetingUi.test.jsx
│   │   ├── noFlash.test.js
│   │   ├── profileSettings.test.jsx
│   │   ├── reactions.test.jsx
│   │   ├── roomLayout.test.jsx
│   │   ├── searchUi.test.jsx
│   │   ├── securityScan.test.js
│   │   ├── setup.js
│   │   ├── tokens.test.js
│   │   ├── ui.test.jsx
│   │   └── webrtc.test.jsx
│   ├── .env.example
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── server/
│   ├── config/
│   │   ├── aiConfig.js
│   │   ├── cors.js
│   │   └── db.js
│   ├── controllers/
│   │   ├── aiController.js
│   │   ├── authController.js
│   │   ├── meetingController.js
│   │   ├── meetingSearchController.js
│   │   ├── taskController.js
│   │   ├── userController.js
│   │   └── workspaceController.js
│   ├── middleware/
│   │   ├── aiRateLimiter.js
│   │   ├── authMiddleware.js
│   │   ├── errorHandler.js
│   │   ├── meetingAccess.js
│   │   ├── roleMiddleware.js
│   │   ├── uploadAudio.js
│   │   ├── uploadAvatar.js
│   │   └── validate.js
│   ├── models/
│   │   ├── ChatMessage.js
│   │   ├── index.js
│   │   ├── Meeting.js
│   │   ├── Recording.js
│   │   ├── Summary.js
│   │   ├── Task.js
│   │   ├── Transcript.js
│   │   ├── TranscriptSegment.js
│   │   ├── Translation.js
│   │   ├── User.js
│   │   └── Workspace.js
│   ├── routes/
│   │   ├── ai.js
│   │   ├── auth.js
│   │   ├── languages.js
│   │   ├── meetings.js
│   │   ├── meetingSearch.js
│   │   ├── summary.js
│   │   ├── tasks.js
│   │   ├── transcription.js
│   │   ├── translation.js
│   │   ├── users.js
│   │   └── workspaces.js
│   ├── scripts/
│   │   ├── backfillEmbeddings.js
│   │   ├── ensureIndexes.js
│   │   ├── seedAdmin.js
│   │   └── seedDemo.js
│   ├── services/
│   │   ├── access/
│   │   │   └── authorizedMeetings.js
│   │   ├── ai/
│   │   │   ├── providers/
│   │   │   │   ├── geminiProvider.js
│   │   │   │   └── groqProvider.js
│   │   │   ├── audioService.js
│   │   │   ├── embeddingService.js
│   │   │   ├── languages.js
│   │   │   ├── meetingSearchService.js
│   │   │   ├── promptTemplates.js
│   │   │   ├── summaryService.js
│   │   │   ├── transcriptionService.js
│   │   │   └── translationService.js
│   │   └── meetingService.js
│   ├── sockets/
│   │   ├── chat.js
│   │   ├── index.js
│   │   ├── presence.js
│   │   ├── reactions.js
│   │   └── signaling.js
│   ├── storage/
│   │   └── avatars/                 # Runtime uploads; don't commit real user files
│   ├── tests/
│   │   ├── languages.test.js
│   │   ├── phase1.test.js
│   │   ├── phase2.test.js
│   │   ├── phase3.test.js
│   │   ├── phase4.test.js
│   │   ├── pipeline.live.js
│   │   ├── profile.test.js
│   │   ├── reactions.test.js
│   │   └── security.test.js
│   ├── utils/
│   │   ├── aiErrors.js
│   │   ├── apiResponse.js
│   │   ├── generateToken.js
│   │   ├── languagePrefs.js
│   │   └── realtime.js
│   ├── .env.example
│   ├── app.js
│   ├── eslint.config.js
│   ├── package.json
│   ├── server.js
│   ├── vitest.config.js
│   └── vitest.live.config.js
│
├── .gitignore
└── README.md
```

## Getting started

### Requirements

- Node.js 20+ and npm
- MongoDB Atlas or a local MongoDB instance
- Groq API key for transcription (optional)
- Google Gemini API key for translation, summaries, search answers, and embeddings (optional)

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd intellmeet
```

### 2. Start the backend

```bash
cd server
npm install
```

Create a local `.env` from the template.

**PowerShell**
```powershell
Copy-Item .env.example .env
```

**macOS/Linux**
```bash
cp .env.example .env
```

Set at least `MONGO_URI` and a strong `JWT_SECRET` (32+ characters). Add AI provider keys to enable the associated features.

```bash
npm run dev
```

The API defaults to `http://localhost:5000`.

### 3. Start the frontend

Open a second terminal from the repository root:

```bash
cd client
npm install
```

Create the frontend environment file:

**PowerShell**
```powershell
Copy-Item .env.example .env
```

**macOS/Linux**
```bash
cp .env.example .env
```

For local development, configure:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

Start the Vite server:

```bash
npm run dev
```

The frontend normally runs at `http://localhost:5173`.

## Environment variables

The `.env.example` files document the full set of supported settings. Never commit real `.env` files or secrets.

### Client

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | REST API base URL. |
| `VITE_SOCKET_URL` | Socket.IO server URL. |

Only non-secret values should use the `VITE_` prefix because they are bundled into browser code. Never put provider API keys in the client.

### Server

| Variable | Purpose |
|---|---|
| `PORT` | API port; default `5000`. |
| `NODE_ENV` | Runtime mode; set to `production` in production. |
| `CLIENT_URL` | Allowed frontend origin(s) for CORS. |
| `MONGO_URI` | MongoDB connection string; required. |
| `JWT_SECRET` | Token-signing secret; required, use 32+ random characters. |
| `JWT_EXPIRE` | Token lifetime; default `7d` in project configuration. |
| `STORAGE_DIR` | Recording storage directory; default `./storage`. |
| `GROQ_API_KEY` | Enables transcription. |
| `GEMINI_API_KEY` | Enables Gemini language and AI features. |
| `TRANSCRIPTION_MODEL`, `LANGUAGE_MODEL` | Provider model configuration; see `.env.example` for defaults. |
| `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` | Embedding configuration. |
| `STUN_URLS`, `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | WebRTC ICE/TURN configuration. |
| `MAX_AUDIO_MB`, `MAX_AUDIO_MINUTES` | Audio upload and processing limits. |
| `MAX_UPLOAD_MB`, `MAX_AVATAR_MB` | Recording and avatar upload limits. |
| `MAX_ROOM_PEERS` | Mesh room size limit. |
| `SEARCH_MAX_QUERY_CHARS`, `SEARCH_MAX_SEGMENTS`, `SEARCH_MAX_CONTEXT_CHARS` | Meeting-search bounds. |
| `SEARCH_VECTOR_CANDIDATES`, `SEARCH_MIN_SIMILARITY`, `ATLAS_VECTOR_INDEX` | Semantic search settings. |
| `AI_RATE_LIMIT_PER_MIN`, `AI_REQUEST_TIMEOUT_MS` | AI rate limit and provider timeout. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used by the admin seed script only. |

## Useful scripts

Run commands from `client/` or `server/` as appropriate.

### Client

| Command | Purpose |
|---|---|
| `npm run dev` | Vite development server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview the production build |
| `npm test` | Run frontend tests |
| `npm run lint` | Run ESLint |

### Server

| Command | Purpose |
|---|---|
| `npm run dev` | Start server with development auto-reload |
| `npm start` | Start the API |
| `npm test` | Run backend tests; database tests need `TEST_MONGO_URI` |
| `npm run test:live` | Live provider tests; needs provider keys and `LIVE_AUDIO_PATH` |
| `npm run lint` | Run ESLint |
| `npm run seed:admin` | Create an admin using configured seed credentials |
| `npm run seed:demo` | Development-only sample data |
| `npm run db:ensure-indexes` | Create database indexes |
| `npm run db:backfill-embeddings` | Backfill missing transcript embeddings |

Check each folder's `package.json` for the exact scripts available in the current checkout.

## Testing

```bash
# Frontend
cd client
npm test
npm run build

# Backend (from a separate terminal)
cd server
npm test
```

Set `TEST_MONGO_URI` to a dedicated test database for database-backed tests. Never use production data for tests. Live provider tests call external APIs and may use provider quota.

## Deployment

### Frontend on Vercel

1. Import this repository into Vercel.
2. Set **Root Directory** to `client`.
3. Select Vite, use `npm run build` as the build command and `dist` as the output directory.
4. Set `VITE_API_URL` to the deployed backend API URL (for example, `https://YOUR-API-DOMAIN/api`).
5. Set `VITE_SOCKET_URL` to the deployed backend origin (for example, `https://YOUR-API-DOMAIN`).
6. Deploy or redeploy after setting the variables.

### Backend on Render

1. Create a Web Service from the same repository.
2. Set **Root Directory** to `server`.
3. Use `npm install` as the build command and `npm start` as the start command.
4. Configure `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, and any required AI/WebRTC variables in Render's environment settings.
5. Set `CLIENT_URL` to the deployed Vercel origin.

**Persistent storage:** local files on hosted services may be ephemeral. Use persistent storage or object storage for durable recordings and user uploads. Keep backups separate from the primary database.

## Security and privacy

- Never commit `.env` files, API keys, database credentials, JWT secrets, tokens, or private user uploads.
- Keep AI provider keys on the backend.
- Use a strong unique production `JWT_SECRET`.
- Restrict database network access and use a least-privilege MongoDB user.
- Configure CORS to trusted frontend origins only.
- Use a dedicated test database.
- Obtain and communicate consent before recording meetings.
- Review the data policies of AI providers before sending meeting recordings or transcripts to them.
- If a secret was ever committed, rotate it; deleting the file in a later commit does not remove it from Git history.

## Known limitations

- Mesh WebRTC is intended for small meetings (configured limit is around six peers); larger meetings generally need an SFU, and restrictive networks may need TURN.
- Transcription is post-meeting, not live.
- Speaker identification is not currently included.
- The in-app vector-search fallback is designed for smaller workloads; larger deployments may need Atlas Vector Search or a dedicated vector database.
- AI features require valid provider keys and may be affected by provider quotas and availability.
- Meeting recordings and transcripts can be sent to Groq or Google for processing when those features are used; review their current terms before using confidential data.

## License

Add a `LICENSE` file if you plan to distribute or open-source this project. Without a license, others do not automatically receive permission to reuse the code.
