function rectangularCollision({
    rectangle1,
    rectangle2
}){
    return (
        rectangle1.attackBox.position.x + rectangle1.attackBox.width >=
        rectangle2.position.x && rectangle1.attackBox.position.x <= rectangle2.position.x + rectangle2.width &&
        rectangle1.attackBox.position.y + rectangle1.attackBox.height >= rectangle2.position.y && 
        rectangle1.attackBox.position.y <= rectangle2.position.y + rectangle2.height
    )
}


function determineWinner({ player, enemy, timerId }) {
    clearTimeout(timerId);
    document.querySelector('#displayText').style.display = 'flex';

    if (player.health === enemy.health) {
        document.querySelector('#displayText').innerHTML = 'TIE';
    } else if (player.health > enemy.health) {
        document.querySelector('#displayText').innerHTML = 'Lucy Wins';
        player.switchSprite('Winner');
        player.isWinning = true;
        enemy.switchSprite('death'); // Player 2 loses
    } else if (enemy.health > player.health) {
        document.querySelector('#displayText').innerHTML = 'Lumina Wins';
        enemy.switchSprite('Winner');
        enemy.isWinning = true;
        player.switchSprite('death'); // Player 1 loses
    }

    window.gameEnded = true;
    
}

let timer = 100
let timerId
let isAnimationStarted = false;

function decreaseTimer() {
    if (timer > 0) {
        timerId = setTimeout(decreaseTimer, 1000)
        timer--
        document.querySelector('#timer').innerHTML = timer

        // If timer is in the last 10 seconds and animation has not started
        if (timer <= 10 && !isAnimationStarted) {
            isAnimationStarted = true; // Set the flag to true

            // Start the animation
            gsap.to("#timer", { 
                scale: 1.1, 
                duration: 1, 
                color: "red",
                yoyo: true, 
                repeat: timer - 1, // Repeat only for the remaining seconds
                ease: "power1.inOut"
            });
        }
    }

    if (timer === 0){
        determineWinner({player,enemy, timerId})
    }
}
