document.addEventListener("DOMContentLoaded", function () {
    var backToTopButton = document.getElementById("back-to-top");

    // Guard: not every page has a back-to-top button
    if (!backToTopButton) return;

    var isButtonVisible = false;

    // Show or hide the "Back to Top" button based on scroll position
    window.addEventListener("scroll", function () {
        var pageHeight = document.body.scrollHeight - window.innerHeight;
        var scrollPercentage = (window.pageYOffset / pageHeight) * 100;

        if (scrollPercentage > 10) {
            if (!isButtonVisible) {
                backToTopButton.style.opacity = 1;
                isButtonVisible = true;
            }
        } else {
            if (isButtonVisible) {
                backToTopButton.style.opacity = 0;
                isButtonVisible = false;
            }
        }
    });

    // Scroll to the top of the page when the button is clicked
    backToTopButton.addEventListener("click", function () {
        window.scroll({ top: 0, left: 0, behavior: "smooth" });
    });
});
