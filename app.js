const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let treasures = [];
let bases = []; // 存储所有玩家的大本营
let gameTime = 300; // 5分钟 (300秒)
let gameActive = true;

function initMap() {
    treasures = Array.from({length: 10}, () => ({
        x: Math.random(), y: Math.random(), 
        found: false, foundBy: null 
    }));
}
initMap();

// 游戏倒计时逻辑
let timer = setInterval(() => {
    if (gameTime > 0) {
        gameTime--;
        io.emit("timer-update", gameTime);
    } else {
        gameActive = false;
        clearInterval(timer);
        io.emit("game-over");
    }
}, 1000);

io.on("connection", (socket) => {
    socket.emit("init-game", { treasures, bases, gameTime });

    // 设置大本营
    socket.on("set-base", (data) => {
        bases.push({ id: socket.id, x: data.x, y: data.y, color: data.color });
        io.emit("update-bases", bases);
    });

    socket.on("refresh-location", (data) => {
        if (!gameActive) return;
        socket.broadcast.emit("player-pulse", data);

        // 1. 碰撞检测：隐藏的星星
        treasures.forEach(t => {
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.08) {
                t.found = true;
                t.foundBy = data.color;
                io.emit("update-treasures", treasures);
            }
        });

        // 2. 碰撞检测：占领对手大本营
        bases.forEach(b => {
            if (b.id !== socket.id && Math.hypot(data.xpos - b.x, data.ypos - b.y) < 0.1) {
                b.color = data.color; // 颜色变为占领者颜色
                io.emit("update-bases", bases);
            }
        });
    });
});

http.listen(process.env.PORT || 3000);