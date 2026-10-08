# การดูแลเว็บ

เว็บเป็น HTML/CSS/JavaScript แบบ static พร้อม Vercel Function สำหรับนับวิวใน Supabase ไม่มีระบบล็อกอิน

## ตรวจสอบก่อนเผยแพร่

- รัน `node --check script.js`
- ชุดทดสอบ `tests/browser.cjs` ใช้แพ็กเกจ `playwright` และ Microsoft Edge: รัน `node tests/browser.cjs` ในสภาพแวดล้อมที่ติดตั้งทั้งสองแล้ว ชุดทดสอบเปิด HTTP server เฉพาะ localhost ชั่วคราวและปิดเมื่อจบ
- ทดสอบเมนูมือถือ แกลเลอรี ปุ่ม Escape/ลูกศร/Tab และลิงก์ติดต่อ
- เพิ่มภาพใหม่พร้อม `width`, `height`, `alt` และ `loading="lazy"` สำหรับภาพนอกส่วนแรก

## การตั้งค่าความปลอดภัย

`index.html` มี Content Security Policy จำกัดสคริปต์ไว้ที่ origin เดียวกัน ไม่มี inline script, eval หรือการเชื่อมต่อ API ภายนอก ฟอนต์อนุญาตเฉพาะ Google Fonts หากฟอนต์โหลดไม่ได้จะใช้ฟอนต์สำรอง

`.htaccess` เพิ่ม CSP รวม `frame-ancestors`, ป้องกัน MIME sniffing และจำกัด camera/microphone/geolocation เมื่อโฮสต์เป็น Apache ที่เปิด `mod_headers` และอนุญาต `.htaccess` ให้ตรวจ response headers บนโฮสต์จริงหลังเผยแพร่

GitHub Pages ไม่ใช้ `.htaccess` จึงได้เฉพาะ CSP จาก meta tag ซึ่งไม่รองรับ `frame-ancestors` หากต้องการ headers เหล่านี้บน Pages ต้องตั้งผ่านโฮสต์หรือ proxy ที่รองรับ เปิด HTTPS บนโฮสต์จริงด้วย

ลบ URL ตัวอย่าง `YOUR-USERNAME/YOUR-REPO` ออกจาก social metadata แล้ว เมื่อมี URL เว็บไซต์จริงให้ใส่ `og:url`, `og:image` และ `twitter:image` เป็น URL แบบเต็มก่อนใช้งานการแชร์ภาพตัวอย่าง

การเปลี่ยนครั้งนี้ยังไม่ได้เผยแพร่ขึ้นโฮสต์จริง และไม่ได้ตรวจการตั้งค่า TLS หรือ headers ของระบบ production

## สไลด์ผลงาน

คืนส่วนสไลด์เป็นโค้ดดราฟเดิมก่อนปรับปรุง: ทำสำเนาภาพหนึ่งชุด มีบาร์คั่น และเริ่มที่ครึ่งหนึ่งของระยะลูป เลื่อนอัตโนมัติเมื่อแถวอยู่บนหน้าจอ ไม่มีปุ่มควบคุมหรือเงื่อนไขพักเมื่อวางเมาส์ ส่วนดูภาพเต็มจอยังคงใช้กับตารางผลงานหลัก

## เปิดใช้ตัวนับวิวบน Vercel

1. ใน Supabase SQL Editor รัน `supabase/views.sql` ทั้งไฟล์ (รันซ้ำไม่ล้างยอดเดิม)
2. Integration ต้องเพิ่มตัวแปรใน Vercel โปรเจกต์เดียวกับเว็บ ใน Production: `SUPABASE_URL` หรือ `NEXT_PUBLIC_SUPABASE_URL` และ `SUPABASE_SECRET_KEY` หรือ `SUPABASE_SERVICE_ROLE_KEY` ไม่ใช้ anon key หรือ JWT secret
3. Push โค้ดขึ้น GitHub แล้ว deploy บน Vercel รวมโฟลเดอร์ `api/` ที่ root ของโปรเจกต์ เว็บ static นี้ใช้ Framework Preset เป็น Other โดยไม่ต้องมี build command
4. เปิดเว็บจริง ดูยอดท้ายเว็บ แล้ว refresh หนึ่งครั้งเพื่อตรวจยอดเพิ่ม (หากมีผู้ชมอื่นพร้อมกันยอดอาจเพิ่มมากกว่า 1)

`view-counter.js` ส่ง POST `/api/views` หนึ่งครั้งต่อการโหลดเอกสาร ไม่มี retry, polling หรือ localStorage การเลื่อนภาพไม่เพิ่มวิว การกลับหน้าผ่าน browser back/forward cache โดยไม่โหลดเอกสารใหม่ไม่นับเพิ่ม ไม่เก็บ IP หรือข้อมูลผู้ชมในตารางนี้ ถ้าติดต่อฐานข้อมูลไม่ได้แสดง — และเว็บส่วนอื่นยังทำงาน

Preview/Development บน Vercel ไม่เพิ่มยอดและแสดง — การใช้ Laragon หรือ GitHub Pages ไม่รัน Vercel Functions ต้องทดสอบบน Vercel หรือใช้ Vercel CLI สำหรับ local development

ตรวจ API ด้วย `node --test tests/views.cjs` (ใช้ Supabase จำลอง ไม่เรียกฐานข้อมูลจริง) และ `node tests/browser.cjs` เพื่อตรวจหน้าเว็บ/การรีเฟรช/กรณี API ล้มเหลว ตัวนับสาธารณะนี้ไม่ใช่ unique visitors และไม่ป้องกันบอตทั้งหมด หากถูกยิงคำขอควรตั้ง rate limit ที่โฮสต์
