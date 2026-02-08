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
let gameState = 0; // 0: 等待首触设置大本营, 3: 正式游戏
let lastMoveTime = -2000;
let lastAccel = 0;
let startTime;
let tipAlpha = 255;

// 空间映射参数 (20平米)
const REAL_SPACE_SIZE = 4.47; 
const STEP_THRESHOLD = 2.5; // 使用线性加速度，2.5是非常灵敏的步行阈值
const STEP_SIZE = 0.05;    // 每步位移比例

function preload() { mapImg = loadImage('map.jpg'); }

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));
    startTime = millis();

    // 接收服务端数据
    socket.on("init-game", d => { treasures = d.treasures; bases = d.bases; timeLeft = d.gameTime; });
    socket.on("update-treasures", d => treasures = d);
    socket.on("update-bases", d => bases = d);
    socket.on("update-leaderboard", d => leaderboard = d);
    socket.on("timer-update", t => timeLeft = t);
    socket.on("game-reset", () => {
        gameState = 0;
        startTime = millis();
        treasures = []; bases = []; leaderboard = [];
        myPos = {x:0.5, y:0.5};
    });
}

// 核心：点击屏幕即授权并开始
function mousePressed() {
    if (gameState === 0) {
        // 1. 申请传感器权限 (iOS必须在此时触发)
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission();
            DeviceMotionEvent.requestPermission().then(response => {
                if (response === 'granted') {
                    window.addEventListener('devicemotion', handleMotion, true);
                    window.addEventListener('deviceorientation', (e) => {
                        heading = e.webkitCompassHeading || e.alpha;
                    }, true);
                }
            });
        } else {
            // 非iOS设备直接监听
            window.addEventListener('devicemotion', handleMotion, true);
            window.addEventListener('deviceorientation', (e) => {
                heading = e.webkitCompassHeading || e.alpha;
            }, true);
        }

        // 2. 设置大本营
        myPos.x = mouseX / width;
        myPos.y = mouseY / height;
        socket.emit("set-base", { 
            x: myPos.x, y: myPos.y, 
            color: {r: red(myColor), g: green(myColor), b: blue(myColor)} 
        });
        
        gameState = 3;
        startTime = millis(); // 重置计时用于提示词消失
        return;
    }

    // 3. 正式游戏：点击只刷新雷达，不移动
    if (gameState === 3) {
        let d = dist(mouseX, mouseY, width - 60, height - 60);
        if (d < 45 && (millis() - lastMoveTime > 1500)) {
            syncData(); 
        }
    }
}

// 加速度计监听
function handleMotion(event) {
    if (gameState !== 3) return;
    
    // 使用 acceleration (剔除重力后的线性加速度)
    let acc = event.acceleration; 
    if (!acc || acc.x === null) {
        // 如果 linear acceleration 不可用，退而求其次使用 gravity 过滤
        acc = event.accelerationIncludingGravity;
    }
    
    let currentAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    let motionDelta = abs(currentAccel - lastAccel);

    // 灵敏度判定
    if (motionDelta > STEP_THRESHOLD) {
        doPhysicalMove();
    }
    lastAccel = currentAccel;
}

// 物理行走：改变坐标
function doPhysicalMove() {
    myPos.x += cos(radians(heading - 90)) * STEP_SIZE;
    myPos.y += sin(radians(heading - 90)) * STEP_SIZE;
    myPos.x = constrain(myPos.x, 0, 1);
    myPos.y = constrain(myPos.y, 0, 1);
    syncData();
}

// 数据同步：不改变坐标
function syncData() {
    lastMoveTime = millis();
    socket.emit("refresh-location", { 
        xpos: myPos.x, ypos: myPos.y, 
        color: {r: red(myColor), g: green(myColor), b: blue(myColor)} 
    });
}

function draw() {
    image(mapImg, 0, 0, width, height);
    
    let timeSinceAction = millis() - startTime;

    if (gameState === 0) {
        drawOverlay("TAP ANYWHERE ON THE MAP\nTO SET BASE AND START");
    } else {
        runGameSession();
        // 5秒提示词逐渐消失逻辑
        if (timeSinceAction < 5000) {
            tipAlpha = map(timeSinceAction, 4000, 5000, 255, 0);
            drawFadingTip("BASE DEPLOYED - GOOD LUCK!", tipAlpha);
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
    drawRefreshBall();
    drawTimer();
    drawLeaderboard();

    let elapsed = millis() - lastMoveTime;
    if (elapsed < 2000) drawPlayerUI(myPos.x * width, myPos.y * height, elapsed);
}

// 侧边 8px 极窄条
function drawDistanceBar(d) {
    let barW = 8;
    let threshold = 0.5 / REAL_SPACE_SIZE;
    let h = map(d, 0, 0.8, height, 0);
    fill(d < threshold ? color(255, 0, 0) : color(255, 180));
    noStroke();
    rect(0, height, barW, -h);
}

// 排行榜：黑底、白描边、白字
function drawLeaderboard() {
    if (leaderboard.length === 0) return;
    let x = 20, y = 65, w = 150;
    let h = leaderboard.length * 25 + 10;
    push();
    fill(0); stroke(255); strokeWeight(1);
    rect(x, y, w, h, 5);
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
    if (millis() - lastMoveTime < 2000) {
        rotate(millis() * 0.01);
        arc(0, 0, 45, 45, 0, PI * 1.5);
    } else { circle(0, 0, 45); fill(0, 255, 180); circle(0, 0, 10); }
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
    fill(0, 200); rect(0, 0, width, height);
    fill(255); textAlign(CENTER, CENTER); textSize(16); text(txt, width/2, height/2);
}

function drawFadingTip(txt, a) {
    fill(0, a * 0.6); noStroke();
    rect(0, height - 100, width, 50);
    fill(255, a); textAlign(CENTER, CENTER);
    text(txt, width/2, height - 75);
}