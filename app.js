// ... 基础连接设置 [cite: 172-174] ...
let treasures = [];
let bombs = [];
let stars = 0;

function initMap() {
    treasures = Array.from({length: 3}, () => ({x: Math.random(), y: Math.random(), found: false}));
    bombs = Array.from({length: 3}, () => ({x: Math.random(), y: Math.random()}));
}
initMap();

io.on("connection", (socket) => {
    socket.emit("status-update", { treasures, stars });

    socket.on("drawing", (data) => {
        socket.broadcast.emit("drawing", data); // [cite: 207, 208]
        
        // 判定宝藏 [cite: 201]
        treasures.forEach(t => {
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.06) {
                t.found = true;
                io.emit("status-update", { treasures, stars });
            }
        });

        // 判定炸弹
        bombs.forEach(b => {
            if (Math.hypot(data.xpos - b.x, data.ypos - b.y) < 0.05) {
                socket.emit("bomb-hit");
            }
        });

        if (treasures.every(t => t.found)) {
            stars++;
            initMap();
            io.emit("status-update", { treasures, stars });
        }
    });
});