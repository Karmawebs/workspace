# KARMA WORKSPACE — CURRENT STATE

Last updated: 2026-10-24

## Current phase
Architecture and backend foundation are ready. Frontend Workspace V1 has not yet been built.

No real production data should be migrated during this phase.

## Repository
Main repository: `Karmawebs/workspace`

Documentation currently available:
- `AGENTS.md` — permanent agent/development rules
- `README.md` — project overview
- `WORKSPACE_ARCHITECTURE.md` — architecture
- `ASTRA_HANDOFF.md` — implementation handoff
- `.env.example` — environment template

## Supabase
Workspace backend project:
`wrkoskqfjuefgrwhymqu`

Current production Karma Project, which must remain untouched:
`vjsmsekbsjngdtuxfbmu`

### Shared Core created
- profiles
- workspaces and memberships
- apps and module configuration
- CRM / clients
- projects and project members
- tasks
- events / meetings
- journal
- alerts
- project resources
- configurable project panels

All new shared tables use the `kw_` prefix.
RLS is enabled on the Workspace Core.

### App-specific models created
Work:
- `kw_project_milestones`

Social:
- `kw_content_items`

Care:
- `kw_care_sites`
- `kw_connections`

Care's previous technical tables/integration are retained and bridged non-destructively.

## Auth
Auth bootstrap is installed.
Creating an Auth user creates its Workspace profile.
Workspace membership is NOT granted automatically.

Current state:
- 0 Auth users
- 0 Workspace profiles
- 0 Workspace members
- 1 Workspace record

This is intentional before frontend setup/testing.

## UX/product reference
Use `Karmawebs/social` as the main reference for the project-management experience.

Important established behavior:
- project/task management pattern is approved
- project detail uses quick-access cards
- tasks and meetings/content sessions can share the main project view
- calendar must represent multiple events on one day clearly
- projects need edit/delete flows

Use `Karmawebs/care` as reference for existing technical/site/plugin functionality.

## Do not do yet
- Do not migrate Work data.
- Do not migrate Social data.
- Do not migrate Care production data.
- Do not modify `vjsmsekbsjngdtuxfbmu`.
- Do not replace Care technical infrastructure without a demonstrated reason.

## Next objective
Build Workspace V1 in this repository using the prepared shared backend.

The first large implementation pass should establish the shared application shell/design system/Core and functional Work, Social and Care modules using empty/test data.

After implementation:
1. verify build and main flows
2. update this file
3. review V1
4. make localized fixes
5. only after approval, plan real-data migration
