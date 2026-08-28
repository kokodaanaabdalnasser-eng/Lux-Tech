/* ============================================================
   Lux Tech — Storefront Logic
   Firestore + Cloudinary Upload
   ============================================================ */

let allProducts = [];
let allCategories = [];
let currentCategory = "all";
let currentSearch = "";

function normalizeCartItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && item.id)
    .map(item => ({
      ...item,
      qty: Math.max(1, Math.floor(Number(item.qty) || 1)),
      price: Number(item.price) || 0
    }));
}

let cart = (() => {
  try {
    return normalizeCartItems(
      JSON.parse(localStorage.getItem("luxtech_cart") || "[]")
    );
  } catch (e) {
    return [];
  }
})();

let currentProductId = null;
let checkoutStep = 1;

let paymentSettings = {
  cashOnDeliveryEnabled: true,
  instapayEnabled: false,
  walletEnabled: false,
  instapay: {},
  wallet: {}
};

let selectedPayment = "cash";
let uploadedPaymentProof = "";
let allCoupons = [];
let appliedCoupon = null;
let couponDiscount = 0;

const grid = document.getElementById("productsGrid");
const catsBar = document.getElementById("catsBar");

/* ============================================================
   Cloudinary Configuration
   ============================================================ */

const CLOUDINARY_CLOUD_NAME = "jaj006bc";
const CLOUDINARY_UPLOAD_PRESET = "lux-tech";

const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

/* ============================================================
   Store settings / footer
   ============================================================ */

db.collection("storeSettings")
  .doc("main")
  .onSnapshot(
    s => {
      paymentSettings = {
        ...paymentSettings,
        ...(s.exists ? s.data() : {})
      };

      renderPaymentMethods();
    },
    e => console.error("Store settings error:", e)
  );

db.collection("branches")
  .orderBy("order", "asc")
  .onSnapshot(
    s => {
      renderFooterBranches(
        s.docs.map(d => ({
          id: d.id,
          ...d.data()
        }))
      );
    },
    e => console.error("Branches error:", e)
  );

db.collection("socialLinks")
  .doc("main")
  .onSnapshot(
    s => {
      renderFooterLinks(s.exists ? s.data() : {});
    },
    e => console.error("Social links error:", e)
  );

/* ============================================================
   Footer
   ============================================================ */

function renderFooterBranches(branches) {
  const el = document.getElementById("footerBranches");

  if (!el) return;

  el.innerHTML = branches.length
    ? branches
        .map(
          b => `
          <div class="footer-branch">
            <strong>${escapeHtml(b.name || "فرع")}</strong>

            <small>
              ${escapeHtml(b.address || "")}
            </small>

            <small>
              ${escapeHtml(b.phone || "")}
              ${b.hours ? " · " + escapeHtml(b.hours) : ""}
            </small>

            ${
              b.maps
                ? `
                <a
                  href="${escapeHtml(b.maps)}"
                  target="_blank"
                  rel="noopener"
                >
                  فتح الموقع على الخريطة ←
                </a>
              `
                : ""
            }
          </div>
        `
        )
        .join("")
    : "<span>لا توجد فروع مضافة حاليًا.</span>";
}

function renderFooterLinks(x) {
  const el = document.getElementById("footerLinks");

  if (!el) return;

  const items = [
    ["whatsapp", "WhatsApp"],
    ["facebook", "Facebook"],
    ["tiktok", "TikTok"],
    ["instagram", "Instagram"],
    ["youtube", "YouTube"],
    ["telegram", "Telegram"]
  ].filter(([k]) => x[k]);

  el.innerHTML = items.length
    ? items
        .map(
          ([k, n]) => `
            <a
              class="footer-link"
              href="${escapeHtml(x[k])}"
              target="_blank"
              rel="noopener"
            >
              ${n} ↗
            </a>
          `
        )
        .join("")
    : "<span>أضف روابط التواصل من لوحة الإدارة.</span>";
}

/* ============================================================
   Payment Methods
   ============================================================ */

function renderPaymentMethods() {
  const box = document.getElementById("paymentMethods");

  if (!box) return;

  const methods = [];

  if (paymentSettings.cashOnDeliveryEnabled !== false) {
    methods.push([
      "cash",
      "الدفع عند الاستلام",
      "بدون تحويل مسبق"
    ]);
  }

  if (paymentSettings.instapayEnabled) {
    methods.push([
      "instapay",
      "InstaPay",
      "تحويل إلكتروني + إثبات"
    ]);
  }

  if (paymentSettings.walletEnabled) {
    methods.push([
      "wallet",
      paymentSettings.wallet?.network || "محفظة إلكترونية",
      "تحويل إلكتروني + إثبات"
    ]);
  }

  if (!methods.length) {
    box.innerHTML = `
      <div style="
        color:#d77b74;
        font-size:12px;
      ">
        لا توجد طريقة دفع مفعلة حاليًا.
        تواصل مع الإدارة.
      </div>
    `;

    return;
  }

  if (!methods.some(x => x[0] === selectedPayment)) {
    selectedPayment = methods[0][0];
  }

  box.innerHTML = methods
    .map(
      ([id, name, sub]) => `
        <label
          class="pay-option ${
            selectedPayment === id ? "active" : ""
          }"
        >
          <input
            type="radio"
            name="paymentMethod"
            value="${id}"
            ${
              selectedPayment === id
                ? "checked"
                : ""
            }
            onchange="selectPayment('${id}')"
          >

          <span>
            <strong>${escapeHtml(name)}</strong>

            <small
              style="
                display:block;
                color:var(--text-dim);
                font-size:10px;
              "
            >
              ${escapeHtml(sub)}
            </small>
          </span>
        </label>
      `
    )
    .join("");

  renderOnlinePaymentBox();
}

function selectPayment(method) {
  selectedPayment = method;
  uploadedPaymentProof = "";

  renderPaymentMethods();
}

function renderOnlinePaymentBox() {
  const box = document.getElementById("onlinePaymentBox");

  if (!box) return;

  if (selectedPayment === "cash") {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  const info =
    selectedPayment === "instapay"
      ? paymentSettings.instapay || {}
      : paymentSettings.wallet || {};

  box.style.display = "block";

  box.innerHTML = `
    <div class="payment-account">

      <strong>
        ${
          selectedPayment === "instapay"
            ? "الدفع عبر InstaPay"
            : info.network || "المحفظة الإلكترونية"
        }
      </strong>

      <br>

      اسم الحساب:
      <b>${escapeHtml(info.name || "—")}</b>

      <br>

      رقم/عنوان الدفع:
      <b>${escapeHtml(info.number || "—")}</b>

      ${
        info.instructions
          ? `
            <br>
            <span
              style="
                color:var(--text-dim);
              "
            >
              ${escapeHtml(info.instructions)}
            </span>
          `
          : ""
      }

      <div class="proof-upload">

        <label>
          رقم الهاتف/الرقم الذي حوّلت منه *
        </label>

        <input
          id="paymentSenderPhone"
          inputmode="tel"
          placeholder="01xxxxxxxxx"
        >

        <label
          style="
            display:block;
            margin-top:10px;
          "
        >
          صورة إثبات التحويل *
        </label>

        <input
          id="paymentProofFile"
          type="file"
          accept="image/*"
          onchange="uploadPaymentProof(this)"
        >

        <small
          id="proofStatus"
          style="
            display:block;
            color:var(--text-dim);
            margin-top:7px;
          "
        >
          اختر صورة واضحة للتحويل.
        </small>

      </div>

    </div>
  `;
}

/* ============================================================
   Cloudinary — Upload Payment Proof
   ============================================================ */

async function uploadPaymentProof(input) {
  const file = input.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    input.value = "";
    showToast("ارفع صورة فقط");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    input.value = "";
    showToast("الصورة يجب ألا تتجاوز 5 ميجا");
    return;
  }

  const status =
    document.getElementById("proofStatus");

  if (status) {
    status.textContent =
      "جاري رفع إثبات التحويل...";
  }

  uploadedPaymentProof = "";

  try {
    const formData = new FormData();

    formData.append("file", file);

    formData.append(
      "upload_preset",
      CLOUDINARY_UPLOAD_PRESET
    );

    /*
      لا نرسل api_key
      لأن الـ Upload Preset عندك Unsigned.
    */

    const response = await fetch(
      CLOUDINARY_UPLOAD_URL,
      {
        method: "POST",
        body: formData
      }
    );

    const data = await response.json();

    console.log(
      "Cloudinary response:",
      data
    );

    if (!response.ok) {
      console.error(
        "Cloudinary upload error:",
        data
      );

      throw new Error(
        data?.error?.message ||
        "فشل رفع الصورة"
      );
    }

    if (!data.secure_url) {
      throw new Error(
        "Cloudinary لم يرجع رابط الصورة"
      );
    }

    uploadedPaymentProof =
      data.secure_url;

    if (status) {
      status.textContent =
        "✓ تم رفع إثبات التحويل";
    }

    console.log(
      "Cloudinary URL:",
      uploadedPaymentProof
    );

    showToast(
      "تم رفع صورة إثبات التحويل"
    );

  } catch (error) {
    console.error(
      "Cloudinary Error:",
      error
    );

    uploadedPaymentProof = "";

    if (status) {
      status.textContent =
        "فشل رفع الصورة";
    }

    showToast(
      error.message ||
      "تعذر رفع إثبات التحويل"
    );
  }
}

function paymentLabel() {
  if (selectedPayment === "cash") {
    return "الدفع عند الاستلام";
  }

  if (selectedPayment === "instapay") {
    return "InstaPay";
  }

  return "محفظة إلكترونية";
}

/* ============================================================
   Coupons
   ============================================================ */

db.collection("coupons").onSnapshot(s => {
  allCoupons = s.docs.map(d => ({ id:d.id, ...d.data() }));
}, e => console.error("Coupons error:", e));

function cartSubtotal(){return cart.reduce((s,c)=>s+(Number(c.price)||0)*(Number(c.qty)||0),0)}
function couponValue(coupon, subtotal){
  let d = coupon.type === "fixed" ? Number(coupon.value)||0 : subtotal * ((Number(coupon.value)||0)/100);
  const max = Number(coupon.maxDiscount)||0;
  if(coupon.type !== "fixed" && max > 0) d = Math.min(d,max);
  return Math.max(0, Math.min(subtotal,d));
}
function applyCoupon(){
  const input=document.getElementById("couponCode"); const status=document.getElementById("couponStatus");
  const code=(input?.value||"").trim().toUpperCase(); const subtotal=cartSubtotal();
  if(!code)return showToast("اكتب كود الخصم أولًا");
  const c=allCoupons.find(x=>String(x.code||"").trim().toUpperCase()===code && x.active!==false);
  if(!c)return setCouponMessage("كود الخصم غير صحيح أو غير مفعل",true);
  const now=new Date();
  if(c.expiresAt){const exp=new Date(c.expiresAt);if(!Number.isNaN(exp.getTime())&&now>exp)return setCouponMessage("كود الخصم انتهت صلاحيته",true);}
  const min=Number(c.minOrder)||0;if(subtotal<min)return setCouponMessage(`الحد الأدنى لاستخدام الكود ${fmtPrice(min)}`,true);
  const used=Number(c.usedCount)||0,limit=Number(c.usageLimit)||0;if(limit>0&&used>=limit)return setCouponMessage("تم الوصول للحد الأقصى لاستخدام الكود",true);
  appliedCoupon={id:c.id,code:c.code,type:c.type||"percent",value:Number(c.value)||0}; couponDiscount=couponValue(c,subtotal);
  setCouponMessage(`✓ تم تطبيق الخصم: ${fmtPrice(couponDiscount)}`,false); renderCheckoutReview();
}
function setCouponMessage(msg,error){const el=document.getElementById("couponStatus");if(el){el.textContent=msg;el.style.color=error?"var(--danger)":"var(--gold2)"}}
function resetCoupon(){appliedCoupon=null;couponDiscount=0;const i=document.getElementById("couponCode"),s=document.getElementById("couponStatus");if(i)i.value="";if(s)s.textContent=""}

/* ============================================================
   Load Categories
   ============================================================ */

db.collection(COLLECTIONS.categories)
  .orderBy("order", "asc")
  .onSnapshot(
    snap => {
      allCategories = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      renderCategories();
    },
    err => {
      console.error(
        "خطأ في تحميل الأقسام:",
        err
      );
    }
  );

function renderCategories() {
  if (!catsBar) return;

  catsBar.innerHTML = `
    <div
      class="cat-chip ${
        currentCategory === "all"
          ? "active"
          : ""
      }"
      onclick="selectCategory('all')"
    >
      الكل
    </div>
  `;

  allCategories.forEach(c => {
    catsBar.innerHTML += `
      <div
        class="cat-chip ${
          currentCategory === c.id
            ? "active"
            : ""
        }"
        onclick="selectCategory('${escapeHtml(c.id)}')"
      >
        ${escapeHtml(c.name)}
      </div>
    `;
  });
}

function selectCategory(catId) {
  currentCategory = catId;

  renderCategories();

  const title =
    document.getElementById("gridTitle");

  if (title) {
    title.textContent =
      catId === "all"
        ? "كل المنتجات"
        : (
            allCategories.find(
              c => c.id === catId
            )?.name || ""
          );
  }

  renderProducts();
}

/* ============================================================
   Load Products
   ============================================================ */

db.collection(COLLECTIONS.products)
  .onSnapshot(
    snap => {
      allProducts = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      renderProducts();
    },
    err => {
      console.error(
        "خطأ في تحميل المنتجات:",
        err
      );

      if (grid) {
        grid.innerHTML = `
          <div class="empty-state">
            تعذّر تحميل المنتجات.
            تأكد من إعداد Firebase
            في firebase-config.js
          </div>
        `;
      }
    }
  );

function renderProducts() {
  if (!grid) return;

  let list = allProducts.filter(
    p => p.available !== false
  );

  if (currentCategory !== "all") {
    list = list.filter(
      p => p.category === currentCategory
    );
  }

  if (currentSearch.trim()) {
    const q =
      currentSearch.trim().toLowerCase();

    list = list.filter(p =>
      (p.name || "")
        .toLowerCase()
        .includes(q)
    );
  }

  const resultsCount =
    document.getElementById(
      "resultsCount"
    );

  if (resultsCount) {
    resultsCount.textContent =
      list.length
        ? `${list.length} منتج`
        : "";
  }

  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state">
        لا توجد منتجات مطابقة
        ${
          allProducts.length === 0
            ? " — لسه محدش ضاف منتجات من لوحة الإدارة"
            : ""
        }
      </div>
    `;

    return;
  }

  grid.innerHTML = list
    .map(
      p => `
        <div
          class="card"
          onclick="openProduct('${escapeHtml(p.id)}')"
        >

          <div class="card-img">

            ${
              p.stock === 0
                ? '<span class="stock-tag">نفذت الكمية</span>'
                : ""
            }

            <img
              src="${
                p.image ||
                "https://placehold.co/400x400/161418/c9a24b?text=Lux+Tech"
              }"
              alt="${escapeHtml(p.name)}"
            >

          </div>

          <div class="card-body">

            <span class="card-cat">
              ${escapeHtml(
                categoryName(p.category)
              )}
            </span>

            <span class="card-name">
              ${escapeHtml(p.name)}
            </span>

            <div class="card-price-row">

              <span class="card-price">
                ${fmtPrice(p.price)}
              </span>

              ${
                p.oldPrice
                  ? `
                    <span class="card-old-price">
                      ${fmtPrice(p.oldPrice)}
                    </span>
                  `
                  : ""
              }

            </div>

            <button
              class="add-btn"
              onclick="
                event.stopPropagation();
                quickAdd('${escapeHtml(p.id)}')
              "
              ${p.stock === 0 ? "disabled" : ""}
            >
              ${
                p.stock === 0
                  ? "غير متاح"
                  : "إضافة للسلة"
              }
            </button>

          </div>

        </div>
      `
    )
    .join("");
}

function categoryName(catId) {
  return (
    allCategories.find(
      c => c.id === catId
    )?.name ||
    catId ||
    ""
  );
}

function fmtPrice(n) {
  return (
    (Number(n) || 0).toLocaleString(
      "ar-EG"
    ) + " ج.م"
  );
}

/* ============================================================
   Search
   ============================================================ */

const searchInput =
  document.getElementById(
    "searchInput"
  );

if (searchInput) {
  searchInput.addEventListener(
    "input",
    e => {
      currentSearch =
        e.target.value;

      renderProducts();
    }
  );
}

/* ============================================================
   Product
   ============================================================ */

function openProduct(id) {
  const p =
    allProducts.find(
      x => x.id === id
    );

  if (!p) return;

  window.location.href =
    "product.html?id=" +
    encodeURIComponent(id);

  return;
}

/* ============================================================
   Cart
   ============================================================ */

function quickAdd(id) {
  addToCart(id, 1);
}

function addToCart(id, qty) {
  const p =
    allProducts.find(
      x => x.id === id
    );

  if (!p) return;

  const useQty =
    qty ||
    parseInt(
      document.getElementById(
        "pdQty"
      )?.textContent || 1
    );

  const existing =
    cart.find(
      c => c.id === id
    );

  const nextQty =
    (existing?.qty || 0) +
    useQty;

  if (
    Number.isFinite(
      Number(p.stock)
    ) &&
    nextQty > p.stock
  ) {
    showToast(
      `المتاح فقط ${p.stock} قطعة`
    );

    return;
  }

  if (existing) {
    existing.qty = nextQty;
  } else {
    cart.push({
      id: p.id,
      name: p.name,
      price: p.price,
      image: p.image,
      qty: useQty
    });
  }

  saveCart();
  renderCart();

  showToast(
    "تمت الإضافة للسلة"
  );

  closeProductModal();
}

function updateCartBadge() {
  const totalCount = cart.reduce(
    (sum, item) => sum + Math.max(0, Number(item.qty) || 0),
    0
  );

  document.querySelectorAll(".cart-badge").forEach(badge => {
    badge.textContent = String(totalCount);
    badge.style.display = totalCount > 0 ? "grid" : "none";
    badge.setAttribute("aria-label", `عدد القطع في السلة: ${totalCount}`);
  });
}


// Keep the cart badge correct on every page and when another tab changes the cart.
if (typeof updateCartBadge === "function") {
  updateCartBadge();
}
window.addEventListener("storage", function (event) {
  if (event.key !== "luxtech_cart") return;
  try {
    cart = normalizeCartItems(JSON.parse(event.newValue || "[]"));
  } catch (e) {
    cart = [];
  }
  updateCartBadge();
  if (document.getElementById("cartItemsList") && typeof renderCart === "function") renderCart();
});

function saveCart() {
  cart = normalizeCartItems(cart);
  localStorage.setItem(
    "luxtech_cart",
    JSON.stringify(cart)
  );
  updateCartBadge();
}

function renderCart() {
  const list =
    document.getElementById(
      "cartItemsList"
    );

  const badge =
    document.getElementById(
      "cartBadge"
    );

  const totalCount = cart.reduce(
    (sum, item) => sum + Math.max(0, Number(item.qty) || 0),
    0
  );

  updateCartBadge();
  if (!list || !badge) return;

  badge.style.display = totalCount > 0 ? "grid" : "none";
  badge.textContent = String(totalCount);

  if (!cart.length) {
    list.innerHTML = `
      <div
        class="empty-state"
        style="padding:40px 0;"
      >
        السلة فارغة
      </div>
    `;
  } else {
    list.innerHTML = cart
      .map(
        c => `
          <div class="cart-item">

            <img
              src="${
                c.image ||
                "https://placehold.co/60x60/161418/c9a24b?text=LT"
              }"
              alt="${escapeHtml(c.name)}"
            >

            <div class="cart-item-info">

              <div class="cart-item-name">
                ${escapeHtml(c.name)}
              </div>

              <div class="cart-item-price">
                ${fmtPrice(c.price)}
              </div>

              <div class="cart-item-actions">

                <button
                  onclick="cartQty('${escapeHtml(c.id)}',1)"
                >
                  +
                </button>

                <span>
                  ${c.qty}
                </span>

                <button
                  onclick="cartQty('${escapeHtml(c.id)}',-1)"
                >
                  -
                </button>

                <span
                  class="remove-link"
                  onclick="removeFromCart('${escapeHtml(c.id)}')"
                >
                  حذف
                </span>

              </div>

            </div>

          </div>
        `
      )
      .join("");
  }

  const total =
    cart.reduce(
      (s, c) =>
        s + c.price * c.qty,
      0
    );

  const cartTotal =
    document.getElementById(
      "cartTotal"
    );

  if (cartTotal) {
    cartTotal.textContent =
      fmtPrice(total);
  }

  const checkoutBtn =
    document.getElementById(
      "checkoutBtn"
    );

  if (checkoutBtn) {
    checkoutBtn.disabled =
      !cart.length;
  }
}

function cartQty(id, delta) {
  const item =
    cart.find(
      c => c.id === id
    );

  if (!item) return;

  const p =
    allProducts.find(
      x => x.id === id
    );

  const next =
    item.qty + delta;

  if (
    next > 0 &&
    Number.isFinite(
      p?.stock
    ) &&
    next > p.stock
  ) {
    showToast(
      `المتاح فقط ${p.stock} قطعة`
    );

    return;
  }

  item.qty = next;

  if (item.qty <= 0) {
    cart =
      cart.filter(
        c => c.id !== id
      );
  }

  saveCart();
  renderCart();
}

function removeFromCart(id) {
  cart =
    cart.filter(
      c => c.id !== id
    );

  saveCart();
  renderCart();
}

function openCart() {
  renderCart();

  document
    .getElementById(
      "drawerOverlay"
    )
    ?.classList.add("open");

  document
    .getElementById(
      "cartDrawer"
    )
    ?.classList.add("open");
}

function closeCart() {
  document
    .getElementById(
      "drawerOverlay"
    )
    ?.classList.remove("open");

  document
    .getElementById(
      "cartDrawer"
    )
    ?.classList.remove("open");
}

/* ============================================================
   Product Modal
   ============================================================ */

function closeProductModal() {
  document
    .getElementById(
      "productOverlay"
    )
    ?.classList.remove("open");

  currentProductId = null;
}

function changePdQty(delta) {
  const el =
    document.getElementById(
      "pdQty"
    );

  if (!el) return;

  const p =
    allProducts.find(
      x =>
        x.id ===
        currentProductId
    );

  let v = Math.max(
    1,
    parseInt(
      el.textContent || 1
    ) + delta
  );

  if (
    p &&
    Number.isFinite(
      Number(p.stock)
    ) &&
    p.stock > 0
  ) {
    v = Math.min(
      v,
      Number(p.stock)
    );
  }

  el.textContent = v;
}

/* ============================================================
   Secure Order Tracking
   ============================================================ */

function normalizePhone(phone) {
  let p = String(
    phone || ""
  ).replace(
    /[^0-9+]/g,
    ""
  );

  if (p.startsWith("+20")) {
    p =
      "0" +
      p.slice(3);
  } else if (
    p.startsWith("20") &&
    p.length >= 12
  ) {
    p =
      "0" +
      p.slice(2);
  }

  return p;
}

async function makeTrackingKey(
  orderId,
  phone
) {
  const data =
    new TextEncoder().encode(
      String(orderId) +
        "|" +
        normalizePhone(phone)
    );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array.from(
    new Uint8Array(hash)
  )
    .map(b =>
      b.toString(16).padStart(
        2,
        "0"
      )
    )
    .join("");
}

async function makePhoneHash(
  phone
) {
  const data =
    new TextEncoder().encode(
      normalizePhone(phone)
    );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array.from(
    new Uint8Array(hash)
  )
    .map(b =>
      b.toString(16).padStart(
        2,
        "0"
      )
    )
    .join("");
}

/* ============================================================
   Checkout
   ============================================================ */

function openCheckout() {
  if (!cart.length) return;

  closeCart();

  checkoutStep = 1;
  resetCoupon();

  renderPaymentMethods();

  updateCheckoutStep();

  const count =
    cart.reduce(
      (s, c) => s + c.qty,
      0
    );

  const total =
    cart.reduce(
      (s, c) =>
        s + c.price * c.qty,
      0
    );

  const countEl =
    document.getElementById(
      "checkoutItemsCount"
    );

  const totalEl =
    document.getElementById(
      "checkoutTotal1"
    );

  if (countEl) {
    countEl.textContent =
      count;
  }

  if (totalEl) {
    totalEl.textContent =
      fmtPrice(total);
  }

  document
    .getElementById(
      "checkoutOverlay"
    )
    ?.classList.add("open");
}

function closeCheckout() {
  document
    .getElementById(
      "checkoutOverlay"
    )
    ?.classList.remove("open");
}

function updateCheckoutStep() {
  for (let i = 1; i <= 3; i++) {
    document
      .getElementById(
        "checkoutStep" + i
      )
      ?.classList.toggle(
        "active",
        i === checkoutStep
      );

    document
      .getElementById(
        "stepBar" + i
      )
      ?.classList.toggle(
        "active",
        i <= checkoutStep
      );
  }

  const label =
    document.getElementById(
      "checkoutStepLabel"
    );

  if (label) {
    label.textContent =
      `${checkoutStep} / 3`;
  }

  if (checkoutStep === 3) {
    renderCheckoutReview();
  }
}

function nextCheckoutStep(step) {
  if (step === 2) {
    const n =
      document
        .getElementById(
          "custName"
        )
        ?.value.trim();

    const ph =
      document
        .getElementById(
          "custPhone"
        )
        ?.value.trim();

    if (!n || !ph) {
      return showToast(
        "اكتب الاسم ورقم الهاتف أولًا"
      );
    }

    if (
      normalizePhone(ph)
        .length < 10
    ) {
      return showToast(
        "اكتب رقم هاتف صحيح"
      );
    }
  }

  if (step === 3) {
    const gov =
      document.getElementById(
        "custGov"
      )?.value;

    const address =
      document
        .getElementById(
          "custAddress"
        )
        ?.value.trim();

    if (
      !gov ||
      !address
    ) {
      return showToast(
        "أكمل المحافظة والعنوان أولًا"
      );
    }
  }

  if (step === 2) {
    renderPaymentMethods();
  }

  checkoutStep = step;

  updateCheckoutStep();
}

function renderCheckoutReview() {
  const subtotal = cartSubtotal();
  couponDiscount = appliedCoupon ? couponValue(appliedCoupon, subtotal) : 0;
  const total = Math.max(0, subtotal - couponDiscount);

  const count =
    cart.reduce(
      (s, c) =>
        s + c.qty,
      0
    );

  const name =
    document
      .getElementById(
        "custName"
      )
      ?.value.trim() || "";

  const phone =
    document
      .getElementById(
        "custPhone"
      )
      ?.value.trim() || "";

  const gov =
    document.getElementById(
      "custGov"
    )?.value || "";

  const address =
    document
      .getElementById(
        "custAddress"
      )
      ?.value.trim() || "";

  const review =
    document.getElementById(
      "checkoutReview"
    );

  if (review) {
    review.innerHTML = `
      <div class="summary-line">
        <span>العميل</span>
        <strong>
          ${escapeHtml(name)}
        </strong>
      </div>

      <div class="summary-line">
        <span>الهاتف</span>
        <strong>
          ${escapeHtml(phone)}
        </strong>
      </div>

      <div class="summary-line">
        <span>العنوان</span>
        <strong
          style="
            max-width:60%;
            text-align:left;
          "
        >
          ${escapeHtml(gov)}
          —
          ${escapeHtml(address)}
        </strong>
      </div>

      <div class="summary-line">
        <span>عدد القطع</span>
        <strong>${count}</strong>
      </div>

      <div class="summary-line">
        <span>طريقة الدفع</span>
        <strong>
          ${escapeHtml(
            paymentLabel()
          )}
        </strong>
      </div>

      <div class="summary-line"><span>قبل الخصم</span><strong>${fmtPrice(subtotal)}</strong></div>
      ${couponDiscount ? `<div class="summary-line"><span>الخصم ${appliedCoupon?.code ? `(${escapeHtml(appliedCoupon.code)})` : ""}</span><strong>- ${fmtPrice(couponDiscount)}</strong></div>` : ""}
      <div class="summary-line"><span>الإجمالي النهائي</span><strong>${fmtPrice(total)}</strong></div>
    `;
  }

  const final =
    document.getElementById(
      "paymentFinalBox"
    );

  if (final) {
    final.innerHTML =
      selectedPayment === "cash"
        ? `
          <div
            style="
              padding:12px 14px;
              border:1px solid #4b3d21;
              border-radius:10px;
              background:#15120c;
              color:#aaa38e;
              font-size:11px;
              line-height:1.8;
            "
          >
            ✓ الدفع عند الاستلام
            <br>
            ✓ تتبع الطلب برقم الهاتف
          </div>
        `
        : `
          <div
            style="
              padding:12px 14px;
              border:1px solid #4b3d21;
              border-radius:10px;
              background:#15120c;
              color:#aaa38e;
              font-size:11px;
              line-height:1.8;
            "
          >
            ✓ تم تجهيز طلب التحويل
            <br>
            ✓ بعد إرسال الطلب سيظهر للإدارة
            لمراجعة إثبات الدفع
          </div>
        `;
  }
}

/* ============================================================
   Submit Order
   ============================================================ */

async function submitOrder() {
  const name =
    document
      .getElementById(
        "custName"
      )
      ?.value.trim();

  const phone =
    document
      .getElementById(
        "custPhone"
      )
      ?.value.trim();

  const gov =
    document.getElementById(
      "custGov"
    )?.value;

  const address =
    document
      .getElementById(
        "custAddress"
      )
      ?.value.trim();

  const notes =
    document
      .getElementById(
        "custNotes"
      )
      ?.value.trim();

  if (
    !name ||
    !phone ||
    !gov ||
    !address
  ) {
    return showToast(
      "من فضلك أكمل بيانات التوصيل"
    );
  }

  if (selectedPayment !== "cash") {
    const sender =
      document
        .getElementById(
          "paymentSenderPhone"
        )
        ?.value.trim();

    if (!sender) {
      return showToast(
        "اكتب الرقم الذي حوّلت منه"
      );
    }

    if (!uploadedPaymentProof) {
      return showToast(
        "ارفع صورة إثبات التحويل أولًا"
      );
    }
  }

  const btn =
    document.getElementById(
      "confirmOrderBtn"
    );

  if (btn) {
    btn.disabled = true;
    btn.textContent =
      "جاري إرسال الطلب...";
  }

  try {
    /* --------------------------------------------------------
       Verify stock
       -------------------------------------------------------- */

    const fresh =
      await Promise.all(
        cart.map(c =>
          db
            .collection(
              COLLECTIONS.products
            )
            .doc(c.id)
            .get()
        )
      );

    for (
      let i = 0;
      i < fresh.length;
      i++
    ) {
      const d = fresh[i];

      if (
        !d.exists ||
        Number(
          d.data().stock || 0
        ) <
          cart[i].qty
      ) {
        throw new Error(
          `المنتج ${cart[i].name} لم يعد متاحًا بالكمية المطلوبة`
        );
      }
    }

    /* --------------------------------------------------------
       Order data
       -------------------------------------------------------- */

    const subtotal = cartSubtotal();
    couponDiscount = appliedCoupon ? couponValue(appliedCoupon, subtotal) : 0;
    const total = Math.max(0, subtotal - couponDiscount);

    const ref =
      db
        .collection(
          COLLECTIONS.orders
        )
        .doc();

    const trackingItems =
      cart.map(c => ({
        productId: c.id,
        name: c.name,
        price: c.price,
        qty: c.qty
      }));

    const sender =
      selectedPayment === "cash"
        ? ""
        : (
            document
              .getElementById(
                "paymentSenderPhone"
              )
              ?.value.trim() || ""
          );

    const paymentStatus =
      selectedPayment === "cash"
        ? "not_required"
        : "pending";

    const payment = {
      method: selectedPayment,
      status: paymentStatus,
      senderPhone: sender,
      proofUrl:
        selectedPayment === "cash"
          ? ""
          : uploadedPaymentProof
    };

    const order = {
      items: trackingItems,

      total,
      subtotal,
      discount: couponDiscount,
      coupon: appliedCoupon ? { ...appliedCoupon } : null,

      customer: {
        name,
        phone,
        governorate: gov,
        address,
        notes
      },

      status: "جديد",

      payment,

      trackingKey: ref.id,

      createdAt:
        firebase.firestore
          .FieldValue
          .serverTimestamp()
    };

    /* --------------------------------------------------------
       Phone hash
       -------------------------------------------------------- */

    const phoneHash =
      await makePhoneHash(
        phone
      );

    /* --------------------------------------------------------
       Firestore batch
       -------------------------------------------------------- */

    const batch =
      db.batch();

    /* Main order */

    batch.set(
      ref,
      order
    );

    /* order_tracking */

    batch.set(
      db
        .collection(
          COLLECTIONS.orderTracking ||
            "order_tracking"
        )
        .doc(ref.id),
      {
        orderId: ref.id,

        status: "جديد",

        total,
        subtotal,
        discount: couponDiscount,
        coupon: appliedCoupon ? { ...appliedCoupon } : null,

        items: trackingItems,

        payment,

        createdAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp(),

        updatedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      }
    );

    /* order_tracking_by_phone */

    batch.set(
      db
        .collection(
          "order_tracking_by_phone"
        )
        .doc(phoneHash)
        .collection("orders")
        .doc(ref.id),
      {
        orderId: ref.id,

        status: "جديد",

        total,
        subtotal,
        discount: couponDiscount,
        coupon: appliedCoupon ? { ...appliedCoupon } : null,

        items: trackingItems,

        payment,

        createdAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp(),

        updatedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()
      }
    );

    /* paymentRequests */

    if (
      selectedPayment !== "cash"
    ) {
      batch.set(
        db
          .collection(
            "paymentRequests"
          )
          .doc(),
        {
          orderId: ref.id,

          method:
            selectedPayment,

          methodName:
            paymentLabel(),

          amount: total,

          senderPhone:
            sender,

          proofUrl:
            uploadedPaymentProof,

          status: "pending",

          createdAt:
            firebase.firestore
              .FieldValue
              .serverTimestamp()
        }
      );
    }

    /* --------------------------------------------------------
       Commit
       -------------------------------------------------------- */

    await batch.commit();

    /* --------------------------------------------------------
       Clear cart
       -------------------------------------------------------- */

    cart = [];

    saveCart();

    renderCart();

    closeCheckout();

    /* --------------------------------------------------------
       Success screen
       -------------------------------------------------------- */

    const orderIdDisplay =
      document.getElementById(
        "orderIdDisplay"
      );

    if (orderIdDisplay) {
      orderIdDisplay.textContent =
        ref.id;
    }

    const payText =
      selectedPayment === "cash"
        ? "الدفع عند الاستلام"
        : "في انتظار تأكيد الدفع";

    const successSummary =
      document.querySelector(
        "#successOverlay .checkout-summary"
      );

    if (successSummary) {
      successSummary.innerHTML = `
        <div class="summary-line">
          <span>رقم الطلب</span>
          <strong>
            ${escapeHtml(ref.id)}
          </strong>
        </div>

        <div class="summary-line">
          <span>الدفع</span>
          <strong>
            ${escapeHtml(payText)}
          </strong>
        </div>
      `;
    }

    document
      .getElementById(
        "successOverlay"
      )
      ?.classList.add("open");

    /* Reset payment */

    uploadedPaymentProof = "";

    selectedPayment = "cash";

    renderPaymentMethods();

    /* Reset form */

    [
      "custName",
      "custPhone",
      "custAddress",
      "custNotes"
    ].forEach(id => {
      const el =
        document.getElementById(
          id
        );

      if (el) {
        el.value = "";
      }
    });

    const govEl =
      document.getElementById(
        "custGov"
      );

    if (govEl) {
      govEl.value = "";
    }

  } catch (e) {
    console.error(
      "Submit order error:",
      e
    );

    showToast(
      e.message ||
      "حدث خطأ أثناء إرسال الطلب"
    );

  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent =
        "تأكيد وإرسال الطلب";
    }
  }
}

function closeSuccess() {
  document
    .getElementById(
      "successOverlay"
    )
    ?.classList.remove("open");
}

/* ============================================================
   Track Order
   ============================================================ */

function openTrackModal() {
  document
    .getElementById(
      "trackOverlay"
    )
    ?.classList.add("open");
}

function closeTrackModal() {
  document
    .getElementById(
      "trackOverlay"
    )
    ?.classList.remove("open");

  const result =
    document.getElementById(
      "trackResult"
    );

  if (result) {
    result.innerHTML = "";
  }
}

async function trackOrder() {
  const phone =
    document
      .getElementById(
        "trackPhone"
      )
      ?.value.trim();

  const resultBox =
    document.getElementById(
      "trackResult"
    );

  if (!resultBox) return;

  if (
    !phone ||
    normalizePhone(phone)
      .length < 10
  ) {
    resultBox.innerHTML = `
      <p
        style="
          color:var(--danger);
          font-size:13px;
        "
      >
        اكتب رقم هاتف صحيح.
      </p>
    `;

    return;
  }

  resultBox.innerHTML = `
    <p
      style="
        color:var(--text-dim);
        font-size:13px;
      "
    >
      جاري البحث عن طلباتك...
    </p>
  `;

  try {
    const phoneHash =
      await makePhoneHash(
        phone
      );

    const snap =
      await db
        .collection(
          "order_tracking_by_phone"
        )
        .doc(phoneHash)
        .collection("orders")
        .orderBy(
          "createdAt",
          "desc"
        )
        .limit(20)
        .get();

    if (snap.empty) {
      resultBox.innerHTML = `
        <div
          style="
            padding:16px;
            border:1px solid #392328;
            border-radius:12px;
            background:#171012;
            color:#d77b74;
            font-size:13px;
            line-height:1.8;
          "
        >
          لم يتم العثور على طلبات مرتبطة بهذا الرقم.

          <br>

          <small
            style="color:#8f777b;"
          >
            تأكد من استخدام نفس رقم الهاتف
            الذي أدخلته عند إتمام الطلب.
          </small>
        </div>
      `;

      return;
    }

    const orders =
      snap.docs.map(
        d => d.data()
      );

    const steps = [
      "جديد",
      "قيد التجهيز",
      "تم الشحن",
      "تم التسليم"
    ];

    resultBox.innerHTML =
      orders
        .map(o => {
          const currentIdx =
            steps.indexOf(
              o.status
            );

          const payment =
            o.payment || {};

          let paymentBox = "";

          if (
            payment.status ===
            "rejected"
          ) {
            paymentBox = `
              <div
                style="
                  margin-top:12px;
                  padding:12px;
                  border:1px solid #5a2929;
                  border-radius:10px;
                  background:#1a1011;
                  color:#e38a83;
                  font-size:11px;
                  line-height:1.8;
                "
              >
                <strong>
                  خطأ في الدفع
                </strong>

                <br>

                لم يتم تأكيد عملية الدفع.
                تواصل مع الإدارة.

                ${
                  payment.rejectionReason
                    ? `
                      <br>
                      السبب:
                      ${escapeHtml(
                        payment.rejectionReason
                      )}
                    `
                    : ""
                }
              </div>
            `;
          } else if (
            payment.status ===
            "pending"
          ) {
            paymentBox = `
              <div
                style="
                  margin-top:12px;
                  padding:12px;
                  border:1px solid #4b3d21;
                  border-radius:10px;
                  background:#15120c;
                  color:#d8c28c;
                  font-size:11px;
                "
              >
                ⏳ إثبات الدفع قيد المراجعة من الإدارة.
              </div>
            `;
          } else if (
            payment.status ===
            "approved"
          ) {
            paymentBox = `
              <div
                style="
                  margin-top:12px;
                  padding:12px;
                  border:1px solid #294b35;
                  border-radius:10px;
                  background:#101a14;
                  color:#83cf9d;
                  font-size:11px;
                "
              >
                ✓ تم تأكيد الدفع.
              </div>
            `;
          }

          const items =
            Array.isArray(
              o.items
            )
              ? o.items
              : [];

          return `
            <div
              style="
                border:1px solid var(--line);
                border-radius:14px;
                background:#111014;
                overflow:hidden;
                margin-bottom:12px;
              "
            >

              <div
                style="
                  padding:15px 17px;
                  border-bottom:1px solid var(--line);
                  display:flex;
                  justify-content:space-between;
                  gap:10px;
                  align-items:center;
                "
              >

                <div>

                  <small
                    style="
                      display:block;
                      color:#77717b;
                      font-size:9px;
                    "
                  >
                    رقم الطلب
                  </small>

                  <strong
                    style="
                      font-family:Inter;
                      color:var(--gold-soft);
                      font-size:13px;
                      word-break:break-all;
                    "
                  >
                    ${escapeHtml(
                      o.orderId
                    )}
                  </strong>

                </div>

                <span
                  style="
                    padding:6px 10px;
                    border-radius:999px;
                    background:${
                      o.status ===
                      "تم التسليم"
                        ? "#13251b"
                        : o.status ===
                          "ملغي"
                        ? "#2b1818"
                        : "#2a2315"
                    };
                    color:${
                      o.status ===
                      "تم التسليم"
                        ? "#63ba85"
                        : o.status ===
                          "ملغي"
                        ? "#dc7770"
                        : "#d9b158"
                    };
                    font-size:9px;
                    font-weight:800;
                    white-space:nowrap;
                  "
                >
                  ${escapeHtml(
                    o.status ||
                      "جديد"
                  )}
                </span>

              </div>

              <div
                style="
                  padding:15px 17px;
                "
              >

                <div
                  style="
                    display:grid;
                    gap:7px;
                    margin-bottom:15px;
                  "
                >

                  ${steps
                    .map(
                      (st, i) => `
                        <div
                          style="
                            display:flex;
                            align-items:center;
                            gap:9px;
                            opacity:${
                              i <=
                              currentIdx
                                ? 1
                                : 0.35
                            };
                          "
                        >

                          <div
                            style="
                              width:9px;
                              height:9px;
                              border-radius:50%;
                              background:${
                                i <=
                                currentIdx
                                  ? "var(--gold)"
                                  : "var(--line)"
                              };
                            "
                          ></div>

                          <span
                            style="
                              font-size:11px;
                            "
                          >
                            ${escapeHtml(
                              st
                            )}
                          </span>

                        </div>
                      `
                    )
                    .join("")}

                </div>

                ${paymentBox}

                <div
                  style="
                    border-top:1px solid var(--line);
                    padding-top:12px;
                  "
                >

                  ${items
                    .map(
                      i => `
                        <div
                          style="
                            display:flex;
                            justify-content:space-between;
                            gap:10px;
                            font-size:11px;
                            padding:6px 0;
                          "
                        >

                          <span>
                            ${escapeHtml(
                              i.name ||
                                "منتج"
                            )}
                            ×
                            ${
                              Number(
                                i.qty
                              ) || 0
                            }
                          </span>

                          <strong
                            style="
                              color:var(--gold-soft);
                            "
                          >
                            ${fmtPrice(
                              (Number(
                                i.price
                              ) || 0) *
                                (Number(
                                  i.qty
                                ) || 0)
                            )}
                          </strong>

                        </div>
                      `
                    )
                    .join("")}

                  <div
                    style="
                      display:flex;
                      justify-content:space-between;
                      border-top:1px solid var(--line);
                      margin-top:7px;
                      padding-top:10px;
                      font-weight:800;
                      font-size:12px;
                    "
                  >

                    <span>
                      الإجمالي
                    </span>

                    <strong
                      style="
                        color:var(--gold-soft);
                      "
                    >
                      ${fmtPrice(
                        o.total || 0
                      )}
                    </strong>

                  </div>

                </div>

              </div>

            </div>
          `;
        })
        .join("");

  } catch (e) {
    console.error(
      "Track order error:",
      e
    );

    resultBox.innerHTML = `
      <p
        style="
          color:var(--danger);
          font-size:13px;
        "
      >
        تعذر البحث حاليًا.
        حاول مرة أخرى.
      </p>
    `;
  }
}

/* ============================================================
   HTML Escape
   ============================================================ */

function escapeHtml(v) {
  return String(
    v ?? ""
  ).replace(
    /[&<>"']/g,
    m =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[m])
  );
}

/* ============================================================
   Page Load
   ============================================================ */

window.addEventListener(
  "load",
  () => {
    if (location.hash === "#cart") { setTimeout(openCart, 180); }

    if (
      location.hash ===
        "#checkout" &&
      cart.length
    ) {
      setTimeout(
        openCheckout,
        250
      );
    }

    renderCart();
    updateCartBadge();
  }
);

window.addEventListener("storage", event => {
  if (event.key !== "luxtech_cart") return;
  try {
    cart = normalizeCartItems(JSON.parse(event.newValue || "[]"));
  } catch (_) {
    cart = [];
  }
  renderCart();
});

/* ============================================================
   Toast
   ============================================================ */

let toastTimer;

function showToast(msg) {
  const t =
    document.getElementById(
      "toast"
    );

  if (!t) return;

  t.textContent = msg;

  t.classList.add("show");

  clearTimeout(
    toastTimer
  );

  toastTimer = setTimeout(
    () =>
      t.classList.remove(
        "show"
      ),
    2200
  );
}