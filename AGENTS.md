# KARMA WORKSPACE — AGENT INSTRUCTIONS

## Mission
Build and maintain Karma Workspace: the shared architecture for Work, Social and Care.

The goal is one reusable Core plus app-specific modules. Do not create three duplicated systems.

## Read first
Before broad repository exploration, read these files in this order:
1. `AGENTS.md`
2. `CURRENT_STATE.md` if present
3. `ASTRA_HANDOFF.md`
4. `WORKSPACE_ARCHITECTURE.md`
5. `README.md`

Treat repository documentation as the technical source of truth. Do not reconstruct known context from scratch on every task.

## Backend
New Workspace Supabase project:
- Project ID: `wrkoskqfjuefgrwhymqu`
- Shared tables use the `kw_` prefix.

Current production Karma Project:
- Project ID: `vjsmsekbsjngdtuxfbmu`

### Critical rule
DO NOT modify, migrate, clean up or refactor the current production Karma Project unless the user explicitly requests a migration/change to production.

Real-data migration is intentionally postponed until Workspace is built, tested and approved.

## Core
Shared Core owns:
- CRM / clients
- projects
- project members
- tasks
- meetings and events
- journal / diary
- alerts
- users and workspace membership
- project resources / accesses
- configurable project quick panels

Primary Core tables include:
- `kw_profiles`
- `kw_workspaces`
- `kw_workspace_members`
- `kw_apps`
- `kw_app_modules`
- `kw_clients`
- `kw_projects`
- `kw_project_members`
- `kw_tasks`
- `kw_events`
- `kw_journal_entries`
- `kw_alerts`
- `kw_project_resources`
- `kw_project_panels`

Do not create app-specific duplicates of Core entities unless there is a demonstrated technical requirement.

## App modules
### Work
Core plus:
- project dashboard
- standalone tasks
- milestones

Specific model:
- `kw_project_milestones`

### Social
Core plus:
- calendar
- content manager

Specific model:
- `kw_content_items`

Calendar UI must support multiple events on the same day clearly.
Projects must be editable and deletable through the intended product flow.

### Care
Core plus:
- technical site management
- connections

Specific bridge/models:
- `kw_care_sites`
- `kw_connections`

Existing Care technical infrastructure is intentionally retained during transition. Preserve plugin/site integration and bridge it to Workspace rather than rebuilding it blindly.

## Existing repositories
Reference implementations:
- `Karmawebs/work`
- `Karmawebs/social`
- `Karmawebs/care`

Do not modify these repositories unless explicitly requested.

Use Social as the primary UX/product reference for project management, project detail, tasks, meetings/content sessions and calendar behavior.
Use Care as the technical reference for its existing WordPress/plugin infrastructure.

Do not repeatedly inspect entire reference repositories. Search/fetch only the files necessary for the current task.

## UX architecture
Work, Social and Care must feel like modules of one product.
Use a shared design system, shared components and coherent navigation.

Preferred project-detail pattern:
1. configurable quick-access cards at the top
2. primary project information/content below
3. task and meeting/event management in a useful two-column layout where appropriate

Examples of quick cards:
- Social: Accesses / Visual references / Next event / Information
- Care: Accesses / Hosting / Connections / Information
- Work: Accesses / Files / Next milestone / Information

Keep app differences module-driven rather than duplicating whole screens.

## Auth and permissions
Creating an Auth user may create its `kw_profiles` record automatically.
Workspace membership must remain deliberate.
Do not automatically grant every authenticated user access to the Workspace.
Respect RLS and existing membership rules.
Never expose service-role/private secrets in frontend code or repository files.

## Scope discipline
Implement the requested task, not adjacent ideas.
Do not perform unsolicited refactors.
Do not redesign established architecture unless a real blocker is found.
Do not create new tables when the existing model already supports the feature.
Do not migrate real production data during the construction phase.

For minor reversible decisions, choose the option most consistent with the existing architecture and continue. Ask only when a missing decision materially affects architecture, security, data or product behavior.

## Token / execution efficiency
Optimize for useful implementation, not exploration.

- Read `CURRENT_STATE.md` before broad investigation.
- Prefer targeted code search over full-repository reading.
- Do not re-audit Supabase if the relevant schema is documented and unchanged.
- Do not re-read reference apps unless the requested feature requires it.
- Batch related edits into one implementation pass.
- Avoid narrating every intermediate discovery.
- Avoid repeated builds after trivial edits; run meaningful verification at the end of the batch unless debugging requires otherwise.
- Reuse existing components and patterns instead of regenerating equivalents.
- Do not spend time proposing alternatives when the specification is already clear.

## Verification
For implementation tasks, finish the requested work before stopping where reasonably possible.
Then verify the affected application/build and report only:
- what changed
- verification result
- genuine blockers or remaining work

Do not claim success without verification when verification is available.

## CURRENT_STATE.md
`CURRENT_STATE.md` is the operational memory of the repository.
After substantial implementation work, update it briefly with:
- current completed state
- important implementation decisions
- known blockers/issues
- next logical step

Keep it concise. It is not a chat transcript or exhaustive changelog.

## Working model
Dani defines product needs.
ChatGPT handles architecture/specification/review and localized changes when practical.
Astra is primarily for large implementation passes, broad refactors and complex multi-layer debugging.

The intended workflow is:
Dani → ChatGPT → Astra → ChatGPT review.

## Definition of the current phase
Build a functional Workspace V1 against the NEW Workspace backend using test/empty data.
Work, Social and Care must operate on the shared architecture.
The old production Karma Project must remain operational and untouched.
Only after V1 is tested and approved will production data migration be planned and executed.