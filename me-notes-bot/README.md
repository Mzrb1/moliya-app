# ME Notes Telegram chat — bir xabarda xarajat

ME Notes Telegram chatida quyidagi xabarlarni qabul qiladigan sinov backend:
- 25 ming taksi
- tushlik 35000
- +3 mln oylik

## Ishga tushirish (Render)
Yangi Node web service yarating. Mavjud ME Notes static site o‘zgarmaydi.
- Repo: Mzrb1/moliya-app
- Branch: me-notes-sahifalab-diary
- Build: npm --prefix me-notes-bot install --omit=dev
- Start: node me-notes-bot/server.cjs
- Variables: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN, PUBLIC_BASE_URL.
- PUBLIC_BASE_URL: xizmatning HTTPS Render domeni.
- TELEGRAM_WEBHOOK_SECRET: uzun tasodifiy harf/raqam/underscore/dash kod.
- Bot tokeni va Turso tokenini GitHub yoki chatga joylamang.

Server /health orqali tekshiriladi. Server ishga tushgach,
me-notes-bot ichida npm run webhook ni bir marta bajarish kerak.
ESLATMA: mavjud Telegram Serverless yoki boshqa webhook yangi webhook
o‘rnatilganda almashtiriladi. Ulashdan oldin tekshiring.

## Buyruqlar
- /start: shaxsiy hisob yaratish va yordam
- /hisob: shaxsiy/oilaviy/biznes hisobni tanlash yoki qo‘shish
- 25 ming taksi, tushlik 35000: xarajat yozish
- +3 mln oylik: daromad yozish
- /limit Transport 100000: joriy oylik limit
- /hisobot: tanlangan hisob natijasi
- /bekor: tanlangan hisobdagi oxirgi yozuvni o‘chirish

## Ma'lumotlar chegarasi
Telegram chatdagi yozuvlar Turso bazasida saqlanadi.
Mini App ma'lumotlari hozircha brauzerning localStorage xotirasida.
Shuning uchun chat va Mini App yozuvlari avtomatik sinxronlanmaydi.
Sahifalab 1–2-darslari va kundalik ma'lumotlari o‘zgarmaydi.

## Sinovdan keyingi xavfsizlik vazifalari
- Mini App bilan Telegram orqali autentifikatsiyali sinxronlash.
- Xabar yuborish xatosida idempotent qayta jo‘natish.
- Hisoblangan ogohlantirishlarni parallel so‘rovlarda sinash.
- Backup/restore, audit, foydalanish shartlari.
- O‘zbekistondagi shaxsiy ma’lumotlar bo‘yicha talablarga moslikni tekshirish.
