# Internal Operations Service Hub — v0.1 Product Foundation

This repository contains the Week 1 product foundation for the Internal Operations Service Hub.

## Repository structure

```text
README.md
docs/
├── product-spec.md
├── architecture.md
├── data-model.md
└── decisions/
    └── ADR-001-relational-database.md
```

## What is complete

- Product requirements and constraints are captured in `docs/product-spec.md`.
- Architecture decisions are captured in `docs/architecture.md`.
- The data model is derived from the product specification and architecture in `docs/data-model.md`.
- One major storage decision is recorded as ADR-001.
- Requirements are traced into entities, relationships, lifecycle rules, authorization rules, storage reasoning, and access patterns.

## What is deliberately not included

This is a product-foundation repository, not a complete application. There is no frontend/backend implementation, physical database schema, detailed API contract, CI/CD infrastructure, AI feature, or message queue.

## Design rule

Requirements come before implementation. The data model stores durable business facts, makes ownership and authorization representable, keeps history separate from current state, and derives values such as overdue status when possible.
