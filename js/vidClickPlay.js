// vidClickPlay.js — Click-to-play for video containers
// Listens for 'projectsRendered' so it works with dynamically added videos

function initVidClickPlay() {
  const videoContainers = document.querySelectorAll('.video-container');

  videoContainers.forEach(container => {
    const video = container.querySelector('.vid');
    if (!video) return;

    video.style.pointerEvents = '';

    const playVideo = () => {
      video.play()
        .then(() => {
          video.style.pointerEvents = '';
          container.removeEventListener('click', playVideo);
        })
        .catch(error => console.error('Error trying to play the video:', error));
    };

    container.addEventListener('click', playVideo);
  });
}

document.addEventListener('projectsRendered', initVidClickPlay);
document.addEventListener('DOMContentLoaded', initVidClickPlay);
