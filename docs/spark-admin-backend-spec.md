# Spark Admin — backend spec

Backend work needed for the `/spark` page. The frontend is **already built and
merged**; it calls the three endpoints below and currently renders an error
card because they 404. Nothing else is blocking.

Stack assumed: FastAPI + HTTPBearer JWT, matching the rest of `/api/v1`.

---

## 1. Why this is different from every other endpoint

Every existing endpoint is **scoped to the caller's company** by the JWT.
`GET /api/v1/admin/users` returns *your* company's users; `GET /api/v1/reports/{company_id}`
returns *one* company's reports.

Spark is the platform owner (us). These three endpoints are the **only** ones in
the system that cross tenants. That makes them the highest-risk endpoints in the
API: a mistake here leaks one customer's data to another.

**They are read-only.** Nothing here mutates a tenant. Anything that changes a
company's data keeps going through that company's own `/admin` endpoints, so
tenancy enforcement stays in exactly one place.

---

## 2. Authorization — the part that matters

### 2.1 New role: `spark_admin`

Add `spark_admin` to the role enum. Properties that differ from every other role:

| | |
|---|---|
| `company_id` | **null** — a Spark user belongs to no company |
| Assignable via `/admin/users/invite`? | **No.** Never grantable from a customer's Admin Console. Seed it directly (see §6). |
| Appears in a company's user list? | **No.** `GET /admin/users` must never return `spark_admin` rows. |
| Counted in a company's seat usage? | **No.** |

### 2.2 The rule

> `/api/v1/spark/*` requires `role == "spark_admin"`. Every other role gets **403**.

A company `admin` hitting these must get 403, not 200. Please make this a
dependency shared by all three routes rather than a per-handler check — e.g.

```python
def require_spark(user = Depends(current_user)):
    if user.role != "spark_admin":
        raise HTTPException(403, "Spark access required")
    return user

router = APIRouter(prefix="/api/v1/spark", dependencies=[Depends(require_spark)])
```

The frontend also hides `/spark` from non-Spark roles, but **that is cosmetic**.
Anyone can type the URL or curl the endpoint. The server is the only real gate.

### 2.3 Please write these two tests

1. A company `admin` JWT → `GET /api/v1/spark/overview` → **403**.
2. A `spark_admin` JWT → the response contains **more than one** `company_id`
   (i.e. tenancy filtering is genuinely off, not accidentally still applied).

---

## 3. Endpoints

### 3.1 `GET /api/v1/spark/overview`

Backs the three count cards **and** the Companies tab in one call.

```json
{
  "total_companies": 12,
  "total_reports": 340,
  "total_users": 87,
  "companies": [
    {
      "id": "cmp_1",
      "name": "Aramco",
      "sector_name": "Energy",
      "jurisdiction": "KSA",
      "created_at": "2025-01-04T09:00:00Z",
      "is_active": true,
      "user_count": 14,
      "report_count": 62
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `total_companies` / `total_reports` / `total_users` | ✅ | Platform-wide totals. Exclude `spark_admin` users from `total_users` — Spark is not a customer. |
| `companies[].id` | ✅ | Used as the React key. Must be unique. |
| `companies[].name` | ✅ | |
| `companies[].sector_name` | optional | Resolved name, not the id — the UI prints it verbatim. `null` renders `—`. |
| `companies[].jurisdiction` | optional | `null` renders `—`. |
| `companies[].created_at` | optional | ISO 8601. Shown as "Joined". |
| `companies[].is_active` | optional | Only `false` renders anything (an "Inactive" badge). |
| `companies[].user_count` / `report_count` | optional | Per-company counts. **These are why the Companies tab needs no second call** — please include them; omitting them shows `0` for every company. |

Sorting doesn't matter — the UI sorts client-side.

### 3.2 `GET /api/v1/spark/users`

Every user on the platform, flat. The UI groups them by company.

```json
[
  {
    "user_id": "usr_1",
    "full_name": "Sara Haddad",
    "email": "sara@aramco.com",
    "role": "admin",
    "status": "active",
    "company_id": "cmp_1",
    "company_name": "Aramco",
    "last_active": "2026-07-30T11:04:00Z"
  }
]
```

| Field | Required | Notes |
|---|---|---|
| `user_id` | ✅ | React key. Must be unique. |
| `full_name`, `email` | ✅ | |
| `role` | ✅ | One of the existing role strings. |
| `company_id` | ✅ | **The grouping key.** See the warning below. |
| `company_name` | ✅ | The group heading. |
| `status` | optional | `active` / `invited` / `suspended` — colour-coded. Anything else renders grey. |
| `last_active` | optional | ISO 8601. `null` renders `—`. |

Exclude `spark_admin` users from this list.

### 3.3 `GET /api/v1/spark/reports`

Every report on the platform, flat. Same grouping treatment.

```json
[
  {
    "report_id": "rpt_1",
    "title": "FY2025 Annual Report",
    "report_type": "annual",
    "status": "published",
    "period": "FY2025",
    "created_at": "2026-03-11T08:20:00Z",
    "company_id": "cmp_1",
    "company_name": "Aramco"
  }
]
```

| Field | Required | Notes |
|---|---|---|
| `report_id` | ✅ | React key. Must be unique. |
| `title` | ✅ | Empty string renders "Untitled report". |
| `company_id`, `company_name` | ✅ | Grouping key + heading. |
| `report_type` | optional | e.g. `annual` / `quarterly` / `earnings` / `esg`. Underscores become spaces and it's title-cased for display, so send the raw enum. |
| `status` | optional | `draft` / `in_review` / `approved` / `published` / `failed` get colours; anything else renders grey. |
| `period` | optional | Free text shown under the title. |
| `created_at` | optional | ISO 8601. |

---

## 4. Rules that apply to all three

**`company_id` and `company_name` on every row are the entire point.** They are
the one thing that distinguishes these endpoints from the existing `/admin` ones.
A row without them lands in an "Unassigned" bucket — it is not dropped, but the
screen is wrong. Use an inner join to the company, or make sure orphan rows are
genuinely orphans.

**Envelopes are accepted but not needed.** The client unwraps either a bare array
or `{"users": [...]}` / `{"reports": [...]}`. Pick one and be consistent.

**No pagination yet.** Return the full list. This is fine to a few thousand rows.
When it stops being fine, add `?limit`/`?offset` and a `?company_id=` filter and
tell us — the client change is small and already noted in the code
(`src/pages/spark/SparkDashboardPage.tsx`, search `ponytail:`).

**Errors:** standard FastAPI `{"detail": "..."}`. The frontend renders `detail`
verbatim to the user, so write it for a human. A 401 anywhere logs the user out
automatically.

**Performance:** the counts want to be aggregates, not `len()` over fetched rows.
Three `GROUP BY company_id` queries plus three `COUNT(*)`s should cover the
overview.

---

## 5. Auth endpoints must also know about the role

Beyond the three new routes, the existing auth endpoints need to handle a Spark
user correctly — the frontend gates entirely on `user.role`:

- **`POST /api/v1/auth/login`** → returns `role: "spark_admin"`, `company_id: null`.
- **`GET /api/v1/auth/me`** → same.
- **Do not require onboarding** for `spark_admin`. `onboarding_completed` can be
  `true` or absent; there is no company to onboard.
- **`must_change_password` works normally.** A seeded Spark account with a temp
  password is sent through `/change-password` first, then to `/spark`. That path
  is already handled and tested client-side.

`company_id: null` is safe on the client — `AuthContext` skips the company
lookup when it's absent.

---

## 6. Creating the first Spark user

There is deliberately no UI for this, since the role must not be grantable from
any customer's console. Seed it directly — a migration, a management command, or
a one-off insert — with:

```
role       = "spark_admin"
company_id = NULL
status     = "active"
```

Please confirm which mechanism you use so we can document it.

---

## 7. Acceptance checklist

- [ ] `GET /api/v1/spark/overview` returns the three totals + companies with per-company counts
- [ ] `GET /api/v1/spark/users` returns users across **all** companies, each with `company_id` + `company_name`
- [ ] `GET /api/v1/spark/reports` returns reports across **all** companies, each with `company_id` + `company_name`
- [ ] All three return **403** for a company `admin` JWT
- [ ] All three return **401** with no JWT
- [ ] `spark_admin` users are excluded from `GET /admin/users` and from `total_users`
- [ ] `spark_admin` cannot be assigned via `POST /admin/users/invite`
- [ ] `/auth/login` and `/auth/me` return `role: "spark_admin"`, `company_id: null`
- [ ] A seeded Spark account can log in

Frontend contract lives in `src/types/spark.ts`; the client calls are in
`src/lib/api.ts` under `export const spark`. Ping us if any field name is
awkward on your side — renaming now is cheap.
