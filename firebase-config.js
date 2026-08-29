/* ============================================================
   Lux Tech — Firebase Configuration
   ============================================================
   1) روح لـ https://console.firebase.google.com
   2) اعمل مشروع جديد (أو استخدم مشروع موجود)
   3) من Project settings > General > Your apps > أضف تطبيق Web
   4) هيديك الأوبجكت ده جاهز، انسخه واستبدل القيم تحت
   5) فعّل من القائمة الجانبية:
        - Firestore Database  (Start in production mode)
        - Authentication > Sign-in method > Email/Password (فعّلها)
   6) اعمل مستخدم أدمن واحد من Authentication > Users > Add user
      وبعدين ضيف نفس الـ UID بتاعه في مجموعة "admins" في Firestore
   7) فعّل من القائمة الجانبية:
        - Storage  (Get started > Start in production mode)
      عشان يشتغل رفع الصور الحقيقي من لوحة الإدارة
      (شرح كامل في README.md)
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyBNxX1KsgJP5k66rOPIoQfYRxmMr4oKq-M",
  authDomain: "kiro-98ae7.firebaseapp.com",
  projectId: "kiro-98ae7",
  storageBucket: "kiro-98ae7.firebasestorage.app",
  messagingSenderId: "356083995116",
  appId: "1:356083995116:web:69a61c9bbdf09dd5a9b0c9",
  measurementId: "G-CE29DT6DF9"
};

// تهيئة Firebase (Compat SDK — لازم تتحمل سكريبتاته في الـ HTML قبل السطر ده)
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();

// auth اختياري — بيشتغل بس لو تم تحميل سكريبت firebase-auth-compat.js في الصفحة (زي admin.html)
let auth;
if (firebase.auth) {
  try { auth = firebase.auth(); } catch (e) { /* لو مش متاح على الصفحة دي، تجاهل */ }
}

// Analytics اختياري — بيشتغل بس لو تم تحميل سكريبت firebase-analytics-compat.js في الصفحة
if (firebase.analytics) {
  try { firebase.analytics(); } catch (e) { /* لو مش متاح على الصفحة دي، تجاهل */ }
}

// أسماء الكولكشنز في Firestore — مركزية عشان لو غيرت اسم يتغير في كل مكان
const COLLECTIONS = {
  products: "products",
  categories: "categories",
  orders: "orders",
    orderTracking: "order_tracking",
  admins: "admins",
  inventoryMovements: "inventory_movements"
};
