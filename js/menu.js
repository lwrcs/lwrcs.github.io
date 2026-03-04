// menu.js — Shared navigation menu injection + scroll hide/show
// Populates both desktop nav and mobile dropdown
// Uses DOMContentLoaded to ensure DOM is ready

document.addEventListener("DOMContentLoaded", function () {
  // --- Menu injection ---
  var baseTag = document.querySelector("base");
  var prefix = baseTag ? "" : "";

  var menuHTML =
    '<li><a href="' + prefix + 'visuals/index.html">Visuals</a></li>' +
    '<!--<li><a href="' + prefix + 'music/index.html">Music</a></li>-->';

  var menuDiv = document.querySelector(".nav-wrap nav ul");
  var dropMenuDiv = document.querySelector("ul.dropdown-menu");

  if (menuDiv) menuDiv.innerHTML = menuHTML;
  if (dropMenuDiv) dropMenuDiv.innerHTML = menuHTML;

  // --- Scroll hide/show for nav ---
  var navWrap = document.querySelector(".nav-wrap");
  if (!navWrap) return;

  var lastScrollY = window.pageYOffset;
  var ticking = false;

  function onScroll() {
    var currentScrollY = window.pageYOffset;

    if (currentScrollY <= 0) {
      // Always show at the very top
      navWrap.style.opacity = "1";
      navWrap.style.pointerEvents = "";
    } else if (currentScrollY < lastScrollY) {
      // Scrolling up — fade in
      navWrap.style.opacity = "1";
      navWrap.style.pointerEvents = "";
    } else {
      // Scrolling down — fade out
      navWrap.style.opacity = "0";
      navWrap.style.pointerEvents = "none";
    }

    lastScrollY = currentScrollY;
    ticking = false;
  }

  window.addEventListener("scroll", function () {
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  });
});
