let socket, myPos = { x: 0.5, y: 0.5 }, targetPos = { x: 0.5, y: 0.5 };
let treasures = [], bases = [], leaderboard = [], finalRanking = [];
let allPlayers = {}, myColor, mapImg, timeLeft = 300;
let gameState = 0, startTime, originCoords = null;
let heading = 0; 

// --- Config ---
let rawLat = "N/A", rawLon = "N/A", gpsAccuracy = "N/A";
let osc = null, nextBeepTime = 0;

const GAME_RANGE_METERS = 7.07; 
const LERP_FACTOR = 0.05;       
const MIN_ACCURACY = 25; 
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

function mousePressed() {
    if (gameState === 0) {
        if (typeof userStartAudio !== 'undefined') userStartAudio();
        
        if ("geolocation" in navigator) {
            navigator.geolocation.watchPosition(handleGPS, null, { enableHighAccuracy: true, maximumAge: 0 });
        }

        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(res => {
                if (res === 'granted') {
                    window.addEventListener('deviceorientation', e => {
                        heading = e.webkitCompassHeading || (360 - e.alpha) || 0;
                    }, true);
                }
            });
        } else {
            window.addEventListener('deviceorientation', e => {
                heading = e.webkitCompassHeading || (360 - e.alpha) || 0;
            }, true);
        }

        let clickX = mouseX / width; let clickY = mouseY / height;
        targetPos.x = clickX; targetPos.y = clickY;
        myPos.x = clickX; myPos.y = clickY;

        const myBase = { id: socket.id, x: clickX, y: clickY, color: {r:red(myColor), g:green(myColor), b:blue(myColor)} };
        bases.push(myBase);
        
        socket.emit("set-base", { x: clickX, y: clickY, color: myBase.color });
        gameState = 3; startTime = millis();
        return false;
    }
}

function handleGPS(position) {
    let lat = position.coords.latitude;
    let lon = position.coords.longitude;
    let acc = position.coords.accuracy;
    rawLat = lat.toFixed(6); rawLon = lon.toFixed(6); gpsAccuracy = acc.toFixed(1) + "m";

    if (gameState !== 3) return;
    if (acc > MIN_ACCURACY) return;

    if (!originCoords) originCoords = { lat, lon };

    let deltaY = (lat - originCoords.lat) * 111320;
    let deltaX = (lon - originCoords.lon) * (111320 * cos(radians(lat)));

    let nx = constrain(0.5 + (deltaX / GAME_RANGE_METERS), 0.01, 0.99);
    let ny = constrain(0.5 - (deltaY / GAME_RANGE_METERS), 0.01, 0.99);

    if (dist(targetPos.x, targetPos.y, nx, ny) < 0.15) {
        targetPos.x = nx; targetPos.y = ny;
        sync();
    }
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
        drawOverlay("TAP TO SET BASE & START");
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
    drawBases(); 
    drawStars(); drawTimer(); drawLeaderboard();
    
    for (let id in allPlayers) {
        let p = allPlayers[id];
        if (p && p.color) drawPlayerMarker(p.x * width, p.y * height, p.color, id === socket.id);
    }
}

// --- The New Compass Logic ---
function drawPlayerMarker(x, y, col, isMe) {
    push();
    translate(x, y);
    
    // Draw base player circle
    fill(col.r, col.g, col.b); stroke(255); strokeWeight(isMe ? 3 : 1);
    circle(0, 0, 18);
    
    if (isMe) {
        // 1. Draw Device Orientation (Ghost Cone) - Where your phone is pointing
        push();
        rotate(radians(heading || 0));
        noStroke(); fill(255, 30); // Very faint white
        arc(0, 0, 80, 80, radians(-30), radians(30), PIE); // Field of view cone
        pop();

        // 2. Draw Treasure Compass (Red Needle) - Points to nearest treasure
        let nearest = getNearestTreasure();
        if (nearest) {
            let dx = nearest.x - myPos.x;
            let dy = nearest.y - myPos.y;
            // Calculate angle: p5 y-axis is down, so we use atan2(dy, dx)
            // +PI/2 because we draw the needle pointing UP (0, -radius)
            let angleToTreasure = atan2(dy, dx) + PI/2; 
            
            push();
            rotate(angleToTreasure);
            stroke(255, 0, 0); strokeWeight(3);
            line(0, 0, 0, -28); // Longer needle
            fill(255, 0, 0); noStroke();
            triangle(-6, -20, 6, -20, 0, -32); // Arrowhead
            pop();
        }

        // Outer ring
        noFill(); stroke(255, 100); ellipse(0, 0, 40, 40);
        fill(255); textAlign(CENTER); textSize(10); text("YOU", 0, 32);
    }
    pop();
}

function getNearestTreasure() {
    let closest = null;
    let record = Infinity;
    treasures.forEach(t => {
        if (!t.found) {
            let d = dist(myPos.x, myPos.y, t.x, t.y);
            if (d < record) {
                record = d;
                closest = t;
            }
        }
    });
    return closest;
}

function handleAudioFeedback(d) {
    if (!osc || d > 0.5) return; 
    let interval = map(d, 0, 0.5, 100, 1000); 
    let freq = map(d, 0, 0.5, 1200, 300); // Higher pitch when closer
    if (millis() > nextBeepTime) {
        osc.freq(freq); osc.amp(0.3, 0.05);
        setTimeout(() => { if(osc) osc.amp(0, 0.1); }, 80);
        nextBeepTime = millis() + interval;
    }
}

// ... Visual Helpers ...
function drawBases() { if(bases) bases.forEach(b => { push(); translate(b.x*width, b.y*height); fill(b.color.r, b.color.g, b.color.b); stroke(255); strokeWeight(1.5); rectMode(CENTER); rect(0, 5, 24, 18); triangle(-16, 5, 0, -14, 16, 5); pop(); }); }
function drawDistanceBar(d) { let barW = 8; fill(d < (0.5/GAME_RANGE_METERS) ? color(255, 0, 0) : color(255, 180)); noStroke(); rect(0, height, barW, -map(d, 0, 0.8, height, 0)); }
function drawLeaderboard() { if (!leaderboard || leaderboard.length === 0) return; push(); fill(0, 200); stroke(255); strokeWeight(1); rect(20, 65, 150, leaderboard.length * 25 + 10, 5); noStroke(); fill(255); textAlign(LEFT, TOP); textSize(12); leaderboard.forEach((p, i) => { if(p.color) { fill(p.color.r, p.color.g, p.color.b); circle(35, 78 + i * 25, 10); fill(255); text(`Rank ${i+1}: ${p.score} ⭐`, 50, 72 + i * 25); } }); pop(); }
function drawTimer() { fill(0, 150); rect(width/2 - 50, 15, 100, 35, 8); fill(255); textAlign(CENTER, CENTER); text(timeLeft < 0 ? "0:00" : `${floor(timeLeft/60)}:${nf(timeLeft%60, 2)}`, width/2, 32); }
function drawStars() { if(treasures) treasures.forEach(t => { if (t.found) { push(); translate(t.x*width, t.y*height); fill(t.foundBy.r, t.foundBy.g, t.foundBy.b); noStroke(); beginShape(); for(let i=0; i<10; i++){ let r=(i%2==0)?10:5; vertex(r*cos(TWO_PI*i/10), r*sin(TWO_PI*i/10)); } endShape(CLOSE); pop(); } }); }
function drawOverlay(t) { fill(0, 220); rect(0, 0, width, height); fill(255); textAlign(CENTER); text(t, width/2, height/2); }
function drawDiagnostic() { push(); textAlign(LEFT, BOTTOM); textSize(9); fill(255, 120); text(`GPS: ${rawLat}, ${rawLon} | ACC: ${gpsAccuracy}`, 15, height - 15); pop(); }
function drawGameOverTable() { fill(0, 240); rect(0, 0, width, height); push(); fill(0); stroke(255); strokeWeight(2); rect(width/2 - 110, height/2 - 150, 220, 300, 10); noStroke(); fill(255); textAlign(CENTER); textSize(22); text("GAME OVER", width/2, height/2 - 110); textSize(13); text("FINAL SCORES", width/2, height/2 - 80); textAlign(LEFT); finalRanking.forEach((p, i) => { if(p.color){ fill(p.color.r, p.color.g, p.color.b); circle(width/2 - 70, height/2 - 40 + i * 35, 10); fill(255); text(`${i+1}. ${p.score} Stars`, width/2 - 50, height/2 - 36 + i * 35); } }); pop(); }