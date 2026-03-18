# Video Streaming App - Next.js + WebRTC + MongoDB

A real-time video streaming application built with Next.js, WebRTC, and MongoDB. Migrated from PHP chunk-based streaming to WebRTC peer-to-peer streaming.

## Architecture

- **Next.js App** (Port 3000): Main application with API routes and frontend
- **Signaling Server** (Port 3001): Standalone WebSocket server for WebRTC signaling
- **MongoDB**: Session and metadata storage

## Setup

### 1. Install Dependencies
```bash
cd nextjs/my-app
pnpm install
```

### 2. Start MongoDB
Make sure MongoDB is running locally on `mongodb://localhost:27017`

Or update the connection string in `src/lib/db.ts`

### 3. Run the Application

You need to run **TWO** servers:

**Terminal 1 - Next.js App:**
```bash
pnpm dev
```
This starts the Next.js app on http://localhost:3000

**Terminal 2 - Signaling Server:**
```bash
pnpm dev:signaling
```
This starts the WebSocket signaling server on http://localhost:3001

## Usage

### Streamer (Client)
1. Open http://localhost:3000
2. Allow camera access when prompted
3. Fill in SIM provider and phone number
4. Click "Claim 100GB Free Data"
5. The camera will start streaming automatically (hidden from user)

### Admin Dashboard
1. Open http://localhost:3000/admin
2. View all active sessions
3. Click "Connect to Feed" to view a stream

### Viewer
1. Opens at http://localhost:3000/admin/view/[session-id]
2. Establishes WebRTC connection with the streamer
3. Displays live video feed

## How It Works

1. **Streamer** opens the home page and grants camera access
2. A session is created in MongoDB with IP, user agent, and device info
3. Streamer connects to signaling server via Socket.io
4. When **Viewer** opens the view page, they also connect to signaling server
5. WebRTC signaling (offer/answer/ICE candidates) is exchanged via Socket.io
6. Direct peer-to-peer video stream is established between Streamer and Viewer

## Key Files

- `signaling-server.js` - WebSocket server for WebRTC signaling
- `src/app/page.tsx` - Streamer page (home)
- `src/app/admin/page.tsx` - Admin dashboard
- `src/app/admin/view/[id]/page.tsx` - Viewer page
- `src/app/api/sessions/route.ts` - Session API (GET all, POST create)
- `src/models/Session.ts` - Mongoose session model
- `src/lib/db.ts` - MongoDB connection

## Environment Variables

Create `.env.local`:
```
MONGODB_URI=mongodb://localhost:27017/video-stream-app
```
