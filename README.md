# RedVeg Backend

Backend for RedVeg e-commerce platform for raw fish, poultry, and meat.

## Tech Stack

- **Backend:** Node.js, Express.js (Hosted on Render free tier)
- **Databases:** Turso SQL (libSQL) split across TWO distinct databases
- **Storage:** Cloudinary (via Cloudinary SDK) with Sharp for compression
- **Frontend (Future):** Next.js on Vercel

## Features

- Hybrid WhatsApp Checkout (no payment gateway)
- Admin Approval & Cross-DB Saga
- Image upload with Sharp compression to Cloudinary
- Data retention policy (auto-archive orders older than 30 days)
- Server sleep mitigation with health check endpoint
- JWT-based authentication
- Rate limiting for abuse prevention

## Project Structure

```
RedVeg-Backend/
├── README.md
├── .env
├── .env.example
├── package.json
├── server/
│   ├── server.js
│   ├── app.js
│   ├── api/
│   │   ├── index.js
│   │   └── v1/
│   │       ├── auth/
│   │       ├── products/
│   │       ├── orders/
│   │       ├── users/
│   │       ├── media/
│   │       ├── ui/
│   │       └── health/
│   ├── config/
│   ├── middleware/
│   ├── services/
│   ├── jobs/
│   └── utils/
├── database/
│   ├── catalog-db/
│   └── orders-db/
└── scripts/
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file with required variables:
   ```
   TURSO_CATALOG_URL=<your_turso_catalog_url>
   TURSO_CATALOG_AUTH_TOKEN=<your_turso_catalog_auth_token>
   TURSO_ORDERS_URL=<your_turso_orders_url>
   TURSO_ORDERS_AUTH_TOKEN=<your_turso_orders_auth_token>
   CLOUDINARY_CLOUD_NAME=<your_cloud_name>
   CLOUDINARY_API_KEY=<your_api_key>
   CLOUDINARY_API_SECRET=<your_api_secret>
   JWT_SECRET=<your_jwt_secret>
   PORT=3000
   ```

3. Start the server:
   ```bash
   npm start
   ```

## GoDaddy Node.js Hosting

For this Express backend, deploy the **repository root** (the directory containing this `package.json`), not the nested `frontend/redveg-commerce-ui` app. GoDaddy requires a `build` script even when no compilation is needed; the root build script is intentionally a no-op. The `start` script launches `server/server.js`, which listens on GoDaddy's injected `PORT` and binds to `0.0.0.0`.

In GoDaddy's app settings, configure the backend secrets from the Environment Variables section below (at minimum the database URLs/tokens used by this deployment, Cloudinary credentials, and `JWT_SECRET`). Do not upload or commit `.env`. After deployment, check **Runtime Logs** for `Server listening on 0.0.0.0:<port>` and open `/api/v1/health/ping` on the deployed app; it should return HTTP 200 with `status: "alive"`.

## API Endpoints

### Authentication
- POST `/api/v1/auth/login` - Admin login
- POST `/api/v1/auth/logout` - Admin logout

### Products
- GET `/api/v1/products` - Get all products
- GET `/api/v1/products/:id` - Get product by ID
- POST `/api/v1/products` - Create product (Admin)
- PUT `/api/v1/products/:id` - Update product (Admin)
- DELETE `/api/v1/products/:id` - Delete product (Admin)

### Orders
- POST `/api/v1/orders/checkout` - Create new order (checkout)
- GET `/api/v1/orders/:id` - Get order by ID
- PATCH `/api/v1/orders/:id/approve` - Approve order (Admin)
- GET `/api/v1/orders/user/:userId/orders` - Get user's order history

### Users
- GET `/api/v1/users/:userId` - Get user profile
- PUT `/api/v1/users/:userId` - Update user profile

### Media
- POST `/api/v1/media/upload/products` - Upload product image (Admin)
- POST `/api/v1/media/upload/ui` - Upload UI asset (Admin)

### UI
- GET `/api/v1/ui/banners` - Get active banners
- PUT `/api/v1/ui/banners/:id` - Update banner (Admin)

### Health
- GET `/api/v1/health/ping` - Health check (for Render.com sleep prevention)

## Environment Variables

- `TURSO_CATALOG_URL` - Turso catalog database URL
- `TURSO_CATALOG_AUTH_TOKEN` - Turso catalog database auth token
- `TURSO_ORDERS_URL` - Turso orders database URL
- `TURSO_ORDERS_AUTH_TOKEN` - Turso orders database auth token
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `JWT_SECRET` - Secret for JWT token signing
- `PORT` - Server port (default: 3000)
- `CORS_ORIGIN` - CORS origin (default: *)
- `ADMIN_WHATSAPP_NUMBER` - Admin WhatsApp number for order notifications
- `ARCHIVE_CRON_TIME` - Cron time for archiving job (default: "0 0 * * *")
- `MAX_FILE_SIZE_MB` - Maximum file upload size in MB (default: 5)
- `SALT_ROUNDS` - Bcrypt salt rounds (default: 10)
- `JWT_EXPIRES_IN` - JWT expiration time (default: "24h")

## Database Scripts

The `scripts/` directory contains utilities for pushing schema to Turso databases:
- `push-catalog.js` - Push catalog database schema
- `push-orders.js` - Push orders database schema

## License

MIT
