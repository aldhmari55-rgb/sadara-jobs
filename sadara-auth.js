(function () {
    const AUTH_DB_URL = "https://lvutrzswngpkjfamgact.supabase.co";
    const AUTH_DB_KEY = "sb_publishable_fB8RmZyfymR8YpjLInA2LQ_hMA6qgRG";
    const authClient = window.supabase
        ? window.supabase.createClient(AUTH_DB_URL, AUTH_DB_KEY)
        : null;

    const SESSION_KEY = "sadara_unified_user_v1";
    const LOCAL_USERS_KEY = "sadara_local_users_cache_v1";
    const ATTEMPTS_KEY = "sadara_pin_attempts_v1";

    let authModalEl = null;
    let onAuthSuccessCallback = null;
    let isMandatoryLock = true;

    function normalizeDigits(raw) {
        return String(raw || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    }

    function normalizePhone(raw) {
        return normalizeDigits(raw).replace(/[^0-9]/g, "");
    }

    function normalizePin(raw) {
        return normalizeDigits(raw).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4);
    }

    function readLocalUsers() {
        try {
            return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || "[]");
        } catch (_) {
            return [];
        }
    }

    function writeLocalUser(userObj) {
        const list = readLocalUsers().filter(u => u.phone !== userObj.phone);
        list.unshift(userObj);
        localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(list));
    }

    function getSavedUser() {
        try {
            const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function saveUserSession(user, remember = true) {
        const cleanPhone = normalizePhone(user.phone);
        const clean = {
            id: user.id || Date.now(),
            full_name: user.full_name || "مستخدم صدارة",
            phone: cleanPhone,
            pin_code: normalizePin(user.pin_code || ""),
            is_affiliate: Boolean(user.is_affiliate),
            ref_code: user.ref_code || ("SADARA_" + cleanPhone.slice(-4))
        };

        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        if (remember) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(clean));
        } else {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(clean));
        }

        if (clean.phone) {
            localStorage.setItem("sadara_customer_phone", clean.phone);
            localStorage.setItem("sadara_student_phone", clean.phone);
            localStorage.setItem("sadara_logged_name", clean.full_name);
            localStorage.setItem("sadara_logged_phone", clean.phone);
            if (clean.is_affiliate) {
                localStorage.setItem("sadara_aff_phone", clean.phone);
            }
        }

        renderHeaderAccountControls();
        enforceAuthGate();
        window.dispatchEvent(new CustomEvent("sadara:auth-changed", { detail: clean }));
        return clean;
    }

    function logoutSadaraUser() {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem("sadara_customer_phone");
        localStorage.removeItem("sadara_student_phone");
        localStorage.removeItem("sadara_logged_name");
        localStorage.removeItem("sadara_logged_phone");
        renderHeaderAccountControls();
        window.dispatchEvent(new CustomEvent("sadara:auth-changed", { detail: null }));
        openSadaraAuthModal("login", null, true);
    }

    function checkLockout() {
        try {
            const state = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || "{}");
            if (state.lockUntil && Date.now() < state.lockUntil) {
                const sec = Math.ceil((state.lockUntil - Date.now()) / 1000);
                return `تم إدخال الرمز بشكل خاطئ عدة مرات. يرجى الانتظار ${sec} ثانية.`;
            }
        } catch (_) {}
        return "";
    }

    function recordFailedPinAttempt() {
        try {
            const state = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{"count":0}');
            state.count = (state.count || 0) + 1;
            if (state.count >= 5) {
                state.lockUntil = Date.now() + 45000;
                state.count = 0;
            }
            localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(state));
        } catch (_) {}
    }

    function resetPinAttempts() {
        localStorage.removeItem(ATTEMPTS_KEY);
    }

    function ensureModalStylesAndDom() {
        if (authModalEl) return;

        const style = document.createElement("style");
        style.textContent = `
            #sadaraAuthModal {
                display: none; position: fixed; inset: 0; z-index: 9999;
                background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(5px);
                align-items: center; justify-content: center; padding: 14px;
            }
            .sa-card {
                background: #fff; color: #0F172A; width: 100%; max-width: 440px;
                border-radius: 20px; padding: 20px; border: 1px solid #E2E8F0;
                box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
            }
            .sa-tabs {
                display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
                background: #F1F5F9; padding: 4px; border-radius: 12px; margin: 12px 0 14px;
            }
            .sa-tab {
                border: none; background: transparent; padding: 9px; border-radius: 9px;
                font-weight: 700; font-size: 13px; cursor: pointer; color: #475569;
            }
            .sa-tab.active {
                background: #fff; color: #2563EB; box-shadow: 0 2px 8px rgba(15,23,42,0.08);
            }
            .sa-field { margin-bottom: 11px; }
            .sa-field label { display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px; color: #0F172A; }
            .sa-input {
                width: 100%; padding: 10px 12px; border: 1px solid #CBD5E1;
                border-radius: 11px; font-size: 13.5px; background: #F8FAFC;
            }
            .sa-pin-input {
                width: 100%; padding: 11px 14px; border: 1.5px solid #2563EB; border-radius: 12px;
                font-size: 18px; font-weight: 700; letter-spacing: 8px; text-align: center;
                text-transform: uppercase; background: #EFF6FF; color: #0F172A;
            }
            .sa-submit {
                width: 100%; background: #2563EB; color: #fff; border: none;
                padding: 11px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer;
            }
            .sa-header-bar {
                display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;
            }
            .sa-account-badge {
                display: inline-flex; align-items: center; gap: 6px;
                background: #EFF6FF; color: #0F172A; border: 1px solid #BFDBFE;
                padding: 7px 11px; border-radius: 11px; font-size: 12px; font-weight: 700;
                cursor: pointer; white-space: nowrap;
            }
            .sa-logout-btn {
                display: inline-flex; align-items: center; gap: 5px;
                background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA;
                padding: 7px 10px; border-radius: 11px; font-size: 12px; font-weight: 700;
                cursor: pointer; white-space: nowrap;
            }
            .sa-login-btn {
                display: inline-flex; align-items: center; gap: 6px;
                background: #2563EB; color: #fff; border: none;
                padding: 7px 12px; border-radius: 11px; font-size: 12px; font-weight: 700;
                cursor: pointer; white-space: nowrap;
            }
        `;
        document.head.appendChild(style);

        authModalEl = document.createElement("div");
        authModalEl.id = "sadaraAuthModal";
        authModalEl.innerHTML = `
            <div class="sa-card" onclick="event.stopPropagation()">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:16px; font-weight:900; color:#0F172A;">حساب منصة صدارة الموحد</div>
                        <div style="font-size:12px; color:#64748B;">يجب تسجيل الدخول أو إنشاء حساب للمتابعة في المتجر والدورات</div>
                    </div>
                    <button type="button" id="saCloseBtn" style="display:none; border:none; background:#F1F5F9; width:32px; height:32px; border-radius:9px; font-weight:700; cursor:pointer;">✕</button>
                </div>

                <div class="sa-tabs">
                    <button type="button" class="sa-tab active" id="saTabLogin">تسجيل الدخول</button>
                    <button type="button" class="sa-tab" id="saTabRegister">إنشاء حساب جديد</button>
                </div>

                <div id="saLoginForm">
                    <div class="sa-field">
                        <label>رقم الجوال أو الاسم المسجل</label>
                        <input type="text" id="saLoginIdentifier" class="sa-input" placeholder="مثال: 780568507 أو اسمك الكامل">
                    </div>
                    <div class="sa-field">
                        <label>الرمز السريع (4 أرقام أو حروف)</label>
                        <input type="text" id="saLoginPin" class="sa-pin-input" maxlength="4" placeholder="A1B2">
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; font-size:12px;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
                            <input type="checkbox" id="saRememberChk" checked> تذكر دخولي على هذا الجهاز
                        </label>
                        <button type="button" id="saForgotBtn" style="border:none; background:none; color:#2563EB; font-weight:700; cursor:pointer;">نسيت الرمز؟</button>
                    </div>
                    <button type="button" id="saDoLoginBtn" class="sa-submit">دخول الحساب 🔓</button>
                </div>

                <div id="saRegisterForm" style="display:none;">
                    <div class="sa-field">
                        <label>الاسم الكامل</label>
                        <input type="text" id="saRegName" class="sa-input" placeholder="أدخل اسمك الكامل">
                    </div>
                    <div class="sa-field">
                        <label>رقم الجوال / الواتساب</label>
                        <input type="tel" id="saRegPhone" class="sa-input" placeholder="مثال: 780568507">
                    </div>
                    <div class="sa-field">
                        <label>اختر رمزاً سريعاً من 4 خانات (أرقام أو حروف)</label>
                        <input type="text" id="saRegPin" class="sa-pin-input" maxlength="4" placeholder="12AB">
                    </div>
                    <button type="button" id="saDoRegisterBtn" class="sa-submit" style="background:#10B981;">إنشاء الحساب الآن 🚀</button>
                </div>

                <div id="saMsgBox" style="margin-top:10px; font-size:12.5px; font-weight:700; text-align:center; min-height:18px;"></div>
            </div>
        `;
        document.body.appendChild(authModalEl);

        authModalEl.addEventListener("click", (e) => {
            if (!isMandatoryLock && e.target.id === "sadaraAuthModal") {
                closeSadaraAuthModal();
            }
        });

        document.getElementById("saCloseBtn").onclick = () => {
            if (!isMandatoryLock) closeSadaraAuthModal();
        };
        document.getElementById("saTabLogin").onclick = () => switchAuthMode("login");
        document.getElementById("saTabRegister").onclick = () => switchAuthMode("register");
        document.getElementById("saDoLoginBtn").onclick = handleLoginSubmit;
        document.getElementById("saDoRegisterBtn").onclick = handleRegisterSubmit;
        document.getElementById("saForgotBtn").onclick = () => {
            const msg = document.getElementById("saMsgBox");
            msg.style.color = "#2563EB";
            msg.textContent = "لاستعادة رمز الـ 4 خانات، تواصل مع الإدارة عبر واتساب (780568507) برقم جوالك المسجل.";
        };
    }

    function switchAuthMode(mode) {
        document.getElementById("saTabLogin").classList.toggle("active", mode === "login");
        document.getElementById("saTabRegister").classList.toggle("active", mode === "register");
        document.getElementById("saLoginForm").style.display = mode === "login" ? "block" : "none";
        document.getElementById("saRegisterForm").style.display = mode === "register" ? "block" : "none";
        document.getElementById("saMsgBox").textContent = "";
    }

    function openSadaraAuthModal(mode = "login", callback = null, mandatory = true) {
        ensureModalStylesAndDom();
        onAuthSuccessCallback = typeof callback === "function" ? callback : null;
        isMandatoryLock = mandatory;
        const closeBtn = document.getElementById("saCloseBtn");
        if (closeBtn) closeBtn.style.display = mandatory ? "none" : "inline-block";
        switchAuthMode(mode);
        authModalEl.style.display = "flex";
    }

    function closeSadaraAuthModal() {
        if (isMandatoryLock && !getSavedUser()) return;
        if (authModalEl) authModalEl.style.display = "none";
    }

    function enforceAuthGate() {
        const user = getSavedUser();
        if (!user) {
            openSadaraAuthModal("login", null, true);
        } else if (authModalEl) {
            authModalEl.style.display = "none";
        }
    }

    async function handleLoginSubmit() {
        const lockMsg = checkLockout();
        const msgEl = document.getElementById("saMsgBox");
        if (lockMsg) {
            msgEl.style.color = "#DC2626";
            msgEl.textContent = lockMsg;
            return;
        }

        const rawId = document.getElementById("saLoginIdentifier").value.trim();
        const pin = normalizePin(document.getElementById("saLoginPin").value);
        const remember = document.getElementById("saRememberChk").checked;

        if (!rawId || pin.length !== 4) {
            msgEl.style.color = "#DC2626";
            msgEl.textContent = "أدخل الاسم أو رقم الجوال والرمز المكون من 4 خانات.";
            return;
        }

        msgEl.style.color = "#2563EB";
        msgEl.textContent = "جاري التحقق من الحساب...";

        const cleanPhone = normalizePhone(rawId);
        let candidates = [];

        if (authClient) {
            try {
                let q = authClient.from("platform_users").select("*");
                q = cleanPhone.length >= 6 ? q.eq("phone", cleanPhone) : q.ilike("full_name", rawId);
                const { data } = await q.limit(5);
                candidates = data || [];
            } catch (_) {}
        }

        if (!candidates.length) {
            candidates = readLocalUsers().filter(u =>
                (cleanPhone.length >= 6 && u.phone === cleanPhone) ||
                u.full_name.toLowerCase() === rawId.toLowerCase()
            );
        }

        const matched = candidates.find(u => normalizePin(u.pin_code) === pin);
        if (!matched) {
            recordFailedPinAttempt();
            msgEl.style.color = "#DC2626";
            msgEl.textContent = "بيانات الدخول أو الرمز الرباعي غير صحيحة.";
            return;
        }

        resetPinAttempts();
        writeLocalUser(matched);
        const sessionUser = saveUserSession(matched, remember);
        msgEl.style.color = "#059669";
        msgEl.textContent = `أهلاً بك ${sessionUser.full_name} ✅`;
        setTimeout(() => {
            if (authModalEl) authModalEl.style.display = "none";
            if (onAuthSuccessCallback) onAuthSuccessCallback(sessionUser);
        }, 350);
    }

    async function handleRegisterSubmit() {
        const full_name = document.getElementById("saRegName").value.trim();
        const phone = normalizePhone(document.getElementById("saRegPhone").value);
        const pin_code = normalizePin(document.getElementById("saRegPin").value);
        const msgEl = document.getElementById("saMsgBox");

        if (!full_name || phone.length < 7 || pin_code.length !== 4) {
            msgEl.style.color = "#DC2626";
            msgEl.textContent = "يرجى إدخال الاسم، رقم الجوال الصحيح، ورمز من 4 أرقام أو حروف.";
            return;
        }

        msgEl.style.color = "#2563EB";
        msgEl.textContent = "جاري إنشاء حسابك الموحد...";

        const ref_code = "SADARA_" + phone.slice(-4);
        let savedRecord = { full_name, phone, pin_code, is_affiliate: false, ref_code, is_active: true };

        if (authClient) {
            try {
                const { data: existing } = await authClient
                    .from("platform_users")
                    .select("*")
                    .eq("phone", phone)
                    .maybeSingle();

                if (existing) {
                    msgEl.style.color = "#D97706";
                    msgEl.textContent = "هذا الرقم مسجل مسبقاً. انتقل إلى تبويب «تسجيل الدخول» وأدخل رمزك.";
                    return;
                }

                const { data: created } = await authClient
                    .from("platform_users")
                    .insert([savedRecord])
                    .select()
                    .single();

                if (created) {
                    savedRecord = created;
                }
            } catch (_) {}
        }

        writeLocalUser(savedRecord);
        const sessionUser = saveUserSession(savedRecord, true);
        msgEl.style.color = "#059669";
        msgEl.textContent = "تم إنشاء حسابك وحفظ رمزك بنجاح 🎉";
        setTimeout(() => {
            if (authModalEl) authModalEl.style.display = "none";
            if (onAuthSuccessCallback) onAuthSuccessCallback(sessionUser);
        }, 400);
    }

    async function promoteCurrentUserToAffiliate() {
        const user = getSavedUser();
        if (!user) {
            openSadaraAuthModal("register", promoteCurrentUserToAffiliate, true);
            return null;
        }
        const ref_code = user.ref_code || ("SADARA_" + user.phone.slice(-4));
        if (authClient && user.id) {
            try {
                await authClient.from("platform_users").update({ is_affiliate: true, ref_code }).eq("id", user.id);
                const { data: existingAff } = await authClient.from("affiliates").select("*").eq("phone", user.phone).maybeSingle();
                if (!existingAff) {
                    await authClient.from("affiliates").insert([{
                        full_name: user.full_name,
                        name: user.full_name,
                        phone: user.phone,
                        ref_code,
                        pending_earnings: 0,
                        settled_earnings: 0,
                        total_earnings: 0,
                        total_sales: 0
                    }]);
                }
            } catch (_) {}
        }
        const updated = { ...user, is_affiliate: true, ref_code };
        writeLocalUser(updated);
        return saveUserSession(updated, true);
    }

    function renderHeaderAccountControls() {
        const user = getSavedUser();
        document.querySelectorAll("[data-sadara-auth-btn]").forEach(el => {
            if (user) {
                el.innerHTML = `
                    <span class="sa-header-bar">
                        <button type="button" class="sa-account-badge" onclick="SadaraAuth.openModal('login', null, false)">👤 ${user.full_name}</button>
                        <button type="button" class="sa-logout-btn" onclick="SadaraAuth.logout()">خروج</button>
                    </span>
                `;
            } else {
                el.innerHTML = `
                    <span class="sa-header-bar">
                        <button type="button" class="sa-login-btn" onclick="SadaraAuth.openModal('login', null, true)">🔐 دخول / حساب</button>
                    </span>
                `;
            }
        });
    }

    window.SadaraAuth = {
        getUser: getSavedUser,
        openModal: openSadaraAuthModal,
        closeModal: closeSadaraAuthModal,
        logout: logoutSadaraUser,
        promoteToAffiliate: promoteCurrentUserToAffiliate,
        enforce: enforceAuthGate,
        normalizePhone,
        normalizePin
    };

    document.addEventListener("DOMContentLoaded", () => {
        ensureModalStylesAndDom();
        renderHeaderAccountControls();
        enforceAuthGate();
    });
})();
