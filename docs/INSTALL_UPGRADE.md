# Install Upgrade Pack

## 1. Copy files

Copy the package contents into your `neurologistAI` repo.

## 2. Install JS dependency

```bash
npm install openai zod
```

## 3. Add Vercel environment variables

In Vercel Project Settings → Environment Variables:

```text
KIMI_API_KEY=sk-your_key
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_MODEL=moonshot-v1-32k
APP_MODE=clinical_decision_support_only
```

Then redeploy.

## 4. Test chat API locally

```bash
curl -X POST http://localhost:3000/api/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"agent\":\"neurology\",\"messages\":[{\"role\":\"user\",\"content\":\"Explain negative LP x2 in suspected NPH vs ex vacuo.\"}]}"
```

## 5. Start local Slicer service

Create `service/.env`:

```env
SLICER_EXE=C:\Users\YOUR_NAME\AppData\Local\slicer.org\Slicer 5.10.0\Slicer.exe
SLICER_SCRIPT=C:\superroo-medical\scripts\analyze_slicer.py
OUTPUT_ROOT=C:\superroo-medical\outputs
```

Run:

```bash
cd service
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8787
```

Open:

```text
http://127.0.0.1:8787/docs
```

## 6. Vercel cannot reach laptop localhost

For production, expose local service using Cloudflare Tunnel/ngrok or deploy the Slicer service to a VPS.
