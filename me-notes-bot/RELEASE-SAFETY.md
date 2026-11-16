# ME Notes — reklamagacha xavfsizlik nazorati (16-noyabr 2026)

## 1. Doimiy bepul foydalanuvchi

- Telegram ID serverda aniqlanadi, Mini App’da signed initData tekshiriladi.
- Toshkent vaqti bilan 2026-11-30 23:59:59 gacha birinchi kirish — **doimiy bepul**.
- Oldindan mavjud `mn_users` IDlari `mn_early_access.reason=legacy` bilan alohida saqlanadi.
- Birinchi kirgan vaqt, `free_forever`, sabab va Telegram ID saqlanadi. Telefon/email/pasport talab qilinmaydi.
- Bu birinchi kirishga asoslangan kafolat; keyingi faoliyat uchun qo‘shimcha minimal kun yoki xarajat talabi yo‘q.
- Foydalanuvchi barcha ma’lumotini **butunlay o‘chirishni** tanlasa, uning doimiy bepul huquqi ham o‘chadi.
- Hozircha to‘lov tizimi mavjud emas: `free_forever=false` foydalanuvchidan avtomatik haq yechmaydi.

## 2. Avtomatik zaxira va tiklash

- `ME_NOTES_BACKUP_KEY_B64`: 32 ta tasodifiy baytdan canonical base64. **Faqat Render server env**, GitHub yoki chatda YO‘Q.
- Server ishga tushganidan 3 soniya keyin va har 6 soatda snapshot sweep: har user uchun UTC kuniga 1 nusxa.
- AES-256-GCM, tasodifiy nonce + autentifikatsion tag, SHA-256 tekshiruvi, 30 kun retention.
- Zaxiralarda moliya jadvallari, hisoblar, byudjetlar, tiklash yordamchi jadvallari va idempotence markerlari bor. Fayl `GET /api/v1/backup-export?day=` bilan egasi tomonidan JSON shaklida olinadi.
- Faqat **yetishmagan yozuvlar/byudjet/kategoriya** `POST /api/v1/backup-restore` orqali yozuvlarni ustidan yozmasdan tiklanadi; maxsus tasdiq, fresh Telegram auth va atomik tranzaksiya talab qilinadi.
- Tizim 2 MiB dan ortiq foydalanuvchi nusxasini saqlamaydi, xato loglanadi.
- **Muhim:** Bu zaxira ham asosiy Turso bazasi ichida joylashgan. Foydalanuvchi xatolari uchun qo‘shimcha tiklash nuqtasi, ammo Turso bazasi butunlay yo‘qolsa, u bilan birga yo‘qoladi. Mustaqil tashqi storage yoqilmagan. Reklamada "ikki mustaqil zaxira" deb aytmang.
- Turso platformasining PITR/retention imkoniyatlari hisob tarifiga bog‘liq bo‘lishi mumkin; hozir konkret akkauntda tasdiqlanmagan.
- `ME_NOTES_BACKUP_KEY_B64` yo‘qolsa backup o‘qilmaydi. Uni GitHub'dan tashqari xavfsiz oflayn parol menejerida ham saqlash kerak.
- Avtomatik snapshot keyingi kun yasaladi. Foydalanuvchi oldingi kechadagi yozuvlarni yuklab olishi mumkin, eng yangi yozuvlar hali kirmagan bo‘lishi mumkin.

## 3. Profilni butunlay o‘chirish

- Mini App → ⚙️ Sozlamalar → "Barcha moliyaviy ma’lumotlarimni o‘chirish".
- Online, bo‘sh sinxronlash navbati, tasdiq `HAMMASINI OCHIR`, ikkita tasdiq oynasi.
- API haqiqiy Telegram imzosi va 10 minutdan yangi `auth_date` talab qiladi.
- Server exact Telegram UID va faol+yopilgan hisoblar sonini tekshiradi.
- **Bir atomik tranzaksiyada** Turso’dagi moliyaviy yozuvlar, barcha hisoblar va arxivlar, tiklash nusxalari, chegirma huquqi, kategoriyalar, barcha mn_* metadata o‘chiriladi.
- Xuddi shu foydalanuvchining avvalgi chat xabarlari **Telegram ichida qolishi mumkin**; avtomatik ravishda Telegram chat tarixidan o‘chirilmaydi.
- Turso provayderining favqulodda restore pointlarida eski nusxa ularning retention siyosatiga qadar qolishi mumkin; bu o‘sha servis darajasidagi boshqaruv.
- Mini App lokal cache/queue darhol o‘chadi, avtomatik sinxronlash to‘xtaydi.
- Foydalanuvchi keyin yangi `/start` yuborsa **yangi hisob** ochiladi.

## Chiqish mezonlari

- [ ] Hamma 3 GitHub QA workflow green.
- [ ] Render static site va chat server eng so‘nggi commit bilan Live.
- [ ] Backup shifrlash kaliti Render env’da, logda `created>0, failed=0`.
- [ ] 2 ta boshqa Telegram foydalanuvchisi bilan o‘zaro ma’lumot ko‘rinmasligi tekshirilgan.
- [ ] "Restore" faqat test (in-memory) jadvalida bajarilgan, real foydalanuvchilarni sinov uchun hech qachon o‘chirmang.
- [ ] Katta hajm, yuklama, tarmoq uzilishi va Turso offsite/PITR alohida tekshirilsin.
