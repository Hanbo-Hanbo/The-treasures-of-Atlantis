const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

app.use(express.static("public"));

let treasures = [];
let bombs = [];
let stars = 0;
let drawingHistory = [];

function initMap() {
    // Treasures are generated in normalized 0-1 coordinates for scaling [cite: 188-191]
    treasures = Array.from({length: 3}, () => ({x: Math.random(), y: Math.random(), found: false}));
    bombs = Array.from({length: 3}, () => ({x: Math.random(), y: Math.random()}));
}
initMap();

io.on("connection", (socket) => {
    socket.emit("status-update", { treasures, stars });
    socket.emit("history", drawingHistory);

    socket.on("drawing", (data) => {
        drawingHistory.push(data);
        if(drawingHistory.length > 2000) drawingHistory.shift();
        socket.broadcast.emit("drawing", data);
        
        treasures.forEach(t => {
            // Hit detection in 5sqm: using normalized distance
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.08) {
                t.found = true;
                io.emit("status-update", { treasures, stars });
            }
        });

        bombs.forEach(b => {
            if (Math.hypot(data.xpos - b.x, data.ypos - b.y) < 0.06) {
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

server.listen(process.env.PORT || 3000);