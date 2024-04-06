document.addEventListener('DOMContentLoaded', function () {
    var iframes = document.querySelectorAll('iframe');
    var overlays = document.querySelectorAll('.video-container .overlay');

    iframes.forEach(function (iframe, index) {
        var player = new Vimeo.Player(iframe);
        var overlay = overlays[index]; // Assuming each iframe has a corresponding overlay

        player.on('play', function () {
            overlay.style.opacity = '0'; // Prevent dimming by adjusting the opacity
        });

        player.on('pause', function () {
            overlay.style.opacity = ''; // Reset the opacity
        });
    });
});