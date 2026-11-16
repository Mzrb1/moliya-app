# ME Notes — bitta guruh, yangiliklar va ixtiyoriy reklama

## Asosiy qoida
Faqat Telegram muhokama **guruhi** ishlatiladi, kanal talab qilinmaydi.
Guruhning **shaxsiy taklif havolasi** GitHubda saqlanmaydi.
Render chat service Environment orqali \`ME_NOTES_GROUP_INVITE_URL\` o‘rnatiladi.
Guruh IDsi faqat haqiqiy Telegram admin /ulash yuborgandan so‘ng Turso bazaga yoziladi.

## Bir martalik ulash (egasi tomonidan)
1. @ME_notes_bot ni o‘zingiz ochgan muhokama guruhiga qo‘shing.
2. Botga administrator huquqini bering (xabar yuborishi kerak).
3. Guruh administratorining o‘sha **shaxsiy Telegram akkauntidan** \`/ulash\` yuboring.
4. Guruhda «✅ ME Notes guruhga ulandi» javobi ko‘rinishi kerak.
5. Botda shaxsiy xabarda \`/guruhholat\` bilan ulangan IDni tekshiring.
6. \`/guruh\` orqali obunachi faqat taklif havolasini ko‘radi; uning moliyaviy hisoblari chiqmaydi.

**Muhim:** Telegramning \`t.me/+...\` havolasidan guruhning API ID raqamini olishning imkoni yo‘q.
Guruhga qo‘shish va /ulash komandasi foydalanuvchi tomonidan bajarilishi shart.
\`ME_NOTES_ADMIN_IDS\` sozlamasi (7989269946) Render Environmentda bo‘lishi kerak.

## E’lonlarni boshqarish (faqat admin shaxsiy chatida)
- \`/admin\` → «📢 E’lonlar va statistika»: ko‘rsatma.
- \`/elon Bugun yangi imkoniyat qo‘shildi.\` — matnli e’lon qoralamasi.
- Avval yuborilgan **rasm** yoki **matn** xabariga reply qilib \`/elon\` — o‘sha kontent qoralamasi.
- Foto captionida \`/elon Matn\` ham mumkin. Rasm captioni 1024 belgigacha.
- Bot dastlab **adminning o‘ziga preview** chiqaradi.
- Admin e’lon turini «Yangilik» / «Reklama» deb belgilaydi.
- Manzilni «Faqat guruh» / «Faqat rozilik bergan obunachilar» / «Ikkalasi» deb belgilaydi.
- **«🚀 Tasdiqlab yuborish»** bosilgandagina navbatga tushadi. Bir IDni ikki marta yuborib bo‘lmaydi.
- \`/elonlar\` — muvaffaqiyatli, xato va kutilayotgan yetkazishlar statistikasi (o‘qilish statistikasi emas).
- Guruh ulanmaguncha unga yuborish bloklangan; reklama xabarlari standartda hech kimga yuborilmaydi.

## Obunachilar (shaxsiy chat)
- \`/guruh\` — guruhga qo‘shilish havolasi.
- \`/obuna\` yoki \`/xabarnoma\` — yangilik/reklama xabarlariga alohida va ixtiyoriy rozilik.
- Default: yangiliklar **off**, reklama **off**. \`/obuna\` dan istalgan payt o‘chiriladi.
- Bot faqat oldin /start orqali xabar bergan, aniq rozilik bildirgan va bloklamagan foydalanuvchiga yozishi mumkin.
- Guruh a’zosi bo‘lish — shaxsiy reklama xabarlariga rozilik emas.

## Xavfsizlik va ishonchlilik
- Guruhda faqat \`/ulash\` ko‘rib chiqiladi; xabarlar, foydalanuvchilarning moliyaviy yozuvlari yig‘ilmaydi.
- \`/ulash\` faqat sozlangan admin Telegram IDsi, guruhda haqiqiy admin va botning o‘zi ham admin bo‘lsa ishlaydi.
- Barcha e’lonlar Turso outbox jadvaliga yoziladi. Worker ~2.5 xabar/sek tezlik bilan yuboradi.
- Yuborishdan oldin \`sending\` holati belgilanadi: server o‘chib qolsa, noma’lum yetkazishlar avtomatik qayta yuborilmaydi, chunki takroriy reklama yuborish xavfli. Admin \`/elonlar\` orqali tekshiradi.
- Moliyaviy hisobotlar, tranzaksiyalar, Sahifalab darslari e’lon matniga avtomatik hech qachon qo‘shilmaydi.
- Foydalanuvchi butun akkauntini o‘chirsa, uning obuna afzalliklari va outboxdagi shaxsiy yozuvlari ham o‘chadi.
- Testlar: \`node --test me-notes-bot/tests/community.test.cjs\`. Pull requestni faqat barcha regressiyalar o‘tgach birlashtiring.

## Reklama etikasi
- Faqat ME Notesga bog‘liq foydali e’lon va reklama yuboring.
- Juda tez-tez yoki majburan shaxsiy xabar yubormang.
- Telegram botlarning bepul yuborish tezligi cheklangan; ommaviy yuborishda ehtiyot bo‘ling.
