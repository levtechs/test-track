# SAT Practice App

A mobile-first SAT practice application with adaptive question difficulty, progress tracking, and session persistence.

## Features

- **Adaptive Practice**: Questions recommended based on your skill level using Elo rating system
- **Session Persistence**: Your progress is saved automatically - resume anytime
- **Progress Tracking**: Track accuracy, streak, and rating over time
- **Detailed Analytics**: View skill breakdown, difficulty, and question metadata
- **Guest Mode**: Practice without signing in, your progress is saved locally

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Firebase Firestore, Firebase Auth
- **State Management**: React hooks with Firestore real-time sync
- **Question Algorithm**: Custom Elo-based recommendation engine

## Getting Started

```bash
npm install
npm run dev
```

## Architecture

### Session Management

The app uses Firebase as the single source of truth with optimistic UI updates:

1. **Client State**: Maintains local question queue and current index
2. **Firestore**: Stores `bufferedQuestions` array with answer state
3. **Real-time Sync**: `onSnapshot` listener keeps client in sync with server
4. **Optimistic Updates**: UI updates immediately, server confirms later

### Question Flow

1. User answers question → local state updates immediately
2. API processes answer in background
3. Firestore document updated with answer info
4. Client syncs via listener for ground truth
