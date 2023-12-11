const canvas = document.querySelector('canvas');
const c = canvas.getContext('2d');
canvas.width = 1024;
canvas.height = 576;

c.fillRect(0, 0, canvas.width, canvas.height);

const gravity = .7;
const jumpThreshold = 330;

const background = new Sprite({
    position: { x: 0, y:0 },
    imageSrc: './img/Stage.png',
    framesMax: 24
});

const player = new Fighter({
    position: { x:0, y:-50 },
    velocity: { x: 0, y: 0 },
    offset: { x: 0, y: 157 },
    imageSrc: './img/P1/LucyIdle.png',
    framesMax: 8,
    jumpCount: 0,
    scale: .4,
    isJumping: false,
    sprites: {
        idle: { imageSrc: './img/P1/LucyIdle.png', framesMax: 8 },
        run: { imageSrc: './img/P1/LucyRun.png', framesMax: 8 },
        jump: { imageSrc: './img/P1/LucyJump.png', framesMax: 5 },
        fall: { imageSrc: './img/P1/LucyFall.png', framesMax: 5 },
        attack1: { imageSrc: './img/P1/LucyAttack.png', framesMax: 5 },
        takeHit: { imageSrc: './img/P1/LucyHit.png', framesMax: 3 },
        death: { imageSrc: './img/P1/LucyDeath.png', framesMax: 8 },
        block: { imageSrc: './img/P1/LucyBlock.png', framesMax: 9 },
        blockHit: { imageSrc: './img/P1/LucyBlockHit.png', framesMax: 3 },
        Winner: { imageSrc: './img/P1/LucyWinner.png', framesMax: 14 }
    },
    attackBox: {
        offset: { x: 50, y: 50 },
        width: 150,
        height: 50
    }
});

const enemy = new Fighter({
    position: { x:550, y:-100 },
    velocity: { x: 0, y: 0 },
    jumpCount:0,
    color: 'blue',
    offset: { x: -50, y: 0 },
    imageSrc: './img/P2/LuminaIdle.png',
    framesMax: 8,
    scale: .4,
    offset: { x: -40, y: 157 },
    sprites: {
        idle: { imageSrc: './img/P2/LuminaIdle.png', framesMax: 8 }, //done
        run: { imageSrc: './img/P2/LuminaRunL.png', framesMax: 8 }, //done
        jump: { imageSrc: './img/P2/LuminaJump.png', framesMax: 5 }, //done
        fall: { imageSrc: './img/P2/LuminaFall.png', framesMax: 5 }, //done
        attack1: { imageSrc: './img/P2/LuminaAttack.png', framesMax: 5 },
        takeHit: { imageSrc: './img/P2/LuminaHit.png', framesMax: 3 }, 
        death: { imageSrc: './img/P2/LuminaDeath.png', framesMax: 8 }, //done
        block: { imageSrc: './img/P2/LuminaBlock.png', framesMax: 9 }, //done
        blockHit: { imageSrc: './img/P2/BlockHit.png', framesMax: 3 }, //done
        Winner: { imageSrc: './img/P2/LuminaWinner.png', framesMax: 14 },
    },
    attackBox: {
        offset: { x: -170, y: 50 },
        width: 170,
        height: 50
    }
});

enemy.draw();

const keys = {
    a: { pressed: false },
    d: { pressed: false },
    w: { pressed: false },
    ArrowRight: { pressed: false },
    ArrowLeft: { pressed: false },
    ArrowUp: { pressed: false },
    b: { pressed: false },
    '0': { pressed: false },
    'c': { pressed: false }
};

decreaseTimer();

let jumpSpriteCreated = false;

function createJumpSprite(x, y) {
    const jumpX = x + 100;
    const jumpY = y - 35;

    let frame = 0;
    const numFrames = 24; // Adjust according to the number of frames in your sprite sheet
    const frameWidth = 200; // Adjust according to your sprite sheet
    const frameHeight = 200; // Adjust according to your sprite sheet

    function drawJumpSprite() {
        // Draw the animated jump sprite
        const spriteImage = new Image();
        spriteImage.src = './img/DoubleJump.png';

        c.drawImage(
            spriteImage,
            frame * frameWidth,
            0,
            frameWidth,
            frameHeight,
            jumpX,
            jumpY,
            frameWidth,
            frameHeight
        );

        frame++;

        if (frame < numFrames) {
            // Continue the animation with the adjusted frame rate
            requestAnimationFrame(drawJumpSprite);
        } 
    }

    // Start the animation
    drawJumpSprite();
}
function animate() {

    window.requestAnimationFrame(animate);
    c.fillStyle = 'black';
    c.fillRect(0, 0, canvas.width, canvas.height);
    background.update();
    player.update();
    enemy.update();

    player.velocity.x = 0;
    enemy.velocity.x = 0;

    
    if (player.velocity.y < 0 && player.jumpCount === 2 && !playerJumpSpriteCreated) {
        createJumpSprite(player.position.x, player.position.y);
        playerJumpSpriteCreated = true;
    } else if (player.velocity.y >= 0) {
        playerJumpSpriteCreated = false; // Reset the flag when the player is not jumping
    }

    // Enemy jump sprite with an offset
    if (enemy.velocity.y < 0 && enemy.jumpCount === 2 && !enemyJumpSpriteCreated) {
        createJumpSprite(enemy.position.x + 54, enemy.position.y -10); // Adjust the Y offset for the enemy
        enemyJumpSpriteCreated = true;
    } else if (enemy.velocity.y >= 0) {
        enemyJumpSpriteCreated = false; // Reset the flag when the enemy is not jumping
    }


    if (player.isWinning) {
        if (player.framesCurrent < player.sprites.Winner.framesMax - 2) {
            // Slow down animation by only incrementing framesCurrent every 2nd frame
            if (player.framesCurrent % 8 === 0) {
                player.framesCurrent++;
            }
        }
        // Stop the animation on the last frame
        player.framesCurrent = Math.min(player.framesCurrent, player.sprites.Winner.framesMax - 2);
    }

    if (enemy.isWinning) {
        // Check if the enemy has started winning and reached the end of its winning animation
        if (enemy.framesCurrent < enemy.sprites.Winner.framesMax - 2) {
            // Slow down animation by only incrementing framesCurrent every 2nd frame
            if (enemy.framesCurrent % 8 === 0) {
                enemy.framesCurrent++;
            }
        }
        // Stop the animation on the last frame
        enemy.framesCurrent = Math.min(enemy.framesCurrent, enemy.sprites.Winner.framesMax - 2);
    }

    // player 1 movement
    if (keys.a.pressed && player.lastKey === 'a') {
        player.velocity.x = -5;
        player.switchSprite('run');
    } else if (keys.d.pressed && player.lastKey === 'd') {
        player.velocity.x = 5;
        player.switchSprite('run');
    } else {
        player.switchSprite('idle');
    }
    if (player.velocity.y < 0) {
        player.switchSprite('jump');
    } else if (player.velocity.y > 0) {
        player.switchSprite('fall');
    }

    // enemy movement
    if (keys.ArrowLeft.pressed && enemy.lastKey === 'ArrowLeft') {
        enemy.velocity.x = -5;
        enemy.switchSprite('run');
    } else if (keys.ArrowRight.pressed && enemy.lastKey === 'ArrowRight') {
        enemy.velocity.x = 5;
        enemy.switchSprite('run');
    } else {
        enemy.switchSprite('idle');
    }
    if (enemy.velocity.y < 0) {
        enemy.switchSprite('jump');
    } else if (enemy.velocity.y > 0) {
        enemy.switchSprite('fall');
    }

    // Collision and damage handling
    if (
        rectangularCollision({ rectangle1: player, rectangle2: enemy }) &&
        player.isAttacking && player.framesCurrent === 3
    ) {
        console.log('Player 2 Hit');
        enemy.takeHit();
        player.isAttacking = false;
        gsap.to('#p2HP', { width: enemy.health + '%' });
    }

    // Check if blocking is false and switch sprite accordingly
    if (!keys.b.pressed && player.isBlocking) {
        player.isBlocking = false;
    }
    if (!keys['0'].pressed && enemy.isBlocking) {
        enemy.isBlocking = false;
    }

    // if player misses
    if (player.isAttacking && player.framesCurrent === 3) {
        player.isAttacking = false;
    }

    if (
        rectangularCollision({ rectangle1: enemy, rectangle2: player }) &&
        enemy.isAttacking && enemy.framesCurrent === 2
    ) {
        console.log('Player  Hit');
        player.takeHit();
        enemy.isAttacking = false;
        gsap.to('#p1HP', { width: player.health + '%' });
    }

    // if enemy misses
    if (enemy.isAttacking && enemy.framesCurrent === 2) {
        enemy.isAttacking = false;
    }
  if (window.gameEnded) {
        return; // Stop the animation if the game has ended
    }

    // end game based on health
    if (enemy.health <= 0 || player.health <= 0) {
        determineWinner({ player, enemy, timerId });
    }
    if (player.velocity.y === 0) {
        player.jumpCount = 0;
    }
    if (enemy.velocity.y === 0) {
        enemy.jumpCount = 0;
    }

    
}


animate();


window.addEventListener('keydown', (event) => {
    if (window.gameEnded) {
        return; // Prevent character movement if the game has ended
    }
    // existing keydown event handling code

    switch (event.key) {
        case 'd':
            keys.d.pressed = true;
            player.lastKey = 'd';
            break;
        case 'a':
            keys.a.pressed = true;
            player.lastKey = 'a';
            break;
        case 'w':
                if (player.jumpCount === 0) {
                    player.velocity.y = -16; 
                    player.jumpCount++;
                } else if (player.jumpCount === 1) {
                    player.velocity.y = -14; 
                    player.jumpCount++;
                }
            break;
        case 's':
                player.velocity.y = 13;
            break;
        case ' ':
            player.attack();
            break;
        case 'b':
            keys.b.pressed = true;
            player.block();
            break;
        case 'ArrowRight':
            keys.ArrowRight.pressed = true;
            enemy.lastKey = 'ArrowRight';
            break;
        case 'ArrowLeft':
            keys.ArrowLeft.pressed = true;
            enemy.lastKey = 'ArrowLeft';
            break;
        case 'ArrowUp':
            if (enemy.jumpCount === 0) {
                enemy.velocity.y = -16; 
                enemy.jumpCount++;
            } else if (enemy.jumpCount === 1) {
                enemy.velocity.y = -14; 
                enemy.jumpCount++;
            }
            break;
        case 'ArrowDown':
            enemy.velocity.y = 13
        break;
        case '.':
            enemy.attack();
            break;
        case '0':
            keys['0'].pressed = true;
            enemy.block();
            break;
            case 'c':
                keys['c'].pressed = true;
                var playerControlsContainer = document.querySelector('.playercontrolscontainer');
                var playerControlsBtn = document.querySelector('.playercontrols-btn');
                
                if (playerControlsContainer) {
                    playerControlsContainer.style.display = (playerControlsContainer.style.display === 'none') ? 'flex' : 'none';
                }
                
                if (playerControlsBtn) {
                    playerControlsBtn.style.display = (playerControlsBtn.style.display === 'flex') ? 'none' : 'flex';
                }
                break;
    }
});

window.addEventListener('keyup', (event) => {
    if (event.key === '.') {
        keys['.'].pressed = false;
    }
    switch (event.key) {
        case 'd':
            keys.d.pressed = false;
            break;
        case 'a':
            keys.a.pressed = false;
            break;
        case 'w':
            keys.w.pressed = false;

            break;
        case 'b':
            keys.b.pressed = false;
            break;
        case 'ArrowRight':
            keys.ArrowRight.pressed = false;
            break;
        case 'ArrowLeft':
            keys.ArrowLeft.pressed = false;
            break;
        case 'ArrowUp':
            keys.ArrowUp.pressed = false;
            break;
        case '0':
            keys['0'].pressed = false;
            break;
    }
});

