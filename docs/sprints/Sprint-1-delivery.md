# Sprint 1 delivery

## Scope delivered

| Story | Result |
| --- | --- |
| S-01 — runnable app, CI, staging path | Docker Compose and PostgreSQL setup, Alembic-at-startup image, CI checks, versioned image publishing, and health-check rollback deploy script are in place. A staging deployment still needs a configured host and the documented GitHub `STAGING_*` secrets. |
| S-02 — email login and temporary lockout | Email-first login, Argon2id hashes, legacy bcrypt upgrade on successful login, account/IP lock after five consecutive failures for 15 minutes, and an HttpOnly session cookie. |
| S-03 — roles and owner data access | Five seeded roles, default-deny policy for new API routes, owner-scoped station/charger access, and authorization-denial audit logs. |
| S-04 — station create/edit | Owner can create and edit stations; coordinate bounds are validated in the form and API; newly created stations start in maintenance; repeat submits are guarded. |
| S-05 — chargers and connectors | Owner can add a charger with 1–4 connectors; each new connector starts `UNKNOWN` until the device reports status. Codes are normalized and globally unique in the database; charger code is not an editable field after creation. |
| K-01 — OCPP spike | Completed against a real OCPP 1.6J simulator. The 14-frame capture includes the eight requested actions, transaction start/meter/stop, and a successful server-initiated reset. See [the spike report](../spikes/K-01-OCPP-1.6J.md). |

## Verification

- Backend: `85 passed`.
- Frontend production build: passed. Vite reports the existing 722 kB JavaScript bundle-size warning.
- Sprint 1 backend lint: passed.
- Alembic on SQLite: upgrade to head, downgrade to base, and upgrade to head all passed; there is one migration head.
- Docker Compose configuration: passed `docker compose config` validation.
- OCPP spike: simulator connected with subprotocol `ocpp1.6`; all eight actions were present in the saved trace.

## Remaining environment step

Docker Desktop was not running on the development machine, so the containers could not be started here. The staging workflow is ready but has not deployed to a real host: configure the required repository secrets and host `.env` described in the root README, then push to `main` to run the deployment. The OCPP simulator was used only in the isolated spike; its older dependency tree reported npm audit findings and is not included in the product images.
