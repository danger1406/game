/**
 * Neon Survivor - Main Entry Point
 */

// Game State
const state = {
    isRunning: false,
    isPaused: false,
    lastTime: 0,
    score: 0,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    player: null,
    enemies: [],
    projectiles: [],
    particles: [],
    xpOrbs: [],
    keys: {},
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    shake: 0,
    floatingTexts: [],
    difficulty: {
        name: 'normal',
        enemyHpMult: 1,
        enemySpeedMult: 1,
        playerDmgMult: 1
    },
    powerups: [],
    lasers: [], // Visual beams
    otherPlayers: {} // Multiplayer state
};

// Multiplayer Setup
const socket = io();

socket.on('currentPlayers', (players) => {
    state.otherPlayers = players;
    delete state.otherPlayers[socket.id]; // Remove self
});

socket.on('newPlayer', (data) => {
    state.otherPlayers[data.id] = data.player;
});

socket.on('playerMoved', (data) => {
    if (state.otherPlayers[data.id]) {
        state.otherPlayers[data.id].x = data.x;
        state.otherPlayers[data.id].y = data.y;
    }
});

socket.on('playerDisconnected', (id) => {
    delete state.otherPlayers[id];
});

// Audio System
const audio = {
    ctx: null,
    muted: false,
    init: () => {
        if (!audio.ctx) {
            audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playTone: (freq, type, duration, vol = 0.1) => {
        if (audio.muted || !audio.ctx) return;
        const osc = audio.ctx.createOscillator();
        const gain = audio.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audio.ctx.currentTime);
        gain.gain.setValueAtTime(vol, audio.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audio.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audio.ctx.destination);
        osc.start();
        osc.stop(audio.ctx.currentTime + duration);
    },
    playShoot: () => audio.playTone(400, 'square', 0.1, 0.05),
    playHit: () => audio.playTone(100, 'sawtooth', 0.1, 0.05),
    playLevelUp: () => {
        if (audio.muted || !audio.ctx) return;
        const now = audio.ctx.currentTime;
        [440, 554, 659, 880].forEach((freq, i) => {
            const osc = audio.ctx.createOscillator();
            const gain = audio.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            gain.gain.setValueAtTime(0.1, now + i * 0.1);
            gain.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.3);
            osc.connect(gain);
            gain.connect(audio.ctx.destination);
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.3);
        });
    }
};

// Initialization
window.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    state.canvas = document.getElementById('gameCanvas');
    state.ctx = state.canvas.getContext('2d');
    
    resize();
    window.addEventListener('resize', resize);
    
    // Input Listeners
    window.addEventListener('keydown', (e) => state.keys[e.code] = true);
    window.addEventListener('keyup', (e) => state.keys[e.code] = false);
    
    // UI Listeners
    // document.getElementById('start-btn').addEventListener('click', startGame); // Removed
    document.getElementById('btn-easy').addEventListener('click', () => startGame('easy'));
    document.getElementById('btn-normal').addEventListener('click', () => startGame('normal'));
    document.getElementById('btn-hard').addEventListener('click', () => startGame('hard'));

    document.getElementById('restart-btn').addEventListener('click', () => {
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
    });
    
    document.getElementById('mute-btn').addEventListener('click', () => {
        audio.muted = !audio.muted;
        document.getElementById('mute-btn').innerText = audio.muted ? '🔇' : '🔊';
    });
    
    // Initial Render (Background)
    render();
}

function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    state.canvas.width = state.width;
    state.canvas.height = state.height;
}

function startGame(diff = 'normal') {
    audio.init(); // Initialize Audio Context
    
    // Set Difficulty
    state.difficulty.name = diff;
    if (diff === 'easy') {
        state.difficulty.enemyHpMult = 0.7;
        state.difficulty.enemySpeedMult = 0.8;
        state.difficulty.playerDmgMult = 1.2;
    } else if (diff === 'hard') {
        state.difficulty.enemyHpMult = 1.5;
        state.difficulty.enemySpeedMult = 1.2;
        state.difficulty.playerDmgMult = 0.8;
    } else {
        state.difficulty.enemyHpMult = 1;
        state.difficulty.enemySpeedMult = 1;
        state.difficulty.playerDmgMult = 1;
    }

    // Reset State
    state.score = 0;
    state.level = 1;
    state.xp = 0;
    state.xpToNextLevel = 100;
    state.enemies = [];
    state.projectiles = [];
    state.particles = [];
    state.xpOrbs = [];
    state.isPaused = false;
    state.isRunning = true;
    
    // Hide/Show UI
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    
    updateHUD();
    
    // Initialize Player
    state.player = {
        x: state.width / 2,
        y: state.height / 2,
        radius: 15,
        speed: 5,
        color: '#00f3ff',
        hp: 100,
        maxHp: 100,
        dash: {
            active: false,
            cooldown: 0,
            maxCooldown: 2000, // 2 seconds
            duration: 200, // 0.2 seconds
            timer: 0,
            speedMult: 3
        },
        weapon: {
            damage: 10 * state.difficulty.playerDmgMult,
            fireRate: 500, // ms
            lastFired: 0,
            range: 300,
            projectileSpeed: 10
        },
        shield: {
            active: false,
            count: 0,
            damage: 5,
            radius: 60,
            speed: 0.05,
            angle: 0
        },
        laser: {
            active: false,
            level: 0,
            damage: 20,
            cooldown: 0,
            maxCooldown: 2000,
            range: 400
        },
        rapidFireTimer: 0
    };

    state.lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
    if (!state.isRunning) return;
    
    const deltaTime = timestamp - state.lastTime;
    state.lastTime = timestamp;

    if (!state.isPaused) {
        update(deltaTime);
    }
    
    render();
    requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    if (!state.player) return;

    if (state.shake > 0) state.shake -= 0.5;
    
    // Update Floating Texts
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const ft = state.floatingTexts[i];
        ft.y -= 1;
        ft.life -= 0.02;
        if (ft.life <= 0) state.floatingTexts.splice(i, 1);
    }

    // Player Movement
    const moveX = (state.keys['KeyD'] || state.keys['ArrowRight'] ? 1 : 0) - (state.keys['KeyA'] || state.keys['ArrowLeft'] ? 1 : 0);
    const moveY = (state.keys['KeyS'] || state.keys['ArrowDown'] ? 1 : 0) - (state.keys['KeyW'] || state.keys['ArrowUp'] ? 1 : 0);
    
    // Dash Logic
    if (state.keys['Space'] && state.player.dash.cooldown <= 0) {
        state.player.dash.active = true;
        state.player.dash.timer = state.player.dash.duration;
        state.player.dash.cooldown = state.player.dash.maxCooldown;
        createParticles(state.player.x, state.player.y, state.player.color, 10); // Dash effect
    }

    if (state.player.dash.cooldown > 0) state.player.dash.cooldown -= deltaTime;
    
    let currentSpeed = state.player.speed;
    if (state.player.dash.active) {
        state.player.dash.timer -= deltaTime;
        currentSpeed *= state.player.dash.speedMult;
        createParticles(state.player.x, state.player.y, state.player.color, 1); // Trail
        if (state.player.dash.timer <= 0) {
            state.player.dash.active = false;
        }
        if (state.player.dash.timer <= 0) {
            state.player.dash.active = false;
        }
    }

    // Rapid Fire Timer
    if (state.player.rapidFireTimer > 0) {
        state.player.rapidFireTimer -= 16;
        if (state.player.rapidFireTimer <= 0) {
             state.player.weapon.fireRate *= 5; // Reset (assuming 5x boost)
             spawnFloatingText(state.player.x, state.player.y - 50, "RAPID FIRE END", "#fff");
        }
    }

    // Laser Logic
    if (state.player.laser.active) {
        state.player.laser.cooldown -= 16;
        if (state.player.laser.cooldown <= 0) {
            fireLaser();
            state.player.laser.cooldown = state.player.laser.maxCooldown;
        }
    }

    // Shield Logic
    if (state.player.shield.active) {
        state.player.shield.angle += state.player.shield.speed;
        // Shield Collision
        state.enemies.forEach((enemy, index) => {
            // Check distance to player (optimization)
            const distToPlayer = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
            if (distToPlayer < state.player.shield.radius + enemy.radius + 10) {
                // Check against each orb (simulated)
                // For simplicity, we treat the shield as a continuous ring damage zone for now
                // Or we can calculate exact orb positions. Let's do exact positions for visuals.
                for(let i=0; i<state.player.shield.count; i++) {
                    const angle = state.player.shield.angle + (i * (Math.PI * 2 / state.player.shield.count));
                    const sx = state.player.x + Math.cos(angle) * state.player.shield.radius;
                    const sy = state.player.y + Math.sin(angle) * state.player.shield.radius;
                    
                    const distToOrb = Math.hypot(sx - enemy.x, sy - enemy.y);
                    if (distToOrb < 10 + enemy.radius) { // Orb radius approx 10
                         enemy.hp -= state.player.shield.damage * 0.1; // Ticks fast, low damage
                         createParticles(enemy.x, enemy.y, '#00ff9d', 1);
                         if (enemy.hp <= 0) {
                             // Kill logic handled in main loop, but we need to ensure we don't double kill
                             // Let's just mark it dead or let the main loop handle it?
                             // Actually, main loop handles death checks. We just reduce HP here.
                         }
                    }
                }
            }
        });
    }

    // Normalize vector
    const length = Math.sqrt(moveX * moveX + moveY * moveY);
    if (length > 0) {
        state.player.x += (moveX / length) * currentSpeed;
        state.player.y += (moveY / length) * currentSpeed;
        
        // Emit movement
        socket.emit('playerMovement', { x: state.player.x, y: state.player.y });
    }
    
    // Clamp to screen
    state.player.x = Math.max(state.player.radius, Math.min(state.width - state.player.radius, state.player.x));
    state.player.y = Math.max(state.player.radius, Math.min(state.height - state.player.radius, state.player.y));

    // --- Spawning Enemies ---
    // Boss Check
    const isBossLevel = state.level % 5 === 0;
    const bossExists = state.enemies.some(e => e.type === 'boss');
    
    if (isBossLevel && !bossExists) {
         spawnEnemy(true); // Spawn Boss
    } else if (!isBossLevel && Math.random() < 0.02 + (state.level * 0.005)) { 
        spawnEnemy(false);
    }

    // --- Update Powerups ---
    state.powerups.forEach((p, index) => {
        const dist = Math.hypot(p.x - state.player.x, p.y - state.player.y);
        if (dist < state.player.radius + 15) {
            activatePowerup(p.type);
            state.powerups.splice(index, 1);
            audio.playLevelUp(); // Reuse sound for now
        }
    });

    // --- Update Enemies ---
    state.enemies.forEach((enemy, index) => {
        // Move towards player
        const dx = state.player.x - enemy.x;
        const dy = state.player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 0) {
            enemy.x += (dx / dist) * enemy.speed;
            enemy.y += (dy / dist) * enemy.speed;
        }

        // Collision with Player
        if (dist < enemy.radius + state.player.radius) {
            state.player.hp -= enemy.damage;
            state.enemies.splice(index, 1); // Enemy explodes on impact
            createParticles(enemy.x, enemy.y, enemy.color, 5);
            shake(10);
            audio.playHit(); // SFX
            spawnFloatingText(state.player.x, state.player.y, `-${enemy.damage}`, '#ff0000');
            updateHUD();
            
            if (state.player.hp <= 0) {
                gameOver();
            }
        }
    });

    // --- Update Lasers (Visuals) ---
    state.lasers = state.lasers.filter(l => l.life > 0);
    state.lasers.forEach(l => l.life -= 0.05);

    // --- Update XP Orbs ---
    for (let i = state.xpOrbs.length - 1; i >= 0; i--) {
        const orb = state.xpOrbs[i];
        const dx = state.player.x - orb.x;
        const dy = state.player.y - orb.y;
        const dist = Math.hypot(dx, dy);
        
        // Magnet effect
        if (dist < 150) {
            orb.x += (dx / dist) * 5;
            orb.y += (dy / dist) * 5;
        }

        // Collection
        if (dist < state.player.radius + 5) {
            state.xp += orb.value;
            state.xpOrbs.splice(i, 1);
            checkLevelUp();
            updateHUD();
        }
    }

    // --- Auto-Fire ---
    const now = performance.now();
    if (now - state.player.weapon.lastFired > state.player.weapon.fireRate) {
        const target = findNearestEnemy();
        if (target) {
            fireProjectile(target);
            state.player.weapon.lastFired = now;
        }
    }

    // --- Update Projectiles ---
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        p.x += p.vx;
        p.y += p.vy;
        
        // Remove if out of bounds
        if (p.x < 0 || p.x > state.width || p.y < 0 || p.y > state.height) {
            state.projectiles.splice(i, 1);
            continue;
        }

        // Collision with Enemies
        for (let j = state.enemies.length - 1; j >= 0; j--) {
            const enemy = state.enemies[j];
            const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
            
            if (dist < p.radius + enemy.radius) {
                enemy.hp -= state.player.weapon.damage;
                state.projectiles.splice(i, 1); // Remove projectile
                createParticles(p.x, p.y, '#fff', 2);
                spawnFloatingText(enemy.x, enemy.y, `${state.player.weapon.damage}`, '#fff');
                audio.playHit(); // SFX
                
                if (enemy.hp <= 0) {
                    // Enemy Death
                    createParticles(enemy.x, enemy.y, enemy.color, 10);
                    spawnXPOrb(enemy.x, enemy.y, enemy.type === 'boss' ? 500 : 10);
                    
                    // Powerup Drop Chance
                    if (Math.random() < 0.20) { // 20% chance
                        spawnPowerup(enemy.x, enemy.y);
                    }

                    state.enemies.splice(j, 1);
                    state.score += enemy.type === 'boss' ? 1000 : 100;
                    updateHUD();
                }
                break; // Projectile hit something, stop checking other enemies
            }
        }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        if (p.life <= 0) {
            state.particles.splice(i, 1);
        }
    }
}

function spawnEnemy(isBoss = false) {
    // Spawn at edge
    let x, y;
    if (Math.random() < 0.5) {
        x = Math.random() < 0.5 ? -20 : state.width + 20;
        y = Math.random() * state.height;
    } else {
        x = Math.random() * state.width;
        y = Math.random() < 0.5 ? -20 : state.height + 20;
    }

    if (isBoss) {
        state.enemies.push({
            x: x,
            y: y,
            radius: 40,
            speed: 1.5 * state.difficulty.enemySpeedMult,
            color: '#ff0000',
            hp: 500 * (state.level / 5) * state.difficulty.enemyHpMult,
            damage: 30,
            type: 'boss'
        });
        // Boss Warning
        spawnFloatingText(state.width/2, state.height/2, "BOSS APPROACHING", "#ff0000");
        shake(20);
        return;
    }

    const typeRoll = Math.random();
    let type = 'normal';
    let speed = 1 + Math.random();
    let hp = 20 + (state.level * 5);
    let radius = 10;
    let color = '#ff00ff';
    let damage = 10;

    if (typeRoll < 0.2) {
        // Chaser (Fast, Low HP)
        type = 'chaser';
        speed *= 1.8;
        hp *= 0.6;
        radius = 8;
        color = '#ff3333'; // Red
    } else if (typeRoll < 0.4) {
        // Tank (Slow, High HP)
        type = 'tank';
        speed *= 0.6;
        hp *= 2.5;
        radius = 18;
        color = '#aa00ff'; // Purple
        damage *= 1.5;
    }

    state.enemies.push({
        x: x,
        y: y,
        radius: radius,
        speed: speed * state.difficulty.enemySpeedMult,
        color: color,
        hp: hp * state.difficulty.enemyHpMult,
        damage: damage,
        type: type
    });
}

function spawnXPOrb(x, y, value) {
    state.xpOrbs.push({
        x: x,
        y: y,
        value: value,
        color: '#00ff9d'
    });
}

function findNearestEnemy() {
    let nearest = null;
    let minDist = state.player.weapon.range;

    state.enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
        if (dist < minDist) {
            minDist = dist;
            nearest = enemy;
        }
    });
    return nearest;
}

function fireProjectile(target) {
    const angle = Math.atan2(target.y - state.player.y, target.x - state.player.x);
    const speed = state.player.weapon.projectileSpeed;
    
    audio.playShoot(); // SFX

    state.projectiles.push({
        x: state.player.x,
        y: state.player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 4,
        color: '#ffff00'
    });
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3;
        state.particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            color: color
        });
    }
}

function checkLevelUp() {
    if (state.xp >= state.xpToNextLevel) {
        state.level++;
        state.xp = state.xp - state.xpToNextLevel; // Keep overflow XP
        state.xpToNextLevel = Math.floor(state.xpToNextLevel * 1.5);
        
        audio.playLevelUp(); // SFX
        showLevelUpScreen();
    }
}

function showLevelUpScreen() {
    state.isPaused = true;
    const container = document.getElementById('upgrade-container');
    container.innerHTML = ''; // Clear previous

    const upgrades = [
        { name: 'Damage Boost', desc: 'Increase damage by 5', apply: () => state.player.weapon.damage += 5 },
        { name: 'Fire Rate', desc: 'Shoot 10% faster', apply: () => state.player.weapon.fireRate *= 0.9 },
        { name: 'Speed Up', desc: 'Move 10% faster', apply: () => state.player.speed *= 1.1 },
        { name: 'Health Pack', desc: 'Heal 50 HP', apply: () => state.player.hp = Math.min(state.player.hp + 50, state.player.maxHp) },
        { name: 'Range Up', desc: 'Increase range by 20%', apply: () => state.player.weapon.range *= 1.2 },
        { name: 'Orbiting Shield', desc: 'Add a protective shield orb', apply: () => {
            state.player.shield.active = true;
            state.player.shield.count++;
        }},
        { name: 'Laser Beam', desc: 'Fire a piercing laser', apply: () => {
            state.player.laser.active = true;
            state.player.laser.level++;
            state.player.laser.damage += 10;
        }}
    ];

    // Pick 3 random upgrades
    const choices = [];
    while(choices.length < 3) {
        const r = upgrades[Math.floor(Math.random() * upgrades.length)];
        if (!choices.includes(r)) choices.push(r);
    }

    choices.forEach(upgrade => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `<h3>${upgrade.name}</h3><p>${upgrade.desc}</p>`;
        card.onclick = () => {
            upgrade.apply();
            document.getElementById('level-up-screen').classList.add('hidden');
            document.getElementById('hud').classList.remove('hidden');
            state.isPaused = false;
            updateHUD();
        };
        container.appendChild(card);
    });

    document.getElementById('level-up-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
}

function gameOver() {
    state.isRunning = false;
    document.getElementById('final-score').innerText = `Score: ${state.score}`;
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
}

function render() {
    const ctx = state.ctx;
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, state.width, state.height);
    
    ctx.save();
    if (state.shake > 0) {
        const dx = (Math.random() - 0.5) * state.shake;
        const dy = (Math.random() - 0.5) * state.shake;
        ctx.translate(dx, dy);
    }
    
    // Grid Background Effect
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    
    for (let x = 0; x < state.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, state.height);
        ctx.stroke();
    }
    for (let y = 0; y < state.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(state.width, y);
        ctx.stroke();
    }

    // Draw XP Orbs
    state.xpOrbs.forEach(orb => {
        ctx.shadowBlur = 5;
        ctx.shadowColor = orb.color;
        ctx.fillStyle = orb.color;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Draw Particles
    state.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    // Draw Projectiles
    state.projectiles.forEach(p => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Draw Enemies
    state.enemies.forEach(enemy => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = enemy.color;
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    });



    if (state.player && state.player.shield.active) {
        for(let i=0; i<state.player.shield.count; i++) {
            const angle = state.player.shield.angle + (i * (Math.PI * 2 / state.player.shield.count));
            const sx = state.player.x + Math.cos(angle) * state.player.shield.radius;
            const sy = state.player.y + Math.sin(angle) * state.player.shield.radius;
            
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00ff9d';
            ctx.fillStyle = '#00ff9d';
            ctx.beginPath();
            ctx.arc(sx, sy, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    // Draw Other Players
    if (state.otherPlayers) {
        Object.keys(state.otherPlayers).forEach(id => {
            const p = state.otherPlayers[id];
            ctx.shadowBlur = 15;
            ctx.shadowColor = p.color;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); // Same radius as player
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Name tag
            ctx.fillStyle = '#fff';
            ctx.font = '12px Outfit';
            ctx.fillText('Player', p.x - 15, p.y - 20);
        });
    }

    if (state.player) {
        // Draw Player
        ctx.shadowBlur = 15;
        ctx.shadowColor = state.player.color;
        ctx.fillStyle = state.player.color;
        ctx.beginPath();
        ctx.arc(state.player.x, state.player.y, state.player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Draw Weapon Range (Subtle)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        ctx.arc(state.player.x, state.player.y, state.player.weapon.range, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Draw Powerups
    state.powerups.forEach(p => {
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        // Draw shape based on type
        if (p.type === 'magnet') {
            ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); // Circle
            ctx.fillText('🧲', p.x-8, p.y+5);
        } else if (p.type === 'nuke') {
            ctx.rect(p.x - 8, p.y - 8, 16, 16); // Square
            ctx.fillText('☢️', p.x-8, p.y+5);
        } else if (p.type === 'rapid_fire') {
            ctx.moveTo(p.x, p.y - 10);
            ctx.lineTo(p.x + 10, p.y + 10);
            ctx.lineTo(p.x - 10, p.y + 10); // Triangle
            ctx.fillText('⚡', p.x-6, p.y+5);
        }
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Draw Lasers
    state.lasers.forEach(l => {
        ctx.globalAlpha = l.life;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ffff';
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
    });

    // Draw Floating Texts
    state.floatingTexts.forEach(ft => {
        ctx.globalAlpha = ft.life;
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 16px Outfit';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.globalAlpha = 1.0;
    });

    ctx.restore();
}

function updateHUD() {
    document.getElementById('score-display').innerText = `Score: ${state.score}`;
    document.getElementById('level-display').innerText = `LVL ${state.level}`;
    document.getElementById('health-text').innerText = `${Math.ceil(state.player?.hp || 0)}/${state.player?.maxHp || 100}`;
    
    const xpPercent = (state.xp / state.xpToNextLevel) * 100;
    document.getElementById('xp-bar-fill').style.width = `${xpPercent}%`;
    
    const hpPercent = (state.player?.hp / state.player?.maxHp) * 100;
    document.getElementById('health-bar-fill').style.width = `${hpPercent}%`;

    // Dash Bar
    if (state.player && state.player.dash) {
        const dashPercent = state.player.dash.cooldown > 0 
            ? 100 - (state.player.dash.cooldown / state.player.dash.maxCooldown * 100)
            : 100;
        document.getElementById('dash-fill').style.width = `${dashPercent}%`;
        document.getElementById('dash-fill').style.backgroundColor = dashPercent === 100 ? '#ffea00' : '#555';
    }
}

function shake(amount) {
    state.shake = amount;
}

function spawnFloatingText(x, y, text, color) {
    state.floatingTexts.push({
        x: x,
        y: y,
        text: text,
        color: color,
        life: 1.0
    });
}

function spawnPowerup(x, y) {
    const types = ['magnet', 'nuke', 'rapid_fire'];
    const type = types[Math.floor(Math.random() * types.length)];
    let color = '#fff';
    if (type === 'magnet') color = '#00ff00';
    if (type === 'nuke') color = '#ff0000';
    if (type === 'rapid_fire') color = '#ffff00';

    state.powerups.push({ x, y, type, color });
}

function activatePowerup(type) {
    spawnFloatingText(state.player.x, state.player.y, type.toUpperCase() + "!", "#fff");
    
    if (type === 'magnet') {
        state.xpOrbs.forEach(orb => {
            // Instant pull logic handled in update loop or just teleport them?
            // Let's make them move very fast
            orb.x = state.player.x; // Instant collect for satisfaction
            orb.y = state.player.y;
        });
    } else if (type === 'nuke') {
        shake(50);
        state.enemies.forEach(e => {
            createParticles(e.x, e.y, e.color, 10);
            spawnXPOrb(e.x, e.y, 10);
        });
        state.enemies = []; // Wipe
        audio.playHit(); // Big boom
    } else if (type === 'rapid_fire') {
        if (state.player.rapidFireTimer <= 0) {
            state.player.weapon.fireRate /= 5;
        }
        state.player.rapidFireTimer = 10000; // 10s
    }
}

function fireLaser() {
    // Find nearest enemy
    let nearest = null;
    let minDist = Infinity;
    state.enemies.forEach(e => {
        const dist = Math.hypot(e.x - state.player.x, e.y - state.player.y);
        if (dist < minDist) {
            minDist = dist;
            nearest = e;
        }
    });

    if (nearest && minDist < state.player.laser.range) {
        // Calculate vector to edge of screen through enemy
        const angle = Math.atan2(nearest.y - state.player.y, nearest.x - state.player.x);
        const endX = state.player.x + Math.cos(angle) * 1000;
        const endY = state.player.y + Math.sin(angle) * 1000;

        // Visual
        state.lasers.push({ x1: state.player.x, y1: state.player.y, x2: endX, y2: endY, life: 1.0 });
        audio.playShoot(); // Pew pew

        // Damage Logic (Line Intersection with Circles)
        // Simplified: Check distance from line
        state.enemies.forEach(e => {
            // Distance from point e to line (player -> end)
            // ... math ...
            // Simple approximation: check angle difference?
            // Or just check if enemy is close to the line segment
            
            const x0 = e.x;
            const y0 = e.y;
            const x1 = state.player.x;
            const y1 = state.player.y;
            const x2 = endX;
            const y2 = endY;
            
            const num = Math.abs((y2-y1)*x0 - (x2-x1)*y0 + x2*y1 - y2*x1);
            const den = Math.sqrt(Math.pow(y2-y1, 2) + Math.pow(x2-x1, 2));
            const distToLine = num / den;

            if (distToLine < e.radius + 10) {
                // Check if enemy is "in front" of player (dot product)
                const dot = (x0-x1)*(x2-x1) + (y0-y1)*(y2-y1);
                if (dot > 0) {
                     e.hp -= state.player.laser.damage;
                     createParticles(e.x, e.y, '#00ffff', 3);
                     if (e.hp <= 0) {
                         // Kill logic (duplicated, should refactor but inline for now)
                         spawnXPOrb(e.x, e.y, 10);
                         e.dead = true; // Mark for removal
                     }
                }
            }
        });
        
        // Cleanup dead enemies
        state.enemies = state.enemies.filter(e => !e.dead);
    }
}
        
