let socket;
let myPos = { x: 0.5, y: 0.5 };
let treasures = [];
let bases = [];
let leaderboard = [];
let myColor;
let mapImg;
let heading = 0;
let timeLeft = 300;

// 状态控制
let gameState = 0; 
let lastMoveTime = -2000;
let refreshCooldown = 2000;
let stepThreshold = 12.0; 
let lastAccel = 0;

const REAL_SPACE_SIZE = 4.47; // 20平米映射

function preload() { mapImg = loadImage('map.jpg'); }

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));

    let authBtn = createButton("STEP 1: ENABLE SENSORS");
    authBtn.center();
    authBtn.style('padding', '20px');
    authBtn.mousePressed(() => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            Promise.all([
                DeviceOrientationEvent.requestPermission(),
                DeviceMotionEvent.requestPermission()
            ]).then(res => {
                if (res.every(r => r === 'granted')) {
                    window.addEventListener('deviceorientation', e => heading = e.webkitCompassHeading || e.alpha, true);
                    window.addEventListener('devicemotion', handleMotion, true);
                    gameState = 1; authBtn.hide();
                }
            });
        } else { gameState = 1; authBtn.hide(); }
    });

    socket.on("init-game", d => { treasures = d.treasures; bases = d.bases; timeLeft = d.gameTime; });
    socket.on("update-treasures", d => treasures = d);
    socket.on("update-bases", d => bases = d);
    socket.on("update-leaderboard", d => leaderboard = d);
    socket.on("timer-update", t => timeLeft = t);
}

function mousePressed() {
    // 步骤 2：选点即开始
    if (gameState === 1) {
        myPos.x = mouseX / width;
        myPos.y = mouseY / height;
        socket.emit("set-base", { 
            x: myPos.x, y: myPos.y, 
            color: {r: red(myColor), g: green(myColor), b: blue(myColor)} 
        });
        gameState = 3;
        return;
    } 
    
    // 正式游戏：点击刷新球，仅触发探测脉冲，【不改变位置】
    if (gameState === 3) {
        let d = dist(mouseX, mouseY, width - 60, height - 60);
        if (d < 45 && (millis() - lastMoveTime > refreshCooldown)) {
            syncAndPulse(); 
        }
    }
}

function handleMotion(event) {
    if (gameState !== 3) return;
    let acc = event.accelerationIncludingGravity;
    if (!acc) return;
    let currentAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    let delta = abs(currentAccel - lastAccel);

    // 只有真实行走才会【触发位移】
    if (delta > stepThreshold) {
        physicalStep(); 
    }
    lastAccel = currentAccel;
}

// 逻辑 A：物理迈步（改变位置 + 同步）
function physicalStep() {
    let stepSize = 0.05; 
    myPos.x += cos(radians(heading - 90)) * stepSize;
    myPos.y += sin(radians(heading - 90)) * stepSize;
    myPos.x = constrain(myPos.x, 0, 1);
    myPos.y = constrain(myPos.y, 0, 1);
    syncAndPulse();
}

// 逻辑 B：同步与脉冲展示（位置不变）
function syncAndPulse() {
    lastMoveTime = millis();
    socket.emit("refresh-location", { 
        xpos: myPos.x, ypos: myPos.y, 
        color: {r: red(myColor), g: green(myColor), b: blue(myColor)} 
    });
}

function draw() {
    image(mapImg, 0, 0, width, height);
    if (gameState === 1) drawOverlay("STEP 2: TAP ONCE TO SET BASE & START");
    else if (gameState === 3) runGame();
}

function runGame() {
    let minDist = 1.0;
    treasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) minDist = d;
    });

    drawDistanceBar(minDist);
    drawBases();
    drawStars();
    drawRefreshBall();
    drawTimer();
    drawLeaderboard();

    let elapsed = millis() - lastMoveTime;
    if (elapsed < 2000) drawPlayerUI(myPos.x * width, myPos.y * height, elapsed);
}

// 1. 极窄进度条 (8像素)，实时更新不闪烁
function drawDistanceBar(d) {
    let barW = 8;
    let threshold = 0.5 / REAL_SPACE_SIZE;
    let h = map(d, 0, 0.8, height, 0);
    fill(d < threshold ? color(255, 0, 0) : color(255, 180));
    noStroke();
    rect(0, height, barW, -h);
}

// 2. 排行榜
function drawLeaderboard() {
    if (leaderboard.length === 0) return;
    let x = 20; let y = 65;
    let w = 150; let h = leaderboard.length * 25 + 10;
    push();
    fill(0); stroke(255); strokeWeight(1.5);
    rect(x, y, w, h, 5);
    noStroke(); fill(255); textAlign(LEFT, TOP); textSize(13);
    for (let i = 0; i < leaderboard.length; i++) {
        let p = leaderboard[i];
        fill(p.color.r, p.color.g, p.color.b);
        circle(x + 15, y + 13 + i * 25, 10);
        fill(255);
        text(`Rank ${i + 1}: ${p.score} Stars`, x + 30, y + 7 + i * 25);
    }
    pop();
}

// 3. 刷新球
function drawRefreshBall() {
    push(); translate(width - 60, height - 60);
    fill(20, 200); stroke(255, 50); circle(0, 0, 80);
    noFill(); stroke(0, 255, 180); strokeWeight(4);
    if (millis() - lastMoveTime < refreshCooldown) {
        rotate(millis() * 0.01);
        arc(0, 0, 45, 45, 0, PI * 1.5);
    } else {
        circle(0, 0, 45); fill(0, 255, 180); circle(0, 0, 10);
    }
    pop();
}

function drawTimer() {
    fill(0, 150); rect(width/2 - 50, 15, 100, 35, 8);
    fill(255); textAlign(CENTER, CENTER); textSize(18);
    let m = floor(timeLeft / 60); let s = timeLeft % 60;
    text(`${m}:${nf(s, 2)}`, width/2, 32);
}

function drawBases() {
    bases.forEach(b => {
        push(); translate(b.x * width, b.y * height);
        fill(b.color.r, b.color.g, b.color.b); stroke(255);
        rectMode(CENTER); rect(0, 5, 22, 16); triangle(-14, 5, 0, -12, 14, 5);
        pop();
    });
}

function drawStars() {
    treasures.forEach(t => {
        if (t.found) {
            push(); translate(t.x * width, t.y * height);
            fill(t.foundBy.r, t.foundBy.g, t.foundBy.b); noStroke();
            beginShape(); for(let i=0; i<10; i++){
                let r=(i%2==0)?10:5; vertex(r*cos(TWO_PI*i/10), r*sin(TWO_PI*i/10));
            } endShape(CLOSE); pop();
        }
    });
}

function drawPlayerUI(x, y, elapsed) {
    let alpha = map(elapsed, 0, 2000, 255, 0);
    push(); translate(x, y);
    noFill(); stroke(255, alpha * 0.5); ellipse(0,0,30,30);
    line(-12,0,12,0); line(0,-12,0,12);
    stroke(255,0,0, alpha); line(0,0,0,-16); 
    fill(red(myColor), green(myColor), blue(myColor), alpha);
    noStroke(); circle(0,0,15); pop();
}

function drawOverlay(txt) {
    fill(0, 220); rect(0, 0, width, height);
    fill(255); textAlign(CENTER, CENTER); textSize(16); text(txt, width/2, height/2);
}