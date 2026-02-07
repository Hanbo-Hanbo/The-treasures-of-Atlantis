let socket;
let myPos = { x: 0.5, y: 0.5 };
let activeTreasures = [];
let myColor;
let mapImg;
let heading = 0;

// 刷新逻辑
let lastRefreshTime = -5000;
let refreshCooldown = 5000;

// 距离感应逻辑
let minDist = 1.0;
const REAL_SPACE_SIZE = 2.24; // 5平米对应的边长 (约2.24米)

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
    drawDistanceBall();    // 左下角：动态闪烁感官球
    drawStarMarkers();     // 已激活宝藏
    drawRefreshBall();     // 右下角：圆形刷新按钮

    // 常驻显示位置小球和圆形指南针
    drawPlayerWithCompass(myPos.x * width, myPos.y * height, myColor);
}

function updateMinDist() {
    let d = 1.0;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let currentD = dist(myPos.x, myPos.y, t.x, t.y);
        if (currentD < d) d = currentD;
    });
    minDist = d;
}

// 1. 左下角：距离感应球 (0.5米内变红并加速闪烁)
function drawDistanceBall() {
    push();
    translate(60, height - 60); 
    
    // 逻辑映射：0.5米对应的归一化距离约为 0.223 (0.5 / 2.24)
    let threshold = 0.5 / REAL_SPACE_SIZE; 
    let isBlinking = minDist < threshold;
    
    let ballColor;
    let alpha;
    
    if (isBlinking) {
        ballColor = color(255, 0, 0); // 靠近时变为红色
        // 越近闪烁越快：距离0时频率为20，距离0.5米时频率为2
        let freq = map(minDist, 0, threshold, 20, 2);
        let blink = sin(millis() * 0.005 * freq);
        alpha = map(blink, -1, 1, 100, 255);
    } else {
        ballColor = color(255); // 远处为常亮白色
        alpha = 255;
    }
    
    noStroke();
    fill(red(ballColor), green(ballColor), blue(ballColor), alpha);
    circle(0, 0, 45);
    
    // 装饰外圈
    stroke(255, 80);
    strokeWeight(1);
    noFill();
    circle(0, 0, 52);
    pop();
}

// 2. 位置小球 + 加了圆环的指南针
function drawPlayerWithCompass(x, y, col) {
    push();
    translate(x, y);
    
    let targetAngle = 0;
    let closestT = null;
    let d = 1.0;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let currentD = dist(myPos.x, myPos.y, t.x, t.y);
        if (currentD < d) { d = currentD; closestT = t; }
    });
    if (closestT) targetAngle = atan2(closestT.y - myPos.y, closestT.x - myPos.x);

    rotate(targetAngle - radians(heading) + PI/2);
    
    // --- 修改：指南针增加圆环 ---
    noFill();
    stroke(255, 120);
    strokeWeight(1);
    ellipse(0, 0, 30, 30); // 指南针外圆
    
    // 十字线
    line(-10, 0, 10, 0); 
    line(0, -10, 0, 10);
    
    // 红色指向端
    stroke(255, 0, 0);
    strokeWeight(2);
    line(0, 0, 0, -15);
    
    // 玩家位置核心球
    noStroke();
    fill(col);
    circle(0, 0, 15);
    pop();
}

// 3. 右下角：圆形刷新按钮
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
        stroke(100, 255, 200, 150);
        rotate(millis() * 0.005);
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