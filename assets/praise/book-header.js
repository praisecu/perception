/*
 * Connects the praisecu.com header to the book.
 * The site's light/dark switch drives Quarto's color scheme, and the
 * switch shows whichever scheme Quarto is using.
 */
(() => {
  const root = document.documentElement;

  /*
   * Quarto places included markup inside the text column, so move the
   * header, the phone tab bar and its menu to the top of the page.
   */
  const parts = [
    document.querySelector("header.modern-header"),
    document.querySelector("nav.mobile-bottom-nav"),
    document.getElementById("mobile-more-menu")
  ].filter(Boolean);

  parts.reverse().forEach((part) => document.body.prepend(part));

  // The site footer goes at the very end of the page.
  const footer = document.querySelector("footer.modern-footer");
  if (footer) document.body.append(footer);

  function currentScheme() {
    return document.body.classList.contains("quarto-dark") ? "dark" : "light";
  }

  function syncButtons() {
    const theme = currentScheme();
    const next = theme === "dark" ? "light" : "dark";
    const label = `Switch to ${next} mode`;

    root.dataset.theme = theme;

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.setAttribute("aria-pressed", String(theme === "dark"));
      const text = button.querySelector(".theme-toggle__label");
      if (text) text.textContent = label;
    });
  }

  function start() {
    syncButtons();

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        if (window.quartoToggleColorScheme) window.quartoToggleColorScheme();
        syncButtons();
      });
    });

    // Follow changes made elsewhere, such as the reader's system setting.
    new MutationObserver(syncButtons).observe(document.body, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
