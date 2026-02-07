let socket;
let myPos = { x: 0.5, y: 0.5 };
let activeTreasures = [];
let myColor;
let mapImg;
let heading = 0;

// 刷新与雷达逻辑
let lastRefreshTime = -5000;
let refreshCooldown = 5000;
let pulseDuration = 2000;

// 距离感应逻辑
let minDist = 1.0;

function preload() {
    mapImg = loadImage('map.jpg');
}

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));

    // 授权按钮 (iOS 专用)
    let authBtn = createButton("START SESSION");
    authBtn.center();
    authBtn.style('padding', '20px');
    authBtn.mousePressed(() => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(res => {
                if (res === 'granted') {
                    window.addEventListener('deviceorientation', e => {
                        heading = e.webkitCompassHeading || e.alpha;
                    }, true);
                    authBtn.hide();
                }
            });
        } else { authBtn.hide(); }
    });

    socket.on("init-game", data => { activeTreasures = data.treasures; });
    socket.on("treasure-activated", data => { activeTreasures = data.treasures; });
}

function draw() {
    image(mapImg, 0, 0, width, height);
    
    updateMinDist();
    drawDistanceBall();    // 左下角：感官球
    drawStarMarkers();     // 已激活宝藏
    drawRefreshBall();     // 右下角：循环刷新球

    let elapsed = millis() - lastRefreshTime;
    if (elapsed < pulseDuration) {
        drawPlayerWithCompass(myPos.x * width, myPos.y * height, myColor, elapsed);
    }
}

function updateMinDist() {
    let d = 1.0;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let currentD = dist(myPos.x, myPos.y, t.x, t.y);
        if (currentD < d) d = currentD;
    });
    minDist = d;
}

// 1. 左下角：距离感应球 (灰 -> 红，呼吸频率随距离变化)
function drawDistanceBall() {
    push();
    translate(60, height - 60); // 定位于左下角
    
    // 5平米空间映射：0.0（接触）到 0.4（较远）
    let proximity = constrain(map(minDist, 0, 0.4, 1, 0), 0, 1);
    let ballColor = lerpColor(color(80), color(255, 20, 20), proximity);
    
    // 闪烁频率
    let freq = map(proximity, 0, 1, 1, 15);
    let blink = sin(millis() * 0.005 * freq);
    let alpha = map(blink, -1, 1, 60, 255);
    
    noStroke();
    fill(red(ballColor), green(ballColor), blue(ballColor), alpha);
    circle(0, 0, 45);
    
    // 外圈光晕
    fill(red(ballColor), green(ballColor), blue(ballColor), alpha * 0.2);
    circle(0, 0, 65);
    pop();
}

// 2. 玩家球 + 整合指南针 (出现在屏幕中心脉冲)
function drawPlayerWithCompass(x, y, col, elapsed) {
    let percent = elapsed / pulseDuration;
    let alpha = lerp(255, 0, percent);
    let scaleVal = lerp(1, 2.8, percent);
    
    push();
    translate(x, y);
    scale(scaleVal);
    
    // 指南针指向逻辑
    let targetAngle = 0;
    let closestT = null;
    let d = 1.0;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let currentD = dist(myPos.x, myPos.y, t.x, t.y);
        if (currentD < d) { d = currentD; closestT = t; }
    });
    if (closestT) targetAngle = atan2(closestT.y - myPos.y, closestT.x - myPos.x);

    rotate(targetAngle - radians(heading) + PI/2);
    
    // 绘製十字
    stroke(255, alpha * 0.6);
    strokeWeight(1.5);
    line(-12, 0, 12, 0); line(0, -12, 0, 12);
    stroke(255, 0, 0, alpha); // 红端
    line(0, 0, 0, -15);
    
    // 玩家球核心
    noStroke();
    fill(red(col), green(col), blue(col), alpha);
    circle(0, 0, 18);
    pop();
}

// 3. 右下角：循环刷新球 (无文字，循环符号动画)
function drawRefreshBall() {
    let centerX = width - 60;
    let centerY = height - 60;
    let r = 80;
    let elapsed = millis() - lastRefreshTime;
    let cooldownPercent = constrain(elapsed / refreshCooldown, 0, 1);

    push();
    translate(centerX, centerY);
    
    // 背景底座
    fill(20, 180);
    stroke(255, 40);
    strokeWeight(1);
    circle(0, 0, r);
    
    // 循环符号动画
    noFill();
    strokeWeight(4);
    if (cooldownPercent < 1) {
        // 冷却中：旋转的圆弧
        stroke(100, 255, 200, 150);
        rotate(millis() * 0.005); // 持续自转
        arc(0, 0, r * 0.6, r * 0.6, 0, PI * 1.5); 
    } else {
        // 准备就绪：完整的亮绿色圆环
        stroke(0, 255, 180);
        circle(0, 0, r * 0.6);
        // 内部装饰点
        fill(0, 255, 180);
        circle(0, 0, 10);
    }
    pop();
}

function mousePressed() {
    // 检测点击是否在右下角按钮区域
    let d = dist(mouseX, mouseY, width - 60, height - 60);
    if (d < 45) handleRefresh();
}

function handleRefresh() {
    let now = millis();
    if (now - lastRefreshTime > refreshCooldown) {
        lastRefreshTime = now;
        // 模拟 5 平米空间内的位移（边长约 2.24 米）
        let stepSize = 0.15; 
        myPos.x += cos(radians(heading - 90)) * stepSize;
        myPos.y += sin(radians(heading - 90)) * stepSize;
        myPos.x = constrain(myPos.x, 0, 1);
        myPos.y = constrain(myPos.y, 0, 1);

        socket.emit("refresh-location", {
            xpos: myPos.x, ypos: myPos.y,
            userR: red(myColor), userG: green(myColor), userB: blue(myColor)
        });
    }
}

function drawStarMarkers() {
    activeTreasures.forEach(t => {
        if (t.found && t.foundByColor) {
            push();
            translate(t.x * width, t.y * height);
            fill(t.foundByColor.r, t.foundByColor.g, t.foundByColor.b);
            noStroke();
            beginShape();
            for (let i = 0; i < 10; i++) {
                let r = (i % 2 === 0) ? 10 : 5;
                vertex(r * cos(TWO_PI * i / 10), r * sin(TWO_PI * i / 10));
            }
            endShape(CLOSE);
            pop();
        }
    });
}