# neurologistAI Upgrade Pack

This package upgrades your app from UI scaffold/mock chat into a working AI-agent architecture.

## What this adds

- Vercel `/api/chat` endpoint
- Kimi/Moonshot OpenAI-compatible client
- Agent router: radiology, neurology, rehab, medication, general
- Frontend chat connector
- Local Slicer API client hook
- Environment variable templates
- Safety system prompts
- Test scripts

## Important architecture

Vercel can run the AI chat endpoint, but it cannot directly access `localhost` on your laptop. For Slicer analysis, use one of these:

1. Run frontend locally and call `http://127.0.0.1:8787`
2. Use Cloudflare Tunnel/ngrok to expose your local Slicer API
3. Deploy Slicer backend on a VPS

## Install

Copy these files into your `neurologistAI` repo, then set `.env.local`.

```bash
npm install openai zod
```

Then run:

```bash
npm run dev
```

## Local Slicer engine

The Analysis tab now includes a Local Slicer Engine panel.

Start the service:

```bash
python service/server.py
```

Then check:

```bash
curl http://127.0.0.1:8787/health
```

The service works without FastAPI installed by using a small built-in HTTP server. If FastAPI is installed, `service.server:app` is still available for `uvicorn`.

The Slicer script writes:

- technical loaded-volume metadata
- experimental Evans index candidate
- experimental ventricular asymmetry candidate
- callosal-angle coronal reconstruction workflow package
- report text with limitations

These are decision-support measurements only. Manual Slicer/radiology confirmation is required before clinical use.
