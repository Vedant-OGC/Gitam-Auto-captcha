(function () {
    const HOSTNAME = "login.gitam.edu";
    const FORM_RETRY_INTERVAL_MS = 1000;
    const FORM_MAX_RETRIES = 10;
    const CAPTCHA_RETRY_INTERVAL_MS = 1000;
    const CAPTCHA_MAX_RETRIES = 10;

    const State = {
        IDLE: "IDLE",
        WAITING_FOR_FORM: "WAITING_FOR_FORM",
        FILLING_CREDENTIALS: "FILLING_CREDENTIALS",
        SOLVING_CAPTCHA: "SOLVING_CAPTCHA",
        DONE: "DONE",
        ERROR: "ERROR"
    };

    let currentState = State.IDLE;
    let captchaObserver = null;
    let captchaSolveDebounce = null;
    let formRetryCount = 0;
    let captchaRetryCount = 0;

    function setState(next) {
        currentState = next;
        console.log("[Rebuilt AutoCaptcha] State:", next);
    }

    function log(message, level = "log") {
        const prefix = "[Rebuilt AutoCaptcha]";
        console[level](`${prefix} ${message}`);
    }

    function showInlineError(message) {
        try {
            let existing = document.getElementById("gitam-autocaptcha-error");
            if (existing) {
                existing.querySelector(".gitam-autocaptcha-error-text").textContent = message;
                existing.style.display = "flex";
            } else {
                const wrapper = document.createElement("div");
                wrapper.id = "gitam-autocaptcha-error";
                wrapper.style.position = "fixed";
                wrapper.style.top = "12px";
                wrapper.style.right = "12px";
                wrapper.style.zIndex = "99999";
                wrapper.style.maxWidth = "320px";
                wrapper.style.padding = "10px 12px";
                wrapper.style.borderRadius = "6px";
                wrapper.style.backgroundColor = "rgba(220, 38, 38, 0.95)";
                wrapper.style.color = "#fff";
                wrapper.style.fontSize = "12px";
                wrapper.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
                wrapper.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
                wrapper.style.display = "flex";
                wrapper.style.alignItems = "flex-start";
                wrapper.style.gap = "8px";

                const icon = document.createElement("span");
                icon.textContent = "!";
                icon.style.display = "inline-flex";
                icon.style.alignItems = "center";
                icon.style.justifyContent = "center";
                icon.style.width = "18px";
                icon.style.height = "18px";
                icon.style.borderRadius = "999px";
                icon.style.backgroundColor = "rgba(0,0,0,0.3)";
                icon.style.fontWeight = "600";

                const text = document.createElement("span");
                text.className = "gitam-autocaptcha-error-text";
                text.textContent = message;

                const close = document.createElement("button");
                close.type = "button";
                close.textContent = "×";
                close.style.marginLeft = "8px";
                close.style.border = "none";
                close.style.background = "transparent";
                close.style.color = "#fff";
                close.style.cursor = "pointer";
                close.style.fontSize = "14px";
                close.onclick = () => {
                    wrapper.style.display = "none";
                };

                wrapper.appendChild(icon);
                wrapper.appendChild(text);
                wrapper.appendChild(close);
                document.body.appendChild(wrapper);
                existing = wrapper;
            }

            setTimeout(() => {
                if (existing) {
                    existing.style.display = "none";
                }
            }, 7000);
        } catch (e) {
            // fail silently if DOM is not ready
        }
    }

    function reportError(message) {
        log(message, "warn");
        setState(State.ERROR);
        showInlineError(message);
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type: "logError",
                message,
                time: Date.now()
            }, () => {
                // ignore response errors
            });
        }
    }

    function getCredentialsAndPauseState() {
        return new Promise((resolve) => {
            chrome.storage.local.get(["username", "password", "paused"], (data) => {
                resolve({
                    username: data.username || "",
                    password: data.password || "",
                    paused: Boolean(data.paused)
                });
            });
        });
    }

    function waitForFormInputs() {
        return new Promise((resolve, reject) => {
            function check() {
                const inputs = document.querySelectorAll("input[type='text'], input[type='password']");
                if (inputs.length >= 3) {
                    resolve(inputs);
                    return;
                }

                formRetryCount++;
                if (formRetryCount >= FORM_MAX_RETRIES) {
                    reject(new Error("Login form inputs not found after maximum retries."));
                    return;
                }

                log(`Not enough input fields found (found ${inputs.length}). Retrying...`);
                setTimeout(check, FORM_RETRY_INTERVAL_MS);
            }

            check();
        });
    }

    function fillCredentials(inputs, username, password) {
        if (!inputs[0] || !inputs[1]) {
            throw new Error("Login input fields not in expected positions.");
        }

        const usernameInput = inputs[0];
        const passwordInput = inputs[1];

        usernameInput.focus();
        usernameInput.value = username;
        usernameInput.dispatchEvent(new Event("input", { bubbles: true }));

        setTimeout(() => {
            passwordInput.focus();
            passwordInput.value = password;
            passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
        }, 300);
    }

    function extractCaptchaValue(container) {
        const spans = container.querySelectorAll("span");
        if (!spans.length) {
            return null;
        }

        const digits = [];
        spans.forEach((span) => {
            const digit = span.innerText.trim();
            const style = window.getComputedStyle(span);
            const left = parseFloat(style.left || span.style.left || "");

            if (!isNaN(left) && digit.match(/\d/)) {
                digits.push({ digit, left });
            }
        });

        if (!digits.length) {
            return null;
        }

        digits.sort((a, b) => a.left - b.left);
        return digits.map(d => d.digit).join("");
    }

    function findCaptchaContainer() {
        const container = document.querySelector(".preview");
        return container || null;
    }

    function ensureCaptchaObserver(container) {
        if (!container || captchaObserver) {
            return;
        }

        captchaObserver = new MutationObserver(() => {
            if (captchaSolveDebounce) {
                clearTimeout(captchaSolveDebounce);
            }
            captchaSolveDebounce = setTimeout(() => {
                if (currentState === State.ERROR) return;
                log("Detected CAPTCHA change, attempting to re-solve.");
                solveAndFillCaptcha(true).catch((err) => {
                    reportError(`Error re-solving CAPTCHA: ${err.message}`);
                });
            }, 300);
        });

        captchaObserver.observe(container, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    async function solveAndFillCaptcha(fromObserver = false) {
        setState(State.SOLVING_CAPTCHA);

        const container = findCaptchaContainer();
        if (!container) {
            captchaRetryCount++;
            if (captchaRetryCount >= CAPTCHA_MAX_RETRIES && !fromObserver) {
                reportError("CAPTCHA container not found after maximum retries.");
                return;
            }
            log("CAPTCHA container not found. Retrying...");
            await new Promise(res => setTimeout(res, CAPTCHA_RETRY_INTERVAL_MS));
            return solveAndFillCaptcha(fromObserver);
        }

        ensureCaptchaObserver(container);

        const captchaValue = extractCaptchaValue(container);
        if (!captchaValue) {
            captchaRetryCount++;
            if (captchaRetryCount >= CAPTCHA_MAX_RETRIES && !fromObserver) {
                reportError("CAPTCHA digits could not be parsed after maximum retries.");
                return;
            }
            log("No valid CAPTCHA digits found. Retrying...");
            await new Promise(res => setTimeout(res, CAPTCHA_RETRY_INTERVAL_MS));
            return solveAndFillCaptcha(fromObserver);
        }

        log(`Detected CAPTCHA: ${captchaValue}`);

        const captchaInput = document.querySelector('input[placeholder="Enter CAPTCHA"]');
        if (!captchaInput) {
            reportError("CAPTCHA input field not found.");
            return;
        }

        captchaInput.focus();
        captchaInput.value = captchaValue;
        captchaInput.dispatchEvent(new Event("input", { bubbles: true }));
        log("CAPTCHA entered successfully.");

        // Only auto-submit on the initial solve, not on observer-triggered refreshes
        if (!fromObserver) {
            const loginButton = document.querySelector("button[type='submit'], #Submit");
            if (!loginButton) {
                reportError("Login button not found.");
                return;
            }
            setTimeout(() => {
                loginButton.click();
                log("Login button clicked.");
                setState(State.DONE);
            }, 500);
        }
    }

    async function run() {
        log("Rebuilt GITAM AutoCaptcha script running...");

        if (window.location.hostname !== HOSTNAME) {
            log(`Not on ${HOSTNAME}, exiting.`);
            return;
        }

        const { username, password, paused } = await getCredentialsAndPauseState();

        if (paused) {
            log("AutoCaptcha is paused. Skipping login.");
            return;
        }

        if (!username || !password) {
            reportError("Credentials not configured. Please open the extension popup and save them.");
            return;
        }

        try {
            setState(State.WAITING_FOR_FORM);
            const inputs = await waitForFormInputs();

            setState(State.FILLING_CREDENTIALS);
            fillCredentials(inputs, username, password);

            await new Promise(res => setTimeout(res, 800));

            captchaRetryCount = 0;
            await solveAndFillCaptcha(false);
        } catch (err) {
            reportError(err.message || String(err));
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run);
    } else {
        run();
    }
})();
