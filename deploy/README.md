# Deploy Jaseo Job Tracker ke VPS Hostinger

Konfigurasi ini memakai satu VPS untuk Nginx, frontend static, API Express,
dan PostgreSQL. GitHub menjadi sumber kode; branch `production` memicu
workflow `.github/workflows/deploy-vps.yml`.

## 1. Persiapan VPS

Pastikan Ubuntu yang dipakai mendukung Node.js 24. Verifikasi:

```bash
cat /etc/os-release
node --version
```

Install paket dasar:

```bash
sudo apt update
sudo apt install -y git nginx postgresql postgresql-contrib curl
```

Install Node.js 24 dan pnpm sesuai metode resmi yang Anda pilih. Setelah itu
pastikan perintah berikut tersedia:

```bash
node --version
pnpm --version
pm2 --version
```

Install PM2 bila belum tersedia:

```bash
sudo npm install --global pm2
```

## 2. PostgreSQL

Buat database dan user khusus aplikasi. Jangan memakai user `postgres` untuk
koneksi aplikasi sehari-hari. Isi `DATABASE_URL` di file `.env` root dengan
format:

```text
postgresql://USER:PASSWORD@127.0.0.1:5432/jaseo
```

Untuk database baru yang belum memiliki data:

```bash
pnpm --filter @workspace/db run push
```

Untuk migrasi data lama, buat backup dari database sumber terlebih dahulu,
restore ke database VPS, lalu verifikasi jumlah tabel dan record sebelum
aplikasi diarahkan ke VPS. Jangan menjalankan `push-force` pada database
produksi tanpa backup dan pemeriksaan diff.

## 3. Clone dan build manual pertama

```bash
sudo mkdir -p /var/www
sudo chown -R "$USER":"$USER" /var/www
git clone <URL_REPOSITORY_GITHUB> /var/www/jaseo-job-tracker
cd /var/www/jaseo-job-tracker
git checkout production
cp .env.production.example .env
chmod 600 .env
```

Edit `.env` dan isi `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, serta
pengaturan lain yang memang sudah dipindahkan. Lalu:

```bash
pnpm install --frozen-lockfile
NODE_ENV=production PORT=8080 BASE_PATH=/ pnpm --filter @workspace/jaseo-job-tracker run build
pnpm --filter @workspace/api-server run build
set -a
. ./.env
set +a
pm2 start deploy/ecosystem.config.cjs --env production --update-env
pm2 save
pm2 startup
```

Jalankan perintah `pm2 startup` yang dicetak oleh PM2 dengan `sudo`, lalu cek:

```bash
curl http://127.0.0.1:8080/api/healthz
pm2 status
```

## 4. Nginx dan HTTPS

```bash
sudo cp deploy/nginx/jaseo.conf.example /etc/nginx/sites-available/jaseo
sudo nano /etc/nginx/sites-available/jaseo
sudo ln -s /etc/nginx/sites-available/jaseo /etc/nginx/sites-enabled/jaseo
sudo nginx -t
sudo systemctl reload nginx
```

Ganti `app.example.com` dengan domain yang DNS-nya sudah diarahkan ke IP VPS.
Setelah HTTP berhasil, pasang sertifikat dengan Certbot, lalu ubah
`APP_ORIGIN` menjadi URL HTTPS dan biarkan `SESSION_COOKIE_SECURE=true`.

## 5. GitHub Actions

Tambahkan repository secrets berikut di GitHub:

- `VPS_HOST`: IP atau hostname VPS
- `VPS_USER`: user deploy non-root
- `VPS_SSH_KEY`: private key SSH untuk user deploy

Public key pasang di `~/.ssh/authorized_keys` pada VPS. Jangan commit private
key atau file `.env`. Setelah workflow aktif, push ke branch `production` akan:

1. pull commit terbaru di VPS,
2. install dependency,
3. build frontend dan API,
4. restart API lewat PM2,
5. cek endpoint `/api/healthz`.

## Komponen yang belum portabel dari Replit

Sebelum go-live, dua integrasi ini harus dipindahkan:

1. `artifacts/api-server/src/lib/objectStorage.ts` masih memakai Replit
   sidecar untuk signed URL dan object storage. Pindahkan ke S3-compatible
   storage atau provider object storage lain, lalu migrasikan file lama.
2. `artifacts/api-server/src/routes/backup.ts` memakai
   `@replit/connectors-sdk` untuk Google Sheets. Di VPS, gunakan Google
   service account/API langsung atau biarkan
   `ENABLE_GOOGLE_SHEETS_BACKUP=false` sampai pengganti siap.

Jangan menganggap aplikasi sudah sepenuhnya production-ready sebelum kedua
komponen tersebut diuji di VPS.