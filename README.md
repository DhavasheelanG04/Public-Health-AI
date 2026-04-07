# AI Public Health Chatbot

This workspace includes a real multilingual NLP chatbot flow.

## Project Structure

- `frontend` - React UI created with Create React App
- `backend` - FastAPI NLP service with a trained symptom classifier

## What It Does

- Accepts symptom text from the user
- Detects English, Tamil, or Hindi input
- Classifies the symptom pattern with a trained text model
- Returns guidance, precautions, and urgency level
- Provides Register and Login screens before chat access
- Shows a protected chat dashboard with sidebar + conversation layout

## Prerequisites

- Node.js 18+
- npm 9+
- Python 3.13 virtual environment in `.venv`

## Run in Development

Start the backend:

```bash
d:/hackathon/.venv/Scripts/python.exe -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend:

```bash
npm start --prefix frontend
```

The frontend runs at http://localhost:3000 and calls the backend at http://localhost:8000.

## App Routes

- /register - create a new account
- /login - sign in with existing account
- /chat - protected chat dashboard

## Auth Implementation

- Authentication is implemented in the frontend using localStorage for demo purposes.
- Registered users and active session are stored locally in the browser.
- This is suitable for hackathon/demo use. For production, move auth to backend with hashed passwords and token-based sessions.

## Demo Test Users

Use any of these pre-seeded accounts on the Login page:

- anitha.demo@healthbot.test / Demo@123
- rahul.demo@healthbot.test / Demo@123
- meena.demo@healthbot.test / Demo@123
- arjun.demo@healthbot.test / Demo@123

If localStorage is cleared, these demo users are automatically re-seeded on next app load.

## Production Build

```bash
npm run build --prefix frontend
```

## Notes

- The backend trains a lightweight NLP classifier on startup if the saved artifact does not exist.
- The symptom model currently supports English, Tamil, and Hindi text input.
