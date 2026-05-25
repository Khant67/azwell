# 📧 Имэйл мэдэгдэл тохируулах заавар

Захиалга үүсэхэд автоматаар:
- 🛒 **Танд (admin) мэдэгдэл** очно — шинэ захиалгын дэлгэрэнгүй
- ✓ **Хэрэглэгчид баталгаа** — захиалга баталгаажсан гэсэн захидал (хэрэв хэрэглэгч имэйл оруулсан бол)

## 🔑 Gmail App Password үүсгэх

Gmail-ийн энгийн нууц үг ажиллахгүй — заавал App Password үүсгэх ёстой.

1. Google акаунтад нэвтэрнэ: https://myaccount.google.com/
2. **Аюулгүй байдал** (Security) → **2-Step Verification** идэвхжүүлэх (хэрэв идэвхгүй бол)
3. https://myaccount.google.com/apppasswords руу очно
4. "Аппын нэр" дотор **Azwell** гэж бичнэ → **Үүсгэх** дарна
5. Гарч ирэх **16 тэмдэгт** код-г хуулна (жишээ: `abcd efgh ijkl mnop`)
6. Хооронд нь хийсэн зайг авч `abcdefghijklmnop` хэлбэртэй болгоно

## ⚙️ Тохиргоо хадгалах

`~/azwell/backend/` хавтсанд **`.env`** файл үүсгээд дараах байдлаар бичнэ:

```env
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop
ADMIN_EMAIL=khantconstructionllc@gmail.com
FROM_NAME=Azwellness.mn
```

- `SMTP_USER` — таны Gmail хаяг (имэйл явуулдаг хаяг)
- `SMTP_PASS` — App Password (16 тэмдэгт, зай агүй)
- `ADMIN_EMAIL` — захиалгын мэдэгдэл хүлээж авах хаяг
- `FROM_NAME` — захидлын "Хэнээс" хэсэгт харагдах нэр

## 🧪 Туршилт

Серверээ дахин асаа:

```bash
cd ~/azwell/backend
npm start
```

Дараах мэдэгдэл гарвал зөв тохирсон:

```
[mailer] ready — sending from your-email@gmail.com
```

Хэрэв `emails disabled` гэвэл .env файл олдоогүй эсвэл утга буруу байна.

## 📩 Захиалга туршаад имэйл хийлгэх

1. `http://localhost:3000/` нээж бараагаа сонгон сагсанд хийнэ
2. **Захиалга хийх** дарна
3. Маягтыг бөглөнө — **имэйл талбарт өөрийн имэйл** оруулна (баталгаа авах)
4. Илгээх → **2 имэйл** ирэх ёстой:
   - Admin (`ADMIN_EMAIL`) → шинэ захиалгын мэдээлэл
   - Хэрэглэгч → захиалга баталгаажсан

## 🔧 Алдаа гарвал

- **"Invalid login"** → Gmail App Password буруу. Зай авч, 16 тэмдэгт гүйцэт байгаа эсэхээ шалга.
- **"Sender address rejected"** → SMTP_USER нь жинхэнэ Gmail хаяг байх ёстой.
- Имэйл явсан боловч **Spam хавтсанд орох** → энэ нь анхны нийтлэг асуудал. Цаг өнгөрөх тусам Gmail таны хаягийг "найдвартай" гэж бүртгэнэ.

## 🌐 Бусад имэйл үйлчилгээ (Gmail-аас өөр)

`.env` дотор `SMTP_HOST` болон `SMTP_PORT`-ийг солих:

| Үйлчилгээ | SMTP_HOST | SMTP_PORT |
|---|---|---|
| Gmail | smtp.gmail.com | 587 |
| Outlook | smtp.office365.com | 587 |
| Yahoo | smtp.mail.yahoo.com | 587 |
| Custom SMTP | таны сервер | 587 эсвэл 465 |

## ⚠️ Production-д

- `.env` файлыг **Git-д хүчлэн нэмж болохгүй** — нууц үг агуулдаг
- VPS дээр deploy хийхдээ environment variable байдлаар тохируул
- Том хэмжээгээр имэйл явуулах бол **SendGrid, Mailgun, Amazon SES** зэрэг тусгай үйлчилгээ илүү найдвартай
