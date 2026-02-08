let socket, myPos = { x: 0.5, y: 0.5 }, targetPos = { x: 0.5, y: 0.5 };
let treasures = [], bases = [], leaderboard = [], finalRanking = [];
let allPlayers = {}, myColor, mapImg, timeLeft = 300;
let gameState = 0, startTime, originCoords = null;
let heading = 0; // Current compass heading

// --- New Audio & Visual Components ---
let osc; // Oscillator for proximity sound
let nextBeepTime = 0;

const GAME_RANGE_METERS = 7.07; 
const LERP_FACTOR = 0.08;       

function preload() { mapImg = loadImage('map.jpg'); }

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));
    
    // Audio Setup: Create a triangle wave oscillator
    osc = new p5.Oscillator('triangle');
    osc.amp(0); 
    osc.start();

    socket.on("init-game", d => { treasures = d.treasures || []; bases = d.bases || []; timeLeft = d.gameTime || 300; });
    socket.on("update-treasures", d => treasures = d);
    socket.on("update-bases", d => bases = d);
    socket.on("update-players", d => allPlayers = d);
    socket.on("update-leaderboard", d => leaderboard = d);
    socket.on("timer-update", t => timeLeft = t);
    
    socket.on("game-over", data => { finalRanking = data; gameState = 4; });
    socket.on("game-reset", () => { 
        gameState = 0; startTime = millis(); treasures = []; bases = []; 
        leaderboard = []; finalRanking = []; originCoords = null;
    });
}

function mousePressed() {
    if (gameState === 0) {
        // Start Audio Context on first click
        userStartAudio();

        if ("geolocation" in navigator) {
            navigator.geolocation.watchPosition(handleGPS, null, { enableHighAccuracy: true });
        }
        
        // Request Compass Permission (iOS)
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(res => {
                if (res === 'granted') {
                    window.addEventListener('deviceorientation', e => {
                        heading = e.webkitCompassHeading || e.alpha;
                    }, true);
                }
            });
        }

        targetPos.x = mouseX / width; targetPos.y = mouseY / height;
        myPos.x = targetPos.x; myPos.y = targetPos.y;
        socket.emit("set-base", { x: targetPos.x, y: targetPos.y, color: {r: red(myColor), g: green(myColor), b: blue(myColor)} });
        gameState = 3; startTime = millis();
        return false;
    }
}

function handleGPS(position) {
    if (gameState !== 3) return;
    let lat = position.coords.latitude;
    let lon = position.coords.longitude;
    if (!originCoords) originCoords = { lat, lon };

    let deltaY = (lat - originCoords.lat) * 111320;
    let deltaX = (lon - originCoords.lon) * (111320 * cos(radians(lat)));

    targetPos.x = constrain(0.5 + (deltaX / GAME_RANGE_METERS), 0.01, 0.99);
    targetPos.y = constrain(0.5 - (deltaY / GAME_RANGE_METERS), 0.01, 0.99);
    
    socket.emit("refresh-location", { xpos: myPos.x, ypos: myPos.y, color: {r: red(myColor), g: green(myColor), b: blue(myColor)} });
}

function draw() {
    myPos.x = lerp(myPos.x, targetPos.x, LERP_FACTOR);
    myPos.y = lerp(myPos.y, targetPos.y, LERP_FACTOR);

    image(mapImg, 0, 0, width, height);

    if (gameState === 0) {
        drawOverlay("TAP TO SET BASE & START\n(50m2 Arena)");
    } else if (gameState === 3) {
        runGameSession();
        drawSubtleInfo(); // Bottom-left coordinate display
    } else if (gameState === 4) {
        osc.amp(0); // Mute audio on game over
        drawGameOverTable();
    }
}

function runGameSession() {
    let minDist = 1.0;
    treasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) minDist = d;
    });

    handleAudioFeedback(minDist);
    drawDistanceBar(minDist);
    drawBases(); drawStars(); drawTimer(); drawLeaderboard();
    
    for (let id in allPlayers) {
        let p = allPlayers[id];
        if (p.color) drawPlayerMarker(p.x * width, p.y * height, p.color, id === socket.id);
    }
}

// --- Proximity Audio Logic ---
function handleAudioFeedback(d) {
    // interval $T \propto d$. Closer = faster beeps.
    let interval = map(d, 0, 0.5, 100, 1500); 
    let freq = map(d, 0, 0.5, 880, 220); // Closer = higher pitch
    
    if (millis() > nextBeepTime && d < 0.5) {
        osc.freq(freq);
        osc.amp(0.3, 0.05); // Fade in
        setTimeout(() => osc.amp(0, 0.1), 100); // Short beep
        nextBeepTime = millis() + interval;
    }
}

// --- Visual: Compass and Marker ---
function drawPlayerMarker(x, y, col, isMe) {
    push(); translate(x, y); 
    fill(col.r, col.g, col.b); stroke(255); strokeWeight(isMe ? 3 : 1);
    circle(0, 0, 18);
    
    if (isMe) {
        // Compass Needle
        rotate(radians(heading));
        stroke(255, 0, 0); strokeWeight(2);
        line(0, 0, 0, -20); // North indicator
        fill(255, 0, 0); triangle(-4, -15, 4, -15, 0, -22);
        
        noFill(); stroke(255, 100); ellipse(0, 0, 35, 35);
    }
    pop();
}

// --- Visual: Subtle Position Info ---
function drawSubtleInfo() {
    push();
    textAlign(LEFT, BOTTOM);
    textSize(10);
    fill(255, 60); // Very faint white
    let info = `REL POS: [${myPos.x.toFixed(3)}, ${myPos.y.toFixed(3)}]`;
    text(info, 15, height - 15);
    pop();
}

// --- Helper Functions (No changes needed) ---
function drawDistanceBar(d) { let barW = 8; fill(d < (0.5/GAME_RANGE_METERS) ? color(255, 0, 0) : color(255, 180)); noStroke(); rect(0, height, barW, -map(d, 0, 0.8, height, 0)); }
function drawLeaderboard() { if (!leaderboard || leaderboard.length === 0) return; push(); fill(0, 180); stroke(255); strokeWeight(1); rect(20, 65, 150, leaderboard.length * 25 + 10, 5); noStroke(); fill(255); textAlign(LEFT, TOP); textSize(12); leaderboard.forEach((p, i) => { fill(p.color.r, p.color.g, p.color.b); circle(35, 78 + i * 25, 10); fill(255); text(`Rank ${i+1}: ${p.score} ⭐`, 50, 72 + i * 25); }); pop(); }
function drawTimer() { fill(0, 150); rect(width/2 - 50, 15, 100, 35, 8); fill(255); textAlign(CENTER, CENTER); text(timeLeft < 0 ? "0:00" : `${floor(timeLeft/60)}:${nf(timeLeft%60, 2)}`, width/2, 32); }
function drawBases() { if(bases) bases.forEach(b => { push(); translate(b.x*width, b.y*height); fill(b.color.r, b.color.g, b.color.b); stroke(255); rectMode(CENTER); rect(0, 5, 22, 16); triangle(-14, 5, 0, -12, 14, 5); pop(); }); }
function drawStars() { if(treasures) treasures.forEach(t => { if (t.found) { push(); translate(t.x*width, t.y*height); fill(t.foundBy.r, t.foundBy.g, t.foundBy.b); noStroke(); beginShape(); for(let i=0; i<10; i++){ let r=(i%2==0)?10:5; vertex(r*cos(TWO_PI*i/10), r*sin(TWO_PI*i/10)); } endShape(CLOSE); pop(); } }); }
function drawOverlay(t) { fill(0, 220); rect(0, 0, width, height); fill(255); textAlign(CENTER); text(t, width/2, height/2); }
function drawFadingTip(t, a) { fill(0, a*0.6); rect(0, height-100, width, 50); fill(255, a); textAlign(CENTER); text(t, width/2, height-75); }
function drawGameOverTable() { fill(0, 230); rect(0, 0, width, height); push(); fill(0); stroke(255); strokeWeight(2); rect(width/2 - 120, height/2 - 150, 240, 300, 10); noStroke(); fill(255); textAlign(CENTER); textSize(24); text("GAME OVER", width/2, height/2 - 110); textSize(14); text("FINAL RANKING", width/2, height/2 - 80); textAlign(LEFT); finalRanking.forEach((p, i) => { fill(p.color.r, p.color.g, p.color.b); circle(width/2 - 80, height/2 - 40 + i * 35, 12); fill(255); text(`Rank ${i+1}: ${p.score} Stars`, width/2 - 50, height/2 - 35 + i * 35); }); textAlign(CENTER); textSize(10); text("NEW ROUND STARTING SOON...", width/2, height/2 + 130); pop(); }