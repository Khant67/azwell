# Azwell.mn — VPS & Domain Холболтын Заавар

**Зорилго:** azwell.mn домайныг VPS-тэй холбож, https://azwell.mn хаягаар сайтаа онлайн болгох.

**Хийгдэх алхамууд:**
1. Монголын hosting-оос VPS худалдан авах
2. VPS дээр Ubuntu сервер бэлдэх (Node.js v22, Nginx, PM2)
3. Файлуудаа upload хийх
4. itools.mn дээр DNS-ээ тохируулах
5. SSL гэрчилгээ суулгах (Let's Encrypt — Үнэгүй)
6. Шалгах: https://azwell.mn ажиллаж байна уу

**Шаардагдах хугацаа:** ~1-2 цаг (VPS суулгасны дараа DNS дэлгэрэхэд 1-4 цаг)

---

## АЛХАМ 1 — Монголын VPS hosting сонгох

### Зөвлөмж: itools.mn

**Хаяг:** https://itools.mn

**Tariff:**
- **VPS Standard 1**: ~25,000₮/сар (1 CPU, 2GB RAM, 40GB SSD) — Azwell-д хирнэ
- **VPS Standard 2**: ~45,000₮/сар (2 CPU, 4GB RAM, 80GB SSD) — Илүү тав тухтай

### Бусад сонголтууд

| Provider | Үнэ (сар) | Тэмдэглэл |
|---|---|---|
| **Datacom** | 25,000₮ | Хамгийн найдвартай, Улаанбаатарт серверүүд |
| **Mongol Hosting** | 20,000₮ | Хямд, VPS-Mini нь хирнэ |
| **Skytel Cloud** | 30,000₮ | Корпорат түвшний |
| **Univision** | 25,000₮ | Дундаж |

### Захиалга өгөхдөө сонгох зүйлс:

- **OS (Үйлдлийн систем):** Ubuntu 22.04 LTS ⚠️ (заавал!)
- **RAM:** 2GB (1GB бас болно)
- **Storage:** 40GB SSD
- **Bandwidth:** Unlimited (хязгааргүй) сонгох
- **IPv4 хаяг:** 1 ширхэг (заавал)
- **Backup:** Сонгох (нэмж 5,000₮)

### Захиалсны дараа танд илгээгдэх мэдээлэл:
```
Сервер IP: XXX.XXX.XXX.XXX  ← Энэ хаягийг бичиж аваарай!
Root password: XXXXXXXXXX
SSH port: 22 (default)
```

⚠️ **Эдгээр мэдээллийг найз нөхөдтэй бүү хуваалц!**

---

## АЛХАМ 2 — VPS-рүү холбогдох

### Windows дээр

PowerShell нээж:

```bash
ssh root@<сервер_IP>
```

Жишээ нь IP нь `103.50.205.78` бол:
```bash
ssh root@103.50.205.78
```

Анх удаа холбогдоход:
```
Are you sure you want to continue connecting? → yes
```

Дараа нь нууц үгээ оруул (datacom-оос ирсэн).

✅ Амжилттай холбогдвол: `root@vps:~#` гэж харагдана.

---

## АЛХАМ 3 — Сервер бэлдэх (Auto скрипт)

VPS дээр доорх командыг хуулж буулгаж (paste) ажиллуулах. Энэ автоматаар бүх зүйлийг суулгана:

```bash
# 1. Систем шинэчлэх
apt update && apt upgrade -y

# 2. Node.js v22 суулгах
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# 3. Хэрэгтэй tool-ууд суулгах
apt install -y nginx certbot python3-certbot-nginx ufw git unzip

# 4. PM2 суулгах (Node.js процесс менежер)
npm install -g pm2

# 5. Firewall тохируулах
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# 6. Verify (шалгах)
node --version    # v22.x.x харагдах ёстой
nginx -v          # nginx version 1.x
pm2 --version     # 5.x
```

Энэ ~3-5 минут үргэлжилнэ.

---

## АЛХАМ 4 — Azwell файлуудаа upload хийх

### A. ZIP файлаа VPS-рүү хуулах

Windows PowerShell дээр (өөрийн компьютер дээр):

```bash
# azwell folder руу очих
cd C:\Users\gunbi\azwell

# ZIP файлаа сервер рүү илгээх
scp azwell-project-*.zip root@<сервер_IP>:/var/www/
```

Нууц үгээ оруулна. ~1-2 минут хүлээнэ (41MB).

### B. Сервер дээр ZIP-ийг задлах

VPS дээр (ssh холболт):

```bash
cd /var/www
mkdir -p azwell
unzip azwell-project-*.zip -d azwell/
cd azwell
ls   # backend, site, brands харагдах ёстой
```

### C. Backend dependencies суулгах

```bash
cd /var/www/azwell/backend
npm install --omit=dev
```

### D. .env файл үүсгэх

```bash
nano /var/www/azwell/backend/.env
```

Дотор нь:
```
PORT=3000
NODE_ENV=production
ADMIN_PHONE=99700-3939
SESSION_SECRET=<санамсаргүй_30_тэмдэгт>
# SMS-ийг production-д хийхдээ Unitel-ээс token авч энд оруул
# SMS_URL=https://api.unitel.mn/sms/send
# SMS_HEADERS={"Authorization":"Bearer YOUR_TOKEN"}
```

Хадгалах: `Ctrl+O` → Enter → `Ctrl+X`

### E. PM2-оор асаах

```bash
cd /var/www/azwell/backend
pm2 start server.js --name azwell
pm2 save
pm2 startup
# Энэ нь нэг команд гаргана — түүнийг хуулж буцаагаад ажиллуул
```

Шалгах:
```bash
pm2 status
# azwell │ online │ ... харагдах ёстой

curl http://localhost:3000
# HTML гарч ирэх ёстой
```

---

## АЛХАМ 5 — Nginx тохируулах

```bash
nano /etc/nginx/sites-available/azwell
```

Дотор нь хуулж буулгах:

```nginx
server {
    listen 80;
    server_name azwell.mn www.azwell.mn;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Хадгалаад идэвхжүүлэх:

```bash
ln -s /etc/nginx/sites-available/azwell /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t        # syntax шалгах
systemctl reload nginx
```

---

## АЛХАМ 6 — itools.mn дээр DNS тохируулах ⭐ ХАМГИЙН ЧУХАЛ

1. **itools.mn-руу нэвтрэх:** https://itools.mn
2. **Миний домайн** хэсэгрүү ор
3. **azwell.mn** → "Удирдах" → "DNS тохиргоо" дарах
4. Дараах **A record**-уудыг нэмэх:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | <Сервер_IP_хаяг> | 3600 |
| A | www | <Сервер_IP_хаяг> | 3600 |

**Жишээ:**
```
A   @     103.50.205.78   3600
A   www   103.50.205.78   3600
```

5. **Хадгалах** товч дарах

⏱️ **DNS дэлгэрэх (propagate)** 1-4 цаг шаардана. Шалгах:

```bash
# Өөрийн компьютер дээр
nslookup azwell.mn
# Хариу нь таны VPS IP байх ёстой
```

Эсвэл онлайн: https://www.whatsmydns.net → azwell.mn оруулж шалгах.

✅ DNS бэлэн болсон үед `http://azwell.mn` гэж браузер дээр нээж үзвэл сайт гарч ирнэ.

---

## АЛХАМ 7 — SSL гэрчилгээ (HTTPS) — Үнэгүй

DNS бэлэн болсны **дараа л** энэ алхмыг хийнэ.

VPS дээр:

```bash
certbot --nginx -d azwell.mn -d www.azwell.mn
```

Асуултанд:
- **Email:** khantconstructionllc@gmail.com
- **Terms:** A (Agree)
- **Newsletter:** N
- **Redirect HTTP → HTTPS:** **2** (Redirect — Recommended)

Амжилттай бол:
```
Congratulations! Your certificate and chain have been saved at:
/etc/letsencrypt/live/azwell.mn/fullchain.pem
```

✅ Одоо https://azwell.mn нээгдэх ёстой!

### Автомат шинэчлэл (3 сар тутам)

Certbot өөрөө сэргээдэг боловч шалгах:
```bash
certbot renew --dry-run
```

---

## АЛХАМ 8 — Бүх зүйл ажиллаж байгаа эсэхийг шалгах

✅ **Шалгалт:**

1. https://azwell.mn → нүүр хуудас гарч ирнэ
2. https://azwell.mn/admin → admin login
   - Email: `admin@az.mn`
   - Password: `Munhsolongo@2122`
3. Бүтээгдэхүүний зураг харагдаж байна уу
4. Сагсанд нэмэх ажиллаж байна уу
5. Бүртгүүлэх / нэвтрэх ажиллаж байна уу

### Хэрэв алдаа гарвал:

```bash
# PM2 log харах
pm2 logs azwell --lines 50

# Nginx error log
tail -50 /var/log/nginx/error.log

# Server-ээ дахин start хийх
pm2 restart azwell
systemctl reload nginx
```

---

## ДАРААГИЙН АЛХАМУУД (Production-д заавал)

### 1. Auto backup (өдөр тутам)

```bash
nano /root/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
mkdir -p /root/backups
cp /var/www/azwell/backend/data/app.db /root/backups/app-$DATE.db
tar -czf /root/backups/uploads-$DATE.tar.gz /var/www/azwell/backend/uploads 2>/dev/null
find /root/backups -mtime +7 -delete  # 7 хоногоос хуучин backup-ыг устгана
```

```bash
chmod +x /root/backup.sh
crontab -e
# Доорх мөрийг нэмэх:
0 3 * * * /root/backup.sh
```

### 2. SMS Gateway (Unitel)

`.env` файлдаа:
```
SMS_URL=https://api.unitel.mn/sms/send
SMS_METHOD=POST
SMS_HEADERS={"Authorization":"Bearer YOUR_UNITEL_TOKEN"}
SMS_BODY={"phone":"{{phone}}","message":"{{message}}"}
```

Unitel-ээс корпорат SMS API сонгож token авах: 9000-1234

### 3. QPay Merchant

QPay-аас Merchant account нээх → https://qpay.mn/business
Дараа нь backend дотор `qpay-config.js` тохируулах.

---

## ХУРААНГУЙ (Cheat sheet)

| Үйлдэл | Команд |
|--------|--------|
| Сервер restart | `pm2 restart azwell` |
| Log харах | `pm2 logs azwell` |
| Nginx reload | `systemctl reload nginx` |
| Файл шинэчлэх | `scp file.html root@IP:/var/www/azwell/site/` |
| SSL шинэчлэх | `certbot renew` |
| Backup хийх | `bash /root/backup.sh` |

---

## ТУСЛАМЖ ШААРДЛАГАТАЙ БОЛ

- **Datacom support:** 7012-2929 / support@datacom.mn
- **itools.mn support:** 7777-0707
- **Unitel SMS API:** 9000-1234
- **QPay business:** 7777-2255

---

**Бичсэн:** 2026-05-21
**Холбоо барих:** 9700-3939 / khantconstructionllc@gmail.com
