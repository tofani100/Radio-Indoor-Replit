# Rádio Indoor — Sistema de Gerenciamento

Full-stack multi-tenant indoor radio management SaaS platform.

## Architecture

Monorepo managed with pnpm workspaces:

- `artifacts/radio-indoor` — React/Vite admin panel + PWA player (served at `/`)
- `artifacts/api-server` — Express.js REST API (served at `/api`)
- `lib/db` — Drizzle ORM + PostgreSQL schema
- `lib/api-client-react` — Orval-generated React Query hooks + custom fetch client
- `lib/api-zod` — Orval-generated Zod schemas

## Key Features

- **Multi-tenant**: clients have isolated media libraries, playlists, and devices
- **Device fingerprinting**: UUID-based gating with pending/active/blocked states
- **Admin panel**: full CRUD for clients, devices, media, playlists, reports
- **Bulk media upload**: XHR with per-file and overall progress bars
- **Drag-and-drop playlists**: @dnd-kit sortable list with reorder persistence
- **PWA player**: Web Audio API, dual volume sliders (music + jingle), queue view
- **Playback logging**: every track play is recorded for reporting
- **Heartbeat monitoring**: devices report every 3 min; online status shown in dashboard
- **Reports**: filterable playback log (date, client, media) with export-ready table
- **Session auth**: express-session with SESSION_SECRET env var

## Admin Credentials (Development)

- Email: `admin@radioindoor.com`
- Password: `password`

## Sample Data

- 2 clients: Restaurante Bom Sabor, Academia Fit Plus
- 2 playlists (one per client)

## Routes

### Frontend (React/Vite)

| Path | Description |
|---|---|
| `/login` | Admin login |
| `/dashboard` | Overview stats, device status, top media, activity |
| `/clients` | Client CRUD |
| `/devices` | Device approval/blocking |
| `/media` | Media library + XHR upload |
| `/playlists` | Playlist list |
| `/playlists/:id` | Drag-drop playlist editor |
| `/reports` | Playback report with filters |
| `/player` | PWA player (email gate → pending/blocked/active) |

### API (Express)

| Endpoint | Description |
|---|---|
| `POST /api/auth/login` | Admin login |
| `GET /api/auth/me` | Session check |
| `GET/POST /api/clients` | Client management |
| `GET/POST/PUT/DELETE /api/clients/:id` | Client CRUD |
| `GET /api/devices` | List devices (admin) |
| `POST /api/devices/register` | Register device (public) |
| `POST /api/devices/heartbeat` | Heartbeat (public) |
| `POST /api/devices/:id/approve\|block` | Approve/block device |
| `GET/POST /api/media` | Media library |
| `POST /api/media/scan-folder` | Bulk import from folder |
| `GET/POST /api/playlists` | Playlist management |
| `GET/PUT/DELETE /api/playlists/:id` | Playlist CRUD |
| `POST /api/playlists/:id/items` | Add item |
| `PUT /api/playlists/:id/reorder` | Drag-drop reorder |
| `DELETE /api/playlists/:id/items/:itemId` | Remove item |
| `GET /api/playback/queue` | Get queue for device (public) |
| `POST /api/playback/log` | Log playback (public) |
| `GET /api/dashboard/summary` | Dashboard stats |
| `GET /api/dashboard/device-status` | Device online/offline |
| `GET /api/dashboard/top-media` | Top played tracks |
| `GET /api/dashboard/recent-activity` | Recent playback log |
| `GET /api/reports/playbacks` | Filterable playback report |
| `GET /api/uploads/:filename` | Serve uploaded media files |

## Database Schema (PostgreSQL / Drizzle ORM)

Tables: `admins`, `clients`, `devices`, `media`, `playlists`, `playlist_items`, `playback_logs`

Media files stored at `artifacts/api-server/uploads/` and served at `/api/uploads/<filename>`.

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned)
- `SESSION_SECRET` — Express session secret (set as Replit secret)
- `PORT`, `BASE_PATH` — Set automatically by workflow config

## Development Notes

- The API server builds via esbuild (`build.mjs`) before starting; `pnpm --filter @workspace/api-server run dev`
- Vite dev server for the frontend: `pnpm --filter @workspace/radio-indoor run dev`
- After schema changes, run: `pnpm --filter @workspace/db run push`
- After OpenAPI changes, run: `pnpm --filter @workspace/api-spec run codegen`, then fix `lib/api-zod/src/index.ts` to only export `from "./generated/api"`
- Libs must be built before typechecking artifacts: `pnpm run typecheck:libs`
