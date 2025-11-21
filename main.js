// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

// Client state (receives from server)
const state = {
    width: canvas.width,
    height: canvas.height,
    myPlayerId: null,
    playerName: '',
    serverGameState: {
        players: {},
        enemies: [],
        projectiles: [],
        xpOrbs: [],
        powerups: []
    },
    keys: {},
    isPaused: false,
    shake: 0,
    floatingTexts: [],
    muted: false
};

// Audio System (client-side only for feedback)
const audio = {
    context: null,
    init: function() {
        if (!this.context && !state.muted) {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playTone: function(freq, type, duration, volume) {
        if (state.muted || !this.context) return;
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;
        osc.connect(gain);
        gain.connect(this.context.destination);
        osc.start();
        osc.stop(this.context.currentTime + duration);
    },
    playShoot: () => audio.playTone(400, 'square', 0.1, 0.05),
    playHit: () => audio.playTone(100, 'sawtooth', 0.1, 0.05),
    playLevelUp: () => audio.playTone(800, 'sine', 0.3, 0.1)
};

// Socket.io connection
const socket = io();

// Difficulty settings (kept for potential future use)
const difficultySettings = {
    easy: { name: 'easy', enemyHpMult: 0.7, enemySpeedMult: 0.8, playerDmgMult: 1.2 },
    normal: { name: 'normal', enemyHpMult: 1, enemySpeedMult: 1, playerDmgMult: 1 },
    hard: { name: 'hard', enemyHpMult: 1.5, enemySpeedMult: 1.2, playerDmgMult: 0.8 }
};

// Input handling
document.addEventListener('keydown', (e) => {
    state.keys[e.code] = true;
});

document.addEventListener('keyup', (e) => {
    state.keys[e.code] = false;
});

// Mute button
document.getElementById('mute-btn').addEventListener('click', () => {
    state.muted = !state.muted;
    document.getElementById('mute-btn').textContent = state.muted ? '🔇' : '🔊';
    if (!state.muted) audio.init();
});

// Name input handling
document.getElementById('name-submit-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('player-name-input');
    state.playerName = nameInput.value.trim() || 'Player';
    
    document.getElementById('name-input-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
});

// Difficulty selection
document.getElementById('btn-easy').addEventListener('click', () => startGame('easy'));
document.getElementById('btn-normal').addEventListener('click', () => startGame('normal'));
document.getElementById('btn-hard').addEventListener('click', () => startGame('hard'));

// Restart button
document.getElementById('restart-btn').addEventListener('click', () => {
    location.reload();
});

function startGame(difficulty) {
    audio.init();
    
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    
    // Join game on server
    socket.emit('playerJoin', { name: state.playerName, difficulty });
    
    requestAnimationFrame(gameLoop);
}

// Socket.io event handlers
socket.on('initGameState', (data) => {
    state.myPlayerId = data.playerId;
    state.serverGameState = {
        players: data.players,
        enemies: data.enemies,
        projectiles: data.projectiles,
        xpOrbs: data.xpOrbs,
        powerups: data.powerups
    };
});

socket.on('gameStateUpdate', (gameState) => {
    state.serverGameState = gameState;
    updateHUD();
});

// Game loop (client-side: input + rendering only)
function gameLoop(timestamp) {
    if (state.isPaused) {
        requestAnimationFrame(gameLoop);
        return;
    }

    // Send input to server
    if (state.myPlayerId) {
        const moveX = (state.keys['KeyD'] || state.keys['ArrowRight'] ? 1 : 0) - 
                     (state.keys['KeyA'] || state.keys['ArrowLeft'] ? 1 : 0);
        const moveY = (state.keys['KeyS'] || state.keys['ArrowDown'] ? 1 : 0) - 
                     (state.keys['KeyW'] || state.keys['ArrowUp'] ? 1 : 0);
        const dashing = state.keys['Space'];

        socket.emit('playerInput', { moveX, moveY, dashing });
    }

    // Update floating texts (client-side visual only)
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const ft = state.floatingTexts[i];
        ft.y -= 1;
        ft.life -= 0.02;
        if (ft.life <= 0) state.floatingTexts.splice(i, 1);
    }

    if (state.shake > 0) state.shake -= 0.5;

    render();
    requestAnimationFrame(gameLoop);
}

function render() {
    // Clear screen
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, state.width, state.height);

    // Apply screen shake
    ctx.save();
    if (state.shake > 0) {
        ctx.translate(
            (Math.random() - 0.5) * state.shake,
            (Math.random() - 0.5) * state.shake
        );
    }

    // Draw XP Orbs
    state.serverGameState.xpOrbs.forEach(orb => {
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#00ff9d';
        ctx.fillStyle = '#00ff9d';
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Draw Projectiles
    state.serverGameState.projectiles.forEach(p => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Draw Enemies
    state.serverGameState.enemies.forEach(enemy => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = enemy.color;
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // HP bar for enemies
        if (enemy.hp < enemy.maxHp) {
            const barWidth = enemy.radius * 2;
            const barHeight = 4;
            const hpPercent = enemy.hp / enemy.maxHp;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(enemy.x - barWidth/2, enemy.y - enemy.radius - 10, barWidth, barHeight);
            
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(enemy.x - barWidth/2, enemy.y - enemy.radius - 10, barWidth * hpPercent, barHeight);
        }
    });

    // Draw Players
    Object.values(state.serverGameState.players).forEach(player => {
        const isMe = player.id === state.myPlayerId;
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = player.color;
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Player name
        ctx.fillStyle = '#fff';
        ctx.font = isMe ? 'bold 14px Outfit' : '12px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, player.x, player.y - player.radius - 10);

        // HP bar
        if (isMe) {
            const barWidth = 60;
            const barHeight = 6;
            const hpPercent = player.hp / player.maxHp;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(player.x - barWidth/2, player.y + player.radius + 5, barWidth, barHeight);
            
            ctx.fillStyle = hpPercent > 0.5 ? '#00ff00' : (hpPercent > 0.25 ? '#ffff00' : '#ff0000');
            ctx.fillRect(player.x - barWidth/2, player.y + player.radius + 5, barWidth * hpPercent, barHeight);
        }
    });

    // Draw Powerups
    state.serverGameState.powerups.forEach(p => {
        ctx.shadowBlur = 15;
        let color = '#fff';
        let emoji = '⭐';
        
        if (p.type === 'magnet') {
            color = '#00ff00';
            emoji = '🧲';
        } else if (p.type === 'nuke') {
            color = '#ff0000';
            emoji = '☢️';
        } else if (p.type === 'rapid_fire') {
            color = '#ffff00';
            emoji = '⚡';
        }
        
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(emoji, p.x, p.y + 7);
        ctx.shadowBlur = 0;
    });

    // Draw Floating Texts
    state.floatingTexts.forEach(ft => {
        ctx.globalAlpha = ft.life;
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 16px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.globalAlpha = 1.0;
    });

    ctx.restore();
}

function updateHUD() {
    if (!state.myPlayerId || !state.serverGameState.players[state.myPlayerId]) return;
    
    const player = state.serverGameState.players[state.myPlayerId];
    
    document.getElementById('level-display').innerText = `LVL ${player.level}`;
    document.getElementById('health-text').innerText = `${Math.ceil(player.hp)}/${player.maxHp}`;
    
    const xpPercent = (player.xp / player.xpToNextLevel) * 100;
    document.getElementById('xp-bar-fill').style.width = `${xpPercent}%`;
    
    const hpPercent = (player.hp / player.maxHp) * 100;
    document.getElementById('health-bar-fill').style.width = `${hpPercent}%`;
}

function spawnFloatingText(x, y, text, color) {
    state.floatingTexts.push({ x, y, text, color, life: 1.0 });
}

function shake(amount) {
    state.shake = amount;
}
