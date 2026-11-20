# Adeena's Job Agent

A multi-agent job search dashboard for tracking, evaluating, and applying to jobs with a more deliberate hiring workflow. The app blends a local job radar, CV/profile matching, AI-driven deliberation, and a "Supreme Jury" recommendation model to surface the most realistic opportunities for a candidate.

**Live Website:** [https://ais-pre-fydkpanbgwhnloy6xrxq34-885189251864.europe-west2.run.app](https://ais-pre-fydkpanbgwhnloy6xrxq34-885189251864.europe-west2.run.app)

## Live Demo

- **Live App:** https://ais-pre-fydkpanbgwhnloy6xrxq34-885189251864.europe-west2.run.app

## Overview

This project helps a job seeker:

- monitor a live pool of job opportunities
- score roles against a candidate profile and CV
- track application status and reasoning
- generate tailored CV/cover-letter drafts for shortlisted roles
- review AI deliberation and jury-style verdicts before applying
- keep learned preferences and match signals over time

The app is built as a TypeScript React frontend with an Express backend, uses SQLite for local job and profile data, and integrates with Google Gemini AI for analysis and argument generation.

## Key Features

- Job radar dashboard with filters for status, source, and liveness
- Top-pick Jury workflow that ranks the strongest opportunities each day
- Candidate profile and CV analysis with role-fit weighting
- Tailored application generation for selected positions
- Local reasoning memory via learned weights and interaction history
- Firebase sync support for profile/Jury state persistence
- Secure backend patterns and validation around user-owned job/profile data

## Tech Stack

- React 19 + Vite
- TypeScript
- Express + Node.js
- SQLite (local persistence)
- Firebase (optional cloud sync)
- Google Gemini API
- Tailwind-style UI and chart components

## Project Structure

```text
.
├── src/                 # React frontend and UI logic
├── server/              # AI job-analysis and source aggregation logic
├── data/                # Local SQLite database files
├── public/              # Static assets
├── server.ts            # Express server entry point
├── .env.example         # Sample environment variables
├── package.json         # Scripts and dependencies
├── vite.config.ts       # Vite configuration
├── firestore.rules      # Firebase rules reference
├── security_spec.md     # Security guidance / validation checklist
└── README.md            # Project documentation
```

## Getting Started

### 1) Install dependencies

```bash
npm install
```

Or with Bun:

```bash
bun install
```

### 2) Configure environment variables

Copy the sample env file and add your credentials:

```bash
cp .env.example .env
```

Then set the required values, including:

- `GEMINI_API_KEY`: your Google Gemini API key
- `APP_URL`: the app URL used by the deployment/runtime environment

### 3) Run the app

```bash
npm run dev
```

The app typically runs on:

```text
http://localhost:3000
```

## Available Scripts

```bash
npm run dev      # start the local Vite/Express app
npm run build    # build the frontend bundle
npm run preview  # preview the production build
npm run lint     # run TypeScript type-checking
npm run clean    # remove generated build artifacts
```

## Notes

- The app includes a local SQLite DB under `data/jobs.db` and generates WAL files during normal operation.
- AI-driven analysis relies on the configured Gemini key and runtime environment access.
- Firebase sync is optional and depends on your project configuration and credentials.

## License

This project is currently unlicensed unless a repository-level license is added later.
