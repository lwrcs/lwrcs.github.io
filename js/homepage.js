// homepage.js — Scroll-reveal animations and hero parallax for the landing page

(function () {
  "use strict";

  // --- Scroll-reveal for sections ---
  // Elements with .reveal fade/slide in when they enter the viewport.
  document.addEventListener("DOMContentLoaded", function () {
    // Tag elements to reveal
    var revealSelectors = [
      ".section-title",
      ".featured-card",
      ".featured-view-all",
      ".about-text",
      ".service-item",
      ".music-callout-inner",
      ".site-footer .footer-inner"
    ];

    var revealEls = [];
    for (var i = 0; i < revealSelectors.length; i++) {
      var nodes = document.querySelectorAll(revealSelectors[i]);
      for (var j = 0; j < nodes.length; j++) {
        nodes[j].classList.add("reveal");
        revealEls.push(nodes[j]);
      }
    }

    if (!revealEls.length) return;

    // Stagger featured cards
    var cards = document.querySelectorAll(".featured-card.reveal");
    for (var k = 0; k < cards.length; k++) {
      cards[k].style.transitionDelay = (k * 0.1) + "s";
    }

    // Stagger service items
    var services = document.querySelectorAll(".service-item.reveal");
    for (var m = 0; m < services.length; m++) {
      services[m].style.transitionDelay = (m * 0.12) + "s";
    }

    // Intersection Observer for reveal
    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        for (var e = 0; e < entries.length; e++) {
          if (entries[e].isIntersecting) {
            entries[e].target.classList.add("reveal-visible");
            observer.unobserve(entries[e].target);
          }
        }
      }, { threshold: 0.15 });

      for (var n = 0; n < revealEls.length; n++) {
        observer.observe(revealEls[n]);
      }
    } else {
      // Fallback: just show everything
      for (var p = 0; p < revealEls.length; p++) {
        revealEls[p].classList.add("reveal-visible");
      }
    }

    // --- Hero parallax on scroll ---
    var heroContent = document.querySelector(".hero-content");
    var hero = document.querySelector(".hero");
    if (heroContent && hero) {
      var heroH = hero.offsetHeight;
      var ticking = false;

      window.addEventListener("scroll", function () {
        if (!ticking) {
          window.requestAnimationFrame(function () {
            var scrollY = window.pageYOffset;
            if (scrollY < heroH) {
              var ratio = scrollY / heroH;
              heroContent.style.transform = "translateY(" + Math.round(scrollY * 0.3) + "px)";
              heroContent.style.opacity = String(1 - ratio * 1.2);
            }
            ticking = false;
          });
          ticking = true;
        }
      });
    }
  });
})();
