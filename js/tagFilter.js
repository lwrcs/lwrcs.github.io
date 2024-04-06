function initializeFilters() {
  const filterButtons = document.querySelectorAll(".filter-button");
  const galleryItems = document.querySelectorAll(".video-container");

  let activeTag = null;
  let isAnimating = false;
  let animationTimeout;
  const tagFilterContainer = document.getElementById("tag-filter");

  function applyTagFilter(tag) {
    galleryItems.forEach((item) => {
      const tagsAttribute = item.getAttribute("data-tags");
      if (!tagsAttribute) {
        console.warn("Missing data-tags attribute on an item:", item);
        return;
      }
      const tags = tagsAttribute.split(" ");
      const shouldDisplay = tag === null || tags.includes(tag);
  
      item.classList.remove("animate-move-in");
      item.classList.add("animate-move-away");
  
      // Force restart of animation by removing and adding classes with a delay
      setTimeout(() => {
        // After the move-out animation, decide whether to display the item or not
        if (shouldDisplay) {
          item.classList.remove("animate-move-away");
          item.classList.add("animate-move-in");
          item.style.display = ""; // Reset to default display style or use 'block' if that's the original
        } else {
          item.classList.remove("animate-move-in");
          item.style.display = "none"; // Ensure the item is not displayed
        }
      }, 200); // This delay should match the duration of the "move out" animation
    });
  }

  function selectFilterBasedOnURL() {
    const hash = window.location.hash.substring(1);
    if (hash) {
      const targetButton = Array.from(filterButtons).find(button => button.getAttribute("data-tag") === hash);
      if (targetButton) {
        activeTag = hash;
        applyTagFilter(activeTag);
        targetButton.classList.add("active");
      }
    }
  }

  tagFilterContainer.addEventListener("click", function (event) {
    const target = event.target;
    if (!target.classList.contains("filter-button") || isAnimating) return;

    clearTimeout(animationTimeout);
    isAnimating = true;

    const tag = target.getAttribute("data-tag");
    if (activeTag !== tag) {
      filterButtons.forEach((btn) => {
        btn.classList.remove("active");
        btn.disabled = true;
      });
      target.classList.add("active");
      activeTag = tag;
    } else {
      target.classList.remove("active");
      activeTag = null;
    }
    galleryItems.forEach((item) => {
      if (!item.classList.contains("animate-move-away")) {
        setTimeout(() => {
          item.style.display = "none";
        }, 200);
      }
    });
    applyTagFilter(activeTag);

    animationTimeout = setTimeout(() => {
      filterButtons.forEach((btn) => (btn.disabled = false));
      isAnimating = false;
      galleryItems.forEach((item) => {
        if (item.classList.contains("animate-move-in")) {
          item.style.display = "block";
        }
      });
    }, 200);
  });

  // Call the new function to select the filter based on the URL hash
  selectFilterBasedOnURL();
}

document.addEventListener("DOMContentLoaded", initializeFilters);
window.initializeFilters = initializeFilters;

