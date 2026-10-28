# integrations

External tool integrations (spec §7). **Reserved boundary — future version (Jira: 0.8.0, backlog INT-05).**

Planned scope (JIRA first):

- Create/query defects.
- Sync test cases with Xray/Zephyr.
- Read user stories to map use cases — connection via API token.

The modular architecture must allow adding this without touching the local
planner module. Layers to be added: `domain/`, `application/`, `infrastructure/`, `ui/`.
