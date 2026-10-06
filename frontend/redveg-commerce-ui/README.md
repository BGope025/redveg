# RedVeg Commerce Frontend

A responsive React frontend for **RedVeg**, covering both the public non-vegetarian storefront and the internal admin panel. The current repository is a frontend prototype: catalogue, orders, stock, offers, checkout, and account data are represented with realistic mock data and browser state until a production backend is connected.

## Included experiences

| Area | Routes | Highlights |
|---|---|---|
| Customer storefront | `/`, `/shop`, `/product/:slug`, `/cart`, `/checkout` | Product discovery, pack variants, persistent cart, guest checkout, saved-order confirmation, and WhatsApp handoff |
| Admin panel | `/admin`, `/admin/orders`, `/admin/catalog`, `/admin/offers` | Dashboard, manual WhatsApp order confirmation, order status controls, inventory, product editor, and offer scheduling |
| Supporting admin modules | `/admin/coupons`, `/admin/delivery`, `/admin/customers`, `/admin/analytics`, `/admin/settings` | Structured module shells ready for backend integration |

## Technology

- React 19 and TypeScript
- Vite 7
- Tailwind CSS 4
- shadcn/ui and Radix UI primitives
- Wouter routing
- Lucide icons
- Sonner notifications
- pnpm 10

## Open in VS Code or Antigravity IDE

### 1. Clone the repository

This repository is private. Sign in to GitHub in your IDE, or authenticate the GitHub CLI first:

```bash
gh auth login
gh repo clone anuragdoesntex1sts/redveg-commerce-ui
cd redveg-commerce-ui
```

In VS Code or Antigravity IDE, you can also choose **Clone Git Repository** and enter:

```text
https://github.com/anuragdoesntex1sts/redveg-commerce-ui.git
```

Open the folder directly:

```bash
code .
```

Alternatively, open `redveg-commerce-ui.code-workspace` from VS Code or Antigravity IDE.

### 2. Install the required tools

Use **Node.js 20 or newer**. Node.js 22 is recommended.

```bash
node --version
corepack enable
corepack prepare pnpm@10.4.1 --activate
```

### 3. Install dependencies

```bash
pnpm install --frozen-lockfile
```

### 4. Start local development

```bash
pnpm dev
```

Vite prints the local address in the terminal, normally `http://localhost:3000`. Open that URL for the storefront and append `/admin` for the admin panel.

## Useful commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the Vite development server with hot reload |
| `pnpm check` | Run TypeScript validation without emitting files |
| `pnpm build` | Create the production frontend and server bundle |
| `pnpm start` | Serve the completed production build |
| `pnpm preview` | Preview Vite’s production frontend output |
| `pnpm format` | Format the repository with Prettier |

## Project structure

```text
client/
  index.html
  src/
    components/
      admin/          Admin shell and status components
      storefront/     Customer header, footer, cards, and shell
      ui/             Shared shadcn/Radix primitives
    contexts/         Persistent cart and theme state
      data/             Static UI metadata only; business data comes from the API
    lib/              Shared assets and utilities
    pages/
      admin/           Admin routes
      storefront/      Customer routes
    types/             Commerce domain types
    App.tsx            Route registration and lazy loading
    index.css          RedVeg tokens, typography, and global styling
server/                Static production server only
shared/                Template compatibility types/constants
```

## Important implementation notes

### Backend-connected status

The storefront and admin panel read business data from the backend API. Admin routes require the dedicated admin session, and order, catalog, delivery, campaign, settings, and analytics changes are persisted in the configured database.

### Order workflow

The intended checkout sequence is:

1. The customer selects products and enters delivery information.
2. The backend validates price, stock, coupon, and serviceability.
3. The order is saved with status `New`.
4. WhatsApp opens with the prepared order summary.
5. Admin staff contacts the customer and manually chooses **Confirm order** or **Cancel order**.

Order creation is persisted by the backend before the customer is offered the prepared WhatsApp summary.

### Product and order data

Products, variants, stock, orders, customers, and reports are fetched from the backend API. Keep shared interfaces in:

```text
client/src/types/commerce.ts
```

### Branding and media

Brand and product media URLs are centralized in:

```text
client/src/lib/assets.ts
```

The optimized media is remotely hosted so a fresh clone displays correctly without copying large generated image files into the repository. Replace these URLs with your production CDN or object-storage URLs when the backend infrastructure is ready.

### Environment variables

Use a local `.env.local` file for the public backend URL and keep it untracked. Never commit real secrets or private API keys. Client-side `VITE_*` variables are visible in the browser and must not contain secrets.

## Before production

- Keep customer and admin screens connected to authenticated backend APIs.
- Keep secure staff login and role-based access controls enabled.
- Validate prices, stock, delivery fees, coupons, and totals on the server.
- Store an order before opening WhatsApp and make order creation idempotent.
- Add automated component, accessibility, and end-to-end tests.
- Configure production analytics, monitoring, SEO metadata, and error reporting.

## Git workflow

Create a branch for each change:

```bash
git checkout -b feature/my-change
```

Before committing:

```bash
pnpm check
pnpm build
```

Then commit and push:

```bash
git add .
git commit -m "Describe the change"
git push -u origin feature/my-change
```
