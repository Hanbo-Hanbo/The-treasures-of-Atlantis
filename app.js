const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

app.use(express.static("public"));

let treasures = [];
let bases = [];
let gameTime = 300; // 5分钟倒计时

// 初始化地图：修改为 5 颗随机星星
function initMap() {
    treasures = Array.from({length: 5}, () => ({
        x: Math.random(), 
        y: Math.random(), 
        found: false, 
        foundBy: null 
    }));
}
initMap();

// 全局计时器逻辑
setInterval(() => {
    if (gameTime > 0) {
        gameTime--;
        io.emit("timer-update", gameTime);
    } else {
        // 每一轮结束自动重置
        gameTime = 300;
        initMap();
        bases = [];
        io.emit("init-game", { treasures, bases, gameTime });
    }
}, 1000);

io.on("connection", (socket) => {
    socket.emit("init-game", { treasures, bases, gameTime });

    // 设置大本营逻辑
    socket.on("set-base", (data) => {
        bases.push({ id: socket.id, x: data.x, y: data.y, color: data.color });
        io.emit("update-bases", bases);
    });

    // 位置更新与碰撞检测
    socket.on("refresh-location", (data) => {
        // 大本营占领检测 (距离约 0.44米)
        bases.forEach(b => {
            if (b.id !== socket.id && Math.hypot(data.xpos - b.x, data.ypos - b.y) < 0.1) {
                b.color = data.color;
            }
        });
        
        // 寻宝检测 (距离约 0.35米)
        treasures.forEach(t => {
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.08) {
                t.found = true;
                t.foundBy = data.color;
            }
        });
        
        io.emit("update-treasures", treasures);
        io.emit("update-bases", bases);
    });
});

server.listen(process.env.PORT || 3000);