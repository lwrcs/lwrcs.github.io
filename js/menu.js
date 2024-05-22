window.onload = function() {
    const menuDiv = document.querySelector('.nav-wrap nav ul');
    const dropMenuDiv = document.querySelector('ul.dropdown-menu')
    const menuHTML = `
        <!--<li><a href="about/">About Me</a></li>-->
        <li><a href="visuals/">Visuals</a></li>
        <!--<li><a href="music/">Music</a></li>-->
    `;
    menuDiv.innerHTML = menuHTML;
    dropMenuDiv.innerHTML = menuHTML;
}