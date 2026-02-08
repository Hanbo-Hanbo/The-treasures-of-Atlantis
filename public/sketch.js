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
let lastPulseTime = -2000; // 仅用于控制视觉脉冲
let lastAccel = 0;
let startTime;
let tipAlpha = 255;

// 20平米精调参数
const REAL_SPACE_SIZE = 4.47; 
const STEP_THRESHOLD = 8.0; // 提高阈值：减少误触灵敏度
const STEP_SIZE = 0.01;    // 减小步幅：位移更精准

function preload() { mapImg = loadImage('map.jpg'); }

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));
    startTime = millis();

    socket.on("init-game", d => { treasures = d.treasures; bases = d.bases; timeLeft = d.gameTime; });
    socket.on("update-treasures", d => treasures = d);
    socket.on("update-bases", d => bases = d);
    socket.on("update-leaderboard", d => leaderboard = d);
    socket.on("timer-update", t => timeLeft = t);
    socket.on("game-reset", () => {
        gameState = 0;
        startTime = millis();
        treasures = []; bases = []; leaderboard = [];
    });
}

function mousePressed() {
    if (gameState === 0) {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission().then(res => { if(res === 'granted') initSensors(); });
        } else { initSensors(); }

        myPos.x = mouseX / width;
        myPos.y = mouseY / height;
        socket.emit("set-base", { x: myPos.x, y: myPos.y, color: {r: red(myColor), g: green(myColor), b: blue(myColor)} });
        
        gameState = 3;
        startTime = millis();
        lastPulseTime = millis(); // 初始设置时显示一次脉冲
        return false;
    }

    if (gameState === 3) {
        let d = dist(mouseX, mouseY, width - 60, height - 60);
        // 只有点击右下角刷新球时，才触发视觉脉冲（lastPulseTime）
        if (d < 45) {
            lastPulseTime = millis(); 
            syncToServer(); 
        }
    }
    return false;
}

function initSensors() {
    window.addEventListener('devicemotion', handleMotion, true);
    window.addEventListener('deviceorientation', e => { heading = e.webkitCompassHeading || e.alpha; }, true);
}

function handleMotion(event) {
    if (gameState !== 3) return;
    let acc = event.accelerationIncludingGravity;
    if (!acc) return;
    
    let currentAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    let delta = abs(currentAccel - lastAccel);

    // 步行仅触发位移，不触发脉冲动画
    if (delta > STEP_THRESHOLD) {
        myPos.x += cos(radians(heading - 90)) * STEP_SIZE;
        myPos.y += sin(radians(heading - 90)) * STEP_SIZE;
        myPos.x = constrain(myPos.x, 0.01, 0.99);
        myPos.y = constrain(myPos.y, 0.01, 0.99);
        syncToServer();
    }
    lastAccel = currentAccel;
}

function syncToServer() {
    socket.emit("refresh-location", { 
        xpos: myPos.x, ypos: myPos.y, 
        color: {r: red(myColor), g: green(myColor), b: blue(myColor)} 
    });
}

function draw() {
    image(mapImg, 0, 0, width, height);
    
    if (gameState === 0) {
        drawOverlay("TAP ANYWHERE ON THE MAP\nTO SET BASE AND START");
    } else {
        let minDist = 1.0;
        treasures.filter(t => !t.found).forEach(t => {
            let d = dist(myPos.x, myPos.y, t.x, t.y);
            if (d < minDist) minDist = d;
        });

        drawDistanceBar(minDist);
        drawBases();
        drawStars();
        drawRefreshBall(); // 动画现在仅随 lastPulseTime 变化
        drawTimer();
        drawLeaderboard();

        // 仅在点击后的 2 秒内显示玩家位置球和指南针
        let elapsedPulse = millis() - lastPulseTime;
        if (elapsedPulse < 2000) {
            drawPlayerUI(myPos.x * width, myPos.y * height, elapsedPulse);
        }

        let timeSinceStart = millis() - startTime;
        if (timeSinceStart < 5000) {
            drawFadingTip("BASE DEPLOYED - GOOD LUCK!", map(timeSinceStart, 4000, 5000, 255, 0));
        }
    }
}

function drawDistanceBar(d) {
    let barW = 8;
    let h = map(d, 0, 0.8, height, 0);
    fill(d < (0.5 / REAL_SPACE_SIZE) ? color(255, 0, 0) : color(255, 180));
    noStroke();
    rect(0, height, barW, -h);
}

function drawLeaderboard() {
    if (leaderboard.length === 0) return;
    let x = 20, y = 65, w = 150;
    push();
    fill(0); stroke(255); strokeWeight(1);
    rect(x, y, w, leaderboard.length * 25 + 10, 5);
    noStroke(); fill(255); textAlign(LEFT, TOP); textSize(13);
    for (let i = 0; i < leaderboard.length; i++) {
        let p = leaderboard[i];
        fill(p.color.r, p.color.g, p.color.b);
        circle(x + 15, y + 13 + i * 25, 10);
        fill(255);
        text(`Rank ${i+1}: ${p.score} ⭐`, x + 30, y + 7 + i * 25);
    }
    pop();
}

function drawRefreshBall() {
    push(); translate(width - 60, height - 60);
    fill(20, 200); stroke(255, 50); circle(0, 0, 80);
    noFill(); stroke(0, 255, 180); strokeWeight(4);
    
    // 动画仅在手动点击后的 2 秒内触发
    let elapsed = millis() - lastPulseTime;
    if (elapsed < 2000) {
        rotate(millis() * 0.01);
        arc(0, 0, 45, 45, 0, PI * 1.5);
    } else {
        circle(0, 0, 45); fill(0, 255, 180); circle(0, 0, 10);
    }
    pop();
}

// 其余绘图函数 (drawTimer, drawBases, drawStars, drawPlayerUI, drawOverlay, drawFadingTip) 保持不变...
// [此处省略重复的视觉代码以保持简洁，逻辑已完全更新]
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

function drawFadingTip(txt, a) {
    fill(0, a * 0.6); noStroke();
    rect(0, height - 100, width, 50);
    fill(255, a); textAlign(CENTER, CENTER);
    text(txt, width/2, height - 75);
}