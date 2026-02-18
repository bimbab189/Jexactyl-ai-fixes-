# Web Hosting Module - Testing Guide

This guide is for future implementation validation of the Jexactyl **Web Hosting** module (OpenResty integration + panel UI).

## Scope

Validate all required behaviors:

- Consumer analytics and domain/port/SSL controls.
- Admin settings, overview analytics, and per-server management.
- Multiple domains/ports per server (plan-limited).
- Custom Domains integration for automatic **A record** creation with Cloudflare proxying.
- Graceful OpenResty outage handling (red warning, no panel crash).

---

## Prerequisites

## 1) Environment

- Jexactyl panel running.
- OpenResty API reachable at configured URL (default `http://127.0.0.1:8080/api`).
- Valid OpenResty API key configured in admin module settings.
- Cloudflare credentials configured via Custom Domains module.
- At least 3 test eggs:
  - one selected as Web Hosting egg,
  - one non-Web Hosting egg,
  - one optional alternate Web Hosting egg.

## 2) Test Data

Create these test servers:

- `WH-Server-A` (Web Hosting egg, subdomain/site limit 1)
- `WH-Server-B` (Web Hosting egg, subdomain/site limit 3)
- `NonWH-Server-C` (non-Web Hosting egg)

Create test domains under a controlled zone:

- `wh-a.example.com`
- `wh-b1.example.com`
- `wh-b2.example.com`

---

## Test Phases

## Phase A - Configuration and Visibility

### A1. Egg Selection Behavior

1. Go to Admin → Modules → Web Hosting → Settings.
2. Select specific eggs as Web Hosting eggs.
3. Save settings.
4. Verify:
   - Web Hosting tab appears for servers using selected eggs.
   - Web Hosting tab does **not** appear for non-selected eggs.

### A2. Fallback Behavior (if implemented)

1. Clear selected eggs.
2. Verify fallback detection (name/features) is applied only if intended by product design.

### A3. Permission Gating

Test with owner and subusers:

- read-only user can view analytics but cannot mutate settings/actions.
- update-capable user can add/delete domains and toggle SSL.

---

## Phase B - OpenResty API Contract

Use a smoke script or `curl` to verify each endpoint contract.

### Header Requirement

All calls include:

- `X-API-Key: <panel-secret-token>`

### B1. Create Site

- Call `POST /sites` with `site_key, user_id, ip, port, domain, ssl_enabled`.
- Expected: `success: true`, persisted in OpenResty and panel DB.

### B2. Update Site

- Call `PUT /sites/<site_key>` with new domain/port/ip.
- Expected: analytics and mapping update reflected in UI after refresh/sync.

### B3. Delete Site

- Call `DELETE /sites/<site_key>`.
- Expected: record removed from OpenResty + panel UI.

### B4. SSL Actions

- `POST /sites/<site_key>/ssl` to toggle.
- `POST /sites/<site_key>/ssl/renew` to renew.
- Expected: `ssl_enabled` and `ssl_expires` update correctly in UI.

### B5. Analytics Endpoints

- `GET /sites/<site_key>` and `GET /analytics/<site_key>`.
- Expected fields present: requests, bytes, status buckets, last_request_ts.

---

## Phase C - Consumer UI Tests

Server page should expose tabs (Analytics and Domains) for Web Hosting servers.

### C1. Add Domain/Port Mapping

1. Add site entry for `WH-Server-B`.
2. Verify UI shows:
   - domain,
   - IP,
   - port,
   - SSL state,
   - last request timestamp.

### C2. Multiple Domain/Port Support

1. Add 2–3 mappings on `WH-Server-B`.
2. Verify each row tracks independent analytics and SSL.

### C3. Plan Limit Enforcement

1. On `WH-Server-A` (limit=1), add one mapping.
2. Attempt second mapping.
3. Expected: blocked with clear validation message; no crash.

### C4. Analytics Rendering

Verify for each mapping:

- total requests,
- bytes sent/bandwidth formatting,
- status code buckets (2xx/3xx/4xx/5xx),
- last request timestamp.

### C5. SSL Toggle + Renew

- Toggle SSL off/on.
- Trigger renew.
- Verify state and expiry changes in UI.

---

## Phase D - Admin UI Tests

### D1. Overview Metrics

Admin overview should list all Web Hosting servers with:

- total bandwidth,
- linked domains,
- IPs,
- ports,
- SSL counts/status.

### D2. Server Detail Management

For selected server, verify admin can:

- inspect full analytics,
- add/remove domain mappings,
- change port/IP/domain,
- enable/disable SSL,
- renew SSL.

### D3. Settings Persistence

Change backend URL and API key in admin settings.

- Refresh page and confirm values persist.
- Confirm calls use updated backend URL/key.

---

## Phase E - Custom Domains Integration (A Record)

### E1. Automatic A Record Creation

When creating/updating site mappings:

- verify A record is created/updated for matching managed zone.
- verify record is proxied according to integration policy.

### E2. Non-Matching Domain Safety

- Use a domain not managed in Custom Domains.
- Expected: no hard failure; Web Hosting action still succeeds.

### E3. Existing CNAME/SRV Regression Check

- Re-run existing Custom Domains workflows.
- Confirm CNAME/SRV behaviors are unchanged.

---

## Phase F - Failure and Resilience

### F1. OpenResty Offline

1. Stop OpenResty backend.
2. Load admin and consumer Web Hosting pages.
3. Expected:
   - red warning banner,
   - panel remains responsive,
   - no white screen/fatal exception.

### F2. OpenResty Returns 5xx/Timeout

- Inject temporary failures.
- Expected: actionable error message and graceful fallback behavior.

### F3. Cloudflare Failure

- Simulate invalid token or zone issue.
- Expected: Web Hosting record operations survive; DNS issue is non-fatal and visible for debugging.

---

## Phase G - Security and Access Control

- Verify API key is not leaked in logs/frontend payloads.
- Verify only authorized users can mutate web hosting entries.
- Verify server-scoped operations cannot access another server’s site IDs.
- Verify input validation for IP/port/domain and invalid SSL actions.

---

## Phase H - Regression Checklist

Run this before release:

- Non-Web Hosting servers unaffected.
- Existing server pages (console/files/network/etc.) unaffected.
- Custom Domains module unaffected.
- Billing/feature limit enforcement unaffected.
- No new TypeScript or PHP lint errors in changed files.

---

## Suggested Test Matrix

- Browsers: Chrome, Firefox.
- Roles: admin, server owner, limited subuser.
- Limits: unlimited and low-limit plans.
- Backend states: healthy, slow, offline.

---

## Optional Automation Targets

Add integration tests for:

- egg selection settings persistence,
- server eligibility detection,
- site create/update/delete controller responses,
- offline backend banner behavior,
- Custom Domains A record invocation (mocked service).

---

## Release Sign-Off Criteria

Ship only when all are true:

- all Phase A–H checks pass,
- no blocking regressions,
- graceful offline behavior confirmed,
- multi-domain/port behavior and limit enforcement confirmed,
- Custom Domains A-record integration validated.
