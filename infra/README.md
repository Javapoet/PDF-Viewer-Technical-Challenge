Infra
=====

Docker + Compose configs for running the backend API and React (Vite) frontend locally and as a single production-style container.

Folder layout
repo-root/
├─ backend/
├─ frontend/
├─ infra/
│  ├─ Dockerfile
│  └─ docker-compose.yml
└─ .dockerignore


- `infra/Dockerfile`: multi-stage build that compiles the frontend and backend and serves both from one Node container.

- `infra/docker-compose.yml`:
  - dev profile → two containers (frontend + backend) with hot reload.
  - prod profile → one container built from the Dockerfile.

## Prerequisites

- Docker Desktop
  - Windows: use WSL 2 backend, Linux containers.
  - macOS/Linux: standard Docker is fine.

- (Optional) AWS creds if using S3 storage:
  - Have ~/.aws/credentials or %UserProfile%\.aws\credentials configured.
  - IAM principal must have at least s3:HeadObject and s3:GetObject on your object.

## Environment

You can run in Local file mode or S3 mode.

### Local file

- Backend reads a PDF from the container (or volume) path.
- Default dev path: /app/backend/assets/sample.pdf

## S3 mode

Set these (values shown are examples):

```
STORAGE_MODE=s3
S3_REGION=us-east-1
S3_BUCKET=dermot-dev
S3_KEY=IRS-Federal-Income-Tax-Guide-2024-Publication-17.pdf
```


**Auth**: either mount your AWS profile directory into the container or pass env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`).

Compose will substitute ${VAR} from your shell or from a .env file in the same directory where you run compose (often the repo root). You can also create an infra/.env and run compose from infra/ so it picks that up.

## Development (hot reload)

Runs two containers with code mounted in:

```
# from repo root
$ docker compose -f infra/docker-compose.yml --profile dev up --build
```

- Frontend (Vite): http://localhost:5173
- Backend (Express API): http://localhost:3000

### Dev env vars (examples):

```
# Local file mode
set STORAGE_MODE=local
set PDF_PATH=/app/backend/assets/sample.pdf

# OR S3 mode (Windows PowerShell/CMD style)
set STORAGE_MODE=s3
set S3_REGION=us-east-1
set S3_BUCKET=dermot-dev
set S3_KEY=IRS-Federal-Income-Tax-Guide-2024-Publication-17.pdf
```

### Mount AWS creds (uncomment in compose if needed):

- Windows: ${USERPROFILE}\\.aws:/root/.aws:ro
- macOS/Linux/WSL: ${HOME}/.aws:/root/.aws:ro

Stop:

```
$ docker compose -f infra/docker-compose.yml --profile dev down
```

## Production-style (single container)

Builds the image from infra/Dockerfile and serves both frontend and backend on port 3000:

```
$ docker compose -f infra/docker-compose.yml --profile prod up --build
# open http://localhost:3000
```

### Prod env vars (examples):

```
NODE_ENV=production
STORAGE_MODE=s3
S3_REGION=us-east-1
S3_BUCKET=dermot-dev
S3_KEY=IRS-Federal-Income-Tax-Guide-2024-Publication-17.pdf
```


Stop:

```
$ docker compose -f infra/docker-compose.yml --profile prod down
```

## Common tasks

### Rebuild from scratch

```
$ docker compose -f infra/docker-compose.yml --profile dev build --no-cache
```

### Clean named volumes (e.g., node_modules caches)

```
$ docker volume ls | findstr pdf-pager
$ docker volume rm <volume_name>
```

### Tail logs

```
$ docker compose -f infra/docker-compose.yml logs -f
```

### Run a one-off shell inside a service

```
$ docker compose -f infra/docker-compose.yml exec backend sh
$ docker compose -f infra/docker-compose.yml exec frontend sh
```

## Ports & URLs

- Dev
  - Frontend: http://localhost:5173
  - Backend API: http://localhost:3000
  - Frontend dev server proxies /api and /static/pdfjs → backend
- Prod (single container)
  - App (frontend + API): http://localhost:3000

## Windows + WSL tips

- Use Linux containers and WSL 2 backend.
- If running compose from Windows shell, volume paths should be Windows-style:

```
- ${USERPROFILE}\.aws:/root/.aws:ro
```

If running from WSL Ubuntu shell, use Linux-style paths:

```
- ${HOME}/.aws:/root/.aws:ro
```

Keep your source code where you run Docker for best performance (Windows → Windows paths; WSL → /home/...).

## Troubleshooting

- Port already in use
  - Something else is on 3000 or 5173. Stop that app, or change the mapped ports in compose.
- Can’t access S3 (403/AccessDenied)
  - Verify S3_REGION, S3_BUCKET, S3_KEY.
  - Ensure your IAM user/role has s3:HeadObject and s3:GetObject for that object.
  - If using KMS encryption, add kms:Decrypt to the key.
- AWS creds not picked up
  - Confirm the credentials file is mounted read-only at /root/.aws inside the container and the profile is set, or pass env keys directly.
- Slow file I/O in dev
  - Docker Desktop file sharing can be slower across environments. If you develop inside WSL, run compose from WSL and keep the repo under /home/....