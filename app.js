const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let treasures = [];
let starsCount = 0;
let activatedHistory = []; // 存储已被激活的宝藏及其颜色

function initMap() {
    // 每次生成10个宝藏，去掉炸弹
    treasures = Array.from({length: 10}, () => ({
        x: Math.random(), 
        y: Math.random(), 
        found: false,
        foundByColor: null 
    }));
}
initMap();

io.on("connection", (socket) => {
    socket.emit("init-game", { treasures, starsCount });

    socket.on("refresh-location", (data) => {
        // 广播新位置给所有人看到
        socket.broadcast.emit("player-pulse", data);

        // 检测碰撞
        treasures.forEach(t => {
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.08) {
                t.found = true;
                t.foundByColor = { r: data.userR, g: data.userG, b: data.userB };
                io.emit("treasure-activated", { treasures, starsCount });
            }
        });

        if (treasures.every(t => t.found)) {
            starsCount++;
            initMap();
            io.emit("level-up", { treasures, starsCount });
        }
    });
});

http.listen(process.env.PORT || 3000);