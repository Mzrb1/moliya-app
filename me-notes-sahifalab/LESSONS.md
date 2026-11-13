# ME Notes — Sahifalab darslari chegaralari

## Majburiy qoida
Har bir dars o'z PDF ish daftaridagi **asl maqsadi, bo'limlari, formulalari va savollari** bilan mustaqil ishlaydi. PDFda bo'lmagan shaxsiy rivojlanish, reklama, AI, vazifa rejalashtirish yoki boshqa xususiyatlar dars ichiga qo'shilmaydi. Tahrirlash, lokal saqlash va zaxira — faqat darsni to'ldirish uchun xizmat qiladigan texnik imkoniyatlar.

## 1-modul, 1-dars
Mavjud holat saqlanadi. Aktivlar, passivlar, sof boylik, oylik pul oqimi, shaxsiy savollar, 60 kunlik maqsad va va'da asl 1-darsdan. Oldingi `moliyaviy_kundalik_sahifalab_v1` saqlash kaliti o'zgartirilmaydi.

## 1-modul, 2-dars: «Vaqtim qancha turadi?»
PDF 1–2-sahifalar: oylik maosh, ish bilan bog'liq xarajatlar, ishga ketgan barcha soatlar; sof daromad, haqiqiy soatlik ish haqi, oddiy hisob bilan taqqoslash va farq.
PDF 3–4-sahifalar: yetti kun davomida xarid sanasi, nomi, summa, mehnat soati, «Arzidimi?» va hafta jami.
PDF 5-sahifa: o'zgartirmasdan uchta savol, bir odat bo'yicha qaror va oyiga qaytadigan taxminiy soatlar.

Formulalar:
- Sof daromad = maosh − ish xarajatlari.
- Haqiqiy soatlik ish haqi = sof daromad ÷ barcha ishga ketgan soatlar.
- Xaridning mehnat soati = xarid summasi ÷ **musbat** haqiqiy soatlik ish haqi.
- Hafta jami = kuzatuvdagi 7 kunga tegishli xaridlar yig'indisi.

2-dars yozuvlari `me_notes_sahifalab_2dars_v1` kalitida **alohida** saqlanadi. Ular 1-dars hisoblariga yoki «Mening kundaligim» xarajatlariga avtomatik qo'shilmaydi.

## Ikki yo'nalish
- **Darslar va ish daftarlari** — PDFga sodiq modullar.
- **Mening kundaligim** — darslardan tashqaridagi kundalik yozuvlar.

## Saqlash va moslik
- GitHub `main`ga tegilmaydi; bu ilova alohida `me-notes-sahifalab-diary` tarmog'ida saqlanadi.
- Ma'lumotlar brauzerning localStorage xotirasida, serverda emas.
- Yagona JSON zaxira ikkala darsni ham qamrab oladi.
- Eski 1-dars JSON zaxirasini tiklash 2-dars ma'lumotini o'chirmaydi.
- Tozalash faqat foydalanuvchi ikki marta aniq tasdiqlagandan keyin.
- Xavfsizlik kalitlari, bot tokenlari va shaxsiy ma'lumotlarni GitHubga joylamang.


## Alohida «Moliya boshqaruvi» — ExpenseBot + BudgetBot
- Bu sahifa dars moduli EMAS; 1–2-dars formullari, savollari va mashqlarini o‘zgartirmaydi.
- Sahifa `finance.html` dan ochiladi va yangi `me_notes_finance_v1` localStorage kalitida saqlanadi.
- Shaxsiy, oilaviy va biznes hisoblarining kategoriyalari, limiti, tranzaksiyalari va hisobotlari o‘zaro ajratilgan.
- Shaxsiy kundalik tranzaksiyalari bu modulga avtomatik ko‘chirilmaydi va ikki marta hisoblanmaydi.
- Moliyaviy modul zaxirasi o‘zining Sozlamalar bo‘limidan alohida eksport va import qilinadi; eski 1–2-dars zaxira formati o‘zgarmaydi.
- Sinov vaqtida yozuvlar faqat qurilmada saqlanadi; Telegram akkauntlari, boshqa telefonlar va oila a'zolari bilan sinxronlashmaydi. Bot chatida avtomatik yozish uchun alohida backend kerak.
- Ushbu modul kelajakda server-side authentication va user/workspace permissions bilan kengaytirilishi kerak, localStorage hech qachon ko‘p foydalanuvchi xavfsizligi sifatida talqin qilinmaydi.
