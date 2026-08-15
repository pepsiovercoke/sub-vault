"""SubVault API — Python/FastAPI Backend"""
import os, re, math, json, csv, io
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import jwt as pyjwt
from passlib.hash import bcrypt
import httpx
from supabase import create_client

# ─── Config ───
PORT = int(os.getenv("PORT", "3001"))
JWT_SECRET = os.getenv("JWT_SECRET", "fallback-dev-secret")
JWT_EXPIRES_IN = os.getenv("JWT_EXPIRES_IN", "7d")
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/auth/google/callback")
GMAIL_REDIRECT_URI = os.getenv("GMAIL_REDIRECT_URI", "http://localhost:3000/gmail/callback")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:3000/auth/github/callback")

def _create_supabase():
    """Create Supabase client, patching key validation for non-JWT keys."""
    import supabase._sync.client as _sc
    _orig_init = _sc.SyncClient.__init__
    def _patched_init(self, url, key, options=None):
        # Temporarily disable the JWT regex check for sb_publishable_ keys
        import re as _re
        _orig_match = _re.match
        def _permissive_match(pattern, string, *a, **kw):
            if "A-Za-z0-9-_=" in str(pattern) and string.startswith("sb_"):
                return True  # Accept sb_ keys
            return _orig_match(pattern, string, *a, **kw)
        _re.match = _permissive_match
        try:
            _orig_init(self, url, key, options)
        finally:
            _re.match = _orig_match
    _sc.SyncClient.__init__ = _patched_init
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    _sc.SyncClient.__init__ = _orig_init  # Restore
    return client

db = _create_supabase()

VALID_CATEGORIES = ["AI & Tech", "Cloud & Infra", "Media & Content", "Finance", "Productivity", "Health", "Other"]
VALID_CYCLES = ["Monthly", "Quarterly", "Yearly"]
VALID_STATUSES = ["active", "paused", "cancelled"]
VALID_CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY"]

# ─── JWT helpers ───
def _parse_expiry(s: str) -> timedelta:
    if s.endswith("d"): return timedelta(days=int(s[:-1]))
    if s.endswith("h"): return timedelta(hours=int(s[:-1]))
    return timedelta(days=7)

def generate_token(user_id, email):
    exp = datetime.now(timezone.utc) + _parse_expiry(JWT_EXPIRES_IN)
    return pyjwt.encode({"id": user_id, "email": email, "exp": exp}, JWT_SECRET, algorithm="HS256")

def get_current_user(request: Request):
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    token = header.split(" ", 1)[1]
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return {"id": payload["id"], "email": payload["email"]}
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

# ─── App ───
app = FastAPI(title="SubVault API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ─── Custom error handler to match JSON format ───
@app.exception_handler(HTTPException)
async def http_exc(request, exc):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})

# ─── Health ───
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "SubVault API", "version": "2.0.0-python", "timestamp": datetime.now(timezone.utc).isoformat()}

# ══════════════════════════════════════════════
#  AUTH ROUTES
# ══════════════════════════════════════════════
class RegisterBody(BaseModel):
    email: str; password: str; name: str
class LoginBody(BaseModel):
    email: str; password: str
class UpdateProfileBody(BaseModel):
    name: Optional[str] = None; email: Optional[str] = None
class SetPasswordBody(BaseModel):
    password: str; currentPassword: Optional[str] = None
class SupabaseSyncBody(BaseModel):
    accessToken: str

@app.post("/api/auth/register", status_code=201)
async def register(body: RegisterBody):
    if not body.email or not body.password or not body.name:
        raise HTTPException(400, "Email, password, and name are required")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    exists = db.from_("users").select("id").eq("email", body.email).maybe_single().execute()
    if exists.data:
        raise HTTPException(409, "Email already registered")
    hashed = bcrypt.hash(body.password)
    res = db.from_("users").insert({"email": body.email, "password": hashed, "name": body.name}).execute()
    user = res.data[0]
    token = generate_token(user["id"], user["email"])
    return {"message": "Account created", "token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}}

@app.post("/api/auth/login")
async def login(body: LoginBody):
    if not body.email or not body.password:
        raise HTTPException(400, "Email and password are required")
    res = db.from_("users").select("*").eq("email", body.email).maybe_single().execute()
    user = res.data
    if not user:
        raise HTTPException(401, "Invalid credentials")
    if not user.get("password"):
        raise HTTPException(401, "This account was created with Google. Please sign in with Google, or set a password from your profile.")
    if not bcrypt.verify(body.password, user["password"]):
        raise HTTPException(401, "Invalid credentials")
    token = generate_token(user["id"], user["email"])
    return {"message": "Logged in", "token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}}

@app.get("/api/auth/me")
async def get_me(user=Depends(get_current_user)):
    res = db.from_("users").select("id, email, name, created_at").eq("id", user["id"]).maybe_single().execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    return {"user": res.data}

@app.put("/api/auth/me")
async def update_me(body: UpdateProfileBody, user=Depends(get_current_user)):
    updates = {}
    if body.name: updates["name"] = body.name
    if body.email: updates["email"] = body.email
    if not updates:
        raise HTTPException(400, "Nothing to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        res = db.from_("users").update(updates).eq("id", user["id"]).execute()
        u = res.data[0]
        return {"message": "Profile updated", "user": {"id": u["id"], "email": u["email"], "name": u["name"]}}
    except Exception as e:
        if "23505" in str(e):
            raise HTTPException(409, "Email already taken")
        raise

@app.delete("/api/auth/me")
async def delete_me(user=Depends(get_current_user)):
    uid = user["id"]
    db.from_("subscriptions").delete().eq("user_id", uid).execute()
    db.from_("oauth_accounts").delete().eq("user_id", uid).execute()
    db.from_("users").delete().eq("id", uid).execute()
    return {"message": "Account deleted"}

@app.post("/api/auth/set-password")
async def set_password(body: SetPasswordBody, user=Depends(get_current_user)):
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    res = db.from_("users").select("*").eq("id", user["id"]).maybe_single().execute()
    u = res.data
    if not u:
        raise HTTPException(404, "User not found")
    if u.get("password") and u["password"] != "":
        if not body.currentPassword:
            raise HTTPException(400, "Current password is required")
        if not bcrypt.verify(body.currentPassword, u["password"]):
            raise HTTPException(401, "Current password is incorrect")
    hashed = bcrypt.hash(body.password)
    db.from_("users").update({"password": hashed, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", user["id"]).execute()
    return {"message": "Password updated successfully"}

@app.post("/api/auth/supabase-sync")
async def supabase_sync(body: SupabaseSyncBody):
    if not body.accessToken:
        raise HTTPException(400, "Access token required")
    try:
        su = db.auth.get_user(body.accessToken)
        su_user = su.user
    except Exception:
        raise HTTPException(401, "Invalid Supabase token")
    if not su_user:
        raise HTTPException(401, "Invalid Supabase token")
    email = su_user.email
    name = (su_user.user_metadata or {}).get("full_name") or (su_user.user_metadata or {}).get("name") or email.split("@")[0]
    res = db.from_("users").select("*").eq("email", email).maybe_single().execute()
    user = res.data
    if not user:
        r = db.from_("users").insert({"email": email, "password": "", "name": name}).execute()
        user = r.data[0]
    token = generate_token(user["id"], user["email"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}}

# ══════════════════════════════════════════════
#  OAUTH ROUTES
# ══════════════════════════════════════════════
class OAuthCallbackBody(BaseModel):
    code: str; redirectUri: Optional[str] = None

async def _get_or_create_user(email, name, provider):
    res = db.from_("users").select("*").eq("email", email).maybe_single().execute()
    user = res.data
    if user:
        ex = db.from_("oauth_accounts").select("id").eq("user_id", user["id"]).eq("provider", provider).maybe_single().execute()
        if not ex.data:
            db.from_("oauth_accounts").insert({"user_id": user["id"], "provider": provider, "provider_id": f"{provider}_{email}", "email": email, "name": name}).execute()
        return user
    r = db.from_("users").insert({"email": email, "password": "", "name": name or email.split("@")[0]}).execute()
    new_user = r.data[0]
    db.from_("oauth_accounts").insert({"user_id": new_user["id"], "provider": provider, "provider_id": f"{provider}_{email}", "email": email, "name": name}).execute()
    return new_user

@app.post("/api/oauth/google/callback")
async def google_oauth(body: OAuthCallbackBody):
    if not body.code: raise HTTPException(400, "Authorization code is required")
    redirect = body.redirectUri or GOOGLE_REDIRECT_URI
    async with httpx.AsyncClient() as c:
        tok = await c.post("https://oauth2.googleapis.com/token", data={"code": body.code, "client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET, "redirect_uri": redirect, "grant_type": "authorization_code"})
        if tok.status_code != 200: raise HTTPException(401, f"Google OAuth error: {tok.json().get('error_description', tok.text)}")
        access_token = tok.json()["access_token"]
        info = await c.get("https://www.googleapis.com/oauth2/v2/userinfo", headers={"Authorization": f"Bearer {access_token}"})
        data = info.json()
    user = await _get_or_create_user(data["email"], data.get("name", ""), "google")
    token = generate_token(user["id"], user["email"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}}

@app.post("/api/oauth/github/callback")
async def github_oauth(body: OAuthCallbackBody):
    if not body.code: raise HTTPException(400, "Authorization code is required")
    redirect = body.redirectUri or GITHUB_REDIRECT_URI
    async with httpx.AsyncClient() as c:
        tok = await c.post("https://github.com/login/oauth/access_token", json={"client_id": GITHUB_CLIENT_ID, "client_secret": GITHUB_CLIENT_SECRET, "code": body.code, "redirect_uri": redirect}, headers={"Accept": "application/json"})
        access_token = tok.json().get("access_token")
        if not access_token: raise HTTPException(401, "GitHub OAuth failed")
        info = await c.get("https://api.github.com/user", headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github.v3+json"})
        data = info.json()
    email = data.get("email")
    name = data.get("name") or data.get("login", "")
    if not email:
        async with httpx.AsyncClient() as c:
            try:
                emails_r = await c.get("https://api.github.com/user/emails", headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github.v3+json"})
                primary = next((e for e in emails_r.json() if e.get("primary")), None)
                if primary: email = primary["email"]
            except: pass
        if not email: email = f"{data.get('login', 'user')}@github.local"
    user = await _get_or_create_user(email, name, "github")
    token = generate_token(user["id"], user["email"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}}

@app.get("/api/oauth/auth-methods/{email}")
async def auth_methods(email: str):
    if not email: raise HTTPException(400, "Email is required")
    res = db.from_("users").select("id, password").eq("email", email).maybe_single().execute()
    if not res.data: return {"methods": []}
    methods = []
    if res.data.get("password"): methods.append("email")
    oa = db.from_("oauth_accounts").select("provider").eq("user_id", res.data["id"]).execute()
    for a in (oa.data or []): methods.append(a["provider"])
    return {"methods": methods}

# ══════════════════════════════════════════════
#  SUBSCRIPTION ROUTES
# ══════════════════════════════════════════════
class SubBody(BaseModel):
    name: Optional[str] = None; cost: Optional[float] = None; currency: Optional[str] = None
    cycle: Optional[str] = None; category: Optional[str] = None; status: Optional[str] = None
    next_bill: Optional[str] = None; notes: Optional[str] = None; url: Optional[str] = None
class BulkDeleteBody(BaseModel):
    ids: List[Any]

@app.get("/api/subscriptions")
async def list_subs(user=Depends(get_current_user), category: Optional[str]=None, status: Optional[str]=None, search: Optional[str]=None, sort: Optional[str]=None, order: Optional[str]=None, page: int=1, limit: int=50):
    sort_map = {"cost":"cost","name":"name","next-bill":"next_bill","created":"created_at","category":"category"}
    sort_col = sort_map.get(sort, "cost")
    asc = order == "asc"
    p = max(1, page); l = min(100, max(1, limit)); offset = (p-1)*l
    q = db.from_("subscriptions").select("*", count="exact").eq("user_id", user["id"])
    if category and category in VALID_CATEGORIES: q = q.eq("category", category)
    if status and status in VALID_STATUSES: q = q.eq("status", status)
    if search:
        term = search.replace("%","\\%").replace("_","\\_")
        q = q.or_(f"name.ilike.%{term}%,notes.ilike.%{term}%,category.ilike.%{term}%")
    q = q.order(sort_col, desc=not asc).range(offset, offset+l-1)
    res = q.execute()
    return {"subscriptions": res.data, "pagination": {"page": p, "limit": l, "total": res.count, "pages": math.ceil((res.count or 0)/l)}}

@app.get("/api/subscriptions/{sub_id}")
async def get_sub(sub_id: str, user=Depends(get_current_user)):
    res = db.from_("subscriptions").select("*").eq("id", sub_id).eq("user_id", user["id"]).maybe_single().execute()
    if not res.data: raise HTTPException(404, "Subscription not found")
    return {"subscription": res.data}

@app.post("/api/subscriptions", status_code=201)
async def create_sub(body: SubBody, user=Depends(get_current_user)):
    if not body.name or not body.name.strip(): raise HTTPException(400, "Name is required")
    if body.cost is None or body.cost < 0: raise HTTPException(400, "Valid cost is required")
    if body.currency and body.currency not in VALID_CURRENCIES: raise HTTPException(400, f"Currency must be one of: {', '.join(VALID_CURRENCIES)}")
    if body.cycle and body.cycle not in VALID_CYCLES: raise HTTPException(400, f"Cycle must be one of: {', '.join(VALID_CYCLES)}")
    if body.category and body.category not in VALID_CATEGORIES: raise HTTPException(400, f"Category must be one of: {', '.join(VALID_CATEGORIES)}")
    row = {"user_id": user["id"], "name": body.name.strip(), "cost": body.cost, "currency": body.currency or "USD", "cycle": body.cycle or "Monthly", "category": body.category or "Other", "status": body.status or "active", "next_bill": body.next_bill, "notes": body.notes or "", "url": body.url or ""}
    res = db.from_("subscriptions").insert(row).execute()
    return {"message": "Subscription created", "subscription": res.data[0]}

@app.put("/api/subscriptions/{sub_id}")
async def update_sub(sub_id: str, body: SubBody, user=Depends(get_current_user)):
    ex = db.from_("subscriptions").select("*").eq("id", sub_id).eq("user_id", user["id"]).maybe_single().execute()
    if not ex.data: raise HTTPException(404, "Subscription not found")
    e = ex.data
    if body.currency and body.currency not in VALID_CURRENCIES: raise HTTPException(400, f"Currency must be one of: {', '.join(VALID_CURRENCIES)}")
    if body.cycle and body.cycle not in VALID_CYCLES: raise HTTPException(400, f"Cycle must be one of: {', '.join(VALID_CYCLES)}")
    if body.category and body.category not in VALID_CATEGORIES: raise HTTPException(400, f"Category must be one of: {', '.join(VALID_CATEGORIES)}")
    if body.status and body.status not in VALID_STATUSES: raise HTTPException(400, f"Status must be one of: {', '.join(VALID_STATUSES)}")
    upd = {"name": body.name if body.name is not None else e["name"], "cost": body.cost if body.cost is not None else e["cost"], "currency": body.currency or e["currency"], "cycle": body.cycle or e["cycle"], "category": body.category or e["category"], "status": body.status or e["status"], "next_bill": body.next_bill if body.next_bill is not None else e["next_bill"], "notes": body.notes if body.notes is not None else e["notes"], "url": body.url if body.url is not None else e["url"], "updated_at": datetime.now(timezone.utc).isoformat()}
    res = db.from_("subscriptions").update(upd).eq("id", sub_id).eq("user_id", user["id"]).execute()
    return {"message": "Subscription updated", "subscription": res.data[0]}

@app.patch("/api/subscriptions/{sub_id}/toggle")
async def toggle_sub(sub_id: str, user=Depends(get_current_user)):
    res = db.from_("subscriptions").select("*").eq("id", sub_id).eq("user_id", user["id"]).maybe_single().execute()
    if not res.data: raise HTTPException(404, "Subscription not found")
    new_status = "paused" if res.data["status"] == "active" else "active"
    upd = db.from_("subscriptions").update({"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", sub_id).execute()
    return {"message": f"Subscription {new_status}", "subscription": upd.data[0]}

@app.delete("/api/subscriptions/{sub_id}")
async def delete_sub(sub_id: str, user=Depends(get_current_user)):
    ex = db.from_("subscriptions").select("id").eq("id", sub_id).eq("user_id", user["id"]).maybe_single().execute()
    if not ex.data: raise HTTPException(404, "Subscription not found")
    db.from_("subscriptions").delete().eq("id", sub_id).execute()
    return {"message": "Subscription deleted"}

@app.post("/api/subscriptions/bulk-delete")
async def bulk_delete(body: BulkDeleteBody, user=Depends(get_current_user)):
    if not body.ids: raise HTTPException(400, "Provide an array of subscription IDs")
    db.from_("subscriptions").delete().in_("id", body.ids).eq("user_id", user["id"]).execute()
    return {"message": f"Deleted {len(body.ids)} subscription(s)"}

# ══════════════════════════════════════════════
#  ANALYTICS ROUTES
# ══════════════════════════════════════════════
def monthize(cost, cycle):
    if cycle == "Yearly": return cost / 12
    if cycle == "Quarterly": return cost / 3
    return cost

@app.get("/api/analytics/summary")
async def analytics_summary(user=Depends(get_current_user)):
    res = db.from_("subscriptions").select("*").eq("user_id", user["id"]).execute()
    subs = res.data
    active = [s for s in subs if s["status"] == "active"]
    paused = [s for s in subs if s["status"] == "paused"]
    total_mo = sum(monthize(s["cost"], s["cycle"]) for s in active)
    total_yr = total_mo * 12
    avg = total_mo / len(active) if active else 0
    paused_savings = sum(monthize(s["cost"], s["cycle"]) for s in paused)
    daily = total_mo / 30
    highest = max(active, key=lambda s: monthize(s["cost"], s["cycle"]), default=None)
    lowest = min(active, key=lambda s: monthize(s["cost"], s["cycle"]), default=None)
    return {"summary": {
        "total_subscriptions": len(subs), "active_count": len(active), "paused_count": len(paused),
        "total_monthly": round(total_mo, 2), "total_annual": round(total_yr, 2),
        "avg_per_service": round(avg, 2), "daily_burn": round(daily, 2), "paused_savings": round(paused_savings, 2),
        "highest_cost": {"name": highest["name"], "monthly": round(monthize(highest["cost"], highest["cycle"]), 2)} if highest else None,
        "lowest_cost": {"name": lowest["name"], "monthly": round(monthize(lowest["cost"], lowest["cycle"]), 2)} if lowest else None,
    }}

@app.get("/api/analytics/categories")
async def analytics_categories(user=Depends(get_current_user)):
    res = db.from_("subscriptions").select("*").eq("user_id", user["id"]).eq("status", "active").execute()
    cat_map, total = {}, 0
    for s in res.data:
        mo = monthize(s["cost"], s["cycle"]); total += mo
        c = s["category"]
        if c not in cat_map: cat_map[c] = {"category": c, "monthly": 0, "count": 0, "subscriptions": []}
        cat_map[c]["monthly"] += mo; cat_map[c]["count"] += 1
        cat_map[c]["subscriptions"].append({"id": s["id"], "name": s["name"], "monthly": round(mo, 2)})
    cats = sorted([{**c, "monthly": round(c["monthly"], 2), "percentage": round(c["monthly"]/total*100, 1) if total else 0} for c in cat_map.values()], key=lambda x: x["monthly"], reverse=True)
    return {"categories": cats, "total_monthly": round(total, 2)}

@app.get("/api/analytics/trends")
async def analytics_trends(user=Depends(get_current_user)):
    h = db.from_("spend_history").select("month, total").eq("user_id", user["id"]).order("month").execute()
    a = db.from_("subscriptions").select("cost, cycle").eq("user_id", user["id"]).eq("status", "active").execute()
    now = datetime.now(timezone.utc)
    cur_month = f"{now.year}-{now.month:02d}"
    cur_total = round(sum(monthize(s["cost"], s["cycle"]) for s in a.data), 2)
    history = h.data or []
    existing = next((x for x in history if x["month"] == cur_month), None)
    if existing: existing["total"] = cur_total
    else: history.append({"month": cur_month, "total": cur_total})
    trends = []
    for i, h in enumerate(history):
        prev = history[i-1]["total"] if i > 0 else h["total"]
        change = ((h["total"]-prev)/prev*100) if prev > 0 else 0
        trends.append({**h, "change_pct": round(change, 1)})
    return {"trends": trends}

@app.get("/api/analytics/upcoming")
async def analytics_upcoming(user=Depends(get_current_user), limit: int = 10, days: int = 30):
    limit = min(20, max(1, limit))
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    future = (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%d")
    res = db.from_("subscriptions").select("id, name, cost, currency, cycle, category, next_bill, notes").eq("user_id", user["id"]).eq("status", "active").not_.is_("next_bill", "null").gte("next_bill", today).lte("next_bill", future).order("next_bill").limit(limit).execute()
    results = []
    for s in res.data:
        diff = (datetime.strptime(s["next_bill"], "%Y-%m-%d") - datetime.now()).days + 1
        results.append({**s, "days_until": diff})
    return {"upcoming": results}

@app.get("/api/analytics/insights")
async def analytics_insights(user=Depends(get_current_user)):
    res = db.from_("subscriptions").select("*").eq("user_id", user["id"]).execute()
    subs = res.data
    active = [s for s in subs if s["status"] == "active"]
    insights = []
    cat_counts = {}
    for s in active:
        cat_counts[s["category"]] = cat_counts.get(s["category"], 0) + 1
    for cat, cnt in cat_counts.items():
        if cnt >= 3:
            insights.append({"type": "optimization", "severity": "medium", "title": f"{cnt} subscriptions in {cat}", "message": f"You have {cnt} active subscriptions in the {cat} category. Consider consolidating to reduce overlap."})
    high_cost = [s for s in active if monthize(s["cost"], s["cycle"]) > 500]
    for s in high_cost:
        insights.append({"type": "cost_alert", "severity": "high", "title": f"High-cost: {s['name']}", "message": f"{s['name']} costs ${monthize(s['cost'], s['cycle']):.0f}/month. Review if this provides adequate value.", "subscription_id": s["id"]})
    monthly_subs = [s for s in active if s["cycle"] == "Monthly" and s["cost"] > 20]
    if monthly_subs:
        insights.append({"type": "savings", "severity": "low", "title": "Switch to annual billing", "message": f"{len(monthly_subs)} service(s) are billed monthly. Switching to annual could save ~15% on average."})
    next7 = []
    for s in active:
        if not s.get("next_bill"): continue
        try:
            diff = (datetime.strptime(s["next_bill"], "%Y-%m-%d") - datetime.now()).days + 1
            if 0 <= diff <= 7: next7.append(s)
        except: pass
    if len(next7) >= 3:
        total_due = sum(s["cost"] for s in next7)
        insights.append({"type": "cashflow", "severity": "medium", "title": f"{len(next7)} renewals this week", "message": f"${total_due:.0f} due across {len(next7)} subscriptions in the next 7 days."})
    score = 80
    if len(high_cost) > 2: score -= 10
    if len(monthly_subs) > 5: score -= 8
    if len([s for s in subs if s["status"] == "paused"]) > 3: score -= 5
    score = max(0, min(100, score))
    return {"insights": insights, "optimization_score": score, "total_insights": len(insights)}

# ══════════════════════════════════════════════
#  IMPORT ROUTES
# ══════════════════════════════════════════════
KNOWN_SERVICES = {
    "openai": {"name": "OpenAI", "category": "AI & Tech"}, "chatgpt": {"name": "ChatGPT Plus", "category": "AI & Tech"},
    "anthropic": {"name": "Anthropic", "category": "AI & Tech"}, "claude": {"name": "Claude Pro", "category": "AI & Tech"},
    "midjourney": {"name": "Midjourney", "category": "AI & Tech"}, "github copilot": {"name": "GitHub Copilot", "category": "AI & Tech"},
    "copilot": {"name": "GitHub Copilot", "category": "AI & Tech"}, "cursor": {"name": "Cursor", "category": "AI & Tech"},
    "aws": {"name": "AWS", "category": "Cloud & Infra"}, "google cloud": {"name": "Google Cloud", "category": "Cloud & Infra"},
    "azure": {"name": "Microsoft Azure", "category": "Cloud & Infra"}, "digitalocean": {"name": "DigitalOcean", "category": "Cloud & Infra"},
    "heroku": {"name": "Heroku", "category": "Cloud & Infra"}, "vercel": {"name": "Vercel", "category": "Cloud & Infra"},
    "netlify": {"name": "Netlify", "category": "Cloud & Infra"}, "cloudflare": {"name": "Cloudflare", "category": "Cloud & Infra"},
    "supabase": {"name": "Supabase", "category": "Cloud & Infra"}, "railway": {"name": "Railway", "category": "Cloud & Infra"},
    "netflix": {"name": "Netflix", "category": "Media & Content"}, "spotify": {"name": "Spotify", "category": "Media & Content"},
    "apple music": {"name": "Apple Music", "category": "Media & Content"}, "youtube premium": {"name": "YouTube Premium", "category": "Media & Content"},
    "youtube": {"name": "YouTube Premium", "category": "Media & Content"}, "disney": {"name": "Disney+", "category": "Media & Content"},
    "hulu": {"name": "Hulu", "category": "Media & Content"}, "hbo": {"name": "HBO Max", "category": "Media & Content"},
    "amazon prime": {"name": "Amazon Prime", "category": "Media & Content"}, "audible": {"name": "Audible", "category": "Media & Content"},
    "hotstar": {"name": "Disney+ Hotstar", "category": "Media & Content"}, "sonyliv": {"name": "SonyLIV", "category": "Media & Content"},
    "zee5": {"name": "ZEE5", "category": "Media & Content"}, "jio": {"name": "JioCinema", "category": "Media & Content"},
    "notion": {"name": "Notion", "category": "Productivity"}, "figma": {"name": "Figma", "category": "Productivity"},
    "slack": {"name": "Slack", "category": "Productivity"}, "zoom": {"name": "Zoom", "category": "Productivity"},
    "microsoft 365": {"name": "Microsoft 365", "category": "Productivity"}, "dropbox": {"name": "Dropbox", "category": "Productivity"},
    "canva": {"name": "Canva Pro", "category": "Productivity"}, "adobe": {"name": "Adobe Creative Cloud", "category": "Productivity"},
    "grammarly": {"name": "Grammarly", "category": "Productivity"}, "1password": {"name": "1Password", "category": "Productivity"},
    "linkedin": {"name": "LinkedIn Premium", "category": "Productivity"},
    "tradingview": {"name": "TradingView", "category": "Finance"}, "quickbooks": {"name": "QuickBooks", "category": "Finance"},
    "stripe": {"name": "Stripe", "category": "Finance"}, "zerodha": {"name": "Zerodha", "category": "Finance"},
    "headspace": {"name": "Headspace", "category": "Health"}, "calm": {"name": "Calm", "category": "Health"},
    "peloton": {"name": "Peloton", "category": "Health"}, "strava": {"name": "Strava", "category": "Health"},
}

def _parse_csv(text):
    lines = text.strip().split("\n")
    if len(lines) < 2: return [], []
    first = lines[0]
    delim = "\t" if first.count("\t") > first.count(",") else ";" if first.count(";") > first.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    rows_raw = list(reader)
    headers = [re.sub(r"[^a-z0-9_]", "_", h.lower().strip()) for h in rows_raw[0]]
    rows = [{headers[j]: (vals[j].strip() if j < len(vals) else "") for j in range(len(headers))} for vals in rows_raw[1:] if any(v.strip() for v in vals)]
    return headers, rows

def _detect_columns(headers, sample):
    result = {"date": None, "description": None, "amount": None, "debit": None, "credit": None}
    for h in headers:
        if not result["date"] and any(p in h for p in ["date","trans_date","txn_date","posting_date","value_date"]): result["date"] = h
        if not result["description"] and any(p in h for p in ["description","desc","narrative","particulars","details","merchant","narration","memo"]): result["description"] = h
        if not result["amount"] and any(p in h for p in ["amount","transaction_amount","txn_amount"]): result["amount"] = h
        if not result["debit"] and any(p in h for p in ["debit","withdrawal","debit_amount"]): result["debit"] = h
    return result

def _parse_amount(v):
    if not v: return None
    cleaned = re.sub(r"[₹$€£,\s]", "", str(v))
    cleaned = re.sub(r"\((.+)\)", r"-\1", cleaned)
    try: return float(cleaned)
    except: return None

def _normalize_merchant(desc):
    if not desc: return ""
    name = re.sub(r"^(UPI|NEFT|IMPS|RTGS|POS|ATM|ACH|DD|ECS|SI|AUTO[\s-]?DEBIT)[:\-/\s]+", "", str(desc).strip(), flags=re.I)
    name = re.sub(r"^(DEBIT CARD|CREDIT CARD|CARD|ONLINE|NET BANKING|BILL PAY)[:\-/\s]+", "", name, flags=re.I)
    name = re.sub(r"\b(ref|txn|trans|id|no)[:\s#]*[\w\d]+", "", name, flags=re.I)
    name = re.sub(r"\b\d{8,}\b", "", name)
    name = re.sub(r"[*#@]", " ", name).strip()
    name = name.split("/")[0].split("-")[0].split("|")[0].strip()
    return name[:50]

def _match_service(name):
    lower = name.lower()
    for kw, svc in KNOWN_SERVICES.items():
        if kw in lower: return svc
    return None

class ImportDetectBody(BaseModel):
    csvText: str; currency: Optional[str] = None
class ImportConfirmBody(BaseModel):
    subscriptions: List[dict]

@app.post("/api/import/detect")
async def import_detect(body: ImportDetectBody, user=Depends(get_current_user)):
    if not body.csvText: raise HTTPException(400, "CSV text is required")
    headers, rows = _parse_csv(body.csvText)
    if not rows: raise HTTPException(400, "No data rows found in CSV")
    cols = _detect_columns(headers, rows[:5])
    if not cols["description"]: raise HTTPException(400, "Could not detect description/merchant column")
    if not cols["amount"] and not cols["debit"]: raise HTTPException(400, "Could not detect amount column")
    if not cols["date"]: raise HTTPException(400, "Could not detect date column")
    # Group transactions by merchant
    groups = {}
    for row in rows:
        desc = row.get(cols["description"], "")
        amt = _parse_amount(row.get(cols["amount"])) if cols["amount"] else _parse_amount(row.get(cols["debit"]))
        if not amt or amt <= 0: continue
        merchant = _normalize_merchant(desc)
        if not merchant or len(merchant) < 2: continue
        key = merchant.lower()[:20]
        if key not in groups: groups[key] = []
        groups[key].append({"merchant": merchant, "amount": abs(amt), "raw": desc})
    detected = []
    for key, txns in groups.items():
        if len(txns) < 2: continue
        amt = round(sum(t["amount"] for t in txns) / len(txns), 2)
        known = _match_service(txns[0]["merchant"])
        name = known["name"] if known else txns[0]["merchant"]
        cat = known["category"] if known else "Other"
        conf = "high" if len(txns) >= 3 else "medium"
        detected.append({"name": name, "cost": amt, "currency": body.currency or "INR", "cycle": "Monthly", "category": cat, "status": "active", "next_bill": "", "notes": f"Detected from {len(txns)} transactions.", "confidence": conf, "occurrences": len(txns)})
    detected.sort(key=lambda x: (0 if x["confidence"]=="high" else 1, -x["cost"]))
    return {"message": f"Analyzed {len(rows)} transactions, found {len(detected)} potential subscriptions", "detected_columns": cols, "total_transactions": len(rows), "subscriptions": detected}

@app.post("/api/import/confirm", status_code=201)
async def import_confirm(body: ImportConfirmBody, user=Depends(get_current_user)):
    if not body.subscriptions: raise HTTPException(400, "No subscriptions to import")
    to_insert = [{"user_id": user["id"], "name": (s.get("name","Unknown"))[:100], "cost": abs(float(s.get("cost",0))), "currency": s.get("currency","USD") if s.get("currency") in VALID_CURRENCIES else "USD", "cycle": s.get("cycle","Monthly") if s.get("cycle") in VALID_CYCLES else "Monthly", "category": s.get("category","Other") if s.get("category") in VALID_CATEGORIES else "Other", "status": "active", "next_bill": s.get("next_bill"), "notes": s.get("notes",""), "url": s.get("url","")} for s in body.subscriptions]
    res = db.from_("subscriptions").insert(to_insert).execute()
    return {"message": f"Successfully imported {len(res.data)} subscription(s)", "subscriptions": res.data}

# ══════════════════════════════════════════════
#  GMAIL ROUTES
# ══════════════════════════════════════════════
GMAIL_SERVICE_MAP = {
    "netflix": {"name": "Netflix", "category": "Media & Content"}, "spotify": {"name": "Spotify", "category": "Media & Content"},
    "apple": {"name": "Apple", "category": "AI & Tech"}, "amazon prime": {"name": "Amazon Prime", "category": "Media & Content"},
    "aws": {"name": "AWS", "category": "Cloud & Infra"}, "google one": {"name": "Google One", "category": "Cloud & Infra"},
    "youtube premium": {"name": "YouTube Premium", "category": "Media & Content"}, "youtube": {"name": "YouTube Premium", "category": "Media & Content"},
    "disney": {"name": "Disney+", "category": "Media & Content"}, "hbo": {"name": "HBO Max", "category": "Media & Content"},
    "adobe": {"name": "Adobe Creative Cloud", "category": "Productivity"}, "microsoft": {"name": "Microsoft", "category": "Productivity"},
    "dropbox": {"name": "Dropbox", "category": "Cloud & Infra"}, "notion": {"name": "Notion", "category": "Productivity"},
    "slack": {"name": "Slack", "category": "Productivity"}, "zoom": {"name": "Zoom", "category": "Productivity"},
    "figma": {"name": "Figma", "category": "Productivity"}, "github": {"name": "GitHub", "category": "AI & Tech"},
    "openai": {"name": "OpenAI", "category": "AI & Tech"}, "chatgpt": {"name": "ChatGPT Plus", "category": "AI & Tech"},
    "anthropic": {"name": "Anthropic (Claude)", "category": "AI & Tech"}, "vercel": {"name": "Vercel", "category": "Cloud & Infra"},
    "heroku": {"name": "Heroku", "category": "Cloud & Infra"}, "digitalocean": {"name": "DigitalOcean", "category": "Cloud & Infra"},
    "cloudflare": {"name": "Cloudflare", "category": "Cloud & Infra"}, "headspace": {"name": "Headspace", "category": "Health"},
    "calm": {"name": "Calm", "category": "Health"}, "strava": {"name": "Strava", "category": "Health"},
    "canva": {"name": "Canva", "category": "Productivity"}, "grammarly": {"name": "Grammarly", "category": "Productivity"},
    "audible": {"name": "Audible", "category": "Media & Content"}, "linkedin": {"name": "LinkedIn Premium", "category": "Productivity"},
    "hotstar": {"name": "Disney+ Hotstar", "category": "Media & Content"}, "sonyliv": {"name": "SonyLIV", "category": "Media & Content"},
    "zee5": {"name": "ZEE5", "category": "Media & Content"}, "jiocinema": {"name": "JioCinema", "category": "Media & Content"},
}

def _identify_service(from_addr, subject):
    combined = f"{from_addr} {subject}".lower()
    for key, info in GMAIL_SERVICE_MAP.items():
        if key in combined: return info
    m = re.match(r'^"?([^"<]+)"?\s*<', from_addr)
    if m:
        n = m.group(1).strip()
        if not re.search(r'noreply|no-reply|billing|support|payment|receipt', n, re.I):
            return {"name": n, "category": "Other"}
    return None

def _extract_amount(text):
    patterns = [r'[\$€£]\s?(\d{1,6}(?:[.,]\d{2})?)', r'₹\s?(\d{1,8}(?:[.,]\d{2})?)', r'(?:USD|INR|EUR|GBP|JPY)\s?(\d{1,8}(?:[.,]\d{2})?)', r'(?:charged|amount|total|payment)[:\s]*[\$€£₹]?\s?(\d{1,8}(?:[.,]\d{2})?)']
    for p in patterns:
        m = re.search(p, text, re.I)
        if m: return float(m.group(1).replace(",", "."))
    return None

def _detect_currency(text):
    if re.search(r'₹|INR', text, re.I): return 'INR'
    if re.search(r'€|EUR', text, re.I): return 'EUR'
    if re.search(r'£|GBP', text, re.I): return 'GBP'
    return 'USD'

def _detect_email_cycle(text):
    if re.search(r'yearly|annual|per year', text, re.I): return 'Yearly'
    if re.search(r'quarterly|per quarter', text, re.I): return 'Quarterly'
    return 'Monthly'

class GmailScanBody(BaseModel):
    code: str; redirectUri: Optional[str] = None

@app.get("/api/gmail/auth-url")
async def gmail_auth_url(user=Depends(get_current_user), redirectUri: Optional[str] = None):
    redirect = redirectUri or GMAIL_REDIRECT_URI
    params = {"client_id": GOOGLE_CLIENT_ID, "redirect_uri": redirect, "response_type": "code", "scope": "https://www.googleapis.com/auth/gmail.readonly", "access_type": "offline", "prompt": "consent"}
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + "&".join(f"{k}={v}" for k, v in params.items())
    return {"url": url}

@app.post("/api/gmail/scan")
async def gmail_scan(body: GmailScanBody, user=Depends(get_current_user)):
    if not body.code: raise HTTPException(400, "Authorization code is required")
    redirect = body.redirectUri or GMAIL_REDIRECT_URI
    async with httpx.AsyncClient() as c:
        # Exchange code for token
        tok = await c.post("https://oauth2.googleapis.com/token", data={"code": body.code, "client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET, "redirect_uri": redirect, "grant_type": "authorization_code"})
        if tok.status_code != 200:
            detail = tok.json().get("error_description", tok.text)
            if "invalid_grant" in str(detail): raise HTTPException(401, "Gmail authorization expired. Please try again.")
            raise HTTPException(500, f"Failed to get Gmail token: {detail}")
        access_token = tok.json()["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}
        # Search for payment emails
        query = "subject:(receipt OR invoice OR payment OR subscription OR renewal OR billing OR membership) newer_than:12m"
        list_res = await c.get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages?q={query}&maxResults=200", headers=headers)
        messages = list_res.json().get("messages", [])
        if not messages: return {"message": "Found 0 potential subscriptions", "subscriptions": []}
        detected_map = {}
        for i in range(0, min(len(messages), 200), 20):
            batch = messages[i:i+20]
            for msg in batch:
                try:
                    det = await c.get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg['id']}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date", headers=headers)
                    hdrs = {h["name"]: h["value"] for h in det.json().get("payload", {}).get("headers", [])}
                    from_addr = hdrs.get("From", ""); subject = hdrs.get("Subject", ""); date = hdrs.get("Date", "")
                    svc = _identify_service(from_addr, subject)
                    if not svc: continue
                    combined = f"{subject} {from_addr}"
                    amt = _extract_amount(combined); cur = _detect_currency(combined); cyc = _detect_email_cycle(combined)
                    key = svc["name"].lower()
                    if key not in detected_map:
                        detected_map[key] = {"name": svc["name"], "category": svc["category"], "cost": amt or 0, "currency": cur, "cycle": cyc, "occurrences": 1}
                    else:
                        detected_map[key]["occurrences"] += 1
                        if amt and not detected_map[key]["cost"]: detected_map[key]["cost"] = amt; detected_map[key]["currency"] = cur
                except: continue
        results = sorted([{"name": s["name"], "category": s["category"], "cost": s["cost"], "currency": s["currency"], "cycle": s["cycle"], "confidence": "high" if s["occurrences"] >= 3 else "medium" if s["occurrences"] >= 2 else "low", "emailCount": s["occurrences"], "status": "active", "next_bill": ""} for s in detected_map.values() if s["occurrences"] >= 2 or s["cost"] > 0], key=lambda x: x["emailCount"], reverse=True)
    return {"message": f"Found {len(results)} potential subscriptions", "subscriptions": results}

# ─── Run ───
if __name__ == "__main__":
    import uvicorn
    print(f"""
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │   ✦  SubVault API — Running (Python/FastAPI)                    │
  │                                                                 │
  │   Port:    {PORT}                                               │
  │   Health:  http://localhost:{PORT}/api/health                   │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
    """)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
