# Domain and DNS Setup

Domain: `vertex-workflow.com`

Production VPS:

- IPv4: `137.184.100.54`
- Web app: `http://127.0.0.1:5173`
- API server: `http://127.0.0.1:4000`

## DNS Records

Configure these records at the domain DNS provider:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `137.184.100.54` | `600` or provider default |
| CNAME | `www` | `vertex-workflow.com` | `600` or provider default |

Optional API subdomain:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `api` | `137.184.100.54` | `600` or provider default |

Optional CAA record:

| Type | Host | Value |
| --- | --- | --- |
| CAA | `@` | `0 issue "letsencrypt.org"` |

Remove any domain parking A records such as `76.223.105.230` and `13.248.243.5`.

## Nginx

The VPS uses host Nginx as the public reverse proxy:

- `vertex-workflow.com` and `www.vertex-workflow.com` proxy to admin web.
- `vertex-workflow.com/api/*` proxies to API server.
- `vertex-workflow.com/uploads/*` proxies generated media files.
- `api.vertex-workflow.com` can also proxy to API server if the optional DNS record exists.

The deploy config is stored at:

`infra/deploy/nginx/vertex-workflow.conf`

## SSL

After DNS points to `137.184.100.54`, issue Let's Encrypt certificates:

```bash
certbot --nginx \
  -d vertex-workflow.com \
  -d www.vertex-workflow.com \
  --redirect \
  --email YOUR_EMAIL@example.com \
  --agree-tos \
  --no-eff-email
```

If `api.vertex-workflow.com` is configured later, expand the certificate:

```bash
certbot --nginx \
  -d vertex-workflow.com \
  -d www.vertex-workflow.com \
  -d api.vertex-workflow.com \
  --redirect \
  --email YOUR_EMAIL@example.com \
  --agree-tos \
  --no-eff-email
```

Verify renewal:

```bash
certbot renew --dry-run
```
