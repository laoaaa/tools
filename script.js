// script.js
const tickSound = document.getElementById("tick-sound");
const dripSound = document.getElementById("drip-sound");

// 设置敲击声音的音量为 30%
tickSound.volume = 0.3;

let lastElapsed = 0;
const cycleDuration = 50000; // 动画的总时长为50秒

function checkBambooPosition(timestamp) {
    const elapsed = (timestamp % cycleDuration) / cycleDuration;

    // 在填水阶段（前95%）间隔播放滴水声
    if (elapsed < 0.95 && Math.floor(elapsed * 10) % 5 === 0 && lastElapsed !== Math.floor(elapsed * 10)) {
        dripSound.play();
    }

    // 在回弹阶段（95% - 97%）播放敲击声
    if (elapsed >= 0.95 && lastElapsed < 0.97) {
        tickSound.play();
    }

    lastElapsed = elapsed;
    requestAnimationFrame(checkBambooPosition); // 继续监控动画
}

// 点击页面后启动装置
window.addEventListener("click", () => {
    requestAnimationFrame(checkBambooPosition); // 开始监控动画位置
});
