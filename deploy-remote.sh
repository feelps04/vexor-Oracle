#!/bin/bash
# VEXOR Remote Deployment Script
# Run this on the OCI instance

set -e

echo "============================================================"
echo "  VEXOR - Remote Deployment"
echo "============================================================"

# Install dependencies
echo "[1/6] Installing dependencies..."
sudo dnf update -y
sudo dnf install -y nodejs npm git curl python3 python3-pip
sudo npm install -g pm2

# Install OCI CLI for AI integration
pip3 install oci-cli --user

# Create app directory
echo "[2/6] Setting up directories..."
sudo mkdir -p /opt/vexor
sudo chown opc:opc /opt/vexor

# Copy project files (if uploaded)
if [ -d "/home/opc/projeto-sentinel" ]; then
    cp -r /home/opc/projeto-sentinel/* /opt/vexor/
fi

cd /opt/vexor

# Create .env file
echo "[3/6] Creating environment file..."
cat > /opt/vexor/.env << 'ENVEOF'
TWELVE_DATA_API_KEY=f908c32743af495fbd29ac1d946446de

# Supabase Configuration
SUPABASE_URL=https://tonwuegoyftfgfpkbvop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnd1ZWdveWZ0ZmdmcGtidm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0ODA4ODEsImV4cCI6MjA4ODA1Njg4MX0.tsholJQFV_pKFajDsGHLUYnOD959TJSvXxYvNxs7pc8
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnd1ZWdveWZ0ZmdmcGtidm9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ4MDg4MSwiZXhwIjoyMDg4MDU2ODgxfQ.9APp09YzrQoQNEVnhnfvNHgfM1dovMxP_ajEol0GzbA

# Database URL (Supabase PostgreSQL)
DATABASE_URL=postgresql://postgres:G0Qg5TKjabVxnicn@db.tonwuegoyftfgfpkbvop.supabase.co:5432/postgres

# Market Data
MARKET_DATA_URL=http://localhost:8765

# Oracle Cloud Infrastructure (OCI)
OCI_USER_OCID=ocid1.user.oc1..aaaaaaaa565gvdyd655b6iatwhzgd5c7jwkjpqiq557nvtht6zlpoat73eta
OCI_TENANCY_OCID=ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a
OCI_FINGERPRINT=fc:e9:cd:fa:94:bb:33:ef:d8:d8:8e:81:80:83:5a:a6
OCI_REGION=sa-saopaulo-1
OCI_KEY_FILE=/home/opc/.oci/private_key.pem

# OCI Generative AI Keys
OCI_GENAI_PRIMARY_KEY=sk-k0e35cOHls3M8Wa10pFdmtRqSmvGN6ntZFrl9O56Y4EeyBko
OCI_GENAI_BACKUP_KEY=sk-DKi0XyVcN2UR2yVzyVco2l4wyplL37rwOh4XZr4E9iMNFeZn

# Production
NODE_ENV=production
PORT=3000
ENVEOF

# Install npm dependencies
echo "[4/6] Installing npm packages..."
cd /opt/vexor
npm install --workspaces --include-workspace-root

# Build API
echo "[5/6] Building API..."
cd /opt/vexor/packages/api
npm run build

# Build Web
echo "[6/6] Building Web..."
cd /opt/vexor/packages/web
npm run build

# Configure firewall
echo "Configuring firewall..."
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=5174/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload

# Setup PM2 for process management
echo "Setting up PM2..."
cd /opt/vexor
cat > ecosystem.config.js << 'PM2EOF'
module.exports = {
  apps: [
    {
      name: 'vexor-api',
      cwd: '/opt/vexor/packages/api',
      script: 'dist/app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
PM2EOF

# Start API with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Setup nginx reverse proxy
echo "Setting up Nginx..."
sudo dnf install -y nginx
sudo systemctl enable nginx

cat << 'NGINXEOF' | sudo tee /etc/nginx/conf.d/vexor.conf
server {
    listen 80;
    server_name _;

    # Web (Vite preview)
    location / {
        root /opt/vexor/packages/web/dist;
        try_files $uri $uri/ /index.html;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Python API
    location /python-api/ {
        proxy_pass http://127.0.0.1:8765/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
NGINXEOF

sudo systemctl restart nginx

echo ""
echo "============================================================"
echo "  VEXOR Deployed Successfully!"
echo "============================================================"
echo "  Public URL: http://168.138.140.213"
echo "  API: http://168.138.140.213/api"
echo "  Social: http://168.138.140.213/social"
echo "============================================================"
