let socket;
let myPos = { x: 0.5, y: 0.5 };
let tempBase = { x: 0.5, y: 0.5 };
let treasures = [];
let bases = [];
let myColor;
let mapImg;
let heading = 0;
let timeLeft = 300;

// 状态控制
let gameState = 0; 
let lastMoveTime = -2000;
let stepThreshold = 12.0; 
let lastAccel = 0;
let confirmBtn;

const REAL_SPACE_SIZE = 4.47; // 20平米映射

function preload() { mapImg = loadImage('map.jpg'); }

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));

    // 步骤 1：开始按钮
    let startBtn = createButton("STEP 1: START SETUP");
    startBtn.center();
    startBtn.style('padding', '20px');
    startBtn.style('z-index', '100');
    startBtn.mousePressed(() => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            Promise.all([
                DeviceOrientationEvent.requestPermission(),
                DeviceMotionEvent.requestPermission()
            ]).then(res => {
                if (res.every(r => r === 'granted')) {
                    window.addEventListener('deviceorientation', e => heading = e.webkitCompassHeading || e.alpha, true);
                    window.addEventListener('devicemotion', handleMotion, true);
                    gameState = 1; startBtn.hide();
                }
            });
        } else { gameState = 1; startBtn.hide(); }
    });

    socket.on("init-game", d => { treasures = d.treasures; bases = d.bases; timeLeft = d.gameTime; });
    socket.on("update-treasures", d => treasures = d);
    socket.on("update-bases", d => bases = d);
    socket.on("timer-update", t => timeLeft = t);
}

function mousePressed() {
    // 步骤 2：在地图任意位置自由点击以设置临时点
    if (gameState === 1 || gameState === 2) {
        tempBase.x = mouseX / width;
        tempBase.y = mouseY / height;
        myPos.x = tempBase.x; 
        myPos.y = tempBase.y;
        gameState = 2; // 进入待确认状态
        
        // 如果确认按钮还没出现，就创建一个
        if (!confirmBtn) {
            confirmBtn = createButton("STEP 3: CONFIRM BASE");
            confirmBtn.style('padding', '15px');
            confirmBtn.style('background', '#00FFB4');
            confirmBtn.position(width/2 - 80, height - 120);
            confirmBtn.mousePressed(finalizeBase);
        }
    } 
    // 正式游戏时的手动刷新逻辑
    else if (gameState === 3) {
        let d = dist(mouseX, mouseY, width - 60, height - 60);
        if (d < 45) triggerUpdate();
    }
}

function finalizeBase() {
    socket.emit("set-base", { x: tempBase.x, y: tempBase.y, color: {r: red(myColor), g: green(myColor), b: blue(myColor)} });
    gameState = 3;
    confirmBtn.hide();
}

function handleMotion(event) {
    if (gameState !== 3) return;
    let acc = event.accelerationIncludingGravity;
    if (!acc) return;
    let totalAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    if (abs(totalAccel - lastAccel) > stepThreshold) triggerUpdate();
    lastAccel = totalAccel;
}

function triggerUpdate() {
    if (millis() - lastMoveTime < 500) return; 
    lastMoveTime = millis();
    let stepSize = 0.04; 
    myPos.x += cos(radians(heading - 90)) * stepSize;
    myPos.y += sin(radians(heading - 90)) * stepSize;
    myPos.x = constrain(myPos.x, 0, 1);
    myPos.y = constrain(myPos.y, 0, 1);
    socket.emit("refresh-location", { 
        xpos: myPos.x, ypos: myPos.y, 
        color: {r: red(myColor), g: green(myColor), b: blue(myColor)} 
    });
}

function draw() {
    image(mapImg, 0, 0, width, height);
    
    if (gameState === 1) {
        drawOverlay("STEP 2: TAP ANYWHERE ON MAP");
    } 
    else if (gameState === 2) {
        drawOverlay("CLICK AGAIN TO MOVE, OR CONFIRM");
        // 预览大本营位置
        push();
        translate(tempBase.x * width, tempBase.y * height);
        fill(255, 255, 0, 180);
        noStroke();
        ellipse(0, 0, 30, 30);
        fill(0);
        textAlign(CENTER, CENTER);
        text("?", 0, 0);
        pop();
    } 
    else if (gameState === 3) {
        runGame();
    }
}

function runGame() {
    let minDist = 1.0;
    treasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) minDist = d;
    });

    drawDistanceBar(minDist); // 左侧窄条
    drawBases();            // 大本营
    drawStars();            // 星星
    drawRefreshBall();     // 右下角球
    drawTimer();           // 计时器

    let elapsed = millis() - lastMoveTime;
    if (elapsed < 2000) drawPlayerUI(myPos.x * width, myPos.y * height, elapsed);
}

function drawDistanceBar(d) {
    let barW = 12;
    let threshold = 0.5 / REAL_SPACE_SIZE;
    let h = map(d, 0, 0.8, height, 0);
    fill(d < threshold ? color(255, 0, 0) : color(255, 200));
    noStroke();
    rect(0, height, barW, -h);
}

function drawRefreshBall() {
    push(); translate(width - 60, height - 60);
    fill(20, 200); stroke(255, 50); circle(0, 0, 80);
    noFill(); stroke(0, 255, 180); strokeWeight(4);
    let elapsed = millis() - lastMoveTime;
    if (elapsed < 2000) {
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
    line(-10,0,10,0); line(0,-10,0,10);
    stroke(255,0,0, alpha); line(0,0,0,-15);
    fill(red(myColor), green(myColor), blue(myColor), alpha);
    noStroke(); circle(0,0,15); pop();
}

function drawOverlay(txt) {
    fill(0, 180); rect(0, height/2 - 50, width, 100);
    fill(255); textAlign(CENTER, CENTER); textSize(16); text(txt, width/2, height/2);
}