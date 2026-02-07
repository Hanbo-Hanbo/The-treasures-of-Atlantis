const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

app.use(express.static("public"));

let treasures = [];
let bases = [];
let gameTime = 300; // 300s = 5min

function initMap() {
    treasures = Array.from({length: 10}, () => ({
        x: Math.random(), y: Math.random(), found: false, foundBy: null 
    }));
}
initMap();

// 每秒更新一次全服时间
setInterval(() => {
    if (gameTime > 0) {
        gameTime--;
        io.emit("timer-update", gameTime);
    } else {
        gameTime = 300; // 自动开启新一轮
        initMap();
        bases = [];
        io.emit("init-game", { treasures, bases, gameTime });
    }
}, 1000);

io.on("connection", (socket) => {
    socket.emit("init-game", { treasures, bases, gameTime });

    socket.on("set-base", (data) => {
        // 每个玩家只能有一个大本营，如果已存在则更新位置
        let existing = bases.find(b => b.id === socket.id);
        if (existing) {
            existing.x = data.x; existing.y = data.y;
        } else {
            bases.push({ id: socket.id, x: data.x, y: data.y, color: data.color });
        }
        io.emit("update-bases", bases);
    });

    socket.on("refresh-location", (data) => {
        // 占领大本营检测
        bases.forEach(b => {
            if (b.id !== socket.id && Math.hypot(data.xpos - b.x, data.ypos - b.y) < 0.1) {
                b.color = data.color;
            }
        });
        
        // 星星点亮检测
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