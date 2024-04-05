window.onload = function() {
    const menuDiv = document.querySelector('.nav-wrap nav ul');
    const dropMenuDiv = document.querySelector('ul.dropdown-menu')
    const menuHTML = `
        <li><a href="#about">About Me</a></li>
        <li><a href="projects.html">Projects</a></li>
        <!--<li><a href="music.html">Music</a></li>-->
    `;
    menuDiv.innerHTML = menuHTML;
    dropMenuDiv.innerHTML = menuHTML;
}