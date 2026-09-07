chrome.runtime.onInstalled.addListener(() => {
    console.log("[Rebuilt AutoCaptcha] Extension installed.");

    chrome.storage.local.get(["username", "password"], (data) => {
        if (!data.username || !data.password) {
            console.warn("[Rebuilt AutoCaptcha] No credentials found, user should configure them via popup.");
        } else {
            console.log("[Rebuilt AutoCaptcha] Credentials found in storage.");
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.type) {
        return;
    }

    if (request.type === "saveCredentials") {
        const { username, password } = request;
        chrome.storage.local.set({ username, password }, () => {
            console.log("[Rebuilt AutoCaptcha] Credentials saved from popup.");
            sendResponse({ status: "ok" });
        });
        return true;
    }

    if (request.type === "clearCredentials") {
        chrome.storage.local.remove(["username", "password"], () => {
            console.log("[Rebuilt AutoCaptcha] Credentials cleared from popup.");
            sendResponse({ status: "ok" });
        });
        return true;
    }

    if (request.type === "setPaused") {
        chrome.storage.local.set({ paused: Boolean(request.paused) }, () => {
            console.log("[Rebuilt AutoCaptcha] Paused state updated:", request.paused);
            sendResponse({ status: "ok" });
        });
        return true;
    }

    if (request.type === "logError") {
        const payload = {
            message: request.message || "Unknown error",
            time: request.time || Date.now()
        };
        chrome.storage.local.set({ lastError: payload }, () => {
            console.warn("[Rebuilt AutoCaptcha] Error logged:", payload.message);
            sendResponse({ status: "ok" });
        });
        return true;
    }

    if (request.type === "clearError") {
        chrome.storage.local.remove(["lastError"], () => {
            console.log("[Rebuilt AutoCaptcha] Last error cleared.");
            sendResponse({ status: "ok" });
        });
        return true;
    }
});
