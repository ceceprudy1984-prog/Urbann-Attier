(() => {
  const welcomeDialog = document.getElementById("memberWelcome");
  if (!welcomeDialog || typeof welcomeDialog.showModal !== "function") return;

  // Jeda sebelum panel benefit muncul setelah animasi pembuka selesai.
  const WELCOME_DIALOG_DELAY_MS = 260;
  const dismissedKey = "urbann-attier-member-welcome-v1";
  // Reuse the homepage client so auth helpers share a single session instance.
  const authClient = window.urbannSupabaseClient || null;

  let alreadyDismissed = false;
  try {
    alreadyDismissed = window.localStorage.getItem(dismissedKey) === "seen";
  } catch {
    // The notice can still work when browser storage is unavailable.
  }

  const rememberChoice = () => {
    try {
      window.localStorage.setItem(dismissedKey, "seen");
    } catch {
      // The current page still works when storage is blocked.
    }
  };

  welcomeDialog.querySelectorAll("[data-welcome-continue]").forEach((button) => {
    button.addEventListener("click", () => {
      rememberChoice();
      welcomeDialog.close();
    });
  });

  document.getElementById("welcomeRegisterButton")?.addEventListener("click", rememberChoice);
  welcomeDialog.addEventListener("cancel", rememberChoice);

  const showWelcomeAfterSplash = async () => {
    if (alreadyDismissed || welcomeDialog.open) return;

    // A persisted Supabase session means this visitor is already a member.
    // Members skip the promotion panel but still see the opening animation.
    if (authClient) {
      try {
        const { data, error } = await authClient.auth.getSession();
        if (!error && data?.session?.user) return;
      } catch {
        // If session lookup fails, show the benefits panel as a safe fallback.
      }
    }

    // A short pause after the curtain gives the homepage a calm transition
    // before the member benefits panel appears.
    window.setTimeout(() => {
      if (!alreadyDismissed && !welcomeDialog.open) welcomeDialog.showModal();
    }, WELCOME_DIALOG_DELAY_MS);
  };

  document.addEventListener("urbann:opening-finished", showWelcomeAfterSplash, { once: true });
  // Supports reduced-motion mode, where the splash finishes before this file loads.
  if (document.body.classList.contains("opening-finished")) showWelcomeAfterSplash();
})();
