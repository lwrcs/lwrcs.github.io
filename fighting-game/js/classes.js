class Sprite {
    constructor({ position, imageSrc, scale = 1, framesMax = 1, offset = { x: 0, y: 0 } }) {
        this.position = position;
        this.width = 50;
        this.height = 150;
        this.image = new Image();
        this.image.src = imageSrc;
        this.scale = scale;
        this.framesMax = framesMax;
        this.framesCurrent = 0;
        this.framesElapsed = 0;
        this.framesHold = 9;
        this.offset = offset;
    }

    draw() {
        c.drawImage(
            this.image,
            this.framesCurrent * (this.image.width / this.framesMax),
            0,
            this.image.width / this.framesMax,
            this.image.height,
            this.position.x - this.offset.x,
            this.position.y - this.offset.y,
            (this.image.width / this.framesMax) * this.scale,
            this.image.height * this.scale
        );
    }

    animateFrames() {
        this.framesElapsed++;
        if (this.framesElapsed % this.framesHold === 0) {
            if (this.framesCurrent < this.framesMax - 1) {
                this.framesCurrent++;
            } else {
                this.framesCurrent = 0;
            }
        }
    }

    update() {
        this.draw();
        this.animateFrames();
    }
}

class Fighter extends Sprite {
    constructor({
        position,
        velocity,
        color = 'yellow',
        imageSrc,
        scale = 1,
        framesMax = 1,
        offset = { x: 0, y: 0 },
        sprites,
        attackBox = { offset: {}, width: undefined, height: undefined },
        blockDamageReduction = 0.5,
        isWinning = false
    }) {
        super({
            position,
            imageSrc,
            scale,
            framesMax,
            offset
        });

        this.isInAir = false; 
        this.velocity = velocity;
        this.width = 50;
        this.height = 150;
        this.attackBox = {
            position: {
                x: this.position.x,
                y: this.position.y
            },
            offset: attackBox.offset,
            width: attackBox.width,
            height: attackBox.height
        };
        this.color = color;
        this.isAttacking = false;
        this.health = 100;
        this.framesCurrent = 0;
        this.framesElapsed = 0;
        this.framesHold = 9;
        this.sprites = sprites;
        this.isAttackInProgress = false;
        this.dead = false;
        this.isBlocking = false;
        this.blockDamageReduction = blockDamageReduction;
        this.isWinning = isWinning;

        for (const sprite in this.sprites) {
            sprites[sprite].image = new Image();
            sprites[sprite].image.src = sprites[sprite].imageSrc;
        }
    }

    update() {
        this.draw();
    
        const fallAreaStartXLeft = -150; // Adjust the start of the fall area on the left side
        const fallAreaStartXRight = 720; // Adjust the start of the fall area on the right side
    
        // Simulate falling by adjusting the player's offset for the left side
        if (this.velocity.y === 0 && this.position.x < fallAreaStartXLeft || this.velocity.y === 0 && this.position.x > fallAreaStartXRight) {
            this.offset.y -= 12;

    
                // Add a delay before setting health to 0
                setTimeout(() => {
                    this.health = 0; // Set health to 0 when falling off
    
                    // Determine the winner based on which character fell
                    if (this === player) {
                        determineWinner(enemy, player, timerId);
                    } else {
                        determineWinner(player, enemy, timerId);
                    }
                }, 1000); // Adjust the delay time as needed (in milliseconds)
               
            }
        

        if (!this.dead) this.animateFrames();

        this.attackBox.position.x = this.position.x + this.attackBox.offset.x;
        this.attackBox.position.y = this.position.y + this.attackBox.offset.y;

        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        // Gravity
        if (this.position.y + this.height + this.velocity.y >= canvas.height - 96) {
            this.velocity.y = 0;
            this.position.y = 330;
            if (this.isInAir) {
                this.isInAir = false;
            }
        } else {
            this.velocity.y += gravity;
            this.isInAir = true;
        }
    }

    attack() {
        if (!this.isAttacking && !this.isAttackInProgress && !this.isWinning) {
            this.isAttacking = true;
            this.switchSprite('attack1');
        }
    }

    block() {
        const isPlayerBlocking = !this.isPlayer;
        const isEnemyBlocking = !this.isEnemy;
        if (isPlayerBlocking || isEnemyBlocking) {
            if (!this.isBlocking) {
                this.isBlocking = true;
                this.switchSprite('block');
            }
        } else {
            if (this.isBlocking) {
                this.isBlocking = false;
            }
        }
    }
    takeHit() {
        let damage = 10;
    
        if (this.isBlocking) {
            damage *= this.blockDamageReduction;
        }
    
        this.health -= damage;
    
        if (this.health <= 0) {
            console.log('Player defeated!');
            this.switchSprite('death'); // Trigger death animation
            this.framesCurrent = 0;
            determineWinner({ player, enemy, timerId });
        } else {
            if (this.isBlocking) {
                this.switchSprite('blockHit');
            } else {
                // Adjust the position change based on whether it's the player or the enemy
                const isPlayer = player === this;
                const speed = 10; // Adjust the speed as needed
    
                // Calculate the diagonal velocity components
                const diagonalVelocityX = isPlayer ? -Math.cos(Math.PI / 4) * speed * 3: Math.cos(Math.PI / 4) * speed * 3;
                const diagonalVelocityY = -Math.sin(Math.PI / 4) * speed ; // Negative for upward direction
    
                this.switchSprite('takeHit');
                this.screenShake();
    
                // Set the diagonal velocity
                this.velocity.x = diagonalVelocityX;
                this.velocity.y = diagonalVelocityY;
            }
        }
    }

    screenShake() {
        const shakeMagnitude = 25;
        const shakeDuration = 0.1;
        const shakeDelay = 0.15;

        gsap.to('body', {
            duration: shakeDuration,
            x: () => Math.random() * shakeMagnitude - shakeMagnitude / 2,
            y: () => Math.random() * shakeMagnitude - shakeMagnitude / 2,
            ease: 'ease-in',
            repeat: 1,
            yoyo: true,
            delay: shakeDelay
        });
    }

    isJumping() {
        return this.velocity.y < 0;
    }

    isFalling() {
        return this.velocity.y > 0;
    }

    switchSprite(sprite) {
        
        
        if (this.image === this.sprites.death.image) {
            if (this.framesCurrent === this.sprites.death.framesMax - 1) this.dead = true;
            return;
        }

        if (this.image === this.sprites.Winner.image) {
            if (this.framesCurrent === this.sprites.Winner.framesMax - 1) this.Winner = true;
            return;
        }

        // Overriding all other animations with the attack animation
        if (this.isAttackInProgress && sprite !== 'Winner') return;

        // Override when fighter gets hit
        if (
            this.image === this.sprites.takeHit.image &&
            this.framesCurrent < this.sprites.takeHit.framesMax - 1
        )
            return;

        switch (sprite) {
            case 'idle':
                if (
                    this.image !== this.sprites.idle.image &&
                    !this.isJumping() &&
                    !this.isFalling() &&
                    !this.isBlocking &&
                    !this.isWinning
                ) {
                    this.image = this.sprites.idle.image;
                    this.framesMax = this.sprites.idle.framesMax;
                    this.framesCurrent = 0;
                }
                break;
            case 'run':
                if (this.image !== this.sprites.run.image) {
                    this.image = this.sprites.run.image;
                    this.framesMax = this.sprites.run.framesMax;
                    this.framesCurrent = 0;
                }
                break;
            case 'jump':
                if (this.image !== this.sprites.jump.image) {
                    this.image = this.sprites.jump.image;
                    this.framesMax = this.sprites.jump.framesMax;
                    this.framesCurrent = 0;
                }
                break;
            case 'fall':
                if (this.image !== this.sprites.fall.image) {
                    this.image = this.sprites.fall.image;
                    this.framesMax = this.sprites.fall.framesMax;
                    this.framesCurrent = 0;
                }
                break;
            case 'attack1':
                if (this.image !== this.sprites.attack1.image) {
                    this.image = this.sprites.attack1.image;
                    this.framesMax = this.sprites.attack1.framesMax;
                    this.framesCurrent = 0;
                    this.isAttackInProgress = true;

                    // Reset framesElapsed to 0 when starting a new attack animation
                    this.framesElapsed = 0;

                    // Use setInterval to check when the attack animation is complete
                    const intervalId = setInterval(() => {
                        if (this.framesElapsed >= this.framesMax * this.framesHold) {
                            this.isAttackInProgress = false;
                            this.framesElapsed = 0;
                            clearInterval(intervalId);
                        }
                    }, 10);
                }
                break;
            case 'takeHit':
                if (this.image !== this.sprites.takeHit.image) {
                    this.image = this.sprites.takeHit.image;
                    this.framesMax = this.sprites.takeHit.framesMax;
                    this.framesCurrent = 0;
                    this.framesElapsed = 0;
                }
                break;
            case 'death':
                if (this.image !== this.sprites.death.image) {
                    this.image = this.sprites.death.image;
                    this.framesMax = this.sprites.death.framesMax;
                    this.framesCurrent = 0;
                }
                break;
            case 'block':
                if (this.image !== this.sprites.block.image) {
                    this.image = this.sprites.block.image;
                    this.framesMax = this.sprites.block.framesMax;
                    this.framesCurrent = 0;
                    this.framesElapsed = 0;
                }
                break;
            case 'blockHit':
                if (this.image !== this.sprites.blockHit.image) {
                    this.image = this.sprites.blockHit.image;
                    this.framesMax = this.sprites.blockHit.framesMax;
                    this.framesCurrent = 0;
                    this.framesElapsed = 0;
                }
                break;
                case 'Winner':
                    if (!this.isWinning) {
                        this.isWinning = true;
                        this.image = this.sprites.Winner.image;
                        this.framesMax = this.sprites.Winner.framesMax;
                        this.framesCurrent = 0;
                        console.log('winning!');
                    }
                    break;
        }
    }
}