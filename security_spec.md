# Security Specification (Phase 0)

## Data Invariants
1. Every document under `/users/{userId}` and its subcollections (`jobActions`, `applications`, `learnedWeights`, `juryDecisions`) MUST be owned by `request.auth.uid == userId`, with `request.auth.token.email_verified == true`.
2. Every document ID (`userId`, `jobId`, `weightId`, `decisionId`) MUST satisfy `^[a-zA-Z0-9_-]+$` and length `1..128`.
3. `ownerId` and `createdAt` are immutable once created (`incoming().ownerId == existing().ownerId`, `incoming().createdAt == existing().createdAt`).
4. Timestamps `createdAt` (on create) and `updatedAt` (on create/update) MUST equal `request.time`.
5. Every subcollection write (`jobActions`, `applications`, `learnedWeights`, `juryDecisions`) verifies parent `/users/$(userId)` ownership via `get(...)` ("Master Gate").
6. Every collection enforces strict `keys().hasAll(...)` and `keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` on update to block shadow fields and privilege injection.
7. Every string field enforces strict `.size() <= MAX` boundaries and numeric counters/scores enforce range bounds (`0..100` for scores, `0..100000` for counts).

## Dirty Dozen Adversarial Payloads
1. Unauthenticated read/write to `/users/{uid}` -> `PERMISSION_DENIED`.
2. Authenticated user with `email_verified: false` writing to `/users/{uid}` -> `PERMISSION_DENIED`.
3. Cross-user access: User A reading/listing/writing `/users/{UserB}/juryDecisions/{decisionId}` -> `PERMISSION_DENIED`.
4. Identity spoofing: Creating `/users/{UserA}` with `ownerId: "UserB"` -> `PERMISSION_DENIED`.
5. Shadow field injection: Creating `/users/{uid}/juryDecisions/{id}` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
6. Timestamp tampering: Creating `/users/{uid}/juryDecisions/{id}` with backdated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
7. Immutable field tamper: Updating `ownerId`, `sessionId`, or `createdAt` on `/users/{uid}/juryDecisions/{id}` -> `PERMISSION_DENIED`.
8. Oversized CV payload (>120,000 chars) in `cv_text` -> `PERMISSION_DENIED`.
9. Invalid status enum (`status: "hacked"`) in `jobActions` -> `PERMISSION_DENIED`.
10. Weight poisoning (`score_delta: 9999`) outside `[-25, 25]` in `learnedWeights` or `avgMatchScore: 999` outside `[0, 100]` in `juryDecisions` -> `PERMISSION_DENIED`.
11. Orphaned subcollection write to `/users/{uid}/juryDecisions/{decisionId}` without existing parent `/users/{uid}` -> `PERMISSION_DENIED`.
12. Invalid path variable containing `/` or `..` or `>128` chars in `{decisionId}` -> `PERMISSION_DENIED`.
