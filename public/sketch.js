let socket, myPos = { x: 0.5, y: 0.5 }, treasures = [], bases = [], leaderboard = [];
let allPlayers = {}; // Dictionary to store other players' data
let myColor, mapImg, heading = 0, timeLeft = 300;
let gameState = 0, lastAccel = 0, startTime;

// --- Parameters ---
const REAL_SIZE = 4.47; 
const STEP_THRES = 2.8; 
const STEP_VAL = 0.03;

function preload() { mapImg = loadImage('map.jpg'); }

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));
    startTime = millis();

    socket.on("init-game", d => { treasures = d.treasures || []; bases = d.bases || []; timeLeft = d.gameTime || 300; });
    socket.on("update-treasures", d => { treasures = d || []; });
    socket.on("update-bases", d => { bases = d || []; });
    socket.on("update-players", d => { allPlayers = d || {}; });
    socket.on("update-leaderboard", d => { leaderboard = d || []; });
    socket.on("timer-update", t => { timeLeft = t; });
    
    socket.on("game-reset", () => { 
        gameState = 0; startTime = millis(); treasures = []; bases = []; leaderboard = [];
    });
}

function mousePressed() {
    if (gameState === 0) {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(oState => {
                if (oState === 'granted') {
                    window.addEventListener('deviceorientation', e => { heading = e.webkitCompassHeading || e.alpha; });
                    return DeviceMotionEvent.requestPermission();
                }
            }).then(mState => {
                if (mState === 'granted') { window.addEventListener('devicemotion', handleMotion, true); }
            });
        } else {
            window.addEventListener('devicemotion', handleMotion, true);
            window.addEventListener('deviceorientation', e => { heading = e.webkitCompassHeading || e.alpha; });
        }
        myPos.x = mouseX / width; myPos.y = mouseY / height;
        socket.emit("set-base", { x: myPos.x, y: myPos.y, color: {r: red(myColor), g: green(myColor), b: blue(myColor)} });
        gameState = 3; startTime = millis();
        return false;
    }
}

function handleMotion(e) {
    if (gameState !== 3) return;
    let acc = e.accelerationIncludingGravity;
    if (!acc) return;
    let current = sqrt(acc.x*acc.x + acc.y*acc.y + acc.z*acc.z);
    let delta = abs(current - lastAccel);
    if (delta > STEP_THRES) {
        myPos.x += cos(radians(heading - 90)) * STEP_VAL;
        myPos.y += sin(radians(heading - 90)) * STEP_VAL;
        myPos.x = constrain(myPos.x, 0.01, 0.99); 
        myPos.y = constrain(myPos.y, 0.01, 0.99);
        sync();
    }
    lastAccel = current;
}

function sync() {
    socket.emit("refresh-location", { xpos: myPos.x, ypos: myPos.y, color: {r: red(myColor), g: green(myColor), b: blue(myColor)} });
}

function draw() {
    image(mapImg, 0, 0, width, height);
    if (gameState === 0) {
        drawOverlay("TAP ANYWHERE TO START"); 
    } else {
        runGameSession();
        if (millis() - startTime < 5000) {
            drawFadingTip("BASE DEPLOYED!", map(millis() - startTime, 4000, 5000, 255, 0));
        }
    }
}

function runGameSession() {
    let minDist = 1.0;
    treasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) minDist = d;
    });

    drawDistanceBar(minDist);
    drawBases(); 
    drawStars(); 
    drawTimer(); 
    drawLeaderboard();
    
    // Draw all players (including yourself)
    for (let id in allPlayers) {
        let p = allPlayers[id];
        if (p.color) {
            drawOtherPlayer(p.x * width, p.y * height, p.color, id === socket.id);
        }
    }
}

function drawOtherPlayer(x, y, col, isMe) {
    push();
    translate(x, y);
    // Draw identity circle
    fill(col.r, col.g, col.b);
    stroke(255);
    strokeWeight(isMe ? 3 : 1); // Thicker stroke for the local player
    circle(0, 0, 15);
    
    // Draw compass for the local player
    if (isMe) {
        noFill();
        stroke(255, 150);
        ellipse(0, 0, 30, 30);
        stroke(255, 0, 0);
        line(0, 0, 0, -16);
    }
    pop();
}

// Visual UI components
function drawDistanceBar(d) {
    let barW = 8;
    fill(d < (0.5/REAL_SIZE) ? color(255, 0, 0) : color(255, 180));
    noStroke();
    rect(0, height, barW, -map(d, 0, 0.8, height, 0));
}

function drawLeaderboard() {
    if (!leaderboard || leaderboard.length === 0) return;
    push(); fill(0, 180); stroke(255); strokeWeight(1);
    rect(20, 65, 150, leaderboard.length * 25 + 10, 5);
    noStroke(); fill(255); textAlign(LEFT, TOP); textSize(13);
    leaderboard.forEach((p, i) => {
        fill(p.color.r, p.color.g, p.color.b); circle(35, 78 + i * 25, 10);
        fill(255); text(`Rank ${i+1}: ${p.score} ⭐`, 50, 72 + i * 25);
    });
    pop();
}

function drawTimer() { fill(0, 150); rect(width/2 - 50, 15, 100, 35, 8); fill(255); textAlign(CENTER, CENTER); text(`${floor(timeLeft/60)}:${nf(timeLeft%60, 2)}`, width/2, 32); }
function drawBases() { if(bases) bases.forEach(b => { push(); translate(b.x*width, b.y*height); fill(b.color.r, b.color.g, b.color.b); stroke(255); rectMode(CENTER); rect(0, 5, 22, 16); triangle(-14, 5, 0, -12, 14, 5); pop(); }); }
function drawStars() { if(treasures) treasures.forEach(t => { if (t.found) { push(); translate(t.x*width, t.y*height); fill(t.foundBy.r, t.foundBy.g, t.foundBy.b); noStroke(); beginShape(); for(let i=0; i<10; i++){ let r=(i%2==0)?10:5; vertex(r*cos(TWO_PI*i/10), r*sin(TWO_PI*i/10)); } endShape(CLOSE); pop(); } }); }
function drawOverlay(t) { fill(0, 220); rect(0, 0, width, height); fill(255); textAlign(CENTER); text(t, width/2, height/2); }
function drawFadingTip(t, a) { fill(0, a*0.6); rect(0, height-100, width, 50); fill(255, a); textAlign(CENTER); text(t, width/2, height-75); }