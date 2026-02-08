const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

app.use(express.static("public"));

let treasures = [];
let bases = [];
let gameTime = 300; 
let playerScores = {};

function initMap() {
    treasures = Array.from({length: 5}, () => ({
        x: Math.random(), y: Math.random(), found: false, foundBy: null 
    }));
}
initMap();

// 核心倒计时与重置
setInterval(() => {
    if (gameTime > 0) {
        gameTime--;
        io.emit("timer-update", gameTime);
    } else {
        // 5分钟结束，触发全局强制重置
        gameTime = 300;
        initMap(); 
        bases = [];
        playerScores = {}; 
        io.emit("game-reset"); // 发送重置指令给所有客户端
    }
}, 1000);

io.on("connection", (socket) => {
    playerScores[socket.id] = { color: null, score: 0 };
    socket.emit("init-game", { treasures, bases, gameTime });

    socket.on("set-base", (data) => {
        playerScores[socket.id] = { color: data.color, score: 0 };
        bases.push({ id: socket.id, x: data.x, y: data.y, color: data.color });
        io.emit("update-bases", bases);
    });

    socket.on("refresh-location", (data) => {
        bases.forEach(b => {
            if (b.id !== socket.id && Math.hypot(data.xpos - b.x, data.ypos - b.y) < 0.1) {
                b.color = data.color;
            }
        });
        let scoreChanged = false;
        treasures.forEach(t => {
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.08) {
                t.found = true; t.foundBy = data.color;
                if(playerScores[socket.id]) { playerScores[socket.id].score++; scoreChanged = true; }
            }
        });
        if (scoreChanged) broadcastLeaderboard();
        io.emit("update-treasures", treasures);
        io.emit("update-bases", bases);
    });

    socket.on("disconnect", () => { delete playerScores[socket.id]; broadcastLeaderboard(); });
});

function broadcastLeaderboard() {
    let lb = Object.values(playerScores).filter(p => p.color !== null).sort((a, b) => b.score - a.score).slice(0, 5);
    io.emit("update-leaderboard", lb);
}

server.listen(process.env.PORT || 3000);