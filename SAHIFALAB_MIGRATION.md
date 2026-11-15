# Sahifalab: ME Notes’dan xavfsiz ajratish (2026-11-15)

## Holat

ME Notes ommaviy kirish sahifasi va bot menyusi endi **faqat moliyaviy boshqaruv** uchun.

Sahifalabning oldingi ishlaydigan sahifasi vaqtincha saqlanadi:
https://me-notes-sahifalab.onrender.com/sahifalab-archive.html

Bu havola ME Notes bot menyusida ham, ME Notes moliya Mini App’ida ham ko‘rsatilmaydi.
Kelajakda Sahifalab uchun **boshqa bot va hosting** tanlangach, eski yozuvlarni ehtiyotkorlik bilan ko‘chirish mumkin.

## Nimalar o‘chirilmagan

- `sahifalab-archive.html`: avvalgi `index.html` faylining to‘liq nusxasi;
- `lesson2.js` va `diary-month-archive.js`: 1- va 2-dars hisoblari, arxiv funksiyalari;
- `LESSONS.md`: PDF darslari chegaralari va asl vazifalari;
- GitHub tarmog‘i: `archive/sahifalab-before-separation-20261115`;
- foydalanuvchi yozuvlariga **hech qanday avtomatik delete, reset, import yoki rename** bajarilmagan.

## Ko‘chirishdan oldingi zarur qadamlar

1. O‘sha telefonning Telegram brauzerida yuqoridagi `sahifalab-archive.html` sahifasini oching. Agar localStorage oldingi sahifaga bir xil origin ostida bog‘langan bo‘lsa, eski kundalik qayta chiqishi mumkin.
2. **Zaxira → Zaxira olish (.json)** bilan to‘liq JSON nusxani saqlang.
3. Qurilma brauzer xotirasi va Telegram webview keshini tozalamang.
4. Yangi hostingda qayta tiklash funksiyasini alohida tekshirib, 1- va 2-dars mashqlari hamda kundalik yozuvlari yo‘qolmaganini tasdiqlang.

Eski browser localStorage kalitlari:
- `moliyaviy_kundalik_sahifalab_v1` — asosiy kundalik;
- `me_notes_sahifalab_2dars_v1` — 2-dars.

**Ogohlantirish:** brauzer `localStorage` ma’lumotlari domen (origin) bo‘yicha ajratilgan. Ular yangi domenga avtomatik ko‘chmaydi. GitHub’dagi kodni arxivlash foydalanuvchining brauzerda saqlangan yozuvlarini serverga ko‘chirmaydi.

## ME Notes moliya qismi

- Bot: `@ME_notes_bot`
- Mini App: `/finance-unified.html`
- Ma’lumot: Telegram initData bilan himoyalangan Turso, chat bilan umumiy.
- Faqat moliya uchun eski `finance.html` sahifasi JSON eksport/import maqsadida saqlangan.
- Amaldagi ma’lumotlar bazasi, login, sync, oylar, byudjet va arxiv o‘zgartirilmagan.

Bu hujjat kelajakdagi Sahifalab migratsiyasi uchun texnik eslatma; ME Notes foydalanuvchi interfeysida ko‘rsatilmaydi.
