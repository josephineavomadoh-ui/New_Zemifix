# ZemiFix CMMS — Staging Deployment & Operations Guide

This guide details the complete staging deployment architecture, configuration verification, startup commands, database initialization, administrative provisioning, backup/recovery procedures, and service health management for ZemiFix.

---

## 1. Architecture & Service Verification

1. **Web Application (`web`)**: Next.js 15 modular monolith service running in standalone container mode, exposing port `3000`.
2. **PostgreSQL Database (`postgres`)**: PostgreSQL 16 Alpine container with persistent named volume `postgres_data` mounted at `/var/lib/postgresql/data`. Includes native health checks (`pg_isready`).
3. **Background Worker (`worker`)**: Dedicated background processing container executing automated PM generation, SLA evaluation, audit anchoring, and notification delivery.
4. **Storage (`storage_data`)**: Persistent Docker volume mounted at `/app/storage/uploads` for document and image attachments.
5. **Email Delivery**: Integrated with Resend via `RESEND_API_KEY` for transactional email and OTP dispatch.

---

## 2. Required Environment Variables

Create a `.env.staging` file in the project root with the following variables (do not commit secret values to version control):

```env
APP_ENV=staging
NODE_ENV=production
DB_PASSWORD=your_secure_postgres_password_here
DATABASE_URL=postgresql://zemifix:your_secure_postgres_password_here@postgres:5432/zemifix_staging?schema=public
DIRECT_URL=postgresql://zemifix:your_secure_postgres_password_here@postgres:5432/zemifix_staging?schema=public
SESSION_SECRET=your_32_character_minimum_session_secret_here
PORTAL_SESSION_SECRET=your_32_character_minimum_portal_secret_here
SECURITY_CONTEXT_SECRET=your_32_character_minimum_security_context_secret_here
RESEND_API_KEY=re_YourResendApiKeyHere
INITIAL_ADMIN_EMAIL=admin@zemifix.staging
INITIAL_ADMIN_PASSWORD=YourSecureAdminPassword123!
```

---

## 3. Exact Commands for Starting the Staging Environment

1. Copy your environment template:
   ```bash
   cp .env.example .env.staging
   # Edit .env.staging with your secure production/staging credentials
   ```

2. Start all services in detached mode using Docker Compose:
   ```bash
   docker-compose --env-file .env.staging up -d --build
   ```

---

## 4. Database Initialization & Prisma Migrations

Once PostgreSQL is healthy and the containers are running, execute database migrations and seed initial roles, permissions, and administrative data:

1. **Run Prisma Migrations**:
   ```bash
   docker-compose exec web npx prisma migrate deploy
   ```

2. **Provision Initial Administrator & Core Seed Data**:
   ```bash
   docker-compose exec web npm run seed
   ```

---

## 5. How to Verify Each Service is Running

- **Container Status**:
  ```bash
  docker-compose ps
  ```
- **Health Check Status**:
  - `zemifix_postgres`: Must report `healthy`.
  - `zemifix_web`: Must report `running` and respond to `http://localhost:3000/api/health`.
  - `zemifix_worker`: Must report `running`.
- **Logs Inspection**:
  ```bash
  docker-compose logs -f web
  docker-compose logs -f worker
  docker-compose logs -f postgres
  ```

---

## 6. How to Stop and Restart the Environment Safely

- **Stop Services (Preserving Volumes & Data)**:
  ```bash
  docker-compose stop
  ```
- **Bring Down Containers (Data in volumes is retained)**:
  ```bash
  docker-compose down
  ```
- **Restart Safely**:
  ```bash
  docker-compose up -d
  ```

---

## 7. Database Backup and Recovery Procedure

### Backup Procedure
To create a timestamped backup dump of the staging PostgreSQL database:
```bash
docker-compose exec postgres pg_dump -U zemifix zemifix_staging > backup_staging_$(date +%Y%m%d_%H%M%S).sql
```

### Recovery Procedure
To restore the staging database from a backup dump file:
```bash
docker-compose exec -T postgres psql -U zemifix -d zemifix_staging < backup_staging_YYYYMMDD_HHMMSS.sql
```
