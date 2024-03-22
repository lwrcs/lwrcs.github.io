// click.js
document.addEventListener('DOMContentLoaded', function () {
    const videos = document.querySelectorAll('.vid');

    videos.forEach(video => {
        let isPaused = true;

        video.addEventListener('click', () => {
            if (isPaused) {
                video.style.transition = 'filter 0.3s ease'; // Add a smooth transition effect
                video.style.filter = 'brightness(1)'; // Restore full brightness when video is clicked
                isPaused = false;
            } else {
                video.style.filter = 'brightness(0.1)'; // Darken the video when it's paused
                isPaused = true;
            }
        });

        video.addEventListener('play', () => {
            video.style.filter = 'brightness(1)'; // Restore full brightness when video is played
            isPaused = false;
        });

        video.addEventListener('pause', () => {
            if (isPaused) {
                video.style.filter = 'brightness(0.1)'; // Darken the video when it's paused
            }
        });
    });
});
