const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static("public"));

let treasures = [];
let bombs = [];
let stars = 0;
let drawingHistory = [];

function initMap() {
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
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.06) {
                t.found = true;
                io.emit("status-update", { treasures, stars });
            }
        });

        bombs.forEach(b => {
            if (Math.hypot(data.xpos - b.x, data.ypos - b.y) < 0.05) socket.emit("bomb-hit");
        });

        if (treasures.every(t => t.found)) {
            stars++;
            initMap();
            io.emit("status-update", { treasures, stars });
        }
    });
});

server.listen(process.env.PORT || 3000, () => console.log("Server running"));