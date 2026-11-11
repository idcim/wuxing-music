# Merged Miniapp Payer Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** A user whose H5 and miniapp accounts were merged can create and pay for music membership, gift cards, courses, and physical goods with the miniapp OpenID issued by the configured AppID.

**Architecture:** Keep `User.openid` unchanged for legacy login and audit. Persist the verified miniapp OpenID separately on each miniapp login; resolve existing merged identities from tombstone rows for old sessions. All new order snapshots use one identity resolver, and pay-time validation rejects an order whose payer differs from the current miniapp identity.

**Tech Stack:** FastAPI, SQLAlchemy 2, SQLite tests, MySQL production, versioned commerce migration.

**Spec:** `docs/V2-COMMERCE.md` and the 2.0 plan in the conversation.

## Global Constraints

- Do not trust an OpenID supplied by the client; only `jscode2session` may establish it.
- Preserve existing paid orders and H5 payer identity; a pending order with the wrong payer must be recreated.
- Schema changes must be idempotent and run through the backup-first deployment chain.

## Review Focus

- H5 account is keeper before its first miniapp login: miniapp purchase uses the newly verified OpenID.
- Miniapp account becomes tombstone after merge: an old valid token still resolves its miniapp OpenID.
- H5-only or phone-only account cannot create a miniapp order without a verified miniapp identity.
- Duplicate login and account merge do not lose the miniapp identity.
- Existing pending order with another payer cannot issue payment parameters.
- When 微信 omits unionid, a client-supplied unionid cannot select another user's account.
- Account deactivation erases the stored miniapp identity; test-account cleanup excludes newly verified real users.

---

### Task 1: Persist and resolve the miniapp payer

**Files:** `backend/app/models.py`, `backend/app/user_merge.py`, `backend/app/routers/mp.py`, `backend/tests/test_member_virtual.py`.

**Interfaces:** `miniapp_openid(db, user) -> str` returns the verified or legacy miniapp OpenID, otherwise raises `HTTPException`.

- [x] Add a failing test for H5-first login followed by miniapp login, plus merged tombstone and H5-only cases.
- [x] Run targeted tests to confirm the current failure.
- [x] Add nullable `User.mp_openid`, set it from `jscode2session`, preserve it through merge, and implement the resolver.
- [x] Run targeted tests to confirm they pass.

### Task 2: Use the payer for every new purchase

**Files:** `backend/app/routers/mp.py`, `backend/app/commerce/trading.py`, `backend/app/commerce/providers.py`, `backend/tests/test_member_virtual.py`, `backend/tests/test_commerce.py`.

- [x] Add failing tests for member, gift, course, physical payer snapshots and mismatched pending order.
- [x] Run targeted tests to confirm the failures.
- [x] Route order creation and payment preflight through `miniapp_openid`.
- [x] Run targeted tests to confirm they pass.

### Task 3: Migrate and verify

**Files:** `backend/app/commerce/migrate.py`, `backend/app/commerce/models.py`, migration tests, `docs/V2-COMMERCE.md`, `docs/WEAPP-TODO.md`.

- [x] Add a failing upgrade/re-entry test for the existing `user` table without `mp_openid`.
- [x] Add idempotent v6 `ALTER TABLE` and update migration/version documentation.
- [x] Run backend full tests, syntax check, local isolated MySQL rehearsal if available, and `codegraph sync/status`.
- [x] Review staged diff, commit, and push after all checks pass.
