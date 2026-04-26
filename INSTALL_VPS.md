# 🚀 Tutorial Instalasi VPS - Sky Predict

Tutorial ini akan membimbing Anda langkah demi langkah untuk melakukan deploy aplikasi Sky Predict (Smart Contracts, Bot, dan Frontend) di VPS (Ubuntu/Debian).

## 📋 Persyaratan Sistem
- VPS dengan OS Ubuntu 20.04 LTS atau 22.04 LTS (Direkomendasikan).
- Akses Root atau user dengan hak akses `sudo`.
- RAM minimal 2GB (untuk proses build Next.js).

---

## 1. Persiapan Awal (Update System)
Update package repository dan upgrade sistem ke versi terbaru.
```bash
sudo apt update && sudo apt upgrade -y
```

## 2. Install Node.js & NPM (via NVM)
Gunakan NVM (Node Version Manager) agar mudah mengganti versi Node.js.
```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load NVM (Atau restart terminal)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js v20 (LTS)
nvm install 20
nvm use 20
node -v # Pastikan output v20.x.x
```

## 3. Install PM2 (Process Manager)
PM2 digunakan agar bot tetap berjalan 24/7 di background.
```bash
npm install -g pm2
```

## 4. Clone Repository
Clone project dari GitHub ke VPS.
```bash
git clone https://github.com/USERNAME/REPO_NAME.git
cd REPO_NAME
```

## 5. Instalasi Dependencies
Instalasi dilakukan di root (untuk bot/hardhat) dan di folder frontend.

### A. Root Dependencies (Bot & Scripts)
```bash
npm install
```

### B. Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

---

## 6. Konfigurasi Environment (.env)
Anda harus membuat file `.env` berdasarkan contoh yang ada.

### A. Root .env (Bot)
```bash
cp .env.example .env
nano .env
```
*Isi dengan Private Key, RPC URL, dan Contract Address.*

### B. Frontend .env
```bash
cd frontend
cp .env.example .env.local
nano .env.local
cd ..
```

---

## 7. Build Frontend (Opsional)
Jika Anda ingin menjalankan frontend di VPS juga:
```bash
cd frontend
npm run build
cd ..
```

---

## 8. Menjalankan Aplikasi dengan PM2

### Menjalankan Bot Automation
Anda bisa menggunakan file `ecosystem.config.js` yang sudah ada atau menjalankan manual.

**Opsi A: Menggunakan ecosystem.config.js**
```bash
pm2 start ecosystem.config.js
```

**Opsi B: Menjalankan script bot secara manual**
```bash
pm2 start scripts/auto-market.js --name "sky-bot"
```

**Opsi C: Menjalankan Frontend**
```bash
cd frontend
pm2 start npm --name "sky-frontend" -- start
```

### Perintah Penting PM2:
- `pm2 status` : Cek semua proses yang jalan.
- `pm2 logs` : Lihat log real-time (sangat berguna untuk debugging).
- `pm2 restart <name>` : Restart proses.
- `pm2 stop <name>` : Stop proses.
- `pm2 save` : Simpan daftar proses agar otomatis jalan saat VPS reboot.
- `pm2 startup` : Ikuti instruksi di layar agar PM2 jalan otomatis saat boot.

---

## 9. Setup Firewall (UFW)
Pastikan port yang dibutuhkan terbuka (misal port 3000 untuk frontend).
```bash
sudo ufw allow ssh
sudo ufw allow 3000
sudo ufw enable
```

---

## 🛠 Troubleshooting
- **Memory Limit saat Build:** Jika build frontend gagal karena RAM penuh, tambahkan swap space di VPS.
- **Port Conflict:** Jika port 3000 sudah dipakai, ubah port di `package.json` frontend atau gunakan Nginx sebagai Reverse Proxy.

---
**Selesai!** Bot Anda sekarang berjalan 24/7 di VPS.
