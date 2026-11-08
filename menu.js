
/* Kanal-Radio Amels – Zentrale Menüsteuerung */

document.addEventListener("DOMContentLoaded", async function () {

  const menuContainer = document.getElementById("menu-container");

  if (!menuContainer) {
    return;
  }

  try {
    // Zentrales Menü laden
    const response = await fetch("/KanalRadioAmelsDaily/menu.html");

    if (!response.ok) {
      throw new Error("Menü konnte nicht geladen werden");
    }

    const menuHTML = await response.text();
    menuContainer.innerHTML = `
      <button
        class="menu"
        id="menu-button"
        type="button"
        aria-expanded="false"
        aria-controls="menu-dropdown">
        Menü ☰
      </button>
      ${menuHTML}
    `;

    const menuButton = document.getElementById("menu-button");
    const menuDropdown = document.getElementById("menu-dropdown");

    // Aktuellen Sender automatisch markieren
    const currentPath = window.location.pathname;

    menuDropdown.querySelectorAll("a").forEach(function (link) {
      if (link.pathname === currentPath ||
          link.pathname.replace(/index\.html$/, "") === currentPath.replace(/index\.html$/, "")) {
        link.setAttribute("aria-current", "page");
      }
    });

    // Menü öffnen und schließen
    function closeMenu() {
      menuDropdown.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    }

    menuButton.addEventListener("click", function () {
      const isOpen = menuDropdown.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(isOpen));
    });

    // Schließen beim Klick außerhalb
    document.addEventListener("click", function (event) {
      if (!menuContainer.contains(event.target)) {
        closeMenu();
      }
    });

    // Schließen mit Escape
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" &&
          menuDropdown.classList.contains("open")) {
        closeMenu();
        menuButton.focus();
      }
    });

  } catch (error) {
    console.error("Kanal-Radio Menüfehler:", error);
    menuContainer.textContent = "Menü nicht verfügbar";
  }

});
