# Minecraft Material Tracker (MMT)

Minecraft Material Tracker (MMT) helps Minecraft cities and building groups plan large projects together. Every project has one shared card: the team can see what to build, which blocks are needed, who is collecting them, and what has already been delivered.

MMT replaces scattered spreadsheets and chat messages with a clear, shared record of work. It is made for communities that run several builds at once and need to divide resource gathering without losing track of contributions.

MMT is an open-source project under the MIT License. You can inspect, run, change, and reuse the code under the terms in [`LICENSE`](LICENSE). This repository contains the site code; access to any hosted private service is managed separately by its owner.

## What the site can do

### Plan and track builds

- Keep a searchable catalog of builds with descriptions, screenshots, coordinates, owners, responsible players, status, and material progress.
- Filter and sort the catalog, browse it page by page, show builds you own or participate in, save favorites, and hide finished builds.
- Move a build through planning, resource collection, ready to build, construction, completion, pause, and archive.
- Preview a build card before saving it, keep its edit history, and restore an earlier version when needed.

### Work with Minecraft materials

- Add a resource list by uploading a `.txt` or `.log` file, pasting a Litematica materials table, or entering items by hand.
- Fix invalid lines before saving, merge duplicate items after confirmation, and add or remove rows later.
- Set the required amount, stack size, and an optional per-item surplus limit.
- Attach `.litematic` and Sponge `.schem` files privately. The site checks their structure and keeps the build's existing progress when a file is replaced.
- Attach screenshots; the editor previews the card and accepts files by browsing or drag and drop.
- Track each player's reserved, gathered, and delivered quantities separately. Partial collection, corrections, and releases are recorded without replacing another player's work.
- See quantities as items, stacks, and shulker boxes, with support for non-standard stack sizes.

### Coordinate a team

- Assign a responsible player and construction tasks.
- Add comments to a build or a specific material.
- See other players' updates without manually reloading the page; the connection resumes after a brief interruption.
- Receive in-site notifications for assignments, status changes, task completion, reservations, collection, delivery, comments, and role changes. Each player can choose which notifications to receive.
- Review personal contribution, completed tasks, created builds, and a paginated activity history in the profile.

### Manage shared city resources

- Use the city needs page to combine material requirements across active builds and see the remaining shortage.
- Keep a personal mining list based on active reservations.
- Track shared warehouse stock, reserved stock, available stock, and recent movements.
- Let players reserve warehouse items; authorized staff can record incoming stock, usage, or a corrected total.

### Give the right people the right access

- The service is closed to public sign-up. Accounts are created by an administrator and use a Minecraft nickname.
- `PLAYER` accounts participate in builds and manage their own cards. `MODERATOR` accounts can manage shared content and moderate comments. `ADMIN` accounts also manage users, roles, and account access.
- Moderators can find, hide, and restore builds and comments, review similar titles and import errors, and manage the shared warehouse.
- Administrators can create or block accounts, change roles and nicknames, issue a temporary password, review contributions, and inspect the audit log.
- The owner-facing steps for adding a moderator are in [`docs/production-moderator.md`](docs/production-moderator.md).

## What MMT does not do

- It does not connect to a Minecraft game server or verify in-game events.
- It does not send Telegram messages. Both integrations are future directions; builds and resource tracking work without them.
- It does not import data from the earlier SQLite version. A local run starts with a separate, empty version 2 database.
- It does not provide public self-registration. A hosted community's administrator creates accounts.

## Run your own local copy

The source code is public, but the hosted service is private. To try MMT, clone the repository and run a separate local copy with your own local database. The beginner-friendly guide explains each command, first local account, file storage setup, and common errors:

- [Clone and run the site locally](docs/local-development.md)
- [Full version 2.0 specification](docs/antville-builder-2.0.md)
- [Implementation status by specification section](docs/v2-implementation-status.md)

Local users and builds stay on your machine. They do not appear in anyone else's hosted service.

## Project checks

The project uses Next.js, React, TypeScript, Prisma, and PostgreSQL. Before proposing code changes, run:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

CI also checks the database migrations and backup restore flow using test data. See [`docs/local-development.md`](docs/local-development.md) for the full local setup and troubleshooting steps.
