// lazyLoad.js — Intersection Observer-based lazy loading for gallery videos
// Videos only load their source when they scroll into view.

function initLazyLoad() {
  const videos = document.querySelectorAll('.vid[data-src]');

  if (!videos.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const video = entry.target;
        const src = video.getAttribute('data-src');
        if (src) {
          video.innerHTML = `<source src="${src}" type="video/mp4" />`;
          video.removeAttribute('data-src');
          video.load();
        }
        observer.unobserve(video);
      }
    });
  }, {
    rootMargin: '200px 0px', // Start loading 200px before visible
    threshold: 0.01
  });

  videos.forEach(video => observer.observe(video));
}

document.addEventListener('projectsRendered', initLazyLoad);
