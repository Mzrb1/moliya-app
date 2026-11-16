# ME Notes — yopiq administrator bo‘limi

## Administrator
- `ME_NOTES_ADMIN_IDS=7989269946` faqat Render chat service **Environment** bo‘limida saqlanadi; bu IDlar ro‘yxati Telegram so‘rovidagi `from.id` bilan tekshiriladi.
- Bot faqat **shaxsiy chat**da ishlaydi; `message.chat.id === message.from.id` va callback uchun ham shunday shart tekshiriladi.
- `/start` da administratorga qo‘shimcha **🛡 Admin boshqaruvi** tugmasi chiqadi; oddiy foydalanuvchi uni ko‘rmaydi.

## Buyruqlar
- `/admin` — umumiy foydalanuvchilar soni, avtomatik bepul huquqlar, qo‘lda bepul huquqlar va tugmalar.
- `/users` — 10 tadan ro‘yxatdan o‘tgan Telegram ID va ism, bepul huquq holati.
- `/grants` — qo‘lda berilgan barcha huquqlar, sana va kim bergan.
- `/find 123456789` — foydalanuvchi Telegram ID, ismi, botga qo‘shilganligi va huquqi.
- `/grant 123456789` — dastlab ID, Telegram ismi va hozirgi huquqi chiqadi; **tasdiqlash tugmasi bosilmaguncha grant berilmaydi**.
- Hali `/start` yubormagan ID uchun grantni oldindan saqlash mumkin. Ismi faqat Telegram haqiqiy ismni qaytarganida ko‘rinadi, aks holda **Ism hali olinmagan**.

## Xavfsizlik
- Moliyaviy xarajatlar, daromadlar, byudjetlar admin ro‘yxatida yo‘q.
- Ism Telegram `first_name` + `last_name` yoki imzo bilan tasdiqlangan Mini App `initData` dan olinadi; foydalanuvchi mustaqil kiritmaydi.
- Profil `mn_user_profiles` jadvalida; admin granti `mn_manual_grants` jadvalida. Grant yozuvi kim va qachon berganini saqlaydi.
- `mn_early_access` avtomatik 30-noyabr bepul huquqlariga **tegmaydi**. Qo‘lda berilganlar bilan birgalikda `early.status().free_forever` ishlaydi.
- Grant idempotent: bitta IDga qayta tasdiqlash yangi yozuv yaratmaydi.
- Foydalanuvchi barcha hisobini butunlay o‘chirganda uning ismi va qo‘lda berilgan grant huquqi ham o‘chadi.
- Admin IDni oddiy foydalanuvchining username, chat nomi yoki Mini App tanlagan IDsi bilan tekshirmang; faqat Telegram tomonidan imzolangan ID yoki Telegram webhook so‘rovidagi `from.id` ishlatiladi.

## Chiqish sinovlari
1. Admin Telegram akkauntidan `/start` → 🛡 Admin boshqaruvi.
2. Admin bo‘lmagan akkauntdan `/admin` → admin ko‘rinishi chiqmasligi kerak.
3. `/find ID` → ID va real ism (agar olinishi mumkin bo‘lsa).
4. `/grant ID` → avval preview, keyin tasdiqlanganda bir martalik grant.
5. `/grants` → ID, ism va grant sanasi.
6. Grant berilgan akkauntning Mini App Sozlamalar → Foydalanish huquqim → doimiy bepul.
7. Hech qaysi qadamda real mijozlarning moliyaviy summalari admin panelga chiqmasligi kerak.

Admin IDsi siz tomonidan berilgan qiymat. Token, Turso maxfiy kaliti yoki boshqa foydalanuvchining haqiqiy yozuvlarini GitHubga yuklamang.
