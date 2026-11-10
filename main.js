const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const products = [
    { id: 1, name: "هاتف ذكي حديث", category: "electronics", price: 130 },
    { id: 2, name: "طقم ملابس رجالي عصري", category: "fashion", price: 20 },
    { id: 3, name: "عطر ومستحضرات تجميل فاخرة", category: "beauty", price: 30 },
    { id: 4, name: "طقم أدوات مطبخ متكامل", category: "home", price: 45 }
];

window.onload = function() {
    loadProducts();
    updateCartCount();
    captureAffiliateRef();
    renderCartItems();
    loadAdminOrders();
};

function loadProducts() {
    const container = document.getElementById('products-container');
    if (!container) return;
    
    container.innerHTML = products.map(p => `
        <div class="product-card">
            <div style="background:#e2e8f0; height:120px; border-radius:6px; display:flex; align-items:center; justify-content:center; margin-bottom:10px; color:#64748b;">صورة المنتج</div>
            <h3>${p.name}</h3>
            <p class="price">${p.price} $</p>
            <button onclick="addToCart(${p.id})" class="btn-buy">إضافة إلى السلة</button>
        </div>
    `).join('');
}

function captureAffiliateRef() {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) localStorage.setItem('sadarah_ref', ref);
}

function addToCart(id) {
    let cart = JSON.parse(localStorage.getItem('sadarah_cart')) || [];
    const prod = products.find(p => p.id === id);
    cart.push(prod);
    localStorage.setItem('sadarah_cart', JSON.stringify(cart));
    updateCartCount();
    alert("تمت إضافة المنتج إلى السلة بنجاح!");
}

function updateCartCount() {
    let cart = JSON.parse(localStorage.getItem('sadarah_cart')) || [];
    const countEl = document.getElementById('cart-count');
    if (countEl) countEl.innerText = cart.length;
}

function renderCartItems() {
    const container = document.getElementById('cart-items-list');
    if (!container) return;
    
    let cart = JSON.parse(localStorage.getItem('sadarah_cart')) || [];
    if (cart.length === 0) {
        container.innerHTML = "<p>سلة التسوق فارغة حالياً.</p>";
        return;
    }

    let total = 0;
    container.innerHTML = `
        <ul style="list-style: none; padding: 0;">
            ${cart.map((item) => {
                total += item.price;
                return `<li style="padding: 8px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between;">
                    <span>${item.name}</span>
                    <strong>${item.price} $</strong>
                </li>`;
            }).join('')}
        </ul>
        <h3 style="margin-top: 15px; color: #059669;">الإجمالي الكلي: ${total} $</h3>
    `;
}

function toggleReceiptField() {
    const method = document.getElementById('payment_method').value;
    const transferInfo = document.getElementById('transfer-info');
    transferInfo.style.display = (method === 'cod') ? 'none' : 'block';
}

async function uploadFileToSupabase(fileInputId) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput || fileInput.files.length === 0) return null;

    const file = fileInput.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `receipts/receipt_${Date.now()}.${fileExt}`;

    const { error } = await supabaseClient.storage
        .from('platform-files') /* استخدام الحاوية الموجودة لديك مسبقاً[span_1](start_span)[span_1](end_span) */
        .upload(fileName, file);

    if (error) {
        console.error("خطأ في رفع الملف:", error.message);
        alert("فشل رفع الملف، يرجى المحاولة مرة أخرى.");
        return null;
    }

    const { data: publicUrlData } = supabaseClient.storage
        .from('platform-files')
        .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
}

async function submitOrderWithReceipt(e) {
    e.preventDefault();

    const name = document.getElementById('c_name').value;
    const phone = document.getElementById('c_phone').value;
    const address = document.getElementById('c_address').value;
    const paymentMethod = document.getElementById('payment_method').value;
    const affiliateRef = localStorage.getItem('sadarah_ref') || 'مباشر';

    let receiptUrl = "";

    if (paymentMethod !== 'cod') {
        alert("جاري رفع سند التحويل باسم عبدالرحمن عبدالله صالح الذماري...");
        receiptUrl = await uploadFileToSupabase('receipt_file');
        if (!receiptUrl) return;
    }

    const orderData = {
        customer_name: name,
        phone: phone,
        address: address,
        payment_method: paymentMethod,
        receipt_url: receiptUrl,
        affiliate_ref: affiliateRef,
        receiver_name: "عبدالرحمن عبدالله صالح الذماري"
    };

    const { error } = await supabaseClient
        .from('orders')
        .insert([orderData]);

    if (error) {
        alert("حدث خطأ أثناء حفظ الطلب: " + error.message);
    } else {
        alert("تم إرسال طلبك بنجاح! سيتم مراجعة سند التحويل وتأكيد التوصيل في ذمار قريباً.");
        localStorage.removeItem('sadarah_cart');
        window.location.href = 'index.html';
    }
}

async function loadAdminOrders() {
    const tableBody = document.getElementById('admin-orders-table');
    if (!tableBody) return;

    const { data: orders, error } = await supabaseClient
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("خطأ في جلب الطلبات:", error.message);
        return;
    }

    tableBody.innerHTML = orders.map(ord => `
        <tr>
            <td>${ord.customer_name}</td>
            <td>${ord.phone}</td>
            <td>${ord.address}</td>
            <td>${ord.payment_method}</td>
            <td>${ord.receipt_url ? `<a href="${ord.receipt_url}" target="_blank">عرض السند</a>` : 'دفع عند الاستلام'}</td>
            <td>${ord.affiliate_ref}</td>
        </tr>
    `).join('');
}

function loginAffiliate() {
    const phone = document.getElementById('aff_phone').value;
    if (!phone) {
        alert("يرجى إدخال رقم الهاتف");
        return;
    }
    document.getElementById('affiliate-login-box').style.display = 'none';
    document.getElementById('affiliate-dashboard').style.display = 'block';
    document.getElementById('dash-phone').innerText = phone;
    document.getElementById('ref-link').value = `https://sadarah.top/?ref=${phone}`;
}
