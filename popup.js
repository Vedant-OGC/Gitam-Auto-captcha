document.addEventListener("DOMContentLoaded", function () {
    const saveBtn = document.getElementById("save");
    const clearBtn = document.getElementById("clear");
    const pauseToggle = document.getElementById("pauseToggle");
    const status = document.getElementById("status");
    const usernameField = document.getElementById("username");
    const passwordField = document.getElementById("password");

    function showStatus(message, color) {
        status.innerText = message;
        status.style.color = color || "#64748b";
        status.style.display = "block";
        setTimeout(() => {
            status.style.display = "none";
        }, 2500);
    }

    // Initial load: credentials and paused state
    chrome.storage.local.get(["username", "password", "paused"], function (data) {
        if (data.username) usernameField.value = data.username;
        if (data.password) passwordField.value = data.password;

        const isEnabled = !data.paused;
        pauseToggle.checked = isEnabled;
        updateToggleUI(isEnabled);

        if (data.username || data.password) {
            clearBtn.disabled = false;
            clearBtn.classList.add("btn--danger");
        }
    });

    // Save credentials via background
    saveBtn.addEventListener("click", function () {
        const username = usernameField.value.trim();
        const password = passwordField.value.trim();

        chrome.runtime.sendMessage(
            { type: "saveCredentials", username, password },
            (response) => {
                if (chrome.runtime.lastError) {
                    showStatus("Failed to save credentials.", "#fc8181");
                    return;
                }

                if (response && response.status === "ok") {
                    showStatus("Credentials saved!", "#059669");
                    clearBtn.disabled = false;
                    clearBtn.classList.add("btn--danger");
                }
            }
        );
    });

    // Clear credentials via background
    clearBtn.addEventListener("click", function () {
        chrome.runtime.sendMessage(
            { type: "clearCredentials" },
            (response) => {
                if (chrome.runtime.lastError) {
                    showStatus("Failed to clear credentials.", "#fc8181");
                    return;
                }

                if (response && response.status === "ok") {
                    usernameField.value = "";
                    passwordField.value = "";
                    clearBtn.disabled = true;
                    clearBtn.classList.remove("btn--danger");
                    showStatus("Credentials cleared!", "#64748b");
                }
            }
        );
    });

    // Toggle AutoCaptcha enabled/paused via background
    pauseToggle.addEventListener("change", function () {
        const isEnabled = pauseToggle.checked;
        chrome.runtime.sendMessage(
            { type: "setPaused", paused: !isEnabled },
            (response) => {
                if (chrome.runtime.lastError) {
                    showStatus("Failed to update state.", "#fc8181");
                    return;
                }

                if (response && response.status === "ok") {
                    updateToggleUI(isEnabled);
                }
            }
        );
    });

    function updateToggleUI(isEnabled) {
        if (isEnabled) {
            status.innerText = "AutoCaptcha Enabled";
            status.style.color = "#059669";
        } else {
            status.innerText = "AutoCaptcha Paused";
            status.style.color = "#64748b";
        }
        status.style.display = "block";
        setTimeout(() => {
            status.style.display = "none";
        }, 2000);
    }
});

