// click.js — Brightness control on play/pause
// Listens for 'projectsRendered' so it works with dynamically added videos

function initClickBrightness() {
  const videos = document.querySelectorAll('.vid');

  videos.forEach(video => {
    video.addEventListener('play', () => {
      video.style.filter = 'brightness(1)';
    });

    video.addEventListener('pause', () => {
      video.style.filter = '';
    });
  });
}

document.addEventListener('projectsRendered', initClickBrightness);
document.addEventListener('DOMContentLoaded', initClickBrightness);
