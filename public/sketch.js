let socket;
let myPos = { x: 0.5, y: 0.5 }; // Normalized position (0.0 to 1.0)
let activeTreasures = [];
let stars = 0;
let heading = 0;
let interferenceTimer = 0;
let myColor;
let stepThreshold = 4; // High sensitivity for 5sqm space
let currentAccel = 0;
let lastAccel = 0;
let drawingHistory = [];
let mapImg;
let flashAlpha = 0; // Visual vibration feedback

function preload() {
    mapImg = loadImage('map.jpg');
}

function setup() {
    socket = io(); 
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent("sketch-container"); 
    myColor = color(random(255), random(255), random(255));

    let btn = createButton("START 5m² SEARCH");
    btn.style('padding', '20px');
    btn.center();
    btn.mousePressed(() => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(reg => {
                if (reg === 'granted') {
                    window.addEventListener('deviceorientation', e => {
                        heading = e.webkitCompassHeading || e.alpha;
                    }, true);
                }
            });
            DeviceMotionEvent.requestPermission().then(reg => {
                if (reg === 'granted') {
                    window.addEventListener('devicemotion', handleMotion, true);
                    btn.hide();
                }
            });
        } else { btn.hide(); }
    });

    socket.on("status-update", data => {
        // Visual flash if a new treasure is found
        if (activeTreasures.length > 0 && data.treasures.filter(t => t.found).length > activeTreasures.filter(t => t.found).length) {
            flashAlpha = 200; 
        }
        activeTreasures = data.treasures;
        stars = data.stars;
    });
    
    socket.on("history", data => { drawingHistory = data; });
    socket.on("bomb-hit", () => { 
        interferenceTimer = millis() + 5000; 
        flashAlpha = 255; // Red flash for bomb
    });
}

function handleMotion(event) {
    if (millis() < interferenceTimer) return;
    let acc = event.accelerationIncludingGravity;
    if (!acc) return;
    
    currentAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    
    // Step detection logic
    if (abs(currentAccel - lastAccel) > stepThreshold) {
        let stepSize = 0.025; // Speed adjusted for smaller 5sqm space
        myPos.x += cos(radians(heading - 90)) * stepSize;
        myPos.y += sin(radians(heading - 90)) * stepSize;
        
        myPos.x = constrain(myPos.x, 0, 1);
        myPos.y = constrain(myPos.y, 0, 1);
        
        // Sync position to server [cite: 105, 108]
        socket.emit("drawing", {
            xpos: myPos.x, ypos: myPos.y,
            userR: red(myColor), userG: green(myColor), userB: blue(myColor)
        });
    }
    lastAccel = currentAccel;
}

function draw() {
    image(mapImg, 0, 0, width, height); // Proportional background [cite: 178]
    let isInterfered = millis() < interferenceTimer;

    // Draw history trails (proportional to window size) [cite: 152-155]
    for (let h of drawingHistory) {
        fill(h.userR, h.userG, h.userB, 50);
        noStroke();
        circle(h.xpos * width, h.ypos * height, 8);
    }

    drawCompassUI(isInterfered);

    // Draw player (proportional to window size) [cite: 123-124]
    fill(myColor);
    stroke(255);
    strokeWeight(3);
    circle(myPos.x * width, myPos.y * height, 25);

    // Visual vibration effect
    if (flashAlpha > 0) {
        fill(255, 0, 0, flashAlpha);
        rect(0, 0, width, height);
        flashAlpha -= 10; 
    }

    // Debug sensor data
    fill(255);
    textSize(10);
    textAlign(LEFT);
    text("Sensor: " + nf(currentAccel, 1, 2), 10, height - 10);
}

function drawCompassUI(isInterfered) {
    let closestT = null;
    let minDist = Infinity;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) { minDist = d; closestT = t; }
    });

    push();
    translate(width / 2, height - 150);
    let targetAngle = closestT ? atan2(closestT.y - myPos.y, closestT.x - myPos.x) : 0;
    rotate(isInterfered ? random(TWO_PI) : (targetAngle - radians(heading) + PI/2));
    
    // Crosshair Compass
    strokeWeight(4);
    stroke(200, 150);
    line(0, -50, 0, 50); 
    line(-50, 0, 50, 0);
    stroke(isInterfered ? 100 : color(255, 0, 0)); 
    line(0, 0, 0, -50); // Red tip points to treasure
    pop();

    // English UI Text
    fill(0, 180);
    rectMode(CENTER);
    rect(width/2, 60, 220, 40, 10);
    fill(255);
    textAlign(CENTER);
    textSize(20);
    text(`⭐ SCORE: ${stars}`, width / 2, 68);
    
    if (closestT) {
        fill(0, 180);
        rect(width/2, height - 85, 240, 40, 10);
        fill(255);
        // Mapping to 5sqm: distance ratio * 2.24m
        text(`TARGET: ${nf(minDist * 2.24, 1, 2)}m`, width / 2, height - 78);
    }
    
    if (isInterfered) {
        fill(255, 0, 0);
        text("⚠️ SIGNAL INTERFERENCE", width / 2, height / 2);
    }
}