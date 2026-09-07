(function () {
    const TARGET_HOST = "login.gitam.edu";
    let cachedTemplates = null;
    let observerLocked = false;

    function sleepFr(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    function yapStatus(msg) {
        let el = document.getElementById("ac-yap-banner");
        if (!el) {
            el = document.createElement("div");
            el.id = "ac-yap-banner";
            el.style.position = "fixed";
            el.style.top = "12px";
            el.style.right = "12px";
            el.style.zIndex = "99999";
            el.style.padding = "8px 14px";
            el.style.borderRadius = "8px";
            el.style.background = "#10b981";
            el.style.color = "#ffffff";
            el.style.fontSize = "12px";
            el.style.fontFamily = "sans-serif";
            el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            el.style.transition = "all 0.2s ease";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.display = "block";
        setTimeout(() => {
            if (el) el.style.display = "none";
        }, 5000);
    }

    function spitError(msg) {
        let el = document.getElementById("ac-spit-error");
        if (!el) {
            el = document.createElement("div");
            el.id = "ac-spit-error";
            el.style.position = "fixed";
            el.style.top = "12px";
            el.style.right = "12px";
            el.style.zIndex = "99999";
            el.style.padding = "8px 14px";
            el.style.borderRadius = "8px";
            el.style.background = "#ef4444";
            el.style.color = "#ffffff";
            el.style.fontSize = "12px";
            el.style.fontFamily = "sans-serif";
            el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.display = "block";
        setTimeout(() => {
            if (el) el.style.display = "none";
        }, 6000);
    }

    function vibeCheck() {
        return new Promise(res => {
            chrome.storage.local.get(["username", "password", "paused"], data => {
                res({
                    user: data.username || "",
                    pass: data.password || "",
                    isPaused: Boolean(data.paused)
                });
            });
        });
    }

    async function snagEl(selector, timeout = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleepFr(150);
        }
        return null;
    }

    // prebake font templates
    function bakeTemplates() {
        if (cachedTemplates) return cachedTemplates;

        const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
        const fonts = [
            "bold 26px Arial, sans-serif",
            "bold 26px Tahoma, sans-serif",
            "bold 26px Verdana, sans-serif",
            "bold 26px Georgia, serif"
        ];

        const dict = {};
        for (const d of digits) {
            dict[d] = [];
            for (const f of fonts) {
                const cvs = document.createElement("canvas");
                cvs.width = 40;
                cvs.height = 50;
                const ctx = cvs.getContext("2d");
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, cvs.width, cvs.height);
                ctx.fillStyle = "#000000";
                ctx.font = f;
                ctx.textBaseline = "top";
                ctx.fillText(d, 5, 5);

                const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
                const dGrid = [];
                for (let y = 0; y < cvs.height; y++) {
                    const row = [];
                    for (let x = 0; x < cvs.width; x++) {
                        const idx = (y * cvs.width + x) * 4;
                        const lum = 0.299 * imgData.data[idx] + 0.587 * imgData.data[idx + 1] + 0.114 * imgData.data[idx + 2];
                        row.push(lum < 128 ? 1 : 0);
                    }
                    dGrid.push(row);
                }

                // tight bounds
                let minX = cvs.width, maxX = -1, minY = cvs.height, maxY = -1;
                for (let y = 0; y < cvs.height; y++) {
                    for (let x = 0; x < cvs.width; x++) {
                        if (dGrid[y][x] === 1) {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                }

                if (maxX >= minX && maxY >= minY) {
                    const rizzGrid = sampleRizzGrid(dGrid, minX, minY, maxX, maxY);
                    const holes = countSusHoles(dGrid, minX, minY, maxX, maxY);
                    dict[d].push({
                        grid: rizzGrid,
                        holes: holes.holeCount,
                        aspect: (maxY - minY + 1) / (maxX - minX + 1)
                    });
                }
            }
        }
        cachedTemplates = dict;
        return cachedTemplates;
    }

    // sample to 8x12
    function sampleRizzGrid(grid, x0, y0, x1, y1) {
        const out = new Float32Array(96);
        const bw = Math.max(1, x1 - x0 + 1);
        const bh = Math.max(1, y1 - y0 + 1);

        for (let gy = 0; gy < 12; gy++) {
            const sy = y0 + (gy / 12) * bh;
            const ey = y0 + ((gy + 1) / 12) * bh;
            for (let gx = 0; gx < 8; gx++) {
                const sx = x0 + (gx / 8) * bw;
                const ex = x0 + ((gx + 1) / 8) * bw;

                let sum = 0;
                let count = 0;
                const startY = Math.floor(sy);
                const endY = Math.min(grid.length - 1, Math.ceil(ey));
                const startX = Math.floor(sx);
                const endX = Math.min(grid[0].length - 1, Math.ceil(ex));

                for (let py = startY; py <= endY; py++) {
                    for (let px = startX; px <= endX; px++) {
                        sum += grid[py][px];
                        count++;
                    }
                }
                out[gy * 8 + gx] = count > 0 ? sum / count : 0;
            }
        }
        return out;
    }

    // count loops
    function countSusHoles(grid, x0, y0, x1, y1) {
        const w = x1 - x0 + 1;
        const h = y1 - y0 + 1;
        const pw = w + 2;
        const ph = h + 2;
        const padded = Array.from({ length: ph }, () => Array(pw).fill(0));

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                padded[y + 1][x + 1] = grid[y0 + y][x0 + x];
            }
        }

        const visited = Array.from({ length: ph }, () => Array(pw).fill(false));
        const queue = [[0, 0]];
        visited[0][0] = true;

        while (queue.length) {
            const [cx, cy] = queue.shift();
            const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
            for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < pw && ny >= 0 && ny < ph && !visited[ny][nx] && padded[ny][nx] === 0) {
                    visited[ny][nx] = true;
                    queue.push([nx, ny]);
                }
            }
        }

        let holeCount = 0;
        let holeCentroids = [];

        for (let y = 1; y <= h; y++) {
            for (let x = 1; x <= w; x++) {
                if (padded[y][x] === 0 && !visited[y][x]) {
                    let sumY = 0;
                    let count = 0;
                    const hQueue = [[x, y]];
                    visited[y][x] = true;
                    while (hQueue.length) {
                        const [hx, hy] = hQueue.shift();
                        sumY += (hy - 1);
                        count++;
                        const hNeighbors = [[hx + 1, hy], [hx - 1, hy], [hx, hy + 1], [hx, hy - 1]];
                        for (const [nhx, nhy] of hNeighbors) {
                            if (nhx >= 1 && nhx <= w && nhy >= 1 && nhy <= h && !visited[nhy][nhx] && padded[nhy][nhx] === 0) {
                                visited[nhy][nhx] = true;
                                hQueue.push([nhx, nhy]);
                            }
                        }
                    }
                    // filter noise loops
                    if (count >= 4) {
                        holeCount++;
                        holeCentroids.push(sumY / (count * h));
                    }
                }
            }
        }

        return { holeCount, holeCentroids };
    }

    // clean canvas
    function nukeNoise(canvas) {
        const ctx = canvas.getContext("2d");
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const w = canvas.width;
        const h = canvas.height;
        const raw = imgData.data;

        // otsu binarization
        const hist = new Array(256).fill(0);
        for (let i = 0; i < raw.length; i += 4) {
            const lum = Math.round(0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2]);
            hist[lum]++;
        }

        let total = w * h;
        let sum = 0;
        for (let t = 0; t < 256; t++) sum += t * hist[t];

        let sumB = 0;
        let wB = 0;
        let wF = 0;
        let varMax = 0;
        let gyattThreshold = 135;

        for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB === 0) continue;
            wF = total - wB;
            if (wF === 0) break;

            sumB += t * hist[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const varBetween = wB * wF * (mB - mF) * (mB - mF);

            if (varBetween > varMax) {
                varMax = varBetween;
                gyattThreshold = t;
            }
        }

        gyattThreshold = Math.min(155, Math.max(115, gyattThreshold));

        const brainrotGrid = [];
        for (let y = 0; y < h; y++) {
            const row = [];
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                const lum = 0.299 * raw[idx] + 0.587 * raw[idx + 1] + 0.114 * raw[idx + 2];
                row.push(lum < gyattThreshold ? 1 : 0);
            }
            brainrotGrid.push(row);
        }

        // wipe pepper noise
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                if (brainrotGrid[y][x] === 1) {
                    const neighbors =
                        brainrotGrid[y - 1][x] + brainrotGrid[y + 1][x] +
                        brainrotGrid[y][x - 1] + brainrotGrid[y][x + 1] +
                        brainrotGrid[y - 1][x - 1] + brainrotGrid[y - 1][x + 1] +
                        brainrotGrid[y + 1][x - 1] + brainrotGrid[y + 1][x + 1];
                    if (neighbors <= 1) {
                        brainrotGrid[y][x] = 0;
                    }
                }
            }
        }

        return brainrotGrid;
    }

    // find digit segments
    function chopDigits(grid, width, height) {
        const colSum = new Array(width).fill(0);
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (grid[y][x] === 1) colSum[x]++;
            }
        }

        let rawSegments = [];
        let inChar = false;
        let startX = 0;

        for (let x = 0; x < width; x++) {
            if (colSum[x] > 1) {
                if (!inChar) {
                    inChar = true;
                    startX = x;
                }
            } else {
                if (inChar) {
                    inChar = false;
                    if (x - startX >= 3) {
                        rawSegments.push({ startX, endX: x - 1 });
                    }
                }
            }
        }
        if (inChar && (width - startX >= 3)) {
            rawSegments.push({ startX, endX: width - 1 });
        }

        // split merged digits
        while (rawSegments.length < 5 && rawSegments.length > 0) {
            let maxW = -1;
            let maxIdx = -1;
            for (let i = 0; i < rawSegments.length; i++) {
                const w = rawSegments[i].endX - rawSegments[i].startX + 1;
                if (w > maxW) {
                    maxW = w;
                    maxIdx = i;
                }
            }
            if (maxW < 7) break;
            const target = rawSegments[maxIdx];
            const mid = Math.floor((target.startX + target.endX) / 2);
            rawSegments.splice(maxIdx, 1,
                { startX: target.startX, endX: mid },
                { startX: mid + 1, endX: target.endX }
            );
        }

        if (rawSegments.length > 5) {
            rawSegments.sort((a, b) => (b.endX - b.startX) - (a.endX - a.startX));
            rawSegments = rawSegments.slice(0, 5);
            rawSegments.sort((a, b) => a.startX - b.startX);
        }

        const sigmaBoxes = [];
        for (const seg of rawSegments) {
            let minY = height;
            let maxY = -1;
            for (let y = 0; y < height; y++) {
                let rCount = 0;
                for (let x = seg.startX; x <= seg.endX; x++) {
                    if (grid[y][x] === 1) rCount++;
                }
                if (rCount > 1 || (rCount === 1 && y > 10 && y < 40)) {
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
            if (maxY >= minY) {
                sigmaBoxes.push({
                    x0: seg.startX,
                    y0: minY,
                    x1: seg.endX,
                    y1: maxY,
                    w: seg.endX - seg.startX + 1,
                    h: maxY - minY + 1
                });
            }
        }
        return sigmaBoxes;
    }

    // classify single digit
    function cookDigit(grid, box, templates) {
        const { holeCount, holeCentroids } = countSusHoles(grid, box.x0, box.y0, box.x1, box.y1);
        const aspect = box.h / Math.max(1, box.w);

        // double loop
        if (holeCount >= 2) return "8";

        // single loop
        if (holeCount === 1) {
            const cY = holeCentroids[0] || 0.5;
            if (cY < 0.38) return "9";
            if (cY > 0.60) return "6";

            // 4 vs 0
            let bLeftPixels = 0;
            for (let y = box.y1 - 2; y <= box.y1; y++) {
                for (let x = box.x0; x <= box.x0 + Math.floor(box.w * 0.45); x++) {
                    if (grid[y][x] === 1) bLeftPixels++;
                }
            }
            if (bLeftPixels <= 1) return "4";
            return "0";
        }

        // narrow digit
        if (aspect > 1.7) return "1";

        const bw = box.w;
        const bh = box.h;
        let leftMidIndent = 0;
        const midYStart = Math.floor(box.y0 + bh * 0.28);
        const midYEnd = Math.floor(box.y0 + bh * 0.52);
        for (let y = midYStart; y <= midYEnd; y++) {
            let firstBlack = -1;
            for (let x = box.x0; x <= box.x1; x++) {
                if (grid[y][x] === 1) {
                    firstBlack = x - box.x0;
                    break;
                }
            }
            if (firstBlack > bw * 0.35) leftMidIndent++;
        }

        let bottomRowFill = 0;
        for (let x = box.x0; x <= box.x1; x++) {
            if (grid[box.y1][x] === 1 || grid[box.y1 - 1][x] === 1) bottomRowFill++;
        }
        const bottomRatio = bottomRowFill / bw;

        let topLeftFill = 0;
        let bottomLeftFill = 0;
        for (let y = box.y0; y < box.y0 + bh * 0.4; y++) {
            for (let x = box.x0; x < box.x0 + bw * 0.4; x++) {
                if (grid[y][x] === 1) topLeftFill++;
            }
        }
        for (let y = Math.floor(box.y0 + bh * 0.6); y <= box.y1; y++) {
            for (let x = box.x0; x < box.x0 + bw * 0.4; x++) {
                if (grid[y][x] === 1) bottomLeftFill++;
            }
        }

        if (bottomRatio > 0.85 && bottomLeftFill > 3) return "2";
        if (bottomLeftFill < 2 && topLeftFill > 5) return "7";
        if (leftMidIndent >= 2) return "3";

        let rightStemPixels = 0;
        for (let y = box.y0; y <= box.y1; y++) {
            if (grid[y][box.x1] === 1 || grid[y][box.x1 - 1] === 1) rightStemPixels++;
        }
        if (rightStemPixels > bh * 0.75) return "4";

        return "5";
    }

    // dump telemetry
    function dumpIntel(info) {
        console.group("[AutoCaptcha Diagnostics]");
        console.log("Attempt at:", new Date().toLocaleTimeString());
        console.log("Solved code:", info.code);
        console.log("Box count:", info.boxes.length);
        info.boxes.forEach((b, i) => {
            console.log(
                "Box " + i + ": digit=" + b.digit +
                ", holes=" + b.holes +
                ", centroids=[" + b.centroids.map(c => c.toFixed(2)).join(",") + "]" +
                ", aspect=" + b.aspect.toFixed(2) +
                ", x=" + b.x0 + ".." + b.x1 +
                ", y=" + b.y0 + ".." + b.y1
            );
        });
        console.log("ASCII preview:\n" + info.ascii);
        console.log("Image DataURL:\n" + info.dataUrl);
        console.groupEnd();

        chrome.storage.local.set({
            lastDiagnostic: {
                time: Date.now(),
                code: info.code,
                boxes: info.boxes,
                dataUrl: info.dataUrl
            }
        });
    }

    // solve image captcha
    async function snatchCaptcha(imgEl) {
        if (!imgEl.complete || imgEl.naturalWidth === 0) {
            await new Promise(res => {
                imgEl.onload = res;
                setTimeout(res, 2500);
            });
        }

        const cvs = document.createElement("canvas");
        cvs.width = imgEl.naturalWidth || 150;
        cvs.height = imgEl.naturalHeight || 45;
        const ctx = cvs.getContext("2d");
        ctx.drawImage(imgEl, 0, 0);

        const cleanGrid = nukeNoise(cvs);
        const boxes = chopDigits(cleanGrid, cvs.width, cvs.height);

        if (boxes.length === 0) {
            throw new Error("Failed to detect captcha digits");
        }

        const templates = bakeTemplates();
        let code = "";
        const boxLogs = [];

        for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            const { digit, holes, centroids, aspect } = cookDigitWithDiag(cleanGrid, b, templates);
            code += digit;
            boxLogs.push({
                index: i,
                digit,
                holes,
                centroids,
                aspect,
                x0: b.x0,
                x1: b.x1,
                y0: b.y0,
                y1: b.y1,
                w: b.w,
                h: b.h
            });
        }

        // build ascii preview
        let ascii = "";
        for (let y = 0; y < cvs.height; y += 2) {
            let row = "";
            for (let x = 0; x < cvs.width; x++) {
                row += cleanGrid[y][x] ? "#" : " ";
            }
            ascii += row + "\n";
        }

        dumpIntel({
            code,
            boxes: boxLogs,
            ascii,
            dataUrl: cvs.toDataURL()
        });

        return code;
    }

    // classify with diagnostics
    function cookDigitWithDiag(grid, box, templates) {
        const { holeCount, holeCentroids } = countSusHoles(grid, box.x0, box.y0, box.x1, box.y1);
        const aspect = box.h / Math.max(1, box.w);

        let digit = cookDigit(grid, box, templates);
        return {
            digit,
            holes: holeCount,
            centroids: holeCentroids,
            aspect
        };
    }

    // fill credentials
    function dropDoxx(userInput, passInput, user, pass) {
        userInput.focus();
        userInput.value = user;
        userInput.dispatchEvent(new Event("input", { bubbles: true }));
        userInput.dispatchEvent(new Event("change", { bubbles: true }));

        setTimeout(() => {
            passInput.focus();
            passInput.value = pass;
            passInput.dispatchEvent(new Event("input", { bubbles: true }));
            passInput.dispatchEvent(new Event("change", { bubbles: true }));
        }, 150);
    }

    // submit form
    function yeetForm(captchaInput, code, submitBtn) {
        captchaInput.focus();
        captchaInput.value = code;
        captchaInput.dispatchEvent(new Event("input", { bubbles: true }));
        captchaInput.dispatchEvent(new Event("change", { bubbles: true }));

        yapStatus("Captcha solved: " + code + ". Logging in...");

        setTimeout(() => {
            submitBtn.click();
        }, 350);
    }

    // main entrypoint
    async function lockIn() {
        chrome.storage.local.get(["lastDiagnostic"], data => {
            if (data && data.lastDiagnostic) {
                console.group("[AutoCaptcha] Previous Attempt Diagnostic");
                console.log("Solved:", data.lastDiagnostic.code);
                console.log("Boxes:", data.lastDiagnostic.boxes);
                console.log("Image DataURL:\n", data.lastDiagnostic.dataUrl);
                console.groupEnd();
            }
        });

        const { user, pass, isPaused } = await vibeCheck();
        if (isPaused) {
            yapStatus("AutoCaptcha is paused");
            return;
        }

        if (!user || !pass) {
            spitError("Please configure credentials in extension popup");
            return;
        }

        const userInput = await snagEl("#txtusername");
        const passInput = await snagEl("#password");
        const imgEl = await snagEl("#imgCaptcha");
        const captchaInput = await snagEl("#txtCaptchaInput");
        const submitBtn = await snagEl("#Submit");

        if (!userInput || !passInput || !imgEl || !captchaInput || !submitBtn) {
            spitError("Required login elements not found");
            return;
        }

        dropDoxx(userInput, passInput, user, pass);
        await sleepFr(300);

        try {
            yapStatus("Solving captcha...");
            const code = await snatchCaptcha(imgEl);
            yeetForm(captchaInput, code, submitBtn);
        } catch (err) {
            spitError(err.message || "Failed solving captcha");
        }

        // observe for captcha refresh
        if (!observerLocked) {
            observerLocked = true;
            const observer = new MutationObserver(async () => {
                await sleepFr(400);
                try {
                    const freshCode = await snatchCaptcha(imgEl);
                    yeetForm(captchaInput, freshCode, submitBtn);
                } catch (e) {
                    // silent retry
                }
            });
            observer.observe(imgEl, { attributes: true, attributeFilter: ["src"] });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", lockIn);
    } else {
        lockIn();
    }
})();
