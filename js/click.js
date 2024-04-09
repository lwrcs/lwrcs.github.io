// click.js
document.addEventListener('DOMContentLoaded', function () {
    const videos = document.querySelectorAll('.vid');

    videos.forEach(video => {

        video.addEventListener('play', () => {
            video.style.filter = 'brightness(1)'; // Restore full brightness when video is played
        });

        video.addEventListener('pause', () => {
                video.style.filter = ''; // Darken the video when it's paused
        });
    });
});
