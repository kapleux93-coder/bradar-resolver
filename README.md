# bradar-resolver

MTProto userbot that turns a Telemetr channel (title + subs, **no** username) into a real
`@username` + advertising contact, **on demand**. Always-on service (Render); BRADAR's Vercel
backend calls it over HTTP. Resolves any public channel live — no pre-built database.

## 1. Get API keys (once)
- Register a Telegram account on a **separate** phone number (not your personal one).
- Go to **my.telegram.org** → log in with that number → **API development tools** → create an app →
  copy **api_id** and **api_hash**.

## 2. Generate a session string (once, locally)
```bash
cd bradar-resolver
npm install
TG_API_ID=<api_id> TG_API_HASH=<api_hash> npm run login
```
Enter the phone, the code Telegram sends, and your 2FA password if set. It prints a **TG_SESSION**
string. Keep it secret — it equals full access to that account.

## 3. Deploy to Render (always-on)
- New → **Web Service** → connect this repo/folder.
- Build: `npm install`  ·  Start: `npm start`
- Environment variables:
  - `TG_API_ID`, `TG_API_HASH`, `TG_SESSION` (from steps 1–2)
  - `RESOLVER_TOKEN` = a long random string (shared secret; BRADAR sends it as `?token=`)
- Deploy. Check `https://<service>.onrender.com/health` → `{"ok":true,"connected":true}`.

## 4. Point BRADAR at it
In the **bradar-server** (Vercel) env set:
- `RESOLVER_URL` = `https://<service>.onrender.com`
- `RESOLVER_TOKEN` = the same secret

BRADAR then calls the userbot resolver first, falling back to the Tavily+getChat resolver.

## API
```
GET /resolve?title=<channel title>&subs=<members>&token=<RESOLVER_TOKEN>
 → { "resolved": true, "username": "...", "link": "https://t.me/...", "adContact": "@...", "confidence": 0.9 }
 → { "resolved": false }
GET /health → { "ok": true, "connected": true }
```

## Safety
Separate account (ban risk), 30-day cache, serialized calls with a gap + FLOOD_WAIT backoff to stay
under Telegram's limits. Never commit `TG_SESSION` — it stays in env only.
