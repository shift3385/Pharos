# integrations

External tool integrations (spec §7). **Reserved boundary — future version, not in v0.0.1.**

Planned scope (post-v0.0.1, JIRA first):

- Create/query defects.
- Sync test cases with Xray/Zephyr.
- Read user stories to map use cases — connection via API token.

The modular architecture must allow adding this without touching the local
planner module. Layers to be added: `domain/`, `application/`, `infrastructure/`, `ui/`.
