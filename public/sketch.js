let socket, myPos = { x: 0.5, y: 0.5 }, targetPos = { x: 0.5, y: 0.5 };
let treasures = [], bases = [], leaderboard = [], finalRanking = [];
let allPlayers = {}, myColor, mapImg, timeLeft = 300;
let gameState = 0, startTime, originCoords = null;
let heading = 0; 

// --- Config & Debug ---
let rawLat = "N/A", rawLon = "N/A", gpsAccuracy = "N/A";
let osc = null, nextBeepTime = 0;

const GAME_RANGE_METERS = 7.07; 
const LERP_FACTOR = 0.05;       
const KB_SPEED = 0.005; 

function preload() { mapImg = loadImage('map.jpg'); }

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));
    
    if (typeof p5.Oscillator !== 'undefined') {
        osc = new p5.Oscillator('triangle'); osc.amp(0); osc.start();
    }

    socket.on("init-game", d => { treasures = d.treasures || []; bases = d.bases || []; timeLeft = d.gameTime || 300; });
    socket.on("update-treasures", d => treasures = d || []);
    socket.on("update-bases", d => bases = d || []);
    socket.on("update-players", d => allPlayers = d || {});
    socket.on("update-leaderboard", d => leaderboard = d || []);
    socket.on("timer-update", t => timeLeft = t);
    socket.on("game-over", data => { finalRanking = data || []; gameState = 4; });
    socket.on("game-reset", () => { 
        gameState = 0; startTime = millis(); treasures = []; bases = []; 
        leaderboard = []; finalRanking = []; originCoords = null;
    });
}

// CRITICAL: Request permissions on first user interaction
function mousePressed() {
    if (gameState === 0) {
        if (typeof userStartAudio !== 'undefined') userStartAudio();

        // 1. Compass Permission (iOS 13+)
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        window.addEventListener('deviceorientation', handleOrientation, true);
                    }
                })
                .catch(console.error);
        } else {
            // Android or non-iOS
            window.addEventListener('deviceorientation', handleOrientation, true);
        }

        // 2. GPS Tracking
        if ("geolocation" in navigator) {
            navigator.geolocation.watchPosition(handleGPS, null, { enableHighAccuracy: true });
        }

        // 3. Set Base and Start
        targetPos.x = mouseX / width; targetPos.y = mouseY / height;
        myPos.x = targetPos.x; myPos.y = targetPos.y;
        socket.emit("set-base", { 
            x: targetPos.x, y: targetPos.y, 
            color: {r: red(myColor), g: green(myColor), b: blue(myColor)} 
        });
        
        gameState = 3; startTime = millis();
        return false;
    }
}

function handleOrientation(event) {
    // iOS uses webkitCompassHeading for absolute north
    if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
    } else {
        // Android/Other fallback
        heading = 360 - event.alpha;
    }
}

function handleGPS(position) {
    let lat = position.coords.latitude;
    let lon = position.coords.longitude;
    rawLat = lat.toFixed(6); rawLon = lon.toFixed(6); gpsAccuracy = position.coords.accuracy.toFixed(1) + "m";

    if (gameState !== 3) return;
    if (!originCoords) originCoords = { lat, lon };

    let deltaY = (lat - originCoords.lat) * 111320;
    let deltaX = (lon - originCoords.lon) * (111320 * cos(radians(lat)));

    targetPos.x = constrain(0.5 + (deltaX / GAME_RANGE_METERS), 0.01, 0.99);
    targetPos.y = constrain(0.5 - (deltaY / GAME_RANGE_METERS), 0.01, 0.99);
    sync();
}

function handleKeyboard() {
    if (gameState !== 3) return;
    let moved = false;
    if (keyIsDown(87) || keyIsDown(UP_ARROW)) { targetPos.y -= KB_SPEED; moved = true; } 
    if (keyIsDown(83) || keyIsDown(DOWN_ARROW)) { targetPos.y += KB_SPEED; moved = true; }
    if (keyIsDown(65) || keyIsDown(LEFT_ARROW)) { targetPos.x -= KB_SPEED; moved = true; }
    if (keyIsDown(68) || keyIsDown(RIGHT_ARROW)) { targetPos.x += KB_SPEED; moved = true; }
    if (moved) sync();
}

function sync() {
    socket.emit("refresh-location", { 
        xpos: myPos.x, ypos: myPos.y, 
        color: {r: red(myColor), g: green(myColor), b: blue(myColor)} 
    });
}

function draw() {
    background(0);
    if (gameState === 3) handleKeyboard();
    myPos.x = lerp(myPos.x, targetPos.x, LERP_FACTOR);
    myPos.y = lerp(myPos.y, targetPos.y, LERP_FACTOR);

    if (mapImg) image(mapImg, 0, 0, width, height);

    if (gameState === 0) {
        drawOverlay("TAP TO START");
    } else if (gameState === 3) {
        runGameSession();
        drawDiagnostic();
    } else if (gameState === 4) {
        if (osc) osc.amp(0); drawGameOverTable();
    }
}

function runGameSession() {
    let minDist = 1.0;
    if (treasures) {
        treasures.filter(t => !t.found).forEach(t => {
            let d = dist(myPos.x, myPos.y, t.x, t.y);
            if (d < minDist) minDist = d;
        });
    }
    handleAudioFeedback(minDist);
    drawDistanceBar(minDist);
    drawBases(); // Rendering all home bases
    drawStars(); drawTimer(); drawLeaderboard();
    for (let id in allPlayers) {
        let p = allPlayers[id];
        if (p && p.color) drawPlayerMarker(p.x * width, p.y * height, p.color, id === socket.id);
    }
}

function drawPlayerMarker(x, y, col, isMe) {
    push();
    translate(x, y);
    fill(col.r, col.g, col.b); stroke(255); strokeWeight(isMe ? 3 : 1);
    circle(0, 0, 18);
    if (isMe) {
        rotate(radians(heading));
        stroke(255, 0, 0); strokeWeight(2.5);
        line(0, 0, 0, -22); // Direction pointer
        fill(255, 0, 0); noStroke(); triangle(-5, -16, 5, -16, 0, -26);
        noFill(); stroke(255, 150); ellipse(0, 0, 38, 38);
    }
    pop();
}

function drawBases() {
    if (!bases) return;
    bases.forEach(b => {
        push(); translate(b.x * width, b.y * height);
        fill(b.color.r, b.color.g, b.color.b); stroke(255); strokeWeight(1.5);
        rectMode(CENTER); rect(0, 5, 24, 18); triangle(-16, 5, 0, -14, 16, 5);
        pop();
    });
}

function drawDiagnostic() {
    push(); textAlign(LEFT, BOTTOM); textSize(9); fill(255, 120);
    text(`DIR: ${floor(heading)}° | GPS: ${rawLat}, ${rawLon}`, 15, height - 15);
    pop();
}

// ... helper functions: drawDistanceBar, drawLeaderboard, drawTimer, drawStars, drawOverlay, drawFadingTip, drawGameOverTable, handleAudioFeedback ...
function drawDistanceBar(d) { let barW = 8; fill(d < (0.5/GAME_RANGE_METERS) ? color(255, 0, 0) : color(255, 180)); noStroke(); rect(0, height, barW, -map(d, 0, 0.8, height, 0)); }
function drawLeaderboard() { if (!leaderboard || leaderboard.length === 0) return; push(); fill(0, 200); stroke(255); strokeWeight(1); rect(20, 65, 150, leaderboard.length * 25 + 10, 5); noStroke(); fill(255); textAlign(LEFT, TOP); textSize(12); leaderboard.forEach((p, i) => { if(p.color) { fill(p.color.r, p.color.g, p.color.b); circle(35, 78 + i * 25, 10); fill(255); text(`Rank ${i+1}: ${p.score} ⭐`, 50, 72 + i * 25); } }); pop(); }
function drawTimer() { fill(0, 150); rect(width/2 - 50, 15, 100, 35, 8); fill(255); textAlign(CENTER, CENTER); text(timeLeft < 0 ? "0:00" : `${floor(timeLeft/60)}:${nf(timeLeft%60, 2)}`, width/2, 32); }
function drawStars() { if(treasures) treasures.forEach(t => { if (t.found) { push(); translate(t.x*width, t.y*height); fill(t.foundBy.r, t.foundBy.g, t.foundBy.b); noStroke(); beginShape(); for(let i=0; i<10; i++){ let r=(i%2==0)?10:5; vertex(r*cos(TWO_PI*i/10), r*sin(TWO_PI*i/10)); } endShape(CLOSE); pop(); } }); }
function drawOverlay(t) { fill(0, 220); rect(0, 0, width, height); fill(255); textAlign(CENTER); text(t, width/2, height/2); }
function drawGameOverTable() { fill(0, 240); rect(0, 0, width, height); push(); fill(0); stroke(255); strokeWeight(2); rect(width/2 - 110, height/2 - 150, 220, 300, 10); noStroke(); fill(255); textAlign(CENTER); textSize(22); text("GAME OVER", width/2, height/2 - 110); textSize(13); text("FINAL SCORES", width/2, height/2 - 80); textAlign(LEFT); finalRanking.forEach((p, i) => { if(p.color){ fill(p.color.r, p.color.g, p.color.b); circle(width/2 - 70, height/2 - 40 + i * 35, 10); fill(255); text(`${i+1}. ${p.score} Stars`, width/2 - 50, height/2 - 36 + i * 35); } }); pop(); }
function handleAudioFeedback(d) { if (!osc || d > 0.5) return; let interval = map(d, 0, 0.5, 120, 1500); let freq = map(d, 0, 0.5, 900, 250); if (millis() > nextBeepTime) { osc.freq(freq); osc.amp(0.25, 0.05); setTimeout(() => { if(osc) osc.amp(0, 0.1); }, 100); nextBeepTime = millis() + interval; } }