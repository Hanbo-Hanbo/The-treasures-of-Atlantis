let socket;
let myPos = { x: 0.5, y: 0.5 };
let activeTreasures = [];
let myColor;
let mapImg;
let heading = 0;

// 逻辑控制
let lastMoveTime = -2000;
let pulseDuration = 2000; 
let stepThreshold = 12.0; // 提高阈值，过滤手抖，确保只有行走才移动
let lastAccel = 0;

// 距离与空间逻辑 (5平米)
let minDist = 1.0;
const REAL_SPACE_SIZE = 2.24; 

function preload() {
    mapImg = loadImage('map.jpg');
}

function setup() {
    socket = io(); 
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));

    // 授权按钮
    let authBtn = createButton("START SESSION");
    authBtn.center();
    authBtn.style('padding', '20px');
    authBtn.mousePressed(() => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
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

// 传感器处理：通过重力加速度变化判定“迈步”
function handleMotion(event) {
    let acc = event.accelerationIncludingGravity;
    if (!acc) return;
    
    // 计算当前的合加速度
    let currentAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    let delta = abs(currentAccel - lastAccel);

    // 只有当震动幅度超过阈值（代表迈步）时才触发更新
    if (delta > stepThreshold) { 
        triggerUpdate(); 
    }
    lastAccel = currentAccel;
}

function mousePressed() {
    // 点击右下角刷新球依然可以手动触发
    let d = dist(mouseX, mouseY, width - 60, height - 60);
    if (d < 45) { triggerUpdate(); }
}

function triggerUpdate() {
    lastMoveTime = millis();
    let stepSize = 0.08; // 缩小步长，防止快速冲向边缘
    
    // 根据手机当前指向的方向计算位移
    myPos.x += cos(radians(heading - 90)) * stepSize;
    myPos.y += sin(radians(heading - 90)) * stepSize;
    
    // 边界约束
    myPos.x = constrain(myPos.x, 0, 1);
    myPos.y = constrain(myPos.y, 0, 1);
    
    socket.emit("refresh-location", {
        xpos: myPos.x, ypos: myPos.y,
        userR: red(myColor), userG: green(myColor), userB: blue(myColor)
    });
}

function draw() {
    image(mapImg, 0, 0, width, height);
    
    updateMinDist();
    drawDistanceBar();     // 左侧实时进度条 (无闪烁)
    drawStarMarkers();     
    drawRefreshBall();     

    let elapsed = millis() - lastMoveTime;
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

// 1. 左侧实时距离感应条：越近越高，不闪烁
function drawDistanceBar() {
    let barWidth = 30; 
    let threshold = 0.5 / REAL_SPACE_SIZE; 
    
    // 映射高度：minDist 为 0 时高度为 height，minDist 为 1 时高度为 0
    let barHeight = map(minDist, 0, 1, height, 0);
    
    push();
    noStroke();
    // 背景槽
    fill(0, 80);
    rect(0, 0, barWidth, height);
    
    // 根据距离改变颜色：0.5米内变为红色
    if (minDist < threshold) {
        fill(255, 0, 0); // 红色常亮
    } else {
        fill(255, 200); // 白色常亮
    }
    
    // 实时绘制进度条（从底部向上）
    rect(0, height, barWidth, -barHeight); 
    
    // 视觉分割线
    stroke(255, 30);
    line(barWidth, 0, barWidth, height);
    pop();
}

// 2. 指南针小球：保持 2 秒脉冲逻辑
function drawPlayerWithCompass(x, y, col, elapsed) {
    let percent = elapsed / pulseDuration;
    let alpha = lerp(255, 0, percent);
    let scaleVal = lerp(1, 1.8, percent);
    
    push();
    translate(x, y);
    scale(scaleVal);
    
    let targetAngle = 0;
    let closestT = null;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d <= minDist) { closestT = t; }
    });
    if (closestT) targetAngle = atan2(closestT.y - myPos.y, closestT.x - myPos.x);

    rotate(targetAngle - radians(heading) + PI/2);
    
    noFill();
    stroke(255, alpha * 0.5);
    ellipse(0, 0, 30, 30);
    line(-10, 0, 10, 0); line(0, -10, 0, 10);
    stroke(255, 0, 0, alpha); // 红色端指向目标
    line(0, 0, 0, -15);
    
    noStroke();
    fill(red(col), green(col), blue(col), alpha);
    circle(0, 0, 15);
    pop();
}

function drawRefreshBall() {
    push();
    translate(width - 60, height - 60);
    fill(20, 180);
    stroke(255, 40);
    circle(0, 0, 80);
    noFill();
    stroke(0, 255, 180);
    strokeWeight(4);
    let elapsed = millis() - lastMoveTime;
    if (elapsed < 1000) {
        rotate(millis() * 0.01);
        arc(0, 0, 45, 45, 0, PI * 1.5);
    } else {
        circle(0, 0, 45);
        fill(0, 255, 180);
        circle(0, 0, 8);
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