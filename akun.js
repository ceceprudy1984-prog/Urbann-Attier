const accountConfig = window.URBANN_SUPABASE_CONFIG;
const accountClient = accountConfig?.url && accountConfig?.publishableKey && window.supabase?.createClient
  ? window.supabase.createClient(accountConfig.url, accountConfig.publishableKey)
  : null;

const authPanel = document.getElementById("authPanel");
const profilePanel = document.getElementById("profilePanel");
const accountTitle = document.getElementById("accountTitle");
const accountIntro = document.getElementById("accountIntro");
const accountStatus = document.getElementById("accountStatus");
const accountSwitch = document.getElementById("accountSwitch");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const newPasswordForm = document.getElementById("newPasswordForm");
const preferenceForm = document.getElementById("preferenceForm");
const profileStatus = document.getElementById("profileStatus");
const loginButton = document.getElementById("loginButton");
const registerButton = document.getElementById("registerButton");
const memberCelebration = document.getElementById("memberCelebration");

function showMemberCelebration() {
  if (memberCelebration && !memberCelebration.open) memberCelebration.showModal();
}

function setStatus(element, message = "", isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function getAccountRedirect(mode = "verified") {
  const url = new URL("akun.html", window.location.href);
  url.searchParams.set("mode", mode);
  const returnTo = new URLSearchParams(window.location.search).get("return");
  if (returnTo === "checkout") url.searchParams.set("return", "checkout");
  return url.href;
}

function showMode(mode) {
  authPanel.hidden = false;
  profilePanel.hidden = true;
  loginForm.hidden = mode !== "login";
  registerForm.hidden = mode !== "register";
  newPasswordForm.hidden = mode !== "new-password";
  setStatus(accountStatus);

  if (mode === "register") {
    accountTitle.textContent = "Buat akun pelanggan";
    accountIntro.textContent = "Daftar untuk membuat akun pelanggan Urbann Attier.";
    accountSwitch.innerHTML = 'Sudah punya akun? <button type="button" data-account-mode="login">Masuk</button>';
  } else if (mode === "new-password") {
    accountTitle.textContent = "Buat kata sandi baru";
    accountIntro.textContent = "Masukkan kata sandi baru untuk akun Anda.";
    accountSwitch.textContent = "";
  } else {
    accountTitle.textContent = "Masuk ke akun Anda";
    accountIntro.textContent = "Masuk untuk mengelola akun pelanggan Urbann Attier.";
    accountSwitch.innerHTML = 'Belum punya akun? <button type="button" data-account-mode="register">Daftar</button>';
  }
}

function friendlyAuthError(error) {
  const message = String(error?.message || "");
  if (/invalid login credentials/i.test(message)) return "Email atau kata sandi belum sesuai.";
  if (/email not confirmed/i.test(message)) return "Verifikasi email Anda terlebih dahulu melalui tautan yang kami kirim.";
  if (/user already registered/i.test(message)) return "Email ini sudah terdaftar. Silakan masuk.";
  if (/password should be at least/i.test(message)) return "Kata sandi harus terdiri dari minimal 8 karakter.";
  return message || "Permintaan belum berhasil. Silakan coba lagi.";
}

async function loadCustomerProfile(session) {
  authPanel.hidden = true;
  profilePanel.hidden = false;
  document.getElementById("profileEmail").textContent = session.user.email || "";
  setStatus(profileStatus, "Memuat pengaturan akun…");

  const { data, error } = await accountClient
    .from("customer_profiles")
    .select("email_marketing_opt_in")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    setStatus(profileStatus, "Pengaturan akun belum dapat dimuat. Pastikan migrasi akun pelanggan sudah diterapkan.", true);
    return;
  }

  document.getElementById("profileEmailConsent").checked = Boolean(data?.email_marketing_opt_in);
  setStatus(profileStatus);
}

async function handleAuthState(event, session) {
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  const returnToCheckout = new URLSearchParams(window.location.search).get("return") === "checkout";
  if (event === "PASSWORD_RECOVERY") {
    showMode("new-password");
    return;
  }
  if (session?.user) {
    if (memberCelebration) {
      const continueLink = memberCelebration.querySelector(".celebration-continue");
      if (continueLink) continueLink.href = returnToCheckout ? "checkout.html" : "index.html";
    }
    if (returnToCheckout && requestedMode !== "verified" && requestedMode !== "register") {
      window.location.replace("checkout.html");
      return;
    }
    await loadCustomerProfile(session);
    if (requestedMode === "verified") {
      showMemberCelebration();
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("mode");
      window.history.replaceState({}, "", cleanUrl);
    }
    return;
  }
  showMode(requestedMode === "register" ? "register" : "login");
  if (requestedMode === "verified") {
    setStatus(accountStatus, "Email sudah diverifikasi. Silakan masuk untuk menyelesaikan akses akun Anda.");
  }
}

if (!accountClient) {
  showMode("login");
  setStatus(accountStatus, "Koneksi Supabase belum tersedia. Muat ulang halaman beberapa saat lagi.", true);
} else {
  accountClient.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => handleAuthState(event, session), 0);
  });

  // INITIAL_SESSION from onAuthStateChange handles both a fresh visitor and
  // an existing session, avoiding duplicate profile requests on page load.
}

document.addEventListener("click", (event) => {
  const modeButton = event.target.closest("[data-account-mode]");
  if (!modeButton) return;
  event.preventDefault();
  const mode = modeButton.dataset.accountMode;
  const url = new URL(window.location.href);
  url.searchParams.set("mode", mode);
  window.history.replaceState({}, "", url);
  showMode(mode);
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!accountClient) return;
  const form = new FormData(loginForm);
  loginButton.disabled = true;
  setStatus(accountStatus, "Memeriksa akun…");
  const { error } = await accountClient.auth.signInWithPassword({
    email: String(form.get("email") || "").trim(),
    password: String(form.get("password") || ""),
  });
  loginButton.disabled = false;
  if (error) setStatus(accountStatus, friendlyAuthError(error), true);
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!accountClient) return;
  const form = new FormData(registerForm);
  if (!registerForm.reportValidity()) return;
  const password = String(form.get("password") || "");
  if (password !== String(form.get("passwordConfirm") || "")) {
    setStatus(accountStatus, "Kata sandi dan ulangannya belum sama.", true);
    return;
  }

  registerButton.disabled = true;
  setStatus(accountStatus, "Membuat akun dan mengirim tautan verifikasi…");
  const { data, error } = await accountClient.auth.signUp({
    email: String(form.get("email") || "").trim(),
    password,
    options: {
      emailRedirectTo: getAccountRedirect("verified"),
      data: {
        full_name: String(form.get("name") || "").trim(),
        phone: String(form.get("phone") || "").trim(),
        email_marketing_opt_in: form.get("emailMarketingConsent") === "on",
      },
    },
  });
  registerButton.disabled = false;

  if (error) {
    setStatus(accountStatus, friendlyAuthError(error), true);
    return;
  }
  if (data.session) {
    showMemberCelebration();
  } else {
    registerForm.reset();
    setStatus(accountStatus, "Akun dibuat. Periksa email Anda dan klik tautan verifikasi sebelum masuk.");
  }
});

document.getElementById("forgotPasswordButton").addEventListener("click", async () => {
  if (!accountClient) return;
  const email = document.getElementById("loginEmail").value.trim();
  if (!email) {
    setStatus(accountStatus, "Masukkan email Anda terlebih dahulu, lalu pilih lupa kata sandi.", true);
    return;
  }
  setStatus(accountStatus, "Mengirim tautan pemulihan…");
  const { error } = await accountClient.auth.resetPasswordForEmail(email, {
    redirectTo: getAccountRedirect("new-password"),
  });
  setStatus(accountStatus, error
    ? friendlyAuthError(error)
    : "Jika email terdaftar, tautan pemulihan akan dikirim. Periksa kotak masuk dan folder spam.", Boolean(error));
});

newPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!accountClient) return;
  const form = new FormData(newPasswordForm);
  if (!newPasswordForm.reportValidity()) return;
  const password = String(form.get("password") || "");
  if (password !== String(form.get("passwordConfirm") || "")) {
    setStatus(accountStatus, "Kata sandi dan ulangannya belum sama.", true);
    return;
  }
  const { error } = await accountClient.auth.updateUser({ password });
  if (error) {
    setStatus(accountStatus, friendlyAuthError(error), true);
    return;
  }
  newPasswordForm.reset();
  setStatus(accountStatus, "Kata sandi berhasil diperbarui. Akun Anda sudah dapat digunakan.");
});

preferenceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!accountClient) return;
  const button = preferenceForm.querySelector("button[type='submit']");
  button.disabled = true;
  setStatus(profileStatus, "Menyimpan pilihan email…");
  const { error } = await accountClient.rpc("set_customer_email_marketing_consent", {
    p_opted_in: document.getElementById("profileEmailConsent").checked,
  });
  button.disabled = false;
  setStatus(profileStatus, error
    ? "Pilihan belum tersimpan. Pastikan migrasi akun pelanggan sudah diterapkan."
    : "Pilihan email promosi berhasil disimpan.", Boolean(error));
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  if (!accountClient) return;
  const { error } = await accountClient.auth.signOut();
  if (error) setStatus(profileStatus, friendlyAuthError(error), true);
});
