let socket;
let myPos = { x: 0.5, y: 0.5 };
let activeTreasures = [];
let myColor;
let mapImg;
let heading = 0;

// 逻辑控制
let lastMoveTime = -2000;
let pulseDuration = 2000; // 迈步后小球显示 2 秒
let stepThreshold = 3.5;  // 步进灵敏度：数值越小越灵敏
let lastAccel = 0;

// 距离感应
let minDist = 1.0;
const REAL_SPACE_SIZE = 2.24; // 5平米边长 (sqrt(5) ≈ 2.24m)

function preload() {
    mapImg = loadImage('map.jpg');
}

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));

    // 授权按钮 (iOS 必须手动点击以开启加速度计和罗盘)
    let authBtn = createButton("START TRACKING");
    authBtn.center();
    authBtn.style('padding', '20px');
    authBtn.mousePressed(() => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            // 同时请求罗盘和动作传感器权限
            Promise.all([
                DeviceOrientationEvent.requestPermission(),
                DeviceMotionEvent.requestPermission()
            ]).then(results => {
                if (results.every(res => res === 'granted')) {
                    window.addEventListener('deviceorientation', e => {
                        heading = e.webkitCompassHeading || e.alpha;
                    }, true);
                    window.addEventListener('devicemotion', handleMotion, true);
                    authBtn.hide();
                }
            });
        } else { authBtn.hide(); }
    });

    socket.on("init-game", data => { activeTreasures = data.treasures; });
    socket.on("treasure-activated", data => { activeTreasures = data.treasures; });
}

// 核心：只有检测到物理移动才会改变坐标
function handleMotion(event) {
    let acc = event.accelerationIncludingGravity;
    if (!acc) return;
    
    // 计算合加速度
    let totalAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    let deltaAccel = abs(totalAccel - lastAccel);

    // 判定迈步：只有震动超过阈值才移动
    if (deltaAccel > stepThreshold) {
        lastMoveTime = millis(); // 记录移动时间，触发 2 秒显示
        
        // 在 5 平米内迈出一小步
        let stepSize = 0.03; 
        myPos.x += cos(radians(heading - 90)) * stepSize;
        myPos.y += sin(radians(heading - 90)) * stepSize;
        
        myPos.x = constrain(myPos.x, 0, 1);
        myPos.y = constrain(myPos.y, 0, 1);

        // 同步到服务器
        socket.emit("refresh-location", {
            xpos: myPos.x, ypos: myPos.y,
            userR: red(myColor), userG: green(myColor), userB: blue(myColor)
        });
    }
    lastAccel = totalAccel;
}

function draw() {
    image(mapImg, 0, 0, width, height);
    
    updateMinDist();
    drawDistanceBall(); // 左上角巨型感官球
    drawStarMarkers();
    
    // 只有在最近 2 秒内有移动时才显示位置和指南针
    let elapsed = millis() - lastMoveTime;
    if (elapsed < pulseDuration) {
        drawPlayerWithCompass(myPos.x * width, myPos.y * height, myColor, elapsed);
    }

    // 右下角显示一个简单的运动指示器 (替代刷新按钮)
    drawMotionIndicator();
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
    translate(90, 90); 
    
    let threshold = 0.5 / REAL_SPACE_SIZE; 
    let isBlinking = minDist < threshold;
    let ballColor = isBlinking ? color(255, 0, 0) : color(255);
    
    let alpha;
    if (isBlinking) {
        let freq = map(minDist, 0, threshold, 20, 2);
        alpha = map(sin(millis() * 0.005 * freq), -1, 1, 100, 255);
    } else {
        alpha = 180;
    }
    
    noStroke();
    fill(red(ballColor), green(ballColor), blue(ballColor), alpha);
    circle(0, 0, 80); // 进一步放大
    stroke(255, 40);
    noFill();
    circle(0, 0, 95);
    pop();
}

// 2. 脉冲式位置球 + 指南针圆环
function drawPlayerWithCompass(x, y, col, elapsed) {
    let percent = elapsed / pulseDuration;
    let alpha = lerp(255, 0, percent);
    let scaleVal = lerp(1, 2.0, percent);
    
    push();
    translate(x, y);
    scale(scaleVal);
    
    let targetAngle = 0;
    let closestT = null;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) { closestT = t; }
    });
    if (closestT) targetAngle = atan2(closestT.y - myPos.y, closestT.x - myPos.x);

    rotate(targetAngle - radians(heading) + PI/2);
    
    noFill();
    stroke(255, alpha * 0.4);
    ellipse(0, 0, 30, 30);
    line(-10, 0, 10, 0); line(0, -10, 0, 10);
    stroke(255, 0, 0, alpha);
    line(0, 0, 0, -15);
    
    noStroke();
    fill(red(col), green(col), blue(col), alpha);
    circle(0, 0, 15);
    pop();
}

// 3. 右下角：运动检测反馈 (不再需要手动点击)
function drawMotionIndicator() {
    push();
    translate(width - 60, height - 60);
    fill(20, 150);
    stroke(255, 30);
    circle(0, 0, 60);
    
    // 如果检测到加速度在跳动，显示一个小绿点
    if (abs(currentAccel - lastAccel) > 1) {
        fill(0, 255, 150);
        noStroke();
        circle(0, 0, 15);
    }
    pop();
}

function drawStarMarkers() {
    activeTreasures.forEach(t => {
        if (t.found && t.foundByColor) {
            push();
            translate(t.x * width, t.y * height);
            fill(t.foundByColor.r, t.foundByColor.g, t.foundByColor.b, 150);
            noStroke();
            beginShape();
            for (let i = 0; i < 10; i++) {
                let r = (i % 2 === 0) ? 8 : 4;
                vertex(r * cos(TWO_PI * i / 10), r * sin(TWO_PI * i / 10));
            }
            endShape(CLOSE);
            pop();
        }
    });
}