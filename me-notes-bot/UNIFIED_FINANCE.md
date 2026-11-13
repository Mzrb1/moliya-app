# ME Notes — Yagona moliya (sinov)

## Maqsad
- Bitta Telegram akkaunt, bitta Turso hisoblar to‘plami.
- Chatga yuborilgan xarajatlar Mini App'da va Mini App'dagi xarajatlar chat hisobotida ko‘rinishi.
- Mobil, ixcham ekran: Asosiy / Yozuvlar / Byudjet / Darslar.
- Sahifalab 1–2-darslari, Mening kundaligim va eski localStorage ma’lumotlari buzilmaydi.

## Qanday ochiladi?
1. Telegramda @ME_notes_bot ichida \`/start\` yuboring.
2. **📱 Yagona moliya — Mini App (sinov)** tugmasini bosing.
3. Yangi sahifa \`finance-unified.html\` Telegram initData ma’lumoti bilan serverga ulanadi.
4. Oddiy tashqi brauzer havolasi foydalanuvchini tasdiqlamaydi; shaxsiy moliyaviy API javob bermaydi.

## Texnik himoya
- Backend \`X-Telegram-Init-Data\` imzosini HMAC-SHA256 bilan tekshiradi, eskirgan sessiyani rad qiladi.
- Hech qachon \`initDataUnsafe.user.id\` ni foydalanuvchi ruxsati sifatida ishlatmaydi.
- Barcha SELECT/INSERT/UPDATE/DELETE so‘rovlarida \`uid\` va workspace ownership tekshiriladi.
- \`mn_api_ops.id\` har bir amaldagi takroriy so‘rovga qarshi marker.
- \`mn_import_rows\` manba ID bo‘yicha qayta importni bloklaydi.
- 20 tagacha ro‘yxat bir bazaviy tranzaksiyada saqlanadi.
- Chatdagi mavjud \`mn_transactions\`, \`mn_budgets\`, \`mn_workspaces\` jadvallari o‘zgartirilmaydi; yangi jadvallar additiv.
- CORS faqat statik ME Notes saytiga ruxsat beradi. BOT_TOKEN va Turso auth token faqat Render'da turadi.

## Internet yo‘q bo‘lsa
- Bir marta ochilgan sahifa HTML/JS qismlari service worker keshi orqali saqlanishi mumkin.
- Yangi yozuvlar mahalliy navbatda qoladi; internet qaytganda serverga yuboriladi.
- Service worker/Telegram WebView platformasiga qarab qayta ochish imkoniyati farq qiladi.
- Offline yozuvlar Telegram chatda ko‘rinmaydi, toki sinxronlash tugamaguncha.
- To‘liq offline sinov uchun alohida telefon QA zarur; brauzer keshini tozalash hali serverga yetmagan yozuvlarni yo‘qotishi mumkin.
- Hozir xotira \`localStorage\`; tijoriy mahsulotda IndexedDB, zaxira va recovery kengaytiriladi.

## Eski Mini App ma’lumotlarini ko‘chirish
- Oldingi \`me_notes_finance_v1\` localStorage kaliti o‘z holicha qoladi.
- Oldingi JSON zaxira olinadi; foydalanuvchi istasa shu qurilmadan yoki JSON fayldan topadi.
- Ekranda qaysi hisob va nechta yozuv import qilinishi ko‘rsatiladi.
- Faqat hisob turi (shaxsiy/oilaviy/biznes) mos kelsa, ikki marta rozilik bilan import qilinadi.
- Oldingi yozuvlar o‘chirilmaydi.
- Bitta manbadan bir xil ID qayta import qilinsa, yangi dublikat yaratilmaydi.
- **Turli tizimlarga avval qo‘lda ikki marta kiritilgan bir xil xarajatlar avtomatik tanilmaydi.**
  Import qilishdan oldin Chat va eski Mini App summalarini solishtiring.
- Eski custom kategoriya yangi hisobda bo‘lmasa, \`Boshqa\` ga o‘tadi va asl nomi izohda saqlanadi.
- Eski qat’iy limitlar faqat alohida foydalanuvchi roziligi bilan import qilinadi.

## QA
- \`.github/workflows/me-notes-unified-qa.yml\` — Telegram imzosi, foydalanuvchilararo izolyatsiya,
  chat va Mini App umumiy bazasi, yangi xarajat va import dublikatlari, limitlar, eski testlar.
- Real Telegram test: \`/start\` → yangi Mini App tugmasi → ikki qatorli xarajat → \`/hisobot\`
  → yangi Mini App Yozuvlar → limit → chatga qaytish.
- Eski ma’lumot importi uchun avval test xarajatlari va JSON zaxira bilan ishlang.

## Cheklovlar
- Chat buyruqlaridagi \`/bekor\` eng so‘nggi yozuv/ro‘yxatni bekor qiladi; Mini App’dagi o‘chirish mustaqil.
- Mini App eski localStorage hisobi va chatdagi Turso hisobi o‘z-o‘zidan birlashtirilmaydi.
- Bu sinov versiyasi; shaxsiy moliyaviy ma’lumotlardan oldin backup va telefon QA tavsiya qilinadi.
