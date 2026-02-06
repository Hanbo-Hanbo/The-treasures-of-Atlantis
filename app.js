const express = require("express"); // Imports Express [cite: 163]
const app = express(); // Creates app [cite: 165]
const server = require("http").createServer(app); // Raw HTTP server [cite: 168, 171]
const io = require("socket.io")(server); // Socket.IO server [cite: 172, 173]

app.use(express.static("public")); // Serves client files [cite: 178, 179]

let treasures = [];
let bombs = [];
let stars = 0;
let drawingHistory = []; // Stores events in memory [cite: 188, 189]

function initMap() {
    treasures = Array.from({length: 3}, () => ({x: Math.random(), y: Math.random(), found: false}));
    bombs = Array.from({length: 3}, () => ({x: Math.random(), y: Math.random()}));
}
initMap();

io.on("connection", (socket) => {
    console.log("A seeker connected"); // Server-side debug [cite: 194, 195]
    socket.emit("status-update", { treasures, stars });
    socket.emit("history", drawingHistory); // Sends full history to new user [cite: 196, 197]

    socket.on("drawing", (data) => {
        drawingHistory.push(data); // Stores in server memory [cite: 201, 202]
        if(drawingHistory.length > 2000) drawingHistory.shift(); // Limits memory [cite: 190, 203, 205, 206]
        
        socket.broadcast.emit("drawing", data); // Relay to other users [cite: 207, 208]
        
        treasures.forEach(t => {
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.07) {
                t.found = true;
                io.emit("status-update", { treasures, stars });
            }
        });

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

server.listen(process.env.PORT || 3000); // Starts server on port [cite: 175, 176, 181, 182]