let socket;
let myPos = { x: 0.5, y: 0.5 };
let treasures = [];
let bases = [];
let myColor;
let mapImg;
let heading = 0;
let timeLeft = 300;

// 逻辑控制
let lastMoveTime = -2000;
let refreshCooldown = 2000; // 2秒冷却
let stepThreshold = 10.0;  // 步进灵敏度
let lastAccel = 0;
let hasSetBase = false;
let authGranted = false;

function preload() {
    mapImg = loadImage('map.jpg');
}

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));

    // 授权按钮
    let authBtn = createButton("START SEARCH");
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
                    authBtn.hide();
                    authGranted = true;
                }
            });
        } else { 
            authBtn.hide(); 
            authGranted = true; 
        }
    });

    socket.on("init-game", d => { treasures = d.treasures; bases = d.bases; timeLeft = d.gameTime; });
    socket.on("update-treasures", d => treasures = d);
    socket.on("update-bases", d => bases = d);
    socket.on("timer-update", t => timeLeft = t);
}

// 物理迈步触发
function handleMotion(event) {
    let acc = event.accelerationIncludingGravity;
    if (!acc) return;
    let currentAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    if (abs(currentAccel - lastAccel) > stepThreshold) {
        triggerUpdate();
    }
    lastAccel = currentAccel;
}

// 点击右下角刷新球手动触发
function mousePressed() {
    let d = dist(mouseX, mouseY, width - 60, height - 60);
    if (d < 45 && (millis() - lastMoveTime > refreshCooldown)) {
        triggerUpdate();
    }
}

function triggerUpdate() {
    lastMoveTime = millis();
    let stepSize = 0.05; // 限制位移幅度
    myPos.x += cos(radians(heading - 90)) * stepSize;
    myPos.y += sin(radians(heading - 90)) * stepSize;
    myPos.x = constrain(myPos.x, 0, 1);
    myPos.y = constrain(myPos.y, 0, 1);
    
    socket.emit("refresh-location", {
        xpos: myPos.x, 
        ypos: myPos.y, 
        color: {r: red(myColor), g: green(myColor), b: blue(myColor)} 
    });
}

function draw() {
    image(mapImg, 0, 0, width, height);
    
    // 计算最近距离
    let minDist = 1.0;
    treasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) minDist = d;
    });

    drawDistanceBar(minDist); // 窄条 UI
    drawBases();            // 大本营 (常驻)
    drawStars();            // 已点亮星星
    drawRefreshBall();     // 右下角刷新按钮
    drawTimer();           // 顶部计时器

    // 点击授权后，若没设置大本营，显示设置提示
    if (authGranted && !hasSetBase) {
        drawSetBaseUI();
    }

    // 位置脉冲效果 (2秒)
    let elapsed = millis() - lastMoveTime;
    if (elapsed < 2000) {
        drawPlayerUI(myPos.x * width, myPos.y * height, elapsed);
    }
}

function drawDistanceBar(d) {
    let barW = 12; // 窄条
    let h = map(d, 0, 0.5, height, 0);
    fill(d < 0.22 ? color(255, 0, 0) : color(255, 200));
    noStroke();
    rect(0, height, barW, -h);
}

function drawRefreshBall() {
    push();
    translate(width - 60, height - 60);
    fill(20, 200);
    stroke(255, 50);
    circle(0, 0, 80);
    
    noFill();
    strokeWeight(4);
    let elapsed = millis() - lastMoveTime;
    if (elapsed < refreshCooldown) {
        stroke(100, 255, 200, 150);
        rotate(millis() * 0.01);
        arc(0, 0, 45, 45, 0, PI * 1.5); // 循环符号
    } else {
        stroke(0, 255, 180);
        circle(0, 0, 45);
        fill(0, 255, 180);
        circle(0, 0, 10);
    }
    pop();
}

function drawSetBaseUI() {
    fill(0, 180);
    rect(width/2 - 100, height - 140, 200, 50, 10);
    fill(255);
    textAlign(CENTER, CENTER);
    text("TAP HERE TO DEPLOY BASE", width/2, height - 115);
    
    // 简单的点击区域判定：点击提示框即可设置
    if (mouseIsPressed && mouseY > height - 140 && mouseY < height - 90) {
        socket.emit("set-base", { 
            x: myPos.x, 
            y: myPos.y, 
            color: {r: red(myColor), g: green(myColor), b: blue(myColor)} 
        });
        hasSetBase = true;
    }
}

function drawTimer() {
    fill(0, 150);
    rect(width/2 - 50, 10, 100, 40, 5);
    fill(255);
    textAlign(CENTER, CENTER);
    let m = floor(timeLeft / 60);
    let s = timeLeft % 60;
    text(`${m}:${nf(s, 2)}`, width/2, 30);
}

function drawBases() {
    bases.forEach(b => {
        push();
        translate(b.x * width, b.y * height);
        fill(b.color.r, b.color.g, b.color.b);
        stroke(255);
        rectMode(CENTER);
        rect(0, 5, 22, 16); // 房子基座
        triangle(-14, 5, 0, -12, 14, 5); // 屋顶
        pop();
    });
}

function drawStars() {
    treasures.forEach(t => {
        if (t.found) {
            push();
            translate(t.x * width, t.y * height);
            fill(t.foundBy.r, t.foundBy.g, t.foundBy.b);
            noStroke();
            beginShape();
            for(let i=0; i<10; i++) {
                let r = (i%2==0) ? 10 : 5;
                vertex(r*cos(TWO_PI*i/10), r*sin(TWO_PI*i/10));
            }
            endShape(CLOSE);
            pop();
        }
    });
}

function drawPlayerUI(x, y, elapsed) {
    let alpha = map(elapsed, 0, 2000, 255, 0);
    push();
    translate(x, y);
    noFill();
    stroke(255, alpha * 0.6);
    ellipse(0, 0, 30, 30); // 指南针圆
    line(-10, 0, 10, 0); line(0, -10, 0, 10);
    stroke(255, 0, 0, alpha);
    line(0, 0, 0, -15); // 红端指向
    fill(red(myColor), green(myColor), blue(myColor), alpha);
    noStroke();
    circle(0, 0, 15);
    pop();
}