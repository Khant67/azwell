# Azwellness backend — local dev

Node.js + Express + SQLite (node:sqlite, built-in).

## Шаардлага
- **Node.js 22.5+** (node:sqlite модуль ашигладаг тул)

## Суулгах
```bash
cd azwell/backend
npm install
```

## Ажиллуулах
```bash
npm start
```
Сервер `http://localhost:3000/` дээр асаах ба storefront-ийг шууд харуулна.

Хэрэв өөр порт ашиглах бол:
```bash
PORT=8080 npm start
```

DB файлыг өөр газар хадгалах бол:
```bash
AZWELL_DB_DIR=/path/to/data npm start
```

## API endpoints

### Auth
| Method | URL | Body | Description |
|---|---|---|---|
| POST | `/api/auth/register` | `{email, password, name?, phone?}` | Шинээр бүртгүүлэх. Token буцаана. |
| POST | `/api/auth/login`    | `{email, password}`              | Нэвтрэх. Token буцаана.         |
| POST | `/api/auth/logout`   | (Bearer token)                   | Гарах (token-ыг устгана).       |
| GET  | `/api/auth/me`       | (Bearer token)                   | Одоогийн хэрэглэгчийн мэдээлэл. |

### Orders
| Method | URL | Auth | Description |
|---|---|---|---|
| POST | `/api/orders`     | optional | Захиалга үүсгэх. Body: `{customer:{name,phone,address,notes?}, items:[{brand,name,price,quantity}]}` |
| GET  | `/api/orders/me`  | required | Хэрэглэгчийн бүх захиалга. |
| GET  | `/api/orders/:id` | required | Нэг захиалгын дэлгэрэнгүй. |

### Health
| Method | URL | Description |
|---|---|---|
| GET | `/api/health` | `{ok:true, ts:...}` буцаана. |

## Файлын бүтэц
```
backend/
├── package.json
├── server.js           ← Express setup, routes wiring
├── db.js               ← node:sqlite + schema (auto-creates tables)
├── routes/
│   ├── auth.js         ← register / login / me / logout
│   └── orders.js       ← place / list / view orders
├── data/
│   └── app.db          ← Файл (auto-created)
└── test.js             ← End-to-end test (17 шалгуур)
```

## Схем
- `users(id, email, name, phone, password_hash, created_at)`
- `sessions(token, user_id)` — нэвтрэх token-ууд
- `orders(id, user_id?, customer_name, customer_phone, customer_address, notes?, total, status, created_at)`
- `order_items(id, order_id, brand, product_name, price, quantity)`

## Аюулгүй байдлын тэмдэглэл
- Нууц үгийг **bcrypt**-ээр хешлэнэ
- Token нь cryptographically random 48-character тэмдэгт (`crypto.randomBytes(24).toString('hex')`)
- Total дүнг server тал бодно (client-ээс ирсэн дүнд итгэхгүй)
- Foreign keys, CHECK constraints DB түвшинд идэвхтэй

## Тест ажиллуулах
```bash
node --experimental-sqlite test.js
```
Сервер автоматаар асаж, дараах 17 шалгуурыг гүйцэтгэнэ:
- health check
- register / duplicate email rejection
- login / bad password rejection
- /me / no-token rejection
- order placement (logged in + guest)
- /orders/me, validation errors

## Production-д гаргахаасаа өмнө хийх зүйлс
- HTTPS асаах (reverse proxy: nginx, Caddy)
- CORS-г зөвхөн өөрийн domain руу хязгаарлах
- Rate limiting (express-rate-limit)
- Logging (morgan, winston)
- Session token-д expiry нэмэх (одоогоор хязгааргүй)
- Password reset, email verification
- DB backup стратеги
