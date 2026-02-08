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

setInterval(() => {
    if (gameTime > 0) {
        gameTime--;
        io.emit("timer-update", gameTime);
    } else {
        gameTime = 300;
        initMap(); 
        bases = [];
        playerScores = {}; 
        io.emit("game-reset"); // 5分钟到，强制所有人回到设置大本营状态
    }
}, 1000);

io.on("connection", (socket) => {
    playerScores[socket.id] = { color: null, score: 0 };
    socket.emit("init-game", { treasures, bases, gameTime });

    socket.on("set-base", (d) => {
        playerScores[socket.id] = { color: d.color, score: 0 };
        bases.push({ id: socket.id, x: d.x, y: d.y, color: d.color });
        io.emit("update-bases", bases);
    });

    socket.on("refresh-location", (data) => {
        // 占领大本营检测
        bases.forEach(b => {
            if (b.id !== socket.id && Math.hypot(data.xpos - b.x, data.ypos - b.y) < 0.1) {
                b.color = data.color;
            }
        });
        // 寻宝检测
        let scoreChanged = false;
        treasures.forEach(t => {
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.08) {
                t.found = true; t.foundBy = data.color;
                if(playerScores[socket.id]) { playerScores[socket.id].score++; scoreChanged = true; }
            }
        });
        if (scoreChanged) {
            let lb = Object.values(playerScores).filter(p => p.color !== null).sort((a,b)=>b.score-a.score).slice(0,5);
            io.emit("update-leaderboard", lb);
        }
        io.emit("update-treasures", treasures);
        io.emit("update-bases", bases);
    });
    socket.on("disconnect", () => { delete playerScores[socket.id]; });
});

server.listen(process.env.PORT || 3000);