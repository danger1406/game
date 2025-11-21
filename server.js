const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(__dirname));

// Game Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const TICK_RATE = 60;
const ENEMY_SPAWN_RATE = 0.02;

// Server-side game state
const gameState = {
    players: {},
    enemies: [],
    projectiles: [],
    xpOrbs: [],
    powerups: [],
    lastEnemySpawn: 0
};

// Utility functions
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function spawnEnemy() {
    let x, y;
    if (Math.random() < 0.5) {
        x = Math.random() < 0.5 ? -20 : CANVAS_WIDTH + 20;
        y = Math.random() * CANVAS_HEIGHT;
    } else {
        x = Math.random() * CANVAS_WIDTH;
        y = Math.random() < 0.5 ? -20 : CANVAS_HEIGHT + 20;
    }

    const typeRoll = Math.random();
    let type = 'normal';
    let speed = 1 + Math.random();
    let hp = 30;
    let radius = 10;
    let color = '#ff00ff';
    let damage = 10;

    if (typeRoll < 0.2) {
        type = 'chaser';
        speed *= 1.8;
        hp *= 0.6;
        radius = 8;
        color = '#ff3333';
    } else if (typeRoll < 0.4) {
        type = 'tank';
        speed *= 0.6;
        hp *= 2.5;
        radius = 18;
        color = '#aa00ff';
        damage *= 1.5;
    }

    gameState.enemies.push({
        id: Date.now() + Math.random(),
        x, y, radius, speed, color, hp, maxHp: hp, damage, type
    });
}

function findNearestEnemy(playerId) {
    const player = gameState.players[playerId];
    if (!player) return null;

    let nearest = null;
    let minDist = player.weapon.range;

    gameState.enemies.forEach(enemy => {
        const dist = distance(player.x, player.y, enemy.x, enemy.y);
        if (dist < minDist) {
            minDist = dist;
            nearest = enemy;
        }
    });

    return nearest;
}

// Game loop (60 FPS)
setInterval(() => {
    const now = Date.now();

    // Spawn enemies
    if (Math.random() < ENEMY_SPAWN_RATE) {
        spawnEnemy();
    }

    // Update enemies
    gameState.enemies.forEach((enemy, index) => {
        // Find nearest player
        let nearestPlayer = null;
        let minDist = Infinity;

        Object.values(gameState.players).forEach(player => {
            const dist = distance(enemy.x, enemy.y, player.x, player.y);
            if (dist < minDist) {
                minDist = dist;
                nearestPlayer = player;
            }
        });

        if (nearestPlayer) {
            const dx = nearestPlayer.x - enemy.x;
            const dy = nearestPlayer.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0) {
                enemy.x += (dx / dist) * enemy.speed;
                enemy.y += (dy / dist) * enemy.speed;
            }

            // Collision with player
            if (dist < enemy.radius + nearestPlayer.radius) {
                nearestPlayer.hp -= enemy.damage;
                gameState.enemies.splice(index, 1);
                
                if (nearestPlayer.hp <= 0) {
                    // Player died - respawn
                    nearestPlayer.hp = nearestPlayer.maxHp;
                    nearestPlayer.x = CANVAS_WIDTH / 2;
                    nearestPlayer.y = CANVAS_HEIGHT / 2;
                }
            }
        }
    });

    // Update projectiles
    gameState.projectiles.forEach((proj, index) => {
        proj.x += proj.vx;
        proj.y += proj.vy;

        // Remove out of bounds
        if (proj.x < 0 || proj.x > CANVAS_WIDTH || proj.y < 0 || proj.y > CANVAS_HEIGHT) {
            gameState.projectiles.splice(index, 1);
            return;
        }

        // Check collision with enemies
        for (let j = gameState.enemies.length - 1; j >= 0; j--) {
            const enemy = gameState.enemies[j];
            const dist = distance(proj.x, proj.y, enemy.x, enemy.y);

            if (dist < proj.radius + enemy.radius) {
                enemy.hp -= proj.damage;
                gameState.projectiles.splice(index, 1);

                if (enemy.hp <= 0) {
                    // Enemy died
                    gameState.xpOrbs.push({
                        id: Date.now() + Math.random(),
                        x: enemy.x,
                        y: enemy.y,
                        value: 10
                    });

                    // Powerup drop chance
                    if (Math.random() < 0.20) {
                        const types = ['magnet', 'nuke', 'rapid_fire'];
                        const type = types[Math.floor(Math.random() * types.length)];
                        gameState.powerups.push({
                            id: Date.now() + Math.random(),
                            x: enemy.x,
                            y: enemy.y,
                            type
                        });
                    }

                    gameState.enemies.splice(j, 1);
                }
                break;
            }
        }
    });

    // Update XP orbs (magnet effect and collection)
    gameState.xpOrbs.forEach((orb, index) => {
        Object.values(gameState.players).forEach(player => {
            const dist = distance(orb.x, orb.y, player.x, player.y);

            // Magnet effect
            if (dist < 150) {
                const dx = player.x - orb.x;
                const dy = player.y - orb.y;
                orb.x += (dx / dist) * 5;
                orb.y += (dy / dist) * 5;
            }

            // Collection
            if (dist < player.radius + 5) {
                player.xp += orb.value;
                gameState.xpOrbs.splice(index, 1);

                // Level up check
                if (player.xp >= player.xpToNextLevel) {
                    player.level++;
                    player.xp -= player.xpToNextLevel;
                    player.xpToNextLevel = Math.floor(player.xpToNextLevel * 1.5);
                }
            }
        });
    });

    // Update powerups
    gameState.powerups.forEach((powerup, index) => {
        Object.values(gameState.players).forEach(player => {
            const dist = distance(powerup.x, powerup.y, player.x, player.y);

            if (dist < player.radius + 15) {
                // Apply powerup
                if (powerup.type === 'magnet') {
                    // Handled in XP orb update
                } else if (powerup.type === 'nuke') {
                    gameState.enemies.forEach(e => {
                        gameState.xpOrbs.push({ id: Date.now() + Math.random(), x: e.x, y: e.y, value: 10 });
                    });
                    gameState.enemies = [];
                } else if (powerup.type === 'rapid_fire') {
                    player.rapidFireTimer = 10000;
                }

                gameState.powerups.splice(index, 1);
            }
        });
    });

    // Auto-fire for each player
    Object.keys(gameState.players).forEach(playerId => {
        const player = gameState.players[playerId];
        const now = Date.now();

        if (now - player.weapon.lastFired > player.weapon.fireRate) {
            const target = findNearestEnemy(playerId);
            if (target) {
                const angle = Math.atan2(target.y - player.y, target.x - player.x);
                const speed = player.weapon.projectileSpeed;

                gameState.projectiles.push({
                    id: Date.now() + Math.random(),
                    x: player.x,
                    y: player.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: 4,
                    color: '#ffff00',
                    damage: player.weapon.damage,
                    owner: playerId
                });

                player.weapon.lastFired = now;
            }
        }
    });

    // Broadcast game state to all clients
    io.emit('gameStateUpdate', {
        players: gameState.players,
        enemies: gameState.enemies,
        projectiles: gameState.projectiles,
        xpOrbs: gameState.xpOrbs,
        powerups: gameState.powerups
    });

}, 1000 / TICK_RATE);

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('playerJoin', (data) => {
        console.log('Player joined:', data.name);

        gameState.players[socket.id] = {
            id: socket.id,
            name: data.name || 'Player',
            x: CANVAS_WIDTH / 2,
            y: CANVAS_HEIGHT / 2,
            radius: 15,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            hp: 100,
            maxHp: 100,
            xp: 0,
            level: 1,
            xpToNextLevel: 100,
            weapon: {
                damage: 10,
                fireRate: 500,
                lastFired: 0,
                range: 300,
                projectileSpeed: 10
            },
            rapidFireTimer: 0
        };

        // Send current game state to new player
        socket.emit('initGameState', {
            playerId: socket.id,
            players: gameState.players,
            enemies: gameState.enemies,
            projectiles: gameState.projectiles,
            xpOrbs: gameState.xpOrbs,
            powerups: gameState.powerups
        });
    });

    socket.on('playerInput', (input) => {
        const player = gameState.players[socket.id];
        if (!player) return;

        // Update player position based on input
        if (input.moveX || input.moveY) {
            const length = Math.sqrt(input.moveX ** 2 + input.moveY ** 2);
            if (length > 0) {
                const speed = input.dashing ? 15 : 5;
                player.x += (input.moveX / length) * speed;
                player.y += (input.moveY / length) * speed;

                // Clamp to screen
                player.x = Math.max(player.radius, Math.min(CANVAS_WIDTH - player.radius, player.x));
                player.y = Math.max(player.radius, Math.min(CANVAS_HEIGHT - player.radius, player.y));
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete gameState.players[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
