// vimeoOverlay.js — Vimeo player overlay integration
// Only runs if the Vimeo SDK is loaded on the page

document.addEventListener('DOMContentLoaded', function () {
  if (typeof Vimeo === 'undefined' || !Vimeo.Player) return;

  const iframes = document.querySelectorAll('iframe');
  const overlays = document.querySelectorAll('.video-container .overlay');

  iframes.forEach(function (iframe, index) {
    const player = new Vimeo.Player(iframe);
    const overlay = overlays[index];
    if (!overlay) return;

    player.on('play', function () {
      overlay.style.opacity = '0';
    });

    player.on('pause', function () {
      overlay.style.opacity = '';
    });
  });
});
