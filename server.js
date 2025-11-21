const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(__dirname));

// Game State
const players = {};

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    // Create new player
    players[socket.id] = {
        x: 0,
        y: 0,
        color: '#' + Math.floor(Math.random()*16777215).toString(16) // Random color
    };

    // Send current players to new player
    socket.emit('currentPlayers', players);

    // Broadcast new player to others
    socket.broadcast.emit('newPlayer', {
        id: socket.id,
        player: players[socket.id]
    });

    // Handle movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            // Broadcast movement to others
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: players[socket.id].x,
                y: players[socket.id].y
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
