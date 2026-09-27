# Student Placement Readiness Dashboard

A React dashboard for resume analysis and job matching, backed by an Express API and SQLite.

## Project layout

- `frontend/`: Vite and React application
- `backend/`: Express API, route modules, SQLite database, and mailer

## Requirements

- Node.js 20 or newer and npm
- SQLite (created automatically on first backend start)
- An NVIDIA API key for resume analysis and matching
- SMTP credentials for password reset emails

The dashboard's AI Toolkit uses NVIDIA AI Endpoints through the OpenAI-compatible API. Set `NVIDIA_API_KEY` and `NVIDIA_MODEL` in `backend/.env`; the default model is `moonshotai/kimi-k3`, and document analyzers accept PNG, JPG, and WebP images.

## Setup

1. Install dependencies from the project root:

	```sh
	npm install
	```

2. Copy `backend/.env.example` to `backend/.env` and set the SQLite path, JWT, NVIDIA, and email values. Set `FRONTEND_URL` to `http://localhost:5173` for local development. The SQLite database and tables are created automatically.

3. Start both apps:

	```sh
	npm run dev
	```

	The frontend runs at `http://localhost:5173`; the API runs at `http://localhost:4000`.

For separate processes, use `npm run dev --workspace frontend` and `npm run dev --workspace backend`. Create a production frontend build with `npm run build --workspace frontend`.
 