# Deploying vitask

Three ways to run it, from most to least work:

1. [A celld fleet](#celld-fleet): two nodes behind a TLS proxy, state in a bucket.
2. [A single VPS](#single-vps): one celld container and Caddy. The cheapest setup.
3. [Cloudflare Workers](#cloudflare-workers): no servers to run.

All three run the same Worker. Build the web app into the Worker's assets first:

```bash
vp install
vpr build
```

## What every deployment needs

| Variable             | What                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `GROQ_API_KEY`       | Your Groq key                                                                            |
| `COOKIE_SECRET`      | Signs the anonymous workspace cookie. Random, 32+ characters (`openssl rand -base64 32`) |
| `BETTER_AUTH_SECRET` | Better Auth's secret. Random, 32+ characters                                             |
| `BETTER_AUTH_URL`    | The app's public origin, `https://vitask.example.com`                                    |

**Choose the hostname before anyone signs up.** Passkeys are bound to the relying-party id, which is the hostname
of `BETTER_AUTH_URL` (`vitask.example.com`, not `example.com`). Moving to another hostname makes every existing
passkey unusable, and the accounts with them. Passkeys need a domain name and https; an IP address does not work.

Rotating `COOKIE_SECRET` disconnects every anonymous visitor from their workspace (accounts are unaffected).
Rotating `BETTER_AUTH_SECRET` signs everyone out.

The other settings (budgets, rate limits, model) are `vars` in `apps/worker/wrangler.jsonc`; see
[architecture.md](architecture.md#configuration).

## celld fleet

### 1. Bucket

celld keeps deployments, every Durable Object's SQLite and D1 in one bucket. The store needs conditional writes,
exact ranged reads and read-after-write consistency. Per the celld 0.6.3 docs, Amazon S3, **Cloudflare R2**, Google
Cloud Storage, Tigris and Azure Blob Storage qualify; Backblaze B2, Hetzner and DigitalOcean Spaces do not; MinIO
community edition passes the storage test but is not qualified for production.

Cloudflare R2 is the recommended choice: no egress fees, and the free tier covers a small deployment. Create a
bucket and an S3 API token scoped to it, then:

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=auto
export S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
export CELLD_BUCKET=s3://vitask-fleet
```

The bucket credentials control the whole fleet, including the app's secrets (see below). Give the token access to
this bucket only.

### 2. Deploy the Worker

celld 0.6.3 has no secrets mechanism, and `celld deploy` reads only `vars` from the config. The deploy script
renders a temporary config with the four values from your environment in `vars`, runs `celld deploy`, and deletes the
file. The secrets end up stored with the deployment in the bucket. It refuses the dev-only secrets, secrets shorter
than 32 characters, and a non-https `BETTER_AUTH_URL`.

```bash
export GROQ_API_KEY=... COOKIE_SECRET=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://vitask.example.com
vpr --filter @vitask/worker deploy:celld --bucket "$CELLD_BUCKET"
```

Notes:

- Arguments after the task name go to `celld deploy` as they are; do not put `--` before them (`celld deploy`
  rejects it).
- Add `--dry-run` to bundle and print the version without writing anything.
- `celld deploy` needs `esbuild`; the script points `CELLD_ESBUILD` at the copy in `apps/worker/node_modules`.
- Running nodes poll for new deployments every 30 s and switch in place; nothing restarts.

### 3. Start two nodes

Each node is one `celld` process. They find each other through the bucket; there is no join step. Put them on a
private network (or WireGuard/Tailscale): peer traffic is plaintext and the internal listener has an
unauthenticated operator API.

```bash
# node A (private IP 10.0.0.11); node B is the same with its own addresses
export CELLD_TRUST_FORWARDED_HEADERS=1     # see below
export CELLD_IDLE_EVICT_S=300
export CELLD_LTX_RETENTION_SECS=86400
celld \
  --bucket "$CELLD_BUCKET" --endpoint "$S3_ENDPOINT" --region "$AWS_REGION" \
  --listen 10.0.0.11:8080 \
  --internal-listen 10.0.0.11:8081 \
  --advertise 10.0.0.11:8081
```

Run it under systemd with `TimeoutStopSec=60` (above celld's 40 s graceful handoff) and `Restart=always`.

**`CELLD_TRUST_FORWARDED_HEADERS=1` is required behind a TLS proxy.** celld builds `request.url` from the `Host`
header with an `http` scheme unless it trusts `X-Forwarded-Proto`. The Worker refuses a state-changing request whose
`Origin` differs from the request's own origin, so `https://vitask.example.com` against `http://vitask.example.com`
is refused with 403 `forbidden_origin`. The mismatch was reproduced on `celld dev` (same request: 403 with an https
`Origin`, 201 with http); the trusted-header fix itself has not been tried on a fleet yet. Set it only when the
proxy replaces both `X-Forwarded-Proto` and `X-Forwarded-Host`, as Caddy does. If you cannot, add the public origin to
`ALLOWED_ORIGINS` in `wrangler.jsonc` and deploy again.

Recommended celld settings for this app:

- `CELLD_IDLE_EVICT_S=300`. Without it, an idle workspace stays in memory until memory pressure, and a two-node
  fleet balances only the cells that hibernate on their own. Evicting after 5 idle minutes is safe here: open
  WebSockets are hibernatable and stay connected, and timers and approval expiries wake the object through its
  alarm. Do not go much lower: while the coach works, the object keeps its event open for up to 30 s and re-arms a
  60 s heartbeat.
- `CELLD_LTX_RETENTION_SECS=86400`. Without it, celld never deletes old epoch prefixes, so each activation adds
  bytes to the bucket for good. Idle eviction means many activations, so turn on epoch GC. It needs
  list-after-write consistency from the bucket; check celld's guarantees doc for your provider. The celld upgrade
  notes say a rollback to v0.6.0 needs it unset on every node first.

### 4. TLS proxy (Caddy)

celld does not terminate TLS. Caddy does, with automatic certificates:

```caddyfile
vitask.example.com {
	encode zstd gzip
	reverse_proxy 10.0.0.11:8080 10.0.0.12:8080 {
		lb_policy least_conn
		health_uri /.well-known/celld/health
		health_interval 5s
		# celld sets no client-IP header; Better Auth's rate limit reads X-Real-IP.
		header_up X-Real-IP {remote_host}
	}
}
```

Caddy passes `Host` through unchanged and sets `X-Forwarded-Proto` and `X-Forwarded-Host` itself, ignoring client
values unless `trusted_proxies` is configured. `header_up` replaces any `X-Real-IP` the client sent, so it cannot be
spoofed. WebSockets need no extra config. Any node can serve any workspace, so no sticky sessions are needed.

### 5. D1 migrations

Accounts live in the D1 database `vitask-auth`, which celld stores in the same bucket. `celld d1` reaches it through
a running node, so apply the migrations after step 3, and again whenever `apps/worker/migrations/` changes:

```bash
vpr --filter @vitask/worker db:migrate:celld
```

It reads `CELLD_BUCKET`, `S3_ENDPOINT` and the AWS variables from the environment.
Until the migrations run, sign-up and sign-in fail; anonymous use works.

### 6. Check it

```bash
curl https://vitask.example.com/api/health          # {"ok":true,"protocol":1}
```

Then open the site, add a task, sign up with a passkey, and start a session.

## Single VPS

One machine with Docker runs one celld node and Caddy; the bucket is still R2 (or any qualified store). One node
has no peers to replicate to, so every write waits for the bucket (`CELLD_DURABILITY` then behaves like `bucket`).

Deploy from your laptop as in [step 2](#2-deploy-the-worker), then on the VPS:

```bash
docker run -d --name celld --restart unless-stopped --stop-timeout 60 \
  -p 127.0.0.1:8080:8080 \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_REGION=auto -e S3_ENDPOINT -e CELLD_BUCKET \
  -e CELLD_TRUST_FORWARDED_HEADERS=1 \
  -e CELLD_IDLE_EVICT_S=300 \
  -e CELLD_LTX_RETENTION_SECS=86400 \
  -e CELLD_WATCH=/var/lib/celld \
  -v celld-data:/var/lib/celld \
  ghcr.io/denoland/celld:v0.6.3 \
  --listen 0.0.0.0:8080 --internal-listen 127.0.0.1:8081
```

The image's entrypoint is `celld`. A non-loopback `--listen` requires an explicit `--internal-listen`; keeping the
internal listener on the container's loopback hides the operator API. The volume is only a local cache: the bucket
holds the state, so losing it loses nothing. Run the D1 migrations ([step 5](#5-d1-migrations)) from any machine with
the bucket credentials and celld installed.

Caddy on the host:

```caddyfile
vitask.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080 {
		header_up X-Real-IP {remote_host}
	}
}
```

To scale out later, start a second node against the same bucket as in [step 3](#3-start-two-nodes) and add it to
Caddy's upstreams.

## Cloudflare Workers

The same Worker runs on Cloudflare with no code changes. Durable Objects with SQLite storage are available on the
free plan.

```bash
cd apps/worker
npx wrangler login
npx wrangler d1 create vitask-auth
```

Put the `database_id` it prints into `d1_databases` in `wrangler.jsonc` (celld uses the name there; Cloudflare needs
the id). Then apply the migrations:

```bash
vpr --filter @vitask/worker db:migrate:cloudflare
```

`wrangler.jsonc` carries development values for `BETTER_AUTH_URL`, `COOKIE_SECRET` and `BETTER_AUTH_SECRET` in
`vars`, and a plain `wrangler deploy` would ship them. Override all of them:

```bash
cat > .secrets.env <<'EOF'
GROQ_API_KEY=...
COOKIE_SECRET=...
BETTER_AUTH_SECRET=...
EOF
npx wrangler deploy --var BETTER_AUTH_URL:https://vitask.example.com --secrets-file .secrets.env
rm .secrets.env
```

`wrangler deploy --dry-run` with `--var` shows the overridden binding; the upload itself was not tried against a
Cloudflare account. If Cloudflare refuses a secret because a var of the same name exists, remove `COOKIE_SECRET` and
`BETTER_AUTH_SECRET` from `vars` and keep the dev values in `apps/worker/.dev.vars` instead.

On Cloudflare the celld workarounds are harmless: `request.url` is already https, `cf-connecting-ip` gives Better
Auth the client IP, and durable timers fire on time after a restart. The bundle is about 5 MB raw and 0.9 MB gzipped,
within the free plan's 3 MB compressed limit.
