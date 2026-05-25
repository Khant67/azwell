// Interactive helper to set up email .env file
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, ans => r(ans.trim())));

(async () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   📧 Имэйл тохиргооны помощник         ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log('Энэ скрипт танаас 3 зүйл асуух ба .env файлыг автоматаар үүсгэнэ.\n');
  console.log('⚠️  ӨМНӨХ АЛХАМ: Эхлээд Gmail App Password үүсгэнэ үү');
  console.log('   1. https://myaccount.google.com/security');
  console.log('   2. "2-Step Verification" идэвхжүүлэх');
  console.log('   3. https://myaccount.google.com/apppasswords');
  console.log('   4. "Azwell" нэрээр шинээр үүсгэх');
  console.log('   5. 16 тэмдэгт код-г бэлэн авна\n');

  const ready = await ask('App Password бэлэн үү? (тийм/yes гэж бичнэ) > ');
  if (!/^(тийм|tiim|yes|y|т)/i.test(ready)) {
    console.log('\n📌 App Password бэлдэж байгаад дахин ажиллуулаарай: npm run setup:email\n');
    rl.close();
    return;
  }

  console.log('\n──────────────────────────────────────────\n');

  const gmail = await ask('1️⃣  Gmail хаягаа бичнэ үү (ж.нь khant@gmail.com):\n    > ');
  if (!gmail.includes('@')) {
    console.log('⚠️  Хүчинтэй имэйл биш байна. Дахин ажиллуулна уу.');
    rl.close();
    return;
  }

  const password = await ask('\n2️⃣  Gmail App Password-г оруулна уу (16 тэмдэгт, зайгүй):\n    > ');
  const cleanPass = password.replace(/\s/g, '');
  if (cleanPass.length < 12) {
    console.log('⚠️  App Password богино байна. 16 тэмдэгт бэлдэж дахин ажиллуулна уу.');
    rl.close();
    return;
  }

  const adminEmail = await ask(`\n3️⃣  Захиалга авах хаягаа бичнэ үү (Enter дарвал: ${gmail}):\n    > `);
  const finalAdmin = adminEmail || gmail;

  const fromName = await ask('\n4️⃣  Дэлгүүрийн нэр (Enter дарвал: Azwellness.mn):\n    > ');

  const content =
`# Имэйл тохиргоо — автоматаар үүсгэгдсэн
SMTP_USER=${gmail}
SMTP_PASS=${cleanPass}
ADMIN_EMAIL=${finalAdmin}
FROM_NAME=${fromName || 'Azwellness.mn'}
`;

  const envPath = path.join(__dirname, '..', '.env');
  fs.writeFileSync(envPath, content);

  console.log('\n──────────────────────────────────────────\n');
  console.log('✅ .env файл амжилттай үүслээ!');
  console.log('   ', envPath);
  console.log('\nОдоо серверээ дахин асаагаарай:');
  console.log('   1. Server-ийн цонхонд Ctrl+C дарж зогсоох');
  console.log('   2. npm start');
  console.log('\nХэрэв зөв бол: [mailer] ready — sending from', gmail);
  console.log('\nТуршилт явуулах:');
  console.log('   npm run test:email\n');

  rl.close();
})();
