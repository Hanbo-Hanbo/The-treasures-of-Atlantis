const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

app.use(express.static("public"));

let treasures = [];
let bases = [];
let gameTime = 300; 
let players = {}; 

// --- 初始化 10 颗星星 ---
function initMap() {
    treasures = Array.from({length: 10}, () => ({
        x: Math.random(), y: Math.random(), found: false, foundBy: null 
    }));
}
initMap();

// --- 全局倒计时逻辑 ---
setInterval(() => {
    if (gameTime > 0) {
        gameTime--;
        io.emit("timer-update", gameTime);
    } else {
        // 游戏结束：发送最终排名
        let finalResults = Object.values(players)
            .filter(p => p.color !== null)
            .sort((a,b) => b.score - a.score)
            .slice(0, 5);
        
        io.emit("game-over", finalResults);
        
        // 10秒后重置
        setTimeout(() => {
            gameTime = 300;
            initMap(); 
            bases = [];
            for (let id in players) { players[id].score = 0; }
            io.emit("game-reset"); 
        }, 10000);
        
        gameTime = -1; // 暂停状态
    }
}, 1000);

io.on("connection", (socket) => {
    // 新玩家连接
    players[socket.id] = { x: 0.5, y: 0.5, color: null, score: 0 };
    
    // 1. 发送当前所有数据给【新玩家】（这就解释了为什么后来的能看到前面的）
    socket.emit("init-game", { treasures, bases, gameTime });

    // 2. 监听：放置大本营
    socket.on("set-base", (data) => {
        if(players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].color = data.color;
        }

        // --- 核心修复：防重复 & 全员广播 ---
        // 先删除该玩家之前的大本营（如果已存在），确保一人一个
        bases = bases.filter(b => b.id !== socket.id);
        
        // 添加新的
        bases.push({ id: socket.id, x: data.x, y: data.y, color: data.color });
        
        // 广播给【所有在线玩家】（包括自己和老玩家）
        io.emit("update-players", players);
        io.emit("update-bases", bases); // <--- 这一行是修复 "第一个人看不到后续玩家" 的关键
    });

    // 3. 监听：位置刷新
    socket.on("refresh-location", (data) => {
        if(!players[socket.id] || gameTime < 0) return;
        players[socket.id].x = data.xpos;
        players[socket.id].y = data.ypos;

        // 抢夺大本营逻辑
        bases.forEach(b => {
            if (b.id !== socket.id && Math.hypot(data.xpos - b.x, data.ypos - b.y) < 0.1) {
                b.color = data.color;
            }
        });

        // 捡星星逻辑
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
        // 位置刷新时也广播一下大本营颜色（防止抢夺后不更新）
        io.emit("update-bases", bases);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        // 玩家离开后保留大本营（根据需求，也可以在这里删除 bases）
        io.emit("update-players", players);
    });
});

server.listen(process.env.PORT || 3000);