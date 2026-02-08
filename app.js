const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

app.use(express.static("public"));

let treasures = [];
let bases = [];
let gameTime = 300; 
let players = {}; 

// Initialize 10 random stars
function initMap() {
    treasures = Array.from({length: 10}, () => ({
        x: Math.random(), y: Math.random(), found: false, foundBy: null 
    }));
}
initMap();

// Global 5-minute game loop
setInterval(() => {
    if (gameTime > 0) {
        gameTime--;
        io.emit("timer-update", gameTime);
    } else {
        // Game Over: Send final results before reset
        let finalResults = Object.values(players)
            .filter(p => p.color !== null)
            .sort((a,b) => b.score - a.score)
            .slice(0, 5);
        
        io.emit("game-over", finalResults);
        
        // Wait 10 seconds for players to see the ranking, then reset
        setTimeout(() => {
            gameTime = 300;
            initMap(); 
            bases = [];
            for (let id in players) { players[id].score = 0; }
            io.emit("game-reset"); 
        }, 10000);
        
        gameTime = -1; // Temporary pause state
    }
}, 1000);

io.on("connection", (socket) => {
    players[socket.id] = { x: 0.5, y: 0.5, color: null, score: 0 };
    socket.emit("init-game", { treasures, bases, gameTime });

    socket.on("set-base", (data) => {
        if(players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].color = data.color;
        }
        bases.push({ id: socket.id, x: data.x, y: data.y, color: data.color });
        io.emit("update-players", players);
    });

    socket.on("refresh-location", (data) => {
        if(!players[socket.id] || gameTime < 0) return;
        players[socket.id].x = data.xpos;
        players[socket.id].y = data.ypos;

        // Base capture logic
        bases.forEach(b => {
            if (b.id !== socket.id && Math.hypot(data.xpos - b.x, data.ypos - b.y) < 0.1) {
                b.color = data.color;
            }
        });

        // Treasure finding logic
        let scoreChanged = false;
        treasures.forEach(t => {
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.08) {
                t.found = true; t.foundBy = data.color;
                players[socket.id].score++;
                scoreChanged = true;
            }
        });

        io.emit("update-players", players);
        if (scoreChanged) {
            let lb = Object.values(players).filter(p => p.color !== null).sort((a,b)=>b.score-a.score).slice(0,5);
            io.emit("update-leaderboard", lb);
            io.emit("update-treasures", treasures);
        }
    });

    socket.on("disconnect", () => { delete players[socket.id]; io.emit("update-players", players); });
});

server.listen(process.env.PORT || 3000);