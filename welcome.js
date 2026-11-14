(() => {
  const welcomeDialog = document.getElementById("memberWelcome");
  if (!welcomeDialog || typeof welcomeDialog.showModal !== "function") return;

  const dismissedKey = "urbann-attier-member-welcome-v1";
  let alreadyDismissed = false;
  try {
    alreadyDismissed = window.localStorage.getItem(dismissedKey) === "seen";
  } catch {
    // Continue to show the notice if browser storage is unavailable.
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

  const registerLink = document.getElementById("welcomeRegisterButton");
  registerLink?.addEventListener("click", rememberChoice);

  welcomeDialog.addEventListener("cancel", rememberChoice);
  if (!alreadyDismissed) welcomeDialog.showModal();
})();
