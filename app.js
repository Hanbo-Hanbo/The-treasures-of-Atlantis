const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let treasures = [];
function initMap() {
    // 10 treasures per round, no bombs
    treasures = Array.from({length: 10}, () => ({
        x: Math.random(), 
        y: Math.random(), 
        found: false,
        foundByColor: null 
    }));
}
initMap();

io.on("connection", (socket) => {
    socket.emit("init-game", { treasures });

    socket.on("refresh-location", (data) => {
        socket.broadcast.emit("player-pulse", data); // Show other players

        treasures.forEach(t => {
            // Collision detection in normalized space
            if (!t.found && Math.hypot(data.xpos - t.x, data.ypos - t.y) < 0.08) {
                t.found = true;
                t.foundByColor = { r: data.userR, g: data.userG, b: data.userB };
                io.emit("treasure-activated", { treasures });
            }
        });

        if (treasures.every(t => t.found)) initMap();
    });
});

http.listen(process.env.PORT || 3000);