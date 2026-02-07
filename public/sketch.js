let socket;
let myPos = { x: 0.5, y: 0.5 };
let activeTreasures = [];
let myColor;
let mapImg;
let heading = 0;

// 逻辑控制
let lastMoveTime = -2000;
let pulseDuration = 2000; 
let stepThreshold = 3.0;  
let lastAccel = 0;
let currentAccel = 0;

// 距离与空间逻辑
let minDist = 1.0;
const REAL_SPACE_SIZE = 2.24; // 5平米边长

function preload() {
    mapImg = loadImage('map.jpg');
}

function setup() {
    socket = io(); 
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));

    // 授权按钮 (iOS 必须点击)
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

function handleMotion(event) {
    let acc = event.accelerationIncludingGravity;
    if (!acc) return;
    currentAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    if (abs(currentAccel - lastAccel) > stepThreshold) { triggerUpdate(); }
    lastAccel = currentAccel;
}

function mousePressed() {
    let d = dist(mouseX, mouseY, width - 60, height - 60);
    if (d < 45) { triggerUpdate(); }
}

function triggerUpdate() {
    lastMoveTime = millis();
    let stepSize = 0.12; 
    myPos.x += cos(radians(heading - 90)) * stepSize;
    myPos.y += sin(radians(heading - 90)) * stepSize;
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
    drawDistanceBar();     // 修改：紧贴左侧的距离感应条
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

// 1. 修改：左侧垂直感应条 (越近越高，进入0.5米变红闪烁)
function drawDistanceBar() {
    let barWidth = 25; // 条形的宽度
    let threshold = 0.5 / REAL_SPACE_SIZE; // 0.5米对应的比例
    
    // 计算条形高度：越近越高。将 minDist (0到1) 映射为高度 (height 到 0)
    // 使用 constrain 确保在极远距离时条形也有一个最小高度
    let barHeight = map(minDist, 0, 1, height, 0);
    
    let isBlinking = minDist < threshold;
    let barColor;
    let alpha = 255;
    
    if (isBlinking) {
        barColor = color(255, 0, 0); // 靠近变红
        let freq = map(minDist, 0, threshold, 20, 2); // 越近闪烁越快
        alpha = map(sin(millis() * 0.005 * freq), -1, 1, 120, 255);
    } else {
        barColor = color(255, 180); // 远处为半透明白色
    }
    
    push();
    noStroke();
    // 绘制条形底座 (半透明黑)
    fill(0, 100);
    rect(0, 0, barWidth, height);
    
    // 绘制活跃进度条 (从底部向上升起)
    fill(red(barColor), green(barColor), blue(barColor), alpha);
    rect(0, height, barWidth, -barHeight); 
    
    // 增加一个高亮边框线
    stroke(255, 50);
    line(barWidth, 0, barWidth, height);
    pop();
}

// 2. 玩家球 + 圆形指南针 (保持不变，2秒消失)
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
        if (d <= minDist) { closestT = t; }
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

// 3. 右下角刷新球 (保持不变)
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