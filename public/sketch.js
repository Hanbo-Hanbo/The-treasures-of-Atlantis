let socket;
let myPos = { x: 0.5, y: 0.5 };
let activeTreasures = [];
let myColor;
let mapImg;
let heading = 0;

// 刷新逻辑 - 缩短为 2 秒
let lastRefreshTime = -2000;
let refreshCooldown = 2000; 
let pulseDuration = 2000; // 小球出现的持续时间

// 距离感应逻辑
let minDist = 1.0;
const REAL_SPACE_SIZE = 2.24; // 5平米对应的边长

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
    drawDistanceBall();    // 左上角：放大版的感官球
    drawStarMarkers();     // 已激活宝藏标记
    drawRefreshBall();     // 右下角：圆形刷新按钮

    // 代表位置的小球和指南针：仅在刷新后的 2 秒内显示
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

// 1. 左上角：放大版距离感应球
function drawDistanceBall() {
    push();
    translate(80, 80); // 移动到左上角，留出边距
    
    let threshold = 0.5 / REAL_SPACE_SIZE; 
    let isBlinking = minDist < threshold;
    
    let ballColor;
    let alpha;
    
    if (isBlinking) {
        ballColor = color(255, 0, 0); 
        let freq = map(minDist, 0, threshold, 20, 2);
        let blink = sin(millis() * 0.005 * freq);
        alpha = map(blink, -1, 1, 100, 255);
    } else {
        ballColor = color(255); 
        alpha = 200;
    }
    
    noStroke();
    // 尺寸从原先的 45 放大到 75
    fill(red(ballColor), green(ballColor), blue(ballColor), alpha);
    circle(0, 0, 75);
    
    // 装饰外圈也相应放大
    stroke(255, 60);
    strokeWeight(2);
    noFill();
    circle(0, 0, 85);
    pop();
}

// 2. 带有圆环的指南针小球 (带淡出效果)
function drawPlayerWithCompass(x, y, col, elapsed) {
    let percent = elapsed / pulseDuration;
    let alpha = lerp(255, 0, percent); // 随时间淡出
    let scaleVal = lerp(1, 2.5, percent); // 随时间轻微放大
    
    push();
    translate(x, y);
    scale(scaleVal);
    
    let targetAngle = 0;
    let closestT = null;
    let d = 1.0;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let currentD = dist(myPos.x, myPos.y, t.x, t.y);
        if (currentD < d) { d = currentD; closestT = t; }
    });
    if (closestT) targetAngle = atan2(closestT.y - myPos.y, closestT.x - myPos.x);

    rotate(targetAngle - radians(heading) + PI/2);
    
    // 圆形指南针外框
    noFill();
    stroke(255, alpha * 0.5);
    strokeWeight(1);
    ellipse(0, 0, 30, 30); 
    
    // 十字线
    line(-10, 0, 10, 0); 
    line(0, -10, 0, 10);
    
    // 红色指向端
    stroke(255, 0, 0, alpha);
    strokeWeight(2);
    line(0, 0, 0, -15);
    
    // 玩家位置核心球
    noStroke();
    fill(red(col), green(col), blue(col), alpha);
    circle(0, 0, 15);
    pop();
}

// 3. 右下角：圆形刷新按钮 (无文字，循环符号)
function drawRefreshBall() {
    let centerX = width - 60;
    let centerY = height - 60;
    let r = 80;
    let elapsed = millis() - lastRefreshTime;
    let cooldownPercent = constrain(elapsed / refreshCooldown, 0, 1);

    push();
    translate(centerX, centerY);
    fill(20, 200);
    stroke(255, 50);
    circle(0, 0, r);
    
    noFill();
    strokeWeight(4);
    if (cooldownPercent < 1) {
        // 旋转的加载圆弧
        stroke(100, 255, 200, 150);
        rotate(millis() * 0.008); // 旋转速度稍微加快以匹配2秒节奏
        arc(0, 0, r * 0.6, r * 0.6, 0, PI * 1.5); 
    } else {
        stroke(0, 255, 180);
        circle(0, 0, r * 0.6);
        fill(0, 255, 180);
        circle(0, 0, 10);
    }
    pop();
}

function mousePressed() {
    let d = dist(mouseX, mouseY, width - 60, height - 60);
    if (d < 45) handleRefresh();
}

function handleRefresh() {
    let now = millis();
    if (now - lastRefreshTime > refreshCooldown) {
        lastRefreshTime = now;
        // 保持单次刷新位移幅度
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