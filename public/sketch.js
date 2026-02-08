let socket, myPos = { x: 0.5, y: 0.5 }, treasures = [], bases = [], leaderboard = [];
let myColor, mapImg, heading = 0, timeLeft = 300;
let gameState = 0, lastPulseTime = -2000, lastAccel = 0, startTime;

// --- 调优参数 ---
const REAL_SIZE = 4.47; 
const STEP_THRES = 1.0; 
const STEP_VAL = 0.03;

function preload() { 
    mapImg = loadImage('map.jpg'); 
}

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));
    startTime = millis();

    // 监听数据，确保数据始终是数组，防止 forEach 报错
    socket.on("init-game", d => { treasures = d.treasures || []; bases = d.bases || []; timeLeft = d.gameTime || 300; });
    socket.on("update-treasures", d => { treasures = d || []; });
    socket.on("update-bases", d => { bases = d || []; });
    socket.on("update-leaderboard", d => { leaderboard = d || []; });
    socket.on("timer-update", t => { timeLeft = t; });
    
    socket.on("game-reset", () => { 
        gameState = 0; 
        startTime = millis(); 
        treasures = []; bases = []; leaderboard = [];
    });
}

function mousePressed() {
    // 状态 0: 必须先完成权限和位置初始化
    if (gameState === 0) {
        // 强制申请权限
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(oState => {
                    if (oState === 'granted') {
                        window.addEventListener('deviceorientation', e => { heading = e.webkitCompassHeading || e.alpha; });
                        return DeviceMotionEvent.requestPermission();
                    }
                })
                .then(mState => {
                    if (mState === 'granted') {
                        window.addEventListener('devicemotion', handleMotion, true);
                    }
                })
                .catch(e => console.error("Permission denied: ", e));
        } else {
            // 非 iOS 或 PC 端测试
            window.addEventListener('devicemotion', handleMotion, true);
            window.addEventListener('deviceorientation', e => { heading = e.webkitCompassHeading || e.alpha; });
        }

        // 绑定大本营
        myPos.x = mouseX / width;
        myPos.y = mouseY / height;
        socket.emit("set-base", { x: myPos.x, y: myPos.y, color: {r: red(myColor), g: green(myColor), b: blue(myColor)} });
        
        gameState = 3; 
        startTime = millis();
        lastPulseTime = millis();
        return false;
    }

    // 状态 3: 手动刷新雷达
    if (gameState === 3) {
        let d = dist(mouseX, mouseY, width - 60, height - 60);
        if (d < 45 && (millis() - lastPulseTime > 1000)) {
            lastPulseTime = millis();
            sync();
        }
    }
    return false;
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
    background(0); // 兜底背景
    image(mapImg, 0, 0, width, height);
    
    if (gameState === 0) {
        drawOverlay("TAP ANYWHERE TO START\n(Please use Safari on iOS)");
    } else {
        runGameSession();
        // 5秒提示逻辑
        let ts = millis() - startTime;
        if (ts < 5000) drawFadingTip("BASE DEPLOYED!", map(ts, 4000, 5000, 255, 0));
    }

    // 调试信息（如果屏幕还是没 UI，看这里有没有文字）
    fill(255, 100);
    noStroke();
    textSize(10);
    textAlign(LEFT);
    text(`S: ${socket.connected ? 'OK' : 'ERR'} | G: ${gameState} | H: ${floor(heading)}`, 15, height - 10);
}

function runGameSession() {
    // 增加数据存在性检查
    let minDist = 1.0;
    if (treasures && treasures.length > 0) {
        treasures.filter(t => !t.found).forEach(t => {
            let d = dist(myPos.x, myPos.y, t.x, t.y);
            if (d < minDist) minDist = d;
        });
    }

    drawDistanceBar(minDist);
    drawBases(); 
    drawStars(); 
    drawRefreshBall(); 
    drawTimer(); 
    drawLeaderboard();

    let el = millis() - lastPulseTime;
    if (el < 2000) drawPlayerUI(myPos.x * width, myPos.y * height, el);
}

// UI 绘制组件
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
        if(p && p.color) {
            fill(p.color.r, p.color.g, p.color.b); circle(35, 78 + i * 25, 10);
            fill(255); text(`Rank ${i+1}: ${p.score} ⭐`, 50, 72 + i * 25);
        }
    });
    pop();
}

function drawRefreshBall() {
    push(); translate(width - 60, height - 60);
    fill(20, 200); stroke(255, 40); circle(0, 0, 80);
    noFill(); stroke(0, 255, 180); strokeWeight(4);
    if (millis() - lastPulseTime < 2000) { rotate(millis() * 0.01); arc(0, 0, 45, 45, 0, PI * 1.5); }
    else { 
        circle(0, 0, 45); 
        fill(abs(accelerationX) > 0.5 ? color(255, 0, 0) : color(0, 255, 180));
        circle(0, 0, 10); 
    }
    pop();
}

function drawTimer() { fill(0, 150); rect(width/2 - 50, 15, 100, 35, 8); fill(255); textAlign(CENTER, CENTER); text(`${floor(timeLeft/60)}:${nf(timeLeft%60, 2)}`, width/2, 32); }
function drawBases() { if(bases) bases.forEach(b => { push(); translate(b.x*width, b.y*height); fill(b.color.r, b.color.g, b.color.b); stroke(255); rectMode(CENTER); rect(0, 5, 22, 16); triangle(-14, 5, 0, -12, 14, 5); pop(); }); }
function drawStars() { if(treasures) treasures.forEach(t => { if (t.found) { push(); translate(t.x*width, t.y*height); fill(t.foundBy.r, t.foundBy.g, t.foundBy.b); noStroke(); beginShape(); for(let i=0; i<10; i++){ let r=(i%2==0)?10:5; vertex(r*cos(TWO_PI*i/10), r*sin(TWO_PI*i/10)); } endShape(CLOSE); pop(); } }); }
function drawPlayerUI(x, y, e) { let a = map(e, 0, 2000, 255, 0); push(); translate(x, y); noFill(); stroke(255, a*0.5); ellipse(0,0,30,30); line(-12,0,12,0); line(0,-12,0,12); stroke(255,0,0, a); line(0,0,0,-16); fill(red(myColor), green(myColor), blue(myColor), a); noStroke(); circle(0,0,15); pop(); }
function drawOverlay(t) { fill(0, 220); rect(0, 0, width, height); fill(255); textAlign(CENTER); text(t, width/2, height/2); }
function drawFadingTip(t, a) { fill(0, a*0.6); rect(0, height-100, width, 50); fill(255, a); textAlign(CENTER); text(t, width/2, height-75); }