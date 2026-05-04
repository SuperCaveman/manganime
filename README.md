# Fantachi

A bilingual (EN/JA) Metacritic-style review aggregation site for anime and manga.

Users and critics can post scored reviews at any granularity — full series, season, episode, movie, or volume — and scores roll up into weighted aggregates displayed on each title's page.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + i18next |
| Backend | AWS SAM — Lambda (Node.js 20) + API Gateway HTTP API |
| Database | Amazon DynamoDB (PAY_PER_REQUEST) |
| Auth | Amazon Cognito (User Pool + JWT) |
| Translation | Amazon Translate (on-demand) |
| Hosting | S3 + CloudFront |

## Features

- Bilingual UI (English / Japanese) with per-review translation
- Hierarchical score aggregation: episode → season → series (anime), volume → series (manga)
- Movie granularity for standalone anime films
- User profiles with review history
- Comment system on reviews
- In-app notifications when someone comments on your review
- Critic vs user score separation
- Cover art fetched automatically from AniList

## Project Structure

```
/
├── backend/          # AWS SAM app (Lambda handlers, template.yaml, seed script)
│   └── src/
│       └── handlers/ # Lambda functions
├── frontend/         # React + Vite app
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── auth/
│       ├── api/
│       └── locales/  # en.json, ja.json
```

## Local Development

```bash
# Frontend
cd frontend
cp .env.example .env   # fill in Cognito + API URL values
npm install
npm run dev

# Backend (requires AWS credentials)
cd backend
sam build
sam deploy --guided
```
