# Oracle Cloud Always Free — single VM (Ubuntu 22.04/24.04, Ampere A1 / E2.1).
# Jalankan sebagai root di VM fresh. Idempoten: aman dijalankan ulang.
# TIDAK menyimpan secret di repo — .env produksi dibuat manual (lihat pints 7).
set -euo pipefail

APP_USER="wapp"
APP_DIR="/opt/monitoring-whatsapp"
REPO_URL="https://github.com/dav112/monitoringwhatsapp.git"

echo "== 1. Paket dasar =="
apt-get update -y
apt-get install -y curl git ufw postgresql-16 nginx certbot python3-certbot-nginx

echo "== 2. Node.js 22 LTS =="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node --version

echo "== 3. Firewall (Oracle Cloud: buka juga port 80/443 di Security List!) =="
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

echo "== 4. User + clone =="
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

echo "== 5. PostgreSQL production (DB TERPISAH dari dev) =="
systemctl enable --now postgresql
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='wa_prod'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE wa_prod LOGIN PASSWORD '$(openssl rand -hex 16)';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='monitoring_whatsapp_prod'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE monitoring_whatsapp_prod OWNER wa_prod;"

echo "== 6. Build aplikasi =="
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --no-audit --no-fund
sudo -u "$APP_USER" npm run build

echo "== 7. .env produksi (BUAT MANUAL — jangan copy dari dev) =="
echo "   Isi $APP_DIR/.env milik $APP_USER:0600 dengan:"
echo "   DATABASE_URL, AUTH_SECRET, WHATSAPP_CONFIG_ENCRYPTION_KEY (openssl rand -hex 32),"
echo "   DATA_RETENTION_DAYS=0, NODE_ENV=production, PORT=3000"
echo "   Kredensial WA via Settings UI setelah login (jangan taruh token di file bila tak perlu)."

echo "== 8. Migration (deploy, BUKAN dev/seed) =="
echo "   Setelah .env terisi, sebagai $APP_USER jalankan:"
echo "   cd $APP_DIR && npx prisma migrate deploy"

echo "== 9. systemd + nginx =="
cp "$APP_DIR/deploy/monitoring-whatsapp.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable monitoring-whatsapp
cp "$APP_DIR/deploy/nginx-monitoring-whatsapp.conf" /etc/nginx/sites-available/monitoring-whatsapp
ln -sf /etc/nginx/sites-available/monitoring-whatsapp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "== 10. HTTPS =="
echo "   Setelah DNS domain mengarah ke VM: certbot --nginx -d DOMAIN-LU.COM"
echo "   Lalu: systemctl start monitoring-whatsapp && curl https://DOMAIN-LU.COM/api/health"
echo "SELESAI (lanjut manual: .env, migrate deploy, buat admin, certbot, start)."
