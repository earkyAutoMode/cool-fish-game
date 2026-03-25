const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const gameOverEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const fogOverlay = document.getElementById('fog-overlay');

// 游戏配置与状态
let score = 0;
let gameRunning = true;
let speed = 4;
let fishSize = 12;
let fogRadius = 250;
let lastTime = 0;
let keys = {};
let particles = [];
let foods = [];
let obstacles = [];
let items = [];

// 鱼类对象 (贪吃鱼核心)
let fish = {
    segments: [], // 鱼身段 [{x, y}]
    dir: { x: 1, y: 0 }, // 移动方向
    targetDir: { x: 1, y: 0 },
    length: 10,
    headColor: '#00f3ff',
    bodyColor: 'rgba(0, 162, 255, 0.6)',
    invincible: false,
    invincibleTimer: 0
};

// 窗口自适应
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// 初始化鱼身
function initFish() {
    fish.segments = [];
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    for (let i = 0; i < fish.length; i++) {
        fish.segments.push({ x: centerX - i * 10, y: centerY });
    }
}

// 核心逻辑：移动
function moveFish() {
    const head = { ...fish.segments[0] };
    
    // 缓动转向
    fish.dir.x += (fish.targetDir.x - fish.dir.x) * 0.15;
    fish.dir.y += (fish.targetDir.y - fish.dir.y) * 0.15;
    
    // 归一化方向向量
    const dist = Math.sqrt(fish.dir.x * fish.dir.x + fish.dir.y * fish.dir.y);
    const vx = (fish.dir.x / dist) * speed;
    const vy = (fish.dir.y / dist) * speed;

    head.x += vx;
    head.y += vy;

    // 边界检查（深海世界，撞墙即死）
    if (head.x < 0 || head.x > canvas.width || head.y < 0 || head.y > canvas.height) {
        if (!fish.invincible) endGame();
    }

    // 自身碰撞检查
    for (let i = 20; i < fish.segments.length; i++) {
        const seg = fish.segments[i];
        const d = Math.sqrt((head.x - seg.x)**2 + (head.y - seg.y)**2);
        if (d < 5 && !fish.invincible) {
            endGame();
        }
    }

    fish.segments.unshift(head);
    if (fish.segments.length > fish.length * 5) { // 保持长度 (乘以倍率让身体显得更连贯)
        fish.segments.pop();
    }

    // 迷雾跟随鱼头
    fogOverlay.style.background = `radial-gradient(circle ${fogRadius}px at ${head.x}px ${head.y}px, transparent 0%, rgba(0, 5, 17, 0.95) 100%)`;
}

// 渲染鱼身 (动态波浪效果)
function drawFish(time) {
    // 鱼身特效粒子
    if (Math.random() > 0.5) createParticle(fish.segments[0].x, fish.segments[0].y, fish.headColor);

    // 绘制鱼身
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    for (let i = fish.segments.length - 1; i >= 0; i -= 5) {
        const seg = fish.segments[i];
        const sizeIdx = Math.max(0, 1 - i / fish.segments.length);
        const dynamicSize = fishSize * (0.5 + sizeIdx * 0.5) + Math.sin(time / 200 + i * 0.1) * 2;
        
        ctx.beginPath();
        ctx.fillStyle = fish.invincible ? `hsla(${(time/10)%360}, 100%, 50%, 0.7)` : fish.bodyColor;
        ctx.arc(seg.x, seg.y, dynamicSize, 0, Math.PI * 2);
        ctx.fill();

        // 头部发光效果
        if (i === 0) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = fish.headColor;
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

// 障碍物系统：水雷 & 障碍鱼
function spawnObstacle() {
    if (obstacles.length < 5 + score / 100) {
        const type = Math.random() > 0.4 ? 'mine' : 'enemy_fish';
        obstacles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            size: 15 + Math.random() * 10,
            type: type
        });
    }
}

function updateObstacles() {
    obstacles.forEach((obs, index) => {
        obs.x += obs.vx;
        obs.y += obs.vy;
        
        // 碰壁反弹
        if (obs.x < 0 || obs.x > canvas.width) obs.vx *= -1;
        if (obs.y < 0 || obs.y > canvas.height) obs.vy *= -1;

        // 碰撞检测
        const head = fish.segments[0];
        const dist = Math.sqrt((head.x - obs.x)**2 + (head.y - obs.y)**2);
        if (dist < obs.size + 10 && !fish.invincible) {
            endGame();
        }

        // 绘制障碍
        ctx.beginPath();
        if (obs.type === 'mine') {
            ctx.fillStyle = '#ff3300';
            ctx.arc(obs.x, obs.y, obs.size, 0, Math.PI * 2);
            ctx.fill();
            // 绘制尖刺
            for (let j = 0; j < 8; j++) {
                const angle = j * Math.PI / 4;
                ctx.moveTo(obs.x, obs.y);
                ctx.lineTo(obs.x + Math.cos(angle)*(obs.size+5), obs.y + Math.sin(angle)*(obs.size+5));
            }
            ctx.strokeStyle = '#ff3300';
            ctx.stroke();
        } else {
            ctx.fillStyle = '#aa00ff';
            ctx.ellipse(obs.x, obs.y, obs.size*1.5, obs.size, Math.atan2(obs.vy, obs.vx), 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

// 食物 & 道具系统
function spawnFood() {
    if (foods.length < 15) {
        foods.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: 5,
            color: `hsla(${Math.random() * 360}, 100%, 70%, 1)`
        });
    }
}

function spawnItem() {
    if (Math.random() < 0.005 && items.length < 2) {
        const types = ['speed', 'shrink', 'shield'];
        items.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            type: types[Math.floor(Math.random() * types.length)],
            timer: 500
        });
    }
}

function updateEntities() {
    const head = fish.segments[0];
    
    // 食物碰撞
    foods = foods.filter(f => {
        const dist = Math.sqrt((head.x - f.x)**2 + (head.y - f.y)**2);
        if (dist < 20) {
            score += 10;
            fish.length += 1;
            speed = 4 + (score / 200); // 难度增长：速度曲线
            scoreEl.innerText = score;
            for(let i=0; i<5; i++) createParticle(f.x, f.y, f.color);
            return false;
        }
        ctx.beginPath();
        ctx.fillStyle = f.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = f.color;
        ctx.arc(f.x, f.y, f.size + Math.sin(Date.now()/200)*2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        return true;
    });

    // 道具碰撞
    items = items.filter(item => {
        const dist = Math.sqrt((head.x - item.x)**2 + (head.y - item.y)**2);
        if (dist < 25) {
            applyItem(item.type);
            return false;
        }
        ctx.font = '20px Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(item.type === 'speed' ? '⚡' : item.type === 'shrink' ? '✨' : '🛡️', item.x - 10, item.y + 10);
        return true;
    });
}

function applyItem(type) {
    if (type === 'speed') { speed += 3; setTimeout(() => speed -= 3, 5000); }
    if (type === 'shrink') { fish.length = Math.max(10, fish.length - 20); }
    if (type === 'shield') { fish.invincible = true; fish.invincibleTimer = 300; }
}

// 粒子特效
function createParticle(x, y, color) {
    particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1,
        color
    });
}

function updateParticles() {
    particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 2, 2);
        ctx.globalAlpha = 1;
        return p.life > 0;
    });
}

// 输入控制
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

function handleInput() {
    if (keys['ArrowUp'] || keys['KeyW']) fish.targetDir = { x: 0, y: -1 };
    if (keys['ArrowDown'] || keys['KeyS']) fish.targetDir = { x: 0, y: 1 };
    if (keys['ArrowLeft'] || keys['KeyA']) fish.targetDir = { x: -1, y: 0 };
    if (keys['ArrowRight'] || keys['KeyD']) fish.targetDir = { x: 1, y: 0 };
}

// 游戏循环
function gameLoop(time) {
    if (!gameRunning) return;
    
    ctx.fillStyle = 'rgba(0, 5, 17, 0.2)'; // 拖尾效果
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    handleInput();
    moveFish();
    spawnFood();
    spawnObstacle();
    spawnItem();
    updateEntities();
    updateObstacles();
    updateParticles();
    drawFish(time);

    if (fish.invincibleTimer > 0) {
        fish.invincibleTimer--;
        if (fish.invincibleTimer === 0) fish.invincible = false;
    }

    requestAnimationFrame(gameLoop);
}

function endGame() {
    gameRunning = false;
    gameOverEl.classList.remove('hidden');
    finalScoreEl.innerText = score;
}

function restart() {
    score = 0;
    scoreEl.innerText = score;
    speed = 4;
    fish.length = 10;
    fish.invincible = false;
    foods = [];
    obstacles = [];
    items = [];
    particles = [];
    gameRunning = true;
    gameOverEl.classList.add('hidden');
    initFish();
    requestAnimationFrame(gameLoop);
}

restartBtn.addEventListener('click', restart);

// 启动
initFish();
requestAnimationFrame(gameLoop);
